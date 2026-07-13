const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const imageryCache = require('./imagery-cache');
const config = require('./lib/config');
const { sendJson, readBody, corsPreflight } = require('./lib/http');
const { createRouter } = require('./lib/router');
const { runStartupVolumeMaintenance } = require('./lib/disk-cleanup');
const createBackups = require('./lib/backups');
const createSafety = require('./lib/safety');
const { ensureSeededSession } = require('./lib/seed-session');
const mapsModule = require('./routes/maps');
const geminiModule = require('./routes/gemini');
const { createUsageStore } = require('./lib/api-usage');

config.loadEnvFile();

const safetyRef = { current: null };
const backups = createBackups({ config, fs, path, crypto, getSafety: () => safetyRef.current });
const safety = createSafety({ config, fs, path, crypto, backups });
safetyRef.current = safety;

const startupSeedResult = ensureSeededSession({ config, fs, path });
if (startupSeedResult.seeded) {
  backups.invalidateSessionCaches();
  console.log(`[Session] Seeded scoped sessions (${startupSeedResult.seedResults} results)`);
}
if (startupSeedResult.migration?.migrated) {
  console.log(`[Session] Migrated global session to admin (${startupSeedResult.migration.results} results)`);
}

const {
  PORT,
  LOCAL_HOSTNAME,
  ROOT,
  SESSION_LATEST_FILE,
  GEMINI_AUDIT_DIR,
  AUTO_BACKUPS_DIR,
  MILESTONE_BACKUPS_DIR,
  MANUAL_BACKUPS_DIR,
  MAX_EPHEMERAL_BACKUPS,
  MAX_MILESTONE_BACKUPS,
  MAX_MANUAL_BACKUPS,
  AUTO_SAFETY_TICK_MS,
  AUTH_TOKEN_FILE,
  MAPS_KEY_FILE
} = config;

let authToken = '';

function readOrCreateAuthToken() {
  const fromEnv = String(process.env.PDA_AUTH_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    if (fs.existsSync(AUTH_TOKEN_FILE)) {
      const existing = fs.readFileSync(AUTH_TOKEN_FILE, 'utf8').trim();
      if (existing) return existing;
    }
  } catch (_) {}
  const token = crypto.randomBytes(32).toString('hex');
  try {
    const logsDir = path.dirname(AUTH_TOKEN_FILE);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(AUTH_TOKEN_FILE, token, 'utf8');
  } catch (err) {
    console.warn('[Auth] Could not persist token file:', err.message);
  }
  return token;
}

function extractAuthToken(req) {
  const bearer = req.headers.authorization || '';
  if (bearer.startsWith('Bearer ')) return bearer.slice(7).trim();
  const header = req.headers['x-pda-token'];
  if (header) return String(header).trim();
  return null;
}

function requireAuth(req, res) {
  const provided = extractAuthToken(req);
  if (provided && provided === authToken) return true;
  sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  return false;
}

const SESSION_GET_API = [
  '/api/session-summary',
  '/api/session-review-meta',
  '/api/session-results',
  '/api/session-result-profile',
  '/api/session-records',
  '/api/session-backup',
  '/api/import-address-index'
];

function requiresAuth(method, pathname) {
  if (!pathname.startsWith('/api/')) return false;
  if (method === 'POST') return true;
  if (method === 'GET') {
    return SESSION_GET_API.some(route => pathname === route || pathname.startsWith(route + '?'));
  }
  return false;
}

authToken = readOrCreateAuthToken();
mapsModule.loadServerMapsKey(MAPS_KEY_FILE);
geminiModule.loadGeminiKey();

const apiStats = {
  startedAt: Date.now(),
  geminiOk: 0,
  geminiFail: 0,
  gemini429: 0,
  gemini503: 0,
  gemini429Times: [],
  geminiHardQuota: 0,
  mapsOk: 0,
  mapsFail: 0,
  streetViewOk: 0,
  streetViewFail: 0,
  mapsHardQuota: 0,
  lastGeminiError: '',
  lastGeminiErrorAt: 0,
  lastMapsError: '',
  lastMapsErrorAt: 0,
  lastHardQuota: null
};

const usageStore = createUsageStore(config.DATA_ROOT || path.join(__dirname));

function getServerConfig() {
  const maps = mapsModule.mapsKeyStatus(MAPS_KEY_FILE);
  const gemini = geminiModule.geminiKeyStatus();
  return {
    ok: true,
    hasMapsKey: maps.hasServerKey,
    hasGeminiKey: gemini.hasGeminiKey,
    mapsKeyTail: maps.keyTail,
    geminiKeyTail: gemini.geminiKeyTail,
    hasServerKey: maps.hasServerKey,
    keyTail: maps.keyTail,
    authRequired: true
  };
}

function getApiStatus() {
  const now = Date.now();
  apiStats.gemini429Times = apiStats.gemini429Times.filter(t => now - t < 120000);
  const recent429 = apiStats.gemini429Times.length;
  const rateLimited = recent429 >= 3 || /429|rate limit/i.test(apiStats.lastGeminiError);
  const mapsQueue = mapsModule.getMapsQueueState();
  const geminiQueue = geminiModule.getGeminiQueueState();
  const usage = usageStore.snapshot(apiStats);
  const hardQuotaActive = !!(usage.hardQuotaActive || apiStats.lastHardQuota);
  return {
    ok: true,
    uptimeSec: Math.floor((now - apiStats.startedAt) / 1000),
    gemini: {
      active: geminiQueue.active,
      waiting: geminiQueue.waiting,
      maxConcurrent: geminiQueue.maxConcurrent,
      ok: apiStats.geminiOk,
      fail: apiStats.geminiFail,
      recent429,
      total429: apiStats.gemini429,
      total503: apiStats.gemini503,
      hardQuota: apiStats.geminiHardQuota || 0,
      rateLimited,
      lastError: apiStats.lastGeminiError,
      lastErrorAgeSec: apiStats.lastGeminiErrorAt
        ? Math.floor((now - apiStats.lastGeminiErrorAt) / 1000)
        : null
    },
    maps: {
      active: mapsQueue.active,
      waiting: mapsQueue.waiting,
      maxConcurrent: mapsQueue.maxConcurrent,
      ok: apiStats.mapsOk,
      fail: apiStats.mapsFail,
      hardQuota: apiStats.mapsHardQuota || 0,
      lastError: apiStats.lastMapsError || '',
      lastErrorAgeSec: apiStats.lastMapsErrorAt
        ? Math.floor((now - apiStats.lastMapsErrorAt) / 1000)
        : null
    },
    streetView: {
      ok: apiStats.streetViewOk,
      fail: apiStats.streetViewFail
    },
    usage,
    hardQuotaActive,
    lastHardQuota: usage.lastHardQuota || apiStats.lastHardQuota || null
  };
}

const router = createRouter();
const ctx = {
  router,
  sendJson,
  readBody,
  requireAuth,
  config,
  backups,
  safety,
  imageryCache,
  authToken,
  apiStats,
  usageStore,
  fs,
  path
};

require('./routes/static').register(ctx);
require('./routes/session').register(ctx);
require('./routes/bridge').register(ctx);
mapsModule.register(ctx);
require('./routes/imagery').register(ctx);
geminiModule.register(ctx);

async function handleAnalyzerRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    return corsPreflight(res);
  }

  try {
    if (requiresAuth(req.method, url.pathname)) {
      if (!requireAuth(req, res)) return;
    }

    if (url.pathname === '/api/status') {
      return sendJson(res, 200, getApiStatus());
    }

    if (url.pathname === '/api/usage' && req.method === 'GET') {
      return sendJson(res, 200, usageStore.snapshot(apiStats));
    }

    if (url.pathname === '/api/usage/clear-quota' && req.method === 'POST') {
      usageStore.clearHardQuota();
      apiStats.lastHardQuota = null;
      return sendJson(res, 200, { ok: true, usage: usageStore.snapshot(apiStats) });
    }

    if ((url.pathname === '/api/config' || url.pathname === '/api/maps-config') && req.method === 'GET') {
      return sendJson(res, 200, getServerConfig());
    }

    if (url.pathname === '/api/maps-key' && req.method === 'POST') {
      return sendJson(res, 410, { ok: false, error: 'Maps key is configured via .env MAPS_API_KEY' });
    }

    const handled = await router.dispatch(req, res, url);
    if (!handled) {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    sendJson(res, status, { ok: false, error: err.message, code: err.code || undefined });
  }
}

const server = http.createServer((req, res) => {
  handleAnalyzerRequest(req, res).catch((err) => {
    sendJson(res, 500, { ok: false, error: err.message });
  });
});

function logServerFault(label, err) {
  const msg = err?.stack || err?.message || String(err);
  console.error(`[Server] ${label}:`, msg);
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(path.join(logsDir, 'server.log'), `[${new Date().toISOString()}] ${label}: ${msg}\n`);
  } catch (_) {}
}

const PID_FILE = path.join(__dirname, 'logs', 'server.pid');

function writePidFile() {
  try {
    const logsDir = path.dirname(PID_FILE);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  } catch (_) {}
}

function removePidFile() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch (_) {}
}

function shutdownServer(signal) {
  logServerFault('shutdown', signal || 'exit');
  removePidFile();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    logServerFault('already-running', err);
    process.exit(0);
    return;
  }
  logServerFault('server-error', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logServerFault('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  logServerFault('unhandledRejection', err);
});

const isEmbedded = process.env.ANALYZER_EMBEDDED === '1';

if (!isEmbedded) {
  process.on('SIGINT', () => shutdownServer('SIGINT'));
  process.on('SIGTERM', () => shutdownServer('SIGTERM'));
}

function bootStandaloneServer() {
  // Bind immediately so /api/status is up before we parse multi-10MB session files.
  // Eager promote/read of large sessions was delaying health and causing parent 502s.
  server.listen(PORT, '127.0.0.1', () => {
    writePidFile();
    const maps = mapsModule.mapsKeyStatus(MAPS_KEY_FILE);
    const gemini = geminiModule.geminiKeyStatus();
    const authTail = authToken.length >= 6 ? authToken.slice(-6) : '(short)';
    console.log('');
    console.log('  Property Distress Analyzer');
    console.log('  --------------------------');
    console.log(`  Open: http://${LOCAL_HOSTNAME}:${PORT}`);
    console.log(`       http://localhost:${PORT} (also works)`);
    console.log(`  Auth: token …${authTail}`);
    console.log(`  Maps key: ${maps.hasServerKey ? `configured (…${maps.keyTail})` : 'missing — add MAPS_API_KEY to .env'}`);
    console.log(`  Gemini key: ${gemini.hasGeminiKey ? `configured (…${gemini.geminiKeyTail})` : 'missing — add GEMINI_API_KEY to .env'}`);
    console.log(`  Gemini queue: max ${geminiModule.GEMINI_MAX_CONCURRENT} concurrent AI calls`);
    console.log(`  Maps queue: max ${mapsModule.MAPS_MAX_CONCURRENT} concurrent Google Maps calls`);
    console.log(`  Imagery cache:  ${imageryCache.IMAGERY_DIR}`);
    console.log('');
    console.log('  Keep this window open while using the tool.');
    console.log('');

    setImmediate(() => {
      try {
        const volume = runStartupVolumeMaintenance(fs, path, config);
        if (volume.files > 0) {
          console.log(
            `[Volume] Startup maintenance freed ${volume.files} file(s), ~${Math.round(volume.bytes / 1024)} KB`
          );
        }
      } catch (err) {
        console.warn('[Volume] Startup maintenance failed:', err?.message || err);
      }
      try {
        const promoteResult = backups.promoteIncrementalToLatest('startup');
        safety.safetyState.lastStartupPromote = {
          at: Date.now(),
          promoted: !!promoteResult.promoted,
          results: promoteResult.results || 0,
          error: promoteResult.error || null
        };
        console.log(`[Safety] Startup promote: ${JSON.stringify(promoteResult)}`);
      } catch (err) {
        console.warn('[Safety] Startup promote failed:', err?.message || err);
      }
      try {
        const adminSession = backups.readLatestSessionFileForScope({ storageKey: 'admin' });
        const adminCount = Array.isArray(adminSession.results) ? adminSession.results.length : 0;
        const vaultSession = backups.readLatestSessionFileForScope({ storageKey: '_vault' });
        const vaultCount = Array.isArray(vaultSession.results) ? vaultSession.results.length : 0;
        console.log(`Scoped sessions: admin=${adminCount} results, vault=${vaultCount} results`);
      } catch (err) {
        console.warn('[Session] Startup session count failed:', err?.message || err);
      }
    });

    setInterval(safety.runAutoSafetyTick, AUTO_SAFETY_TICK_MS);
    setTimeout(safety.runAutoSafetyTick, 12000);
  });
}

if (!isEmbedded) {
  bootStandaloneServer();
}

module.exports = {
  handleAnalyzerRequest,
  server,
  getApiStatus
};