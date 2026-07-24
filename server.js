const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
// Load local .env before config consumers read process.env (gitignored secrets).
require('./lib/load-env').loadEnvFile();
const config = require('./lib/config');
const runtime = require('./lib/runtime');
const { isForgeRequest, proxyToForge, checkForgeHealth } = require('./lib/forge-proxy');
const { isAnalyzerRequest, proxyToAnalyzer, checkAnalyzerHealth } = require('./lib/analyzer-proxy');
const { rejectUnauthorizedModule } = require('./lib/module-auth-gate');
const { ensureForgeRunning, stopForgeProcess } = require('./lib/forge-process');
const { ensureAnalyzerRunning, stopAnalyzerProcess } = require('./lib/analyzer-process');
const { clientAcceptsGzip, gzippableExt } = require('./lib/static-gzip');
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const { CACHE_NONE, cacheControlForExt } = require('./lib/static-cache');

/** Login/register abuse protection (in-memory; resets on restart). */
const AUTH_BODY_MAX = 64 * 1024;
const loginAttempts = new Map(); // key -> { count, resetAt }
const { authRateLimitOk: authRateLimitOkMap } = require('./lib/auth-rate-limit');

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

function authRateLimitOk(req, username) {
  return authRateLimitOkMap(loginAttempts, clientIp(req), username);
}

async function readJsonBodyCapped(req, maxBytes = AUTH_BODY_MAX) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('Request body too large');
      err.code = 'BODY_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

let bridgeApiModule;
function getBridgeApi() {
  if (!bridgeApiModule) bridgeApiModule = require('./lib/bridge-api');
  return bridgeApiModule;
}

let leadsApiModule;
function getLeadsApi() {
  if (!leadsApiModule) leadsApiModule = require('./lib/leads-platform/api');
  return leadsApiModule;
}

let operatingCostsApiModule;
function getOperatingCostsApi() {
  if (!operatingCostsApiModule) operatingCostsApiModule = require('./lib/operating-costs/api');
  return operatingCostsApiModule;
}

let campaignsSmsApiModule;
function getCampaignsSmsApi() {
  if (!campaignsSmsApiModule) campaignsSmsApiModule = require('./lib/campaigns/api');
  return campaignsSmsApiModule;
}

let buyersApiModule = null;
function getBuyersApi() {
  if (!buyersApiModule) buyersApiModule = require('./lib/buyers/api');
  return buyersApiModule;
}

let preLienApiModule = null;
function getPreLienApi() {
  if (!preLienApiModule) preLienApiModule = require('./lib/pre-lien-api');
  return preLienApiModule;
}

let govPlaybooksApiModule = null;
function getGovPlaybooksApi() {
  if (!govPlaybooksApiModule) govPlaybooksApiModule = require('./lib/gov-playbooks/api');
  return govPlaybooksApiModule;
}

function send(res, status, body, type, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': CACHE_NONE,
    ...extraHeaders
  });
  res.end(body);
}

function serveStatic(urlPath, req, res) {
  const rel = urlPath.replace(/^\//, '');
  // Block sensitive catalogs that must never be public (buyers / fund intel).
  // Government lists + city images stay public by product choice.
  const lowerRel = rel.replace(/\\/g, '/').toLowerCase();
  if (
    lowerRel === 'data/buyers/catalog.json'
    || lowerRel.startsWith('data/buyers/')
    || lowerRel === 'data/fund-buyers/catalog.json'
    || lowerRel.startsWith('data/fund-buyers/')
  ) {
    send(res, 404, 'Not found');
    return;
  }
  const publicRoot = path.resolve(config.PUBLIC);
  const file = path.resolve(path.normalize(path.join(config.PUBLIC, rel)));
  if (file !== publicRoot && !file.startsWith(publicRoot + path.sep)) {
    send(res, 403, 'Forbidden');
    return;
  }
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (_) {
    send(res, 404, 'Not found');
    return;
  }
  if (!stat.isFile()) {
    send(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const size = stat.size;
  const reqUrl = (req && req.url) || urlPath || '';
  const baseHeaders = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControlForExt(ext, reqUrl),
    'Accept-Ranges': 'bytes'
  };

  // Range support for <video> progressive playback (esp. larger files like analyze.mp4)
  // (HEAD for media still uses size below when no range.)
  const range = req && req.headers && req.headers.range;
  if (range && req.method !== 'HEAD') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range));
    if (!match) {
      res.writeHead(416, {
        ...baseHeaders,
        'Content-Range': `bytes */${size}`
      });
      res.end();
      return;
    }
    let start = match[1] === '' ? 0 : parseInt(match[1], 10);
    let end = match[2] === '' ? size - 1 : parseInt(match[2], 10);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      res.writeHead(416, {
        ...baseHeaders,
        'Content-Range': `bytes */${size}`
      });
      res.end();
      return;
    }
    end = Math.min(end, size - 1);
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(chunkSize)
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }

  const acceptEnc = (req && req.headers && req.headers['accept-encoding']) || '';
  const wantGzip = clientAcceptsGzip(acceptEnc) && gzippableExt(ext) && size > 0 && size < 20 * 1024 * 1024;

  if (wantGzip) {
    try {
      const raw = fs.readFileSync(file);
      const compressed = zlib.gzipSync(raw, { level: 6 });
      res.writeHead(200, {
        ...baseHeaders,
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
        'Content-Length': String(compressed.length)
      });
      if (req && req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(compressed);
      return;
    } catch (err) {
      console.warn('[static] gzip failed, sending raw:', err.message);
    }
  }

  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': String(size)
  });
  if (req && req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    try {
      if (!res.headersSent) send(res, 500, 'Read error');
      else res.destroy();
    } catch (_) { /* ignore */ }
  });
  stream.pipe(res);
}

function isDistressStatic(pathname) {
  return pathname.startsWith('/css/')
    || pathname.startsWith('/js/')
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/images/')
    || pathname.startsWith('/videos/')
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
    const auth = require('./lib/phuglee-auth');
    const { isAdminUsername } = require('./lib/phuglee-roles');
    // When auth is on (typical production), diagnostics are admin-only.
    // When AUTH_DISABLED (local), keep open for operator debugging.
    if (auth.isAuthRequired()) {
      const session = auth.readSessionFromReq(req);
      if (!session || !isAdminUsername(session.username)) {
        send(res, 401, JSON.stringify({
          error: 'Admin authentication required',
          code: 'ADMIN_REQUIRED'
        }), 'application/json');
        return;
      }
    }
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
    const modulesReady = !!(forge.ok && analyzer.ok);
    // Shallow: always 200 for Railway basic healthcheck (modules reported in body).
    // modulesReady lets operators/UI know Collect/Review are actually usable.
    send(res, 200, JSON.stringify({
      ok: true,
      modulesReady,
      service: 'distress-os',
      version: '1.1.0',
      modules: {
        formForge: forge.ok ? 'up' : 'down',
        propertyAnalyzer: analyzer.ok ? 'up' : 'down'
      }
    }), 'application/json');
    return;
  }

  if (pathname === '/api/health/deep') {
    let analyzerHealth;
    if (runtime.useEmbeddedAnalyzer()) {
      analyzerHealth = { ok: true, mode: 'embedded' };
    } else {
      analyzerHealth = await checkAnalyzerHealth();
    }
    const [forge, analyzer] = await Promise.all([checkForgeHealth(), Promise.resolve(analyzerHealth)]);
    const modulesOk = !!(forge.ok && analyzer.ok);
    const status = modulesOk ? 200 : 503;
    send(res, status, JSON.stringify({
      ok: modulesOk,
      service: 'distress-os',
      version: '1.1.0',
      deep: true,
      modules: {
        formForge: forge.ok ? 'up' : 'down',
        propertyAnalyzer: analyzer.ok ? 'up' : 'down'
      }
    }), 'application/json');
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const auth = require('./lib/phuglee-auth');
    const credentials = require('./lib/phuglee-credentials');
    let body = {};
    try {
      body = await readJsonBodyCapped(req);
    } catch (err) {
      const status = err.code === 'BODY_TOO_LARGE' ? 413 : 400;
      send(res, status, JSON.stringify({ error: err.message, code: err.code || 'INVALID_JSON' }), 'application/json');
      return;
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const planHint = String(body.plan || '').trim();
    if (!authRateLimitOk(req, username)) {
      send(res, 429, JSON.stringify({ error: 'Too many login attempts. Try again later.', code: 'RATE_LIMIT' }), 'application/json');
      return;
    }
    try {
      let sessionUser = username;
      let sessionPlan = planHint;

      if (config.AUTH_DISABLED) {
        // Local convenience: mint session without password, but still sanitize.
        if (!sessionUser) {
          send(res, 400, JSON.stringify({ error: 'Username required', code: 'USERNAME_REQUIRED' }), 'application/json');
          return;
        }
      } else {
        const verified = credentials.authenticateUser(username, password);
        if (!verified.ok) {
          send(res, 401, JSON.stringify({
            ok: false,
            error: verified.error,
            code: verified.code
          }), 'application/json');
          return;
        }
        sessionUser = verified.username;
        sessionPlan = verified.plan || planHint;
      }

      const token = auth.createSessionToken({ username: sessionUser, plan: sessionPlan });
      const session = auth.verifySessionToken(token);
      send(res, 200, JSON.stringify({
        ok: true,
        username: session.username,
        plan: session.plan || ''
      }), 'application/json', {
        'Set-Cookie': auth.buildSessionCookieHeader(token, req)
      });
    } catch (err) {
      send(res, 400, JSON.stringify({
        error: err.message || 'Login failed',
        code: err.code || 'LOGIN_FAILED'
      }), 'application/json');
    }
    return;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const auth = require('./lib/phuglee-auth');
    const credentials = require('./lib/phuglee-credentials');
    let body = {};
    try {
      body = await readJsonBodyCapped(req);
    } catch (err) {
      const status = err.code === 'BODY_TOO_LARGE' ? 413 : 400;
      send(res, status, JSON.stringify({ error: err.message, code: err.code || 'INVALID_JSON' }), 'application/json');
      return;
    }
    if (!authRateLimitOk(req, body.username)) {
      send(res, 429, JSON.stringify({ error: 'Too many register attempts. Try again later.', code: 'RATE_LIMIT' }), 'application/json');
      return;
    }
    const registered = credentials.registerUser({
      username: body.username,
      password: body.password,
      plan: body.plan,
      email: body.email,
      fullName: body.fullName,
      inviteCode: body.inviteCode
    });
    if (!registered.ok) {
      send(res, 400, JSON.stringify(registered), 'application/json');
      return;
    }
    try {
      const token = auth.createSessionToken({
        username: registered.username,
        plan: registered.plan
      });
      const session = auth.verifySessionToken(token);
      send(res, 200, JSON.stringify({
        ok: true,
        username: session.username,
        plan: session.plan || registered.plan
      }), 'application/json', {
        'Set-Cookie': auth.buildSessionCookieHeader(token, req)
      });
    } catch (err) {
      send(res, 400, JSON.stringify({
        error: err.message || 'Register failed',
        code: err.code || 'REGISTER_FAILED'
      }), 'application/json');
    }
    return;
  }

  if (pathname === '/api/auth/logout' && (req.method === 'POST' || req.method === 'GET')) {
    const auth = require('./lib/phuglee-auth');
    send(res, 200, JSON.stringify({ ok: true }), 'application/json', {
      'Set-Cookie': auth.buildClearSessionCookieHeader(req)
    });
    return;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = require('./lib/phuglee-auth');
    const session = auth.readSessionFromReq(req);
    if (!session || !session.username) {
      send(res, 401, JSON.stringify({ ok: false, authenticated: false }), 'application/json');
      return;
    }
    send(res, 200, JSON.stringify({
      ok: true,
      authenticated: true,
      username: session.username,
      plan: session.plan || ''
    }), 'application/json');
    return;
  }

  if (pathname.startsWith('/api/bridge')) {
    const handled = await getBridgeApi().handle(req, res, pathname, url);
    if (handled) return;
  }

  if (pathname.startsWith('/api/leads')) {
    const handled = await getLeadsApi().handle(req, res, pathname, url);
    if (handled) return;
  }

  if (pathname.startsWith('/api/admin/operating-costs')) {
    const handled = await getOperatingCostsApi().handle(req, res, pathname, url);
    if (handled) return;
  }

  // GHL workflow webhook — auto-tag person:dnc / system:landline (no admin session)
  if (pathname.startsWith('/api/webhooks/ghl/')) {
    const handled = await getCampaignsSmsApi().handleWebhook(req, res, pathname, url);
    if (handled) return;
  }

  if (pathname.startsWith('/api/admin/campaigns/sms')) {
    const handled = await getCampaignsSmsApi().handle(req, res, pathname, url);
    if (handled) return;
  }

  if (pathname.startsWith('/api/buyers')) {
    const handled = await getBuyersApi().handle(req, res, pathname);
    if (handled) return;
  }

  if (pathname.startsWith('/api/pre-lien')) {
    const handled = await getPreLienApi().handle(req, res, pathname);
    if (handled) return;
  }

  if (pathname.startsWith('/api/gov-playbooks')) {
    const handled = await getGovPlaybooksApi().handle(req, res, pathname);
    if (handled) return;
  }

  // Government lists meta + sources (state=all or omit for nationwide; optional listType)
  if (pathname.startsWith('/api/gov-lists') && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const govLists = require('./lib/gov-lists-catalog');
      if (pathname === '/api/gov-lists/meta') {
        const meta = govLists.getMeta();
        send(res, 200, JSON.stringify({ ok: true, meta }), 'application/json', {
          'Cache-Control': 'public, max-age=300, must-revalidate'
        });
        return;
      }
      if (pathname === '/api/gov-lists/sources') {
        const stateQ = url.searchParams.get('state') || '';
        const listType = url.searchParams.get('listType') || '';
        const result = govLists.getSources({ state: stateQ, listType });
        send(res, 200, JSON.stringify({ ok: true, ...result }), 'application/json', {
          'Cache-Control': 'public, max-age=300, must-revalidate'
        });
        return;
      }
      send(res, 404, JSON.stringify({ ok: false, error: 'Not found' }), 'application/json');
      return;
    } catch (err) {
      const code = err && err.code;
      const status = code === 'STATE_REQUIRED' ? 400 : code === 'CATALOG_MISSING' ? 404 : 500;
      send(res, status, JSON.stringify({
        ok: false,
        error: err.message || 'gov-lists error',
        code: code || 'GOV_LISTS_ERROR'
      }), 'application/json');
      return;
    }
  }

  if (isForgeRequest(pathname)) {
    if (rejectUnauthorizedModule(req, res, 'Form Forge')) return;
    proxyToForge(req, res, pathname, url.search);
    return;
  }

  if (isAnalyzerRequest(pathname)) {
    if (rejectUnauthorizedModule(req, res, 'Property Analyzer')) return;
    if (runtime.useEmbeddedAnalyzer()) {
      await getEmbeddedAnalyzer().dispatchEmbeddedAnalyzer(req, res, pathname, url.search);
      return;
    }
    proxyToAnalyzer(req, res, pathname, url.search);
    return;
  }

  // Wave 2: Trust Funds is not a second product — send bookmarks to Buyers.
  if (pathname === '/trust-funds') {
    res.writeHead(302, {
      Location: '/buyers',
      'Cache-Control': 'no-store'
    });
    res.end();
    return;
  }

  if (config.DISTRESS_ROUTES[pathname]) {
    const auth = require('./lib/phuglee-auth');
    if (auth.isAuthRequired()) {
      const session = auth.readSessionFromReq(req);
      if (session && session.username) {
        const {
          isPathAllowedForUsername,
          defaultHomeForUsername,
          normalizePath
        } = require('./lib/phuglee-roles');
        const pagePath = normalizePath(pathname);
        // Public landers stay reachable; restricted roles are bounced to their home.
        if (pagePath !== '/' && pagePath !== '/heat' && !isPathAllowedForUsername(session.username, pagePath)) {
          res.writeHead(302, {
            Location: defaultHomeForUsername(session.username),
            'Cache-Control': 'no-store'
          });
          res.end();
          return;
        }
      }
    }
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
    // Never ship bootstrap passwords to the browser. Auth is server-verified.
    const body = config.AUTH_DISABLED
      ? [
          '(function () {',
          '  window.__PHUGLEE_AUTH_DISABLED__ = true;',
          "  try {",
          "    sessionStorage.removeItem('phuglee_logout');",
          "    sessionStorage.setItem('phuglee_session', 'admin');",
          '  } catch (_) {}',
          '})();',
          ''
        ].join('\n')
      : [
          '(function () {',
          '  window.__PHUGLEE_AUTH_DISABLED__ = false;',
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

  // Admin Campaigns → SMS (pretty path)
  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/campaigns/sms') {
    serveStatic('/campaigns-sms.html', req, res);
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && isDistressStatic(pathname)) {
    serveStatic(pathname, req, res);
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

function runListOpsMigrations() {
  try {
    const {
      resetCitiesStatusToReady,
      resetAllDownloadedStatusToReady
    } = require('./lib/bridge-list-store');
    // One-time: Cheyenne / Midlothian were marked Downloaded during testing — back to Ready.
    const result = resetCitiesStatusToReady(['Cheyenne', 'Midlothian'], {
      onceKey: 'ready-cheyenne-midlothian-v1'
    });
    if (result.skipped) {
      console.log('[Filter lists] status reset already applied (Cheyenne/Midlothian)');
    } else if (result.updated > 0) {
      console.log(
        `[Filter lists] reset ${result.updated} list(s) to Ready:`,
        result.matches.join(', ')
      );
    } else {
      console.log('[Filter lists] no Cheyenne/Midlothian lists needed status reset');
    }

    // One-time: operator accidental bulk download — restore all Downloaded → Ready.
    const allDl = resetAllDownloadedStatusToReady({
      onceKey: 'ready-all-downloaded-2026-07-12'
    });
    if (allDl.skipped) {
      console.log('[Filter lists] all-downloaded→ready already applied');
    } else if (allDl.updated > 0) {
      console.log(
        `[Filter lists] reset ${allDl.updated} Downloaded list(s) to Ready:`,
        allDl.matches.slice(0, 40).join(', ') +
          (allDl.matches.length > 40 ? ` …+${allDl.matches.length - 40} more` : '')
      );
    } else {
      console.log('[Filter lists] no Downloaded lists needed status reset');
    }
  } catch (err) {
    console.warn('[Filter lists] status migration skipped:', err.message);
  }
}

function startStandaloneServer() {
  try {
    const { ensureVaultOnlyUser } = require('./lib/phuglee-credentials');
    const ensured = ensureVaultOnlyUser();
    if (ensured.ok) {
      console.log(`[auth] Ensured vault-only user: ${ensured.username}`);
    }
  } catch (err) {
    console.warn('[auth] ensureVaultOnlyUser skipped:', err.message);
  }

  const publicHost = config.loopbackHost(config.HOST);
  const onListening = () => {
    console.log(`Distress OS running at http://${publicHost}:${config.PORT}`);
    console.log(`Railway PORT env: ${process.env.PORT || '(unset)'} | bound: ${config.PORT} host: ${config.HOST || '(dual-stack default)'}`);
    console.log(`Form Forge proxy: http://${publicHost}:${config.PORT}${config.FORGE_PREFIX}/`);
    console.log(`Property Analyzer proxy: http://${publicHost}:${config.PORT}${config.ANALYZER_PREFIX}/`);
    runListOpsMigrations();
    try {
      const { warmCatalogIndex } = require('./lib/leads-platform/store');
      const warmed = warmCatalogIndex();
      console.log(`[Leads catalog] warmed index leads=${warmed.leads} in ${warmed.ms}ms`);
    } catch (err) {
      console.warn('[Leads catalog] warm failed:', err.message);
    }
    try {
      const { startSignNowBackgroundSync } = require('./lib/leads-platform/contracts');
      startSignNowBackgroundSync({ intervalMs: 60000 });
    } catch (err) {
      console.warn('[signnow] background sync start failed:', err.message);
    }
    bootModules().catch((err) => {
      console.error('[Distress OS] Module boot error:', err);
    });
  };

  // Empty HOST → let Node pick dual-stack so both 127.0.0.1 and localhost (::1) work on Windows.
  if (config.HOST) {
    server.listen(config.PORT, config.HOST, onListening);
  } else {
    server.listen(config.PORT, onListening);
  }
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