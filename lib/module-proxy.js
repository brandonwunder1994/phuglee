const http = require('http');
const https = require('https');
const { URL } = require('url');
const { createRewriter } = require('./rewrite');

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function resolveTarget({ host, port, baseUrl }) {
  if (baseUrl) {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/$/, '') || '';
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      basePath: pathname,
      target: baseUrl.replace(/\/$/, ''),
      displayHost: parsed.host
    };
  }
  return {
    protocol: 'http:',
    hostname: host,
    port,
    basePath: '',
    target: `http://${host}:${port}`,
    displayHost: `${host}:${port}`
  };
}

function createModuleProxy({
  prefix,
  host,
  port,
  baseUrl,
  serviceName,
  healthPath = '/api/health',
  /**
   * Optional ({ req, headers }) => void — mutate outbound proxy headers
   * (e.g. inject X-PDA-Token for Property Analyzer).
   */
  prepareHeaders = null,
  /**
   * Optional (body, contentType, req) => string — rewrite text responses
   * after the prefix rewriter (e.g. strip leaked auth tokens from HTML).
   */
  prepareResponseBody = null,
  /** Optional body size cap for proxied POST/PUT/PATCH (bytes). */
  maxBodyBytes = 0
}) {
  const targetInfo = resolveTarget({ host, port, baseUrl });
  const rewriter = createRewriter({
    prefix,
    targetHost: targetInfo.hostname,
    targetPort: targetInfo.port
  });
  const target = targetInfo.target;
  const PROXY_TIMEOUT_MS = 120000;

  function isModuleRequest(pathname) {
    return pathname === prefix || pathname.startsWith(prefix + '/');
  }

  function toModulePath(pathname, search) {
    const stripped = pathname === prefix
      ? '/'
      : pathname.slice(prefix.length) || '/';
    return stripped + (search || '');
  }

  function proxyRequest(req, res, pathname, search) {
    const modulePath = `${targetInfo.basePath}${toModulePath(pathname, search)}`;
    const headers = { ...req.headers, host: targetInfo.displayHost };
    delete headers['content-length'];
    delete headers.host;
    // Never forward client session cookies / auth to child modules.
    delete headers.cookie;
    delete headers.Cookie;
    delete headers.authorization;
    delete headers.Authorization;
    headers.host = targetInfo.displayHost;
    if (typeof prepareHeaders === 'function') {
      try {
        prepareHeaders({ req, headers, pathname, search });
      } catch (_) {}
    }

    const transport = targetInfo.protocol === 'https:' ? https : http;
    const proxyReq = transport.request(
      {
        protocol: targetInfo.protocol,
        hostname: targetInfo.hostname,
        port: targetInfo.port,
        method: req.method,
        path: modulePath,
        headers
      },
      (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        const outHeaders = { ...proxyRes.headers };
        const isText = /text\/|javascript|json/.test(contentType);

        if (outHeaders.location) {
          outHeaders.location = rewriter.rewriteLocationHeader(
            Array.isArray(outHeaders.location) ? outHeaders.location[0] : outHeaders.location
          );
        }

        // Binary/media: stream through without buffering the full body in RAM.
        if (!isText) {
          res.writeHead(proxyRes.statusCode || 502, outHeaders);
          proxyRes.pipe(res);
          return;
        }

        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const raw = Buffer.concat(chunks);
          delete outHeaders['content-length'];

          let body = rewriter.rewriteTextBody(raw.toString('utf8'), contentType);
          if (typeof prepareResponseBody === 'function') {
            try {
              body = prepareResponseBody(body, contentType, req) || body;
            } catch (_) {}
          }

          // Rewritten JS/HTML must not be cached long — rewrite rules change without
          // the upstream file mtime changing (e.g. proxyFetchUrl corruption fix).
          if (/javascript|text\/html/.test(contentType)) {
            outHeaders['cache-control'] = 'no-store, no-cache, must-revalidate';
            delete outHeaders['etag'];
            delete outHeaders['last-modified'];
            delete outHeaders['expires'];
          }

          res.writeHead(proxyRes.statusCode || 502, outHeaders);
          res.end(Buffer.from(body, 'utf8'));
        });
      }
    );

    proxyReq.setTimeout(PROXY_TIMEOUT_MS, () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: `${serviceName} timed out`,
          detail: `No response within ${PROXY_TIMEOUT_MS / 1000}s`
        }));
      }
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: `${serviceName} unavailable`,
          detail: err.message
        }));
      }
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      proxyReq.end();
      return;
    }

    readRequestBody(req)
      .then((body) => {
        if (maxBodyBytes > 0 && body.length > maxBodyBytes) {
          proxyReq.destroy();
          if (!res.headersSent) {
            res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              ok: false,
              error: `${serviceName} upload too large`,
              code: 'PAYLOAD_TOO_LARGE',
              maxBytes: maxBodyBytes
            }));
          }
          return;
        }
        proxyReq.end(body);
      })
      .catch(() => {
        proxyReq.destroy();
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Proxy request error');
        }
      });
  }

  function checkHealth() {
    return new Promise((resolve) => {
      const healthUrl = `${target}${healthPath}`;
      const parsed = new URL(healthUrl);
      const transport = parsed.protocol === 'https:' ? https : http;
      const req = transport.get(healthUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let ok = res.statusCode === 200;
          try {
            const parsed = JSON.parse(data);
            if (parsed && typeof parsed.ok === 'boolean') ok = ok && parsed.ok;
          } catch (_) {}
          resolve({ ok, status: res.statusCode, body: data });
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
    });
  }

  return {
    prefix,
    target,
    isModuleRequest,
    proxyRequest,
    checkHealth
  };
}

module.exports = { createModuleProxy };