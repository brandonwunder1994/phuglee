const { normalizeAddress } = require('../imagery-cache');
const {
  addressMatchKey,
  addressMatchKeyLoose,
  buildKnownAddressKeySet
} = require('./address-match');

function recordAddressKey(record) {
  if (!record || typeof record !== 'object') return '';
  const full = String(record.address || '').trim()
    || [record.street, record.city, record.state, record.postal]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ');
  if (!full) return '';
  return normalizeAddress(full);
}

function addRecordIndexKeys(keys, record) {
  const added = new Set();
  const full = recordAddressKey(record);
  if (full) added.add(full);

  const addressField = String(record.address || '').trim();
  const street = normalizeAddress(String(record.street || (addressField ? addressField.split(',')[0] : '')).trim());
  if (street) added.add(street);

  const composedFull = [
    record.street || (addressField ? addressField.split(',')[0].trim() : ''),
    record.city,
    record.state,
    record.postal
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
  if (composedFull) added.add(normalizeAddress(composedFull));

  // Primary scan-desk keys (must match browser addressMatchKey)
  const match = addressMatchKey(record);
  if (match) added.add(match);
  const loose = addressMatchKeyLoose(record);
  if (loose) added.add(loose);

  for (const key of added) keys.add(key);
  return added.size > 0;
}

function buildImportAddressIndex(session) {
  const keys = new Set();
  const sources = {
    records: 0,
    results: 0
  };

  for (const record of session?.records || []) {
    if (!addRecordIndexKeys(keys, record)) continue;
    sources.records += 1;
  }

  for (const result of session?.results || []) {
    const before = keys.size;
    if (!addRecordIndexKeys(keys, result)) continue;
    if (keys.size > before) sources.results += 1;
  }

  // Authoritative match-key sets for client/server dedupe (scanned results only)
  const known = buildKnownAddressKeySet(session?.results || [], []);
  // Also block re-queue of addresses still sitting in scan queue
  const knownWithQueue = buildKnownAddressKeySet(session?.results || [], session?.records || []);

  return {
    count: keys.size,
    addresses: [...keys],
    matchKeys: [...known.exact],
    matchKeysLoose: [...known.loose],
    matchKeysWithQueue: [...knownWithQueue.exact],
    sources,
    resultsCount: Array.isArray(session?.results) ? session.results.length : 0,
    recordsCount: Array.isArray(session?.records) ? session.records.length : 0
  };
}

module.exports = {
  recordAddressKey,
  buildImportAddressIndex,
  addressMatchKey,
  addressMatchKeyLoose
};