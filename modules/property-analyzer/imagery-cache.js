/**
 * Permanent property imagery cache — fetch from Google once, serve forever.
 *
 * Default: local disk at property_imagery/ (zero cost, zero egress).
 * Optional: Cloudflare R2 mirror when R2_* env vars are set (S3-compatible API).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/fs-atomic');
const { DATA_ROOT } = require('./lib/config');
const config = require('./lib/config');
const { freeSessionDiskSpace, isDiskSpaceError } = require('./lib/disk-cleanup');

const IMAGERY_DIR = process.env.PDA_IMAGERY_ROOT
  ? path.resolve(process.env.PDA_IMAGERY_ROOT)
  : path.join(DATA_ROOT, 'property_imagery');
const INDEX_FILE = path.join(IMAGERY_DIR, 'index.json');
const LOG_DIR = path.join(__dirname, 'logs');

const TYPES = ['streetview', 'satellite'];

function ensureDirs() {
  for (const t of TYPES) {
    fs.mkdirSync(path.join(IMAGERY_DIR, t), { recursive: true });
  }
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logImagery(msg, level = 'info') {
  const line = `[${new Date().toISOString()}] [imagery-cache] ${msg}\n`;
  if (level === 'error') console.error(`[Imagery] ${msg}`);
  else console.log(`[Imagery] ${msg}`);
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'imagery-cache.log'), line);
  } catch (_) {}
}

function normalizeAddress(address) {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function addressId(address) {
  return crypto.createHash('sha256').update(normalizeAddress(address)).digest('hex').slice(0, 16);
}

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  return '.jpg';
}

function publicUrl(type, id, mime) {
  const ext = extForMime(mime);
  return `/api/cached-imagery/${type}/${id}${ext}`;
}

function localFilePath(type, id, mime) {
  return path.join(IMAGERY_DIR, type, `${id}${extForMime(mime)}`);
}

let indexCache = null;
let indexMapCache = null;
let indexMapCacheMtime = 0;

function loadIndex() {
  if (indexCache) return indexCache;
  ensureDirs();
  if (!fs.existsSync(INDEX_FILE)) {
    indexCache = { version: 1, entries: {} };
    return indexCache;
  }
  try {
    indexCache = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (!indexCache.entries) indexCache.entries = {};
  } catch (err) {
    logImagery(`Index corrupt, rebuilding from disk: ${err.message}`, 'error');
    indexCache = { version: 1, entries: {} };
    try {
      for (const type of TYPES) {
        const dir = path.join(IMAGERY_DIR, type);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          const m = file.match(/^([a-f0-9]{16})\.(jpe?g|png|webp)$/i);
          if (!m) continue;
          const id = m[1].toLowerCase();
          const ext = `.${m[2].toLowerCase().replace('jpeg', 'jpg')}`;
          const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
          const key = `${id}:${type}`;
          indexCache.entries[key] = {
            id,
            type,
            mime,
            path: path.join(type, `${id}${ext}`),
            url: publicUrl(type, id, mime),
            recovered: true,
            recoveredAt: Date.now()
          };
        }
      }
      saveIndex();
      logImagery(`Rebuilt imagery index with ${Object.keys(indexCache.entries).length} entries from disk`);
    } catch (rebuildErr) {
      logImagery(`Index rebuild failed: ${rebuildErr.message}`, 'error');
    }
  }
  return indexCache;
}

function tryRecoverDiskSpace() {
  try {
    return freeSessionDiskSpace(fs, path, config, { aggressive: true });
  } catch (_) {
    return { files: 0, bytes: 0 };
  }
}

function saveIndex() {
  ensureDirs();
  const idx = loadIndex();
  const payload = JSON.stringify(idx, null, 2);
  try {
    writeFileAtomic(INDEX_FILE, payload);
    indexMapCache = null;
    indexMapCacheMtime = 0;
    return true;
  } catch (err) {
    if (isDiskSpaceError(err)) {
      const freed = tryRecoverDiskSpace();
      logImagery(
        `Index save ENOSPC — freed ${freed.files} file(s), retrying`,
        'error'
      );
      try {
        writeFileAtomic(INDEX_FILE, payload);
        indexMapCache = null;
        indexMapCacheMtime = 0;
        return true;
      } catch (retryErr) {
        logImagery(`Index save failed after cleanup: ${retryErr.message}`, 'error');
        return false;
      }
    }
    logImagery(`Index save failed: ${err.message}`, 'error');
    return false;
  }
}

function indexKey(address, type) {
  return `${addressId(address)}:${type}`;
}

function getEntry(address, type) {
  const idx = loadIndex();
  const key = indexKey(address, type);
  const entry = idx.entries[key];
  if (!entry) return null;
  const filePath = localFilePath(type, entry.id, entry.mimeType);
  if (entry.status === 'ok' && !fs.existsSync(filePath)) {
    entry.status = 'missing';
    saveIndex();
    return entry;
  }
  return entry;
}

function hasCachedImagery(address, type) {
  const entry = getEntry(address, type);
  return entry?.status === 'ok' && fs.existsSync(localFilePath(type, entry.id, entry.mimeType));
}

function getCachedUrl(address, type) {
  const entry = getEntry(address, type);
  if (!entry) return null;
  if (entry.status === 'unavailable') return null;
  if (entry.status === 'ok') {
    const url = entry.publicUrl || publicUrl(type, entry.id, entry.mimeType);
    if (fs.existsSync(localFilePath(type, entry.id, entry.mimeType))) return url;
  }
  return null;
}

function buildImageryRecord(address) {
  const sv = getEntry(address, 'streetview');
  const sat = getEntry(address, 'satellite');
  const imagery = {};
  if (sv) {
    imagery.streetView = {
      url: sv.status === 'ok' ? (sv.publicUrl || getCachedUrl(address, 'streetview')) : null,
      status: sv.status,
      cachedAt: sv.cachedAt || null,
      unavailable: sv.status === 'unavailable',
      error: sv.error || null
    };
  }
  if (sat) {
    imagery.satellite = {
      url: sat.status === 'ok' ? (sat.publicUrl || getCachedUrl(address, 'satellite')) : null,
      status: sat.status,
      cachedAt: sat.cachedAt || null,
      unavailable: sat.status === 'unavailable',
      error: sat.error || null
    };
  }
  return Object.keys(imagery).length ? imagery : null;
}

function saveImageryBuffer(address, type, buffer, mimeType, meta = {}) {
  if (!address || !type || !buffer?.length) {
    return { ok: false, error: 'Missing address, type, or image data' };
  }
  if (!TYPES.includes(type)) {
    return { ok: false, error: `Invalid type: ${type}` };
  }

  ensureDirs();
  const id = addressId(address);
  const mime = mimeType || 'image/jpeg';
  const filePath = localFilePath(type, id, mime);
  const url = publicUrl(type, id, mime);

  const writeBuffer = () => {
    fs.writeFileSync(filePath, buffer);
  };
  try {
    writeBuffer();
  } catch (err) {
    if (isDiskSpaceError(err)) {
      const freed = tryRecoverDiskSpace();
      logImagery(
        `Imagery save ENOSPC for ${address.slice(0, 50)} — freed ${freed.files} file(s), retrying`,
        'error'
      );
      try {
        writeBuffer();
      } catch (retryErr) {
        logImagery(`Imagery save failed after cleanup: ${retryErr.message}`, 'error');
        return { ok: false, error: retryErr.message, diskFull: true, cacheSkipped: true };
      }
    } else {
      logImagery(`Save failed ${address.slice(0, 50)}: ${err.message}`, 'error');
      return { ok: false, error: err.message };
    }
  }

  const entry = {
    id,
    address: String(address).trim(),
    type,
    status: 'ok',
    mimeType: mime,
    publicUrl: url,
    bytes: buffer.length,
    cachedAt: Date.now(),
    viewMeta: meta.viewMeta || null,
    source: meta.source || 'google'
  };

  const idx = loadIndex();
  idx.entries[indexKey(address, type)] = entry;
  if (!saveIndex()) {
    // Image file exists on disk; index update failed — scan can still use in-memory base64
    return { ok: true, url, entry, indexStale: true };
  }

  logImagery(`Cached ${type} for ${address.slice(0, 60)} (${buffer.length} bytes)`);

  uploadToR2IfConfigured(type, id, mime, buffer, entry).catch((err) => {
    logImagery(`R2 upload skipped/failed for ${id}: ${err.message}`, 'error');
  });

  return { ok: true, url, entry };
}

function clearImageryUnavailable(address, type) {
  if (!address || !TYPES.includes(type)) return { ok: false, cleared: false };
  const idx = loadIndex();
  const key = indexKey(address, type);
  const entry = idx.entries[key];
  if (!entry || entry.status !== 'unavailable') return { ok: true, cleared: false };
  delete idx.entries[key];
  saveIndex();
  logImagery(`Cleared ${type} unavailable flag: ${address.slice(0, 60)}`);
  return { ok: true, cleared: true };
}

function markImageryUnavailable(address, type, reason = 'No imagery available') {
  ensureDirs();
  const id = addressId(address);
  const entry = {
    id,
    address: String(address).trim(),
    type,
    status: 'unavailable',
    mimeType: null,
    publicUrl: null,
    cachedAt: Date.now(),
    error: reason
  };
  const idx = loadIndex();
  idx.entries[indexKey(address, type)] = entry;
  saveIndex();
  logImagery(`Marked ${type} unavailable: ${address.slice(0, 60)} — ${reason}`);
  return { ok: true, unavailable: true, entry };
}



const HOT_CACHE_MAX = 800;
const hotFileCache = new Map();

function readCachedFile(type, filename) {
  const safe = path.basename(filename);
  if (!/^[a-f0-9]{16}\.(jpg|jpeg|png|webp)$/i.test(safe)) return null;
  const cacheKey = `${type}/${safe}`;
  const hot = hotFileCache.get(cacheKey);
  if (hot) return hot;

  const filePath = path.join(IMAGERY_DIR, type, safe);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(safe).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const body = fs.readFileSync(filePath);
  const entry = { body, mimeType: mime };
  if (hotFileCache.size >= HOT_CACHE_MAX) {
    hotFileCache.delete(hotFileCache.keys().next().value);
  }
  hotFileCache.set(cacheKey, entry);
  return entry;
}

function readCachedByAddress(address, type) {
  const entry = getEntry(address, type);
  if (!entry || entry.status !== 'ok') return null;
  const filename = `${entry.id}${extForMime(entry.mimeType)}`;
  return readCachedFile(type, filename);
}

function lookupEntryByFilename(type, filename) {
  const safe = path.basename(filename || '');
  const match = safe.match(/^([a-f0-9]{16})\.(jpg|jpeg|png|webp)$/i);
  if (!match) return null;
  const id = match[1];
  const idx = loadIndex();
  for (const entry of Object.values(idx.entries || {})) {
    if (entry?.type === type && entry?.id === id) return entry;
  }
  return null;
}

function buildImageryIndexMap() {
  ensureDirs();
  let mtime = 0;
  if (fs.existsSync(INDEX_FILE)) {
    try { mtime = fs.statSync(INDEX_FILE).mtimeMs; } catch (_) {}
  }
  if (indexMapCache && indexMapCacheMtime === mtime) {
    return indexMapCache;
  }
  const idx = loadIndex();
  const map = {};
  for (const entry of Object.values(idx.entries || {})) {
    if (!entry?.address) continue;
    const key = normalizeAddress(entry.address);
    if (!map[key]) map[key] = {};
    if (entry.status === 'ok' && entry.publicUrl) {
      map[key][entry.type === 'satellite' ? 'satellite' : 'streetView'] = {
        url: entry.publicUrl,
        status: 'ok',
        cachedAt: entry.cachedAt || null
      };
    } else if (entry.status === 'unavailable') {
      map[key][entry.type === 'satellite' ? 'satellite' : 'streetView'] = {
        url: null,
        status: 'unavailable',
        unavailable: true,
        cachedAt: entry.cachedAt || null
      };
    }
  }
  indexMapCache = map;
  indexMapCacheMtime = mtime;
  return map;
}

function getStats() {
  const idx = loadIndex();
  const entries = Object.values(idx.entries || {});
  const stats = {
    total: entries.length,
    streetview: { ok: 0, unavailable: 0, missing: 0 },
    satellite: { ok: 0, unavailable: 0, missing: 0 },
    storageDir: IMAGERY_DIR,
    r2Configured: isR2Configured()
  };
  for (const e of entries) {
    const bucket = stats[e.type];
    if (!bucket) continue;
    if (e.status === 'ok') {
      const exists = fs.existsSync(localFilePath(e.type, e.id, e.mimeType));
      bucket[exists ? 'ok' : 'missing']++;
    } else if (e.status === 'unavailable') {
      bucket.unavailable++;
    }
  }
  return stats;
}

// ── Optional Cloudflare R2 (S3-compatible) ──────────────────────────────────

function isR2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET
  );
}

function getR2PublicBase() {
  const custom = process.env.R2_PUBLIC_URL;
  if (custom) return custom.replace(/\/$/, '');
  return null;
}

let s3ClientPromise = null;

async function getS3Client() {
  if (!isR2Configured()) return null;
  if (!s3ClientPromise) {
    s3ClientPromise = (async () => {
      try {
        const { S3Client } = require('@aws-sdk/client-s3');
        return new S3Client({
          region: 'auto',
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
          }
        });
      } catch (err) {
        logImagery(`@aws-sdk/client-s3 not installed — R2 uploads disabled. Run: npm install`, 'error');
        return null;
      }
    })();
  }
  return s3ClientPromise;
}

async function uploadToR2IfConfigured(type, id, mime, buffer, entry) {
  if (!isR2Configured()) return null;
  const client = await getS3Client();
  if (!client) return null;

  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `property-imagery/${type}/${id}${extForMime(mime)}`;
  const bucket = process.env.R2_BUCKET;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mime,
    CacheControl: 'public, max-age=31536000, immutable'
  }));

  const publicBase = getR2PublicBase();
  if (publicBase) {
    entry.r2Url = `${publicBase}/${key}`;
    const idx = loadIndex();
    const ik = indexKey(entry.address, type);
    if (idx.entries[ik]) {
      idx.entries[ik].r2Url = entry.r2Url;
      saveIndex();
    }
    logImagery(`R2 uploaded: ${key}`);
  }
  return key;
}

module.exports = {
  IMAGERY_DIR,
  TYPES,
  addressId,
  normalizeAddress,
  publicUrl,
  getEntry,
  hasCachedImagery,
  getCachedUrl,
  buildImageryRecord,
  buildImageryIndexMap,
  saveImageryBuffer,
  markImageryUnavailable,
  clearImageryUnavailable,
  readCachedFile,
  readCachedByAddress,
  lookupEntryByFilename,
  getStats,
  isR2Configured,
  getR2PublicBase,
  logImagery
};