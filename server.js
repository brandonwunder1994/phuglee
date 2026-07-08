const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./lib/config');
const runtime = require('./lib/runtime');
const { isForgeRequest, proxyToForge, checkForgeHealth } = require('./lib/forge-proxy');
const { isAnalyzerRequest, proxyToAnalyzer, checkAnalyzerHealth } = require('./lib/analyzer-proxy');
const { ensureForgeRunning, stopForgeProcess } = require('./lib/forge-process');
const { ensureAnalyzerRunning, stopAnalyzerProcess } = require('./lib/analyzer-process');
let embeddedAnalyzerModule;
function getEmbeddedAnalyzer() {
  if (!embeddedAnalyzerModule) embeddedAnalyzerModule = require('./lib/embedded-analyzer');
  return embeddedAnalyzerModule;
}

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
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const { CACHE_NONE, cacheControlForExt } = require('./lib/static-cache');

let bridgeApiModule;
function getBridgeApi() {
  if (!bridgeApiModule) bridgeApiModule = require('./lib/bridge-api');
  return bridgeApiModule;
}

function send(res, status, body, type, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': CACHE_NONE,
    ...extraHeaders
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
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControlForExt(ext)
  };
  res.writeHead(200, headers);
  res.end(fs.readFileSync(file));
}

function isDistressStatic(pathname) {
  return pathname.startsWith('/css/')
    || pathname.startsWith('/js/')
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/images/')
    || pathname.startsWith('/data/');
}

function serveLibAsBrowser(res, libFile, globalName) {
  const src = fs.readFileSync(libFile, 'utf8').replace(/module\.exports\s*=\s*/, `window.${globalName}=`);
  send(res, 200, src, 'application/javascript; charset=utf-8');
}

function requestHost(req) {
  const headers = req.headers || {};
  return headers.host || headers['x-forwarded-host'] || process.env.VERCEL_URL || 'localhost';
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${requestHost(req)}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  if (pathname === '/api/forge-diagnostics' && req.method === 'GET') {
    const fs = require('fs');
    const bootLogPath = process.env.FORGE_BOOT_LOG || '/tmp/forge-boot.log';
    let bootLog = '';
    try {
      if (fs.existsSync(bootLogPath)) {
        bootLog = fs.readFileSync(bootLogPath, 'utf8').slice(-8000);
      }
    } catch (_) {}
    const [forge, analyzer] = await Promise.all([
      checkForgeHealth(),
      runtime.useEmbeddedAnalyzer()
        ? Promise.resolve({ ok: true, mode: 'embedded' })
        : checkAnalyzerHealth()
    ]);
    send(res, 200, JSON.stringify({
      ok: true,
      forge,
      analyzer,
      bootLog,
      bootLogPath,
      env: {
        NODE_ENV: process.env.NODE_ENV || null,
        FORM_FORGE_HOST: config.FORGE_HOST,
        FORM_FORGE_PORT: config.FORGE_PORT,
        PROPERTY_ANALYZER_HOST: config.ANALYZER_HOST,
        PROPERTY_ANALYZER_PORT: config.ANALYZER_PORT
      }
    }), 'application/json');
    return;
  }

  if (pathname === '/api/health') {
    let analyzerHealth;
    if (runtime.useEmbeddedAnalyzer()) {
      /* Avoid cold-loading analyzer on health pings (serverless). */
      analyzerHealth = { ok: true, mode: 'embedded' };
    } else {
      analyzerHealth = await checkAnalyzerHealth();
    }
    const [forge, analyzer] = await Promise.all([checkForgeHealth(), Promise.resolve(analyzerHealth)]);
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

  if (pathname.startsWith('/api/bridge')) {
    const handled = await getBridgeApi().handle(req, res, pathname, url);
    if (handled) return;
  }

  if (isForgeRequest(pathname)) {
    proxyToForge(req, res, pathname, url.search);
    return;
  }

  if (isAnalyzerRequest(pathname)) {
    if (runtime.useEmbeddedAnalyzer()) {
      await getEmbeddedAnalyzer().dispatchEmbeddedAnalyzer(req, res, pathname, url.search);
      return;
    }
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

  if (pathname === '/js/auth-config.js' && (req.method === 'GET' || req.method === 'HEAD')) {
    const body = [
      '(function () {',
      `  window.__PHUGLEE_AUTH_DISABLED__ = ${config.AUTH_DISABLED ? 'true' : 'false'};`,
      '  if (!window.__PHUGLEE_AUTH_DISABLED__) return;',
      "  try { if (!sessionStorage.getItem('phuglee_session')) sessionStorage.setItem('phuglee_session', 'dev'); } catch (_) {}",
      '})();',
      ''
    ].join('\n');
    if (req.method === 'HEAD') {
      send(res, 200, '', 'application/javascript; charset=utf-8');
    } else {
      send(res, 200, body, 'application/javascript; charset=utf-8');
    }
    return;
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
  if (!runtime.isVercel()) process.exit(1);
});

async function bootModules() {
  if (runtime.useEmbeddedAnalyzer()) {
    try {
      await getEmbeddedAnalyzer().checkEmbeddedAnalyzerHealth();
      console.log('Property Analyzer embedded in-process (Vercel/serverless mode)');
    } catch (err) {
      console.warn('Property Analyzer embed failed:', err.message);
    }
  }

  if (runtime.skipChildProcesses()) {
    if (!runtime.useEmbeddedAnalyzer()) {
      console.warn('Property Analyzer unavailable — serverless mode requires embedded analyzer');
    }
    if (runtime.remoteForgeUrl()) {
      console.log(`Form Forge remote proxy: ${runtime.remoteForgeUrl()}`);
    } else {
      console.warn('Form Forge unavailable on Vercel — set FORM_FORGE_URL to a Railway/Render deploy');
    }
    return;
  }

  const [forge, analyzer] = await Promise.all([
    ensureForgeRunning({ spawnIfMissing: true }),
    ensureAnalyzerRunning({ spawnIfMissing: true })
  ]);

  if (forge.running) {
    console.log(forge.spawned ? 'Form Forge started automatically' : 'Form Forge already running');
  } else {
    console.warn('Form Forge not available — check modules/form-forge');
    if (forge.error) console.warn(forge.error);
    if (forge.health?.error) console.warn(`Form Forge health: ${forge.health.error}`);
  }

  const mapsKey = String(process.env.MAPS_API_KEY || '').trim();
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!mapsKey || !geminiKey) {
    console.warn(
      'Railway/production: set MAPS_API_KEY and GEMINI_API_KEY in service Variables '
      + '(Property Analyzer scans and imagery require both).'
    );
  }

  if (analyzer.running) {
    console.log(analyzer.spawned ? 'Property Analyzer started automatically' : 'Property Analyzer already running');
  } else {
    console.warn('Property Analyzer not available — check modules/property-analyzer');
    if (analyzer.error) console.warn(analyzer.error);
  }
}

function startStandaloneServer() {
  server.listen(config.PORT, config.HOST, () => {
    console.log(`Distress OS running at http://${config.HOST}:${config.PORT}`);
    console.log(`Railway PORT env: ${process.env.PORT || '(unset)'} | bound: ${config.PORT}`);
    console.log(`Form Forge proxy: http://${config.HOST}:${config.PORT}${config.FORGE_PREFIX}/`);
    console.log(`Property Analyzer proxy: http://${config.HOST}:${config.PORT}${config.ANALYZER_PREFIX}/`);
    bootModules().catch((err) => {
      console.error('[Distress OS] Module boot error:', err);
    });
  });
}

process.on('unhandledRejection', (err) => {
  console.error('[Distress OS] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Distress OS] Uncaught exception:', err);
});

if (runtime.isVercel()) {
  /* Analyzer loads lazily on first /analyzer request */
} else {
  startStandaloneServer();
}

module.exports = server;
module.exports.handleRequest = handleRequest;

function shutdown() {
  stopForgeProcess();
  stopAnalyzerProcess();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);