const fs = require('fs');
const http = require('http');
const config = require('./config');
const {
  resolveSessionScope,
  scopeSessionPath,
  sessionHasAddresses
} = require('../modules/property-analyzer/lib/user-session');
const { sanitizePhugleeUsername, sanitizePhugleePlan } = require('./phuglee-user');

const CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_FILE = 'distressAnalyzerSession_LATEST.json';
const cacheByScope = new Map();

function normalizeAddressKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[#,./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recordAddressKey(record) {
  if (!record || typeof record !== 'object') return '';
  const full = String(record.address || '').trim()
    || [record.street, record.city, record.state, record.postal || record.zip]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ');
  return normalizeAddressKey(full);
}

function addRecordIndexKeys(addresses, record) {
  const keys = new Set();
  const full = recordAddressKey(record);
  if (full) keys.add(full);

  const addressField = String(record.address || '').trim();
  const street = normalizeAddressKey(record.street || (addressField ? addressField.split(',')[0] : ''));
  if (street) keys.add(street);

  const composedFull = [
    record.street || (addressField ? addressField.split(',')[0].trim() : ''),
    record.city,
    record.state,
    record.postal || record.zip
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
  if (composedFull) keys.add(normalizeAddressKey(composedFull));

  for (const key of keys) addresses.add(key);
  return keys.size > 0;
}

function buildIndexFromSession(session) {
  const addresses = new Set();
  const sources = { records: 0, results: 0 };

  for (const record of session?.records || []) {
    if (!addRecordIndexKeys(addresses, record)) continue;
    sources.records += 1;
  }

  for (const result of session?.results || []) {
    const before = addresses.size;
    if (!addRecordIndexKeys(addresses, result)) continue;
    if (addresses.size > before) sources.results += 1;
  }

  return { addresses, count: addresses.size, sources };
}

function resolveIndexScope({ username = '', plan = '' } = {}) {
  return resolveSessionScope({
    username: sanitizePhugleeUsername(username),
    plan: sanitizePhugleePlan(plan)
  });
}

function readSessionFromDisk(scope) {
  const file = scopeSessionPath(config.ANALYZER_DATA_ROOT, SESSION_FILE, scope);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn('[Bridge] Could not read analyzer session file:', err.message);
    return null;
  }
}

function fetchIndexFromApi(scope) {
  const headers = { Accept: 'application/json' };
  if (scope?.username) headers['X-Phuglee-User'] = scope.username;
  if (scope?.plan) headers['X-Phuglee-Plan'] = scope.plan;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.ANALYZER_HOST,
        port: config.ANALYZER_PORT,
        path: '/api/import-address-index',
        method: 'GET',
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (res.statusCode < 200 || res.statusCode >= 300 || !body.ok) {
              reject(new Error(body.error || `Analyzer index request failed (${res.statusCode})`));
              return;
            }
            resolve(body);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function emptyIndex() {
  return { addresses: new Set(), count: 0, sources: null };
}

function cacheKeyForScope(scope) {
  return scope?.storageKey || '_anonymous';
}

function indexFromApiBody(body) {
  const addresses = new Set(
    (body.addresses || []).map((addr) => normalizeAddressKey(addr)).filter(Boolean)
  );
  return {
    addresses,
    count: addresses.size,
    sources: body.sources || null
  };
}

async function loadImportAddressIndex({ force = false, username = '', plan = '' } = {}) {
  const scope = resolveIndexScope({ username, plan });
  const cacheKey = cacheKeyForScope(scope);
  const now = Date.now();
  const cached = cacheByScope.get(cacheKey);
  if (!force && cached?.loadedAt && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  let index = emptyIndex();

  try {
    const body = await fetchIndexFromApi(scope);
    index = indexFromApiBody(body);
  } catch (err) {
    console.warn('[Bridge] Analyzer import index API unavailable:', err.message);
    const session = readSessionFromDisk(scope);
    if (sessionHasAddresses(session)) {
      index = buildIndexFromSession(session);
    }
  }

  const nextCache = {
    loadedAt: now,
    addresses: index.addresses,
    count: index.count,
    sources: index.sources,
    scope: scope.kind,
    storageKey: scope.storageKey
  };
  cacheByScope.set(cacheKey, nextCache);
  return nextCache;
}

function rowAddressKey(row) {
  const full = [row.streetAddress, row.city, row.state, row.zip]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
  return normalizeAddressKey(full);
}

module.exports = {
  normalizeAddressKey,
  recordAddressKey,
  rowAddressKey,
  buildIndexFromSession,
  loadImportAddressIndex,
  emptyIndex,
  readSessionFromDisk,
  sessionHasAddresses,
  resolveIndexScope
};