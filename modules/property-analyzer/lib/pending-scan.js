'use strict';

/**
 * Single source of truth for "left to scan" math.
 * Used by session-summary, session-records?mode=unscanned, and reset/prepare helpers.
 */

const {
  addressMatchKey,
  addressMatchKeyLoose,
  buildKnownAddressKeySet
} = require('./address-match');

function identityKey(r) {
  if (!r) return '';
  const street = r.street || String(r.address || '').split(',')[0] || '';
  return `${r.email || ''}|${r.phone || ''}|${street}`;
}

function buildResultIdentitySet(results = []) {
  const keys = new Set();
  for (const r of results) {
    const rk = identityKey(r);
    if (rk && rk !== '||') keys.add(rk);
  }
  return keys;
}

function isRecordAlreadyScanned(r, known, existingIdentityKeys) {
  if (!r) return true;
  if (r.forceRescan) return false;
  const rk = identityKey(r);
  if (rk && rk !== '||' && existingIdentityKeys.has(rk)) return true;
  const k = addressMatchKey(r);
  if (k && known.exact.has(k)) return true;
  const l = addressMatchKeyLoose(r);
  if (l && known.loose.has(l) && !String(r.postal || r.zip || '').trim()) return true;
  return false;
}

function filterUnscannedRecords(records = [], results = []) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return [];
  const known = buildKnownAddressKeySet(results, []);
  const existingIdentityKeys = buildResultIdentitySet(results);
  return list.filter((r) => !isRecordAlreadyScanned(r, known, existingIdentityKeys));
}

function countPendingUnscanned(session) {
  const results = Array.isArray(session?.results) ? session.results : [];
  const records = Array.isArray(session?.records) ? session.records : [];
  if (!records.length) return 0;
  return filterUnscannedRecords(records, results).length;
}

module.exports = {
  identityKey,
  buildResultIdentitySet,
  isRecordAlreadyScanned,
  filterUnscannedRecords,
  countPendingUnscanned
};
