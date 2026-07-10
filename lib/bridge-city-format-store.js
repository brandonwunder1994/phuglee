/**
 * Per-city Type-column format memory.
 * Durable fingerprint + last confirmed typeHeader by cityId + uploadType.
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
 * Load one city+uploadType entry, or null if missing.
 * @param {string} cityId
 * @param {string} uploadType
 * @returns {object|null}
 */
function loadCityFormat(cityId, uploadType) {
  if (!cityId || !uploadType) return null;
  const doc = loadCityFormats();
  const city = doc.cities[cityId];
  if (!city || typeof city !== 'object') return null;
  const entry = city[uploadType];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

/**
 * Persist format memory for cityId + uploadType.
 * typeHeader may be null (admin confirmed "No type column").
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

  const entry = {
    fingerprint,
    typeHeader: Object.prototype.hasOwnProperty.call(opts, 'typeHeader')
      ? opts.typeHeader
      : undefined,
    confirmedAt: new Date().toISOString(),
    confirmedBy: opts.confirmedBy != null ? opts.confirmedBy : undefined,
    sourceFileLast: opts.sourceFileLast != null ? opts.sourceFileLast : undefined,
    headerSnapshot: Array.isArray(opts.headerSnapshot) ? opts.headerSnapshot : undefined
  };

  // Ensure typeHeader key is always present when caller passed it (incl. null)
  if (Object.prototype.hasOwnProperty.call(opts, 'typeHeader')) {
    entry.typeHeader = opts.typeHeader;
  }

  doc.cities[cityId][uploadType] = entry;
  writeJsonAtomic(cityFormatsPath(), doc);
  return entry;
}

module.exports = {
  emptyCityFormats,
  cityFormatsPath,
  computeFormatFingerprint,
  loadCityFormats,
  loadCityFormat,
  saveCityFormat
};
