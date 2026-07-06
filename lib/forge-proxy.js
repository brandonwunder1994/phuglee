const http = require('http');
const config = require('./config');
const { rewriteTextBody, rewriteLocationHeader } = require('./rewrite');

const FORGE_TARGET = `http://${config.FORGE_HOST}:${config.FORGE_PORT}`;
const PREFIX = config.FORGE_PREFIX;

function isForgeRequest(pathname) {
  return pathname === PREFIX || pathname.startsWith(PREFIX + '/');
}

function toForgePath(pathname, search) {
  const stripped = pathname === PREFIX
    ? '/'
    : pathname.slice(PREFIX.length) || '/';
  return stripped + (search || '');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function proxyToForge(req, res, pathname, search) {
  const forgePath = toForgePath(pathname, search);

  const headers = { ...req.headers, host: `${config.FORGE_HOST}:${config.FORGE_PORT}` };
  delete headers['content-length'];

  const proxyReq = http.request(
    {
      hostname: config.FORGE_HOST,
      port: config.FORGE_PORT,
      method: req.method,
      path: forgePath,
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
          outHeaders.location = rewriteLocationHeader(
            Array.isArray(outHeaders.location) ? outHeaders.location[0] : outHeaders.location
          );
        }

        delete outHeaders['content-length'];

        const isText = /text\/|javascript|json/.test(contentType);
        const body = isText ? rewriteTextBody(raw.toString('utf8'), contentType) : raw;

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
        error: 'Form Forge unavailable',
        detail: err.message,
        hint: 'Start Form Forge on port 8787 or use launch-distressos.bat'
      }));
    }
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    proxyReq.end();
    return;
  }

  readRequestBody(req)
    .then((body) => {
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

function checkForgeHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${FORGE_TARGET}/api/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ ok: res.statusCode === 200, status: res.statusCode, body: data });
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

module.exports = {
  isForgeRequest,
  proxyToForge,
  checkForgeHealth,
  FORGE_TARGET
};