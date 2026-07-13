const { DISCARD_REASONS } = require('../bridge-intake-schema');
const { rowAddressKey, normalizeAddressKey } = require('../analyzer-import-index');
const {
  similarityScore,
  leadingStreetNumber,
  normalizeAddress
} = require('../bridge-dedup');

/** Street-type tokens stripped when measuring "short name" cores. */
const STREET_TYPE_RE =
  /\b(street|avenue|boulevard|drive|road|lane|court|circle|place|terrace|highway|way|trail|parkway|alley|loop)\b/g;

/**
 * Significant street-name body (no house #, no type suffix).
 * Short bodies like "bay" / "day" are fuzzy-collision prone at 0.92.
 */
function streetNameBody(address) {
  const norm = normalizeAddress(address);
  if (!norm) return '';
  return norm
    .replace(/^\d+\s+/, '')
    .replace(STREET_TYPE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isShortStreetName(address) {
  const body = streetNameBody(address);
  // One short token ("bay", "oak", "a") or very short multi-token cores
  if (!body) return false;
  const tokens = body.split(' ').filter(Boolean);
  if (tokens.length === 1 && tokens[0].length <= 6) return true;
  return body.length <= 8;
}

/**
 * Fuzzy match with short-street guard: avoid "15 Bay St" ≈ "15 Day St" at 0.92.
 * Exact Set hits still win before this path runs.
 */
function fuzzyAddressMatch(candidate, existing, threshold) {
  const score = similarityScore(candidate, existing);
  if (score < threshold) return false;
  if (isShortStreetName(candidate) || isShortStreetName(existing)) {
    const left = streetNameBody(candidate);
    const right = streetNameBody(existing);
    if (left && right && left !== right) {
      // Require near-exact overall score when cores differ
      return score >= Math.max(threshold, 0.98);
    }
  }
  return true;
}

function rowMatchKeys(row) {
  const keys = [];
  const full = rowAddressKey(row);
  const street = normalizeAddressKey(row.streetAddress || '');
  if (full) keys.push(full);
  if (street) keys.push(street);
  return keys;
}

function matchesImported(row, importedAddresses, indexList, threshold) {
  const keys = rowMatchKeys(row);
  if (!keys.length) return false;

  for (const key of keys) {
    if (importedAddresses.has(key)) return true;
  }

  const street = String(row.streetAddress || '').trim();
  const streetNum = leadingStreetNumber(street);
  return indexList.some((existing) => {
    if (streetNum) {
      const existingNum = leadingStreetNumber(existing);
      if (existingNum && existingNum !== streetNum) return false;
    }
    return keys.some((key) => fuzzyAddressMatch(key, existing, threshold))
      || (street && fuzzyAddressMatch(street, existing, threshold));
  });
}

function filterAlreadyImported(rows, importedAddresses, options = {}) {
  const threshold = options.threshold ?? 0.92;
  const kept = [];
  const removed = [];

  if (!importedAddresses || !importedAddresses.size) {
    return { rows, removedCount: 0, removed };
  }

  const indexList = [...importedAddresses];

  for (const row of rows) {
    const matched = matchesImported(row, importedAddresses, indexList, threshold);

    if (matched) {
      removed.push({
        row,
        reason: DISCARD_REASONS.already_imported,
        rawPreview: row.streetAddress || rowAddressKey(row)
      });
    } else {
      kept.push(row);
    }
  }

  return {
    rows: kept,
    removedCount: removed.length,
    removed
  };
}

module.exports = {
  rowMatchKeys,
  matchesImported,
  filterAlreadyImported,
  streetNameBody,
  isShortStreetName,
  fuzzyAddressMatch
};