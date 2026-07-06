const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.DISTRESS_OS_PORT || 3000);
const HOST = process.env.DISTRESS_OS_HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const ROUTES = {
  '/': 'index.html',
  '/heat': 'heat.html'
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(body);
}

function serveStatic(urlPath, res) {
  const rel = urlPath.replace(/^\//, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    send(res, 403, 'Forbidden');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed');
    return;
  }

  if (pathname === '/api/health') {
    send(res, 200, JSON.stringify({ ok: true, service: 'distress-os', version: '0.1.0' }), 'application/json');
    return;
  }

  if (ROUTES[pathname]) {
    const file = path.join(PUBLIC, ROUTES[pathname]);
    if (fs.existsSync(file)) {
      const html = fs.readFileSync(file, 'utf8');
      if (req.method === 'HEAD') {
        send(res, 200, '', 'text/html; charset=utf-8');
      } else {
        send(res, 200, html, 'text/html; charset=utf-8');
      }
      return;
    }
  }

  if (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/assets/')) {
    if (req.method === 'HEAD') {
      serveStatic(pathname, { writeHead: (s, h) => res.writeHead(s, h), end: () => res.end() });
    } else {
      serveStatic(pathname, res);
    }
    return;
  }

  send(res, 404, 'Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Distress OS running at http://${HOST}:${PORT}`);
  console.log(`Also try http://distressos.local:${PORT} (if hosts entry exists)`);
});