const http = require('http');
const { createRewriter } = require('./rewrite');

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createModuleProxy({ prefix, host, port, serviceName, healthPath = '/api/health' }) {
  const rewriter = createRewriter({ prefix, targetHost: host, targetPort: port });
  const target = `http://${host}:${port}`;

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
    const modulePath = toModulePath(pathname, search);
    const headers = { ...req.headers, host: `${host}:${port}` };
    delete headers['content-length'];

    const proxyReq = http.request(
      {
        hostname: host,
        port,
        method: req.method,
        path: modulePath,
        headers
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const raw = Buffer.concat(chunks);
          const contentType = proxyRes.headers['content-type'] || '';
          const outHeaders = { ...proxyRes.headers };

          if (outHeaders.location) {
            outHeaders.location = rewriter.rewriteLocationHeader(
              Array.isArray(outHeaders.location) ? outHeaders.location[0] : outHeaders.location
            );
          }

          delete outHeaders['content-length'];

          const isText = /text\/|javascript|json/.test(contentType);
          const body = isText
            ? rewriter.rewriteTextBody(raw.toString('utf8'), contentType)
            : raw;

          res.writeHead(proxyRes.statusCode || 502, outHeaders);
          res.end(typeof body === 'string' ? Buffer.from(body, 'utf8') : body);
        });
      }
    );

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
      .then((body) => proxyReq.end(body))
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
      const req = http.get(`${target}${healthPath}`, (res) => {
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