const fs = require('fs');
const http = require('http');
const path = require('path');
const config = require('./config');

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { loadedAt: 0, addresses: new Set(), count: 0, sources: null };

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

function readSessionFromDisk() {
  const file = path.join(config.ANALYZER_PATH, 'distressAnalyzerSession_LATEST.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn('[Bridge] Could not read analyzer session file:', err.message);
    return null;
  }
}

function fetchIndexFromApi() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.ANALYZER_HOST,
        port: config.ANALYZER_PORT,
        path: '/api/import-address-index',
        method: 'GET',
        headers: { Accept: 'application/json' }
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

async function loadImportAddressIndex({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.loadedAt && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }

  let index = emptyIndex();
  const session = readSessionFromDisk();
  if (session) {
    index = buildIndexFromSession(session);
  } else {
    try {
      const body = await fetchIndexFromApi();
      const addresses = new Set(
        (body.addresses || []).map((addr) => normalizeAddressKey(addr)).filter(Boolean)
      );
      index = {
        addresses,
        count: addresses.size,
        sources: body.sources || null
      };
    } catch (err) {
      console.warn('[Bridge] Analyzer import index unavailable:', err.message);
    }
  }

  cache = {
    loadedAt: now,
    addresses: index.addresses,
    count: index.count,
    sources: index.sources
  };
  return cache;
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
  emptyIndex
};