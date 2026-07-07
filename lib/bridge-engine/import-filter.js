const { DISCARD_REASONS } = require('../bridge-intake-schema');
const { rowAddressKey, normalizeAddressKey } = require('../analyzer-import-index');
const { similarityScore } = require('../bridge-dedup');

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
  return indexList.some((existing) => keys.some((key) => similarityScore(existing, key) >= threshold)
    || (street && similarityScore(existing, street) >= threshold));
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
  filterAlreadyImported
};