/**
 * Per-city Type-column format memory.
 * Durable fingerprint + last confirmed typeHeader by cityId + uploadType.
 * Supports multiple formats per city (by fingerprint) so mixed-sheet batches
 * can each remember their Type column.
 * Separate from global-brain.json — never nest format memory in the brain file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { normalizeHeader } = require('./bridge-intake-schema');

function emptyCityFormats() {
  return {
    version: 1,
    cities: {}
  };
}

/** Read config at call time so tests can override BRIDGE_CITY_FORMATS_ROOT. */
function cityFormatsPath() {
  return path.join(config.BRIDGE_CITY_FORMATS_ROOT, 'city-formats.json');
}

/**
 * Order-independent normalized header fingerprint (sha1 hex).
 * Does not hash row counts or file bytes.
 * @param {string[]|unknown} headers
 * @returns {string}
 */
function computeFormatFingerprint(headers) {
  const list = Array.isArray(headers) ? headers : [];
  const normalized = list
    .map((h) => normalizeHeader(h))
    .filter((h) => h && h !== '_meta')
    .sort();
  const base = normalized.join('\u0001');
  return crypto.createHash('sha1').update(base, 'utf8').digest('hex');
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * Load full city-formats document. Missing or corrupt → empty, no throw.
 * @returns {{ version: number, cities: object }}
 */
function loadCityFormats() {
  const filePath = cityFormatsPath();
  if (!fs.existsSync(filePath)) return emptyCityFormats();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyCityFormats();
    const cities = raw.cities && typeof raw.cities === 'object' ? raw.cities : {};
    return {
      version: Number(raw.version) || 1,
      cities
    };
  } catch (err) {
    console.warn('[Bridge city-formats] Could not read', filePath, err.message);
    return emptyCityFormats();
  }
}

/**
 * Normalize a stored entry to always expose fingerprint + typeHeader.
 * @param {object} entry
 * @param {string} [fingerprint]
 */
function normalizeEntry(entry, fingerprint) {
  if (!entry || typeof entry !== 'object') return null;
  const fp = fingerprint || entry.fingerprint || '';
  return {
    fingerprint: fp,
    typeHeader: Object.prototype.hasOwnProperty.call(entry, 'typeHeader')
      ? entry.typeHeader
      : undefined,
    confirmedAt: entry.confirmedAt,
    confirmedBy: entry.confirmedBy,
    sourceFileLast: entry.sourceFileLast,
    headerSnapshot: entry.headerSnapshot
  };
}

/**
 * Load one city+uploadType entry, or null if missing.
 * When fingerprint is provided, match that format only (byFingerprint map or legacy single).
 * When fingerprint is omitted, return the last-confirmed (legacy primary) entry.
 * @param {string} cityId
 * @param {string} uploadType
 * @param {string} [fingerprint]
 * @returns {object|null}
 */
function loadCityFormat(cityId, uploadType, fingerprint) {
  if (!cityId || !uploadType) return null;
  const doc = loadCityFormats();
  const city = doc.cities[cityId];
  if (!city || typeof city !== 'object') return null;
  const entry = city[uploadType];
  if (!entry || typeof entry !== 'object') return null;

  const byFp =
    entry.byFingerprint && typeof entry.byFingerprint === 'object'
      ? entry.byFingerprint
      : null;

  if (fingerprint) {
    if (byFp && byFp[fingerprint] && typeof byFp[fingerprint] === 'object') {
      return normalizeEntry(byFp[fingerprint], fingerprint);
    }
    // Legacy single-format entry
    if (entry.fingerprint === fingerprint) {
      return normalizeEntry(entry, fingerprint);
    }
    return null;
  }

  // No fingerprint: prefer last primary fields
  if (entry.fingerprint) {
    return normalizeEntry(entry, entry.fingerprint);
  }
  // Only byFingerprint map — return most recently confirmed if any
  if (byFp) {
    const keys = Object.keys(byFp);
    if (!keys.length) return null;
    let best = null;
    let bestAt = '';
    for (const k of keys) {
      const e = byFp[k];
      if (!e || typeof e !== 'object') continue;
      const at = String(e.confirmedAt || '');
      if (!best || at > bestAt) {
        best = normalizeEntry(e, k);
        bestAt = at;
      }
    }
    return best;
  }
  return null;
}

/**
 * Persist format memory for cityId + uploadType.
 * typeHeader may be null (admin confirmed "No type column").
 * Writes both primary (last) entry and byFingerprint[fp] for multi-format cities.
 * @param {{
 *   cityId: string,
 *   uploadType: string,
 *   fingerprint: string,
 *   typeHeader?: string|null,
 *   confirmedBy?: string,
 *   sourceFileLast?: string,
 *   headerSnapshot?: string[]
 * }} opts
 * @returns {object} saved entry
 */
function saveCityFormat(opts = {}) {
  const cityId = opts.cityId;
  const uploadType = opts.uploadType;
  const fingerprint = opts.fingerprint;

  if (!cityId || !uploadType) {
    const err = new Error('saveCityFormat requires cityId and uploadType');
    err.code = 'INVALID_CITY_FORMAT';
    throw err;
  }
  if (typeof fingerprint !== 'string' || !fingerprint) {
    const err = new Error('saveCityFormat requires fingerprint string');
    err.code = 'INVALID_CITY_FORMAT';
    throw err;
  }

  const doc = loadCityFormats();
  if (!doc.cities[cityId] || typeof doc.cities[cityId] !== 'object') {
    doc.cities[cityId] = {};
  }

  const prev = doc.cities[cityId][uploadType];
  const byFingerprint =
    prev && prev.byFingerprint && typeof prev.byFingerprint === 'object'
      ? { ...prev.byFingerprint }
      : {};

  // Migrate legacy single entry into map
  if (prev && prev.fingerprint && !byFingerprint[prev.fingerprint]) {
    byFingerprint[prev.fingerprint] = {
      typeHeader: Object.prototype.hasOwnProperty.call(prev, 'typeHeader')
        ? prev.typeHeader
        : undefined,
      confirmedAt: prev.confirmedAt,
      confirmedBy: prev.confirmedBy,
      sourceFileLast: prev.sourceFileLast,
      headerSnapshot: prev.headerSnapshot
    };
  }

  const slice = {
    typeHeader: Object.prototype.hasOwnProperty.call(opts, 'typeHeader')
      ? opts.typeHeader
      : undefined,
    confirmedAt: new Date().toISOString(),
    confirmedBy: opts.confirmedBy != null ? opts.confirmedBy : undefined,
    sourceFileLast: opts.sourceFileLast != null ? opts.sourceFileLast : undefined,
    headerSnapshot: Array.isArray(opts.headerSnapshot) ? opts.headerSnapshot : undefined
  };
  if (Object.prototype.hasOwnProperty.call(opts, 'typeHeader')) {
    slice.typeHeader = opts.typeHeader;
  }

  byFingerprint[fingerprint] = slice;

  const entry = {
    fingerprint,
    typeHeader: slice.typeHeader,
    confirmedAt: slice.confirmedAt,
    confirmedBy: slice.confirmedBy,
    sourceFileLast: slice.sourceFileLast,
    headerSnapshot: slice.headerSnapshot,
    byFingerprint
  };

  doc.cities[cityId][uploadType] = entry;
  writeJsonAtomic(cityFormatsPath(), doc);
  return normalizeEntry(entry, fingerprint);
}

module.exports = {
  emptyCityFormats,
  cityFormatsPath,
  computeFormatFingerprint,
  loadCityFormats,
  loadCityFormat,
  saveCityFormat
};
