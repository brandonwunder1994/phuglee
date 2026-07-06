const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./lib/config');
const { isForgeRequest, proxyToForge, checkForgeHealth } = require('./lib/forge-proxy');
const { isAnalyzerRequest, proxyToAnalyzer, checkAnalyzerHealth } = require('./lib/analyzer-proxy');
const { ensureForgeRunning, stopForgeProcess } = require('./lib/forge-process');
const { ensureAnalyzerRunning, stopAnalyzerProcess } = require('./lib/analyzer-process');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
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
  const file = path.normalize(path.join(config.PUBLIC, rel));
  if (!file.startsWith(config.PUBLIC)) {
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

function isDistressStatic(pathname) {
  return pathname.startsWith('/css/')
    || pathname.startsWith('/js/')
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/images/');
}

function serveLibAsBrowser(res, libFile, globalName) {
  const src = fs.readFileSync(libFile, 'utf8').replace(/module\.exports\s*=\s*/, `window.${globalName}=`);
  send(res, 200, src, 'application/javascript; charset=utf-8');
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  if (pathname === '/api/health') {
    const [forge, analyzer] = await Promise.all([checkForgeHealth(), checkAnalyzerHealth()]);
    send(res, 200, JSON.stringify({
      ok: true,
      service: 'distress-os',
      version: '1.1.0',
      modules: {
        formForge: forge.ok ? 'up' : 'down',
        propertyAnalyzer: analyzer.ok ? 'up' : 'down'
      }
    }), 'application/json');
    return;
  }

  if (isForgeRequest(pathname)) {
    proxyToForge(req, res, pathname, url.search);
    return;
  }

  if (isAnalyzerRequest(pathname)) {
    proxyToAnalyzer(req, res, pathname, url.search);
    return;
  }

  if (config.DISTRESS_ROUTES[pathname]) {
    const file = path.join(config.PUBLIC, config.DISTRESS_ROUTES[pathname]);
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

  if (pathname === '/js/bridge-schema.js' && (req.method === 'GET' || req.method === 'HEAD')) {
    if (req.method === 'HEAD') {
      send(res, 200, '', 'application/javascript; charset=utf-8');
    } else {
      serveLibAsBrowser(res, path.join(config.ROOT, 'lib', 'bridge-schema.js'), 'DistressBridgeSchema');
    }
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && isDistressStatic(pathname)) {
    if (req.method === 'HEAD') {
      serveStatic(pathname, { writeHead: (s, h) => res.writeHead(s, h), end: () => res.end() });
    } else {
      serveStatic(pathname, res);
    }
    return;
  }

  send(res, 404, 'Not found');
}

// Hidden/redirected launches can close stdout; ignore broken-pipe writes from child modules.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (err && err.code === 'EPIPE') return;
    throw err;
  });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[Distress OS] Request error:', err);
    if (!res.headersSent) send(res, 500, 'Internal server error');
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Distress OS] Port ${config.PORT} is already in use. Stop the other process or set DISTRESS_OS_PORT.`);
  } else {
    console.error('[Distress OS] Server error:', err);
  }
  process.exit(1);
});

server.listen(config.PORT, config.HOST, async () => {
  console.log(`Distress OS running at http://${config.HOST}:${config.PORT}`);
  console.log(`Form Forge proxy: http://${config.HOST}:${config.PORT}${config.FORGE_PREFIX}/`);
  console.log(`Property Analyzer proxy: http://${config.HOST}:${config.PORT}${config.ANALYZER_PREFIX}/`);

  const [forge, analyzer] = await Promise.all([
    ensureForgeRunning({ spawnIfMissing: true }),
    ensureAnalyzerRunning({ spawnIfMissing: true })
  ]);

  if (forge.running) {
    console.log(forge.spawned ? 'Form Forge started automatically' : 'Form Forge already running');
  } else {
    console.warn('Form Forge not available — check modules/form-forge link');
    if (forge.error) console.warn(forge.error);
  }

  if (analyzer.running) {
    console.log(analyzer.spawned ? 'Property Analyzer started automatically' : 'Property Analyzer already running');
  } else {
    console.warn('Property Analyzer not available — check modules/property-analyzer link');
    if (analyzer.error) console.warn(analyzer.error);
  }
});

function shutdown() {
  stopForgeProcess();
  stopAnalyzerProcess();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);