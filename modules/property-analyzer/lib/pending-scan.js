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

/** Map identity + exact address keys → result row (for forceRescan completion checks). */
function buildResultMatchIndex(results = []) {
  const byIdentity = new Map();
  const byExact = new Map();
  for (const r of results || []) {
    const id = identityKey(r);
    if (id && id !== '||') byIdentity.set(id, r);
    const k = addressMatchKey(r);
    if (k) byExact.set(k, r);
  }
  return { byIdentity, byExact };
}

function matchingResult(r, index) {
  if (!r || !index) return null;
  const id = identityKey(r);
  if (id && id !== '||' && index.byIdentity.has(id)) return index.byIdentity.get(id);
  const k = addressMatchKey(r);
  if (k && index.byExact.has(k)) return index.byExact.get(k);
  return null;
}

/**
 * forceRescan means "queue me again" until a NEW result lands after import.
 * Once results.analyzedAt >= importedAt (or the record itself carries that analysis),
 * the flag is stale — counting it as pending forever is the "1995 left to scan" bug.
 */
function forceRescanStillPending(r, match) {
  if (!r?.forceRescan) return false;
  if (!match) return true;
  const importedAt = Number(r.importedAt) || 0;
  const resultAt = Number(match.analyzedAt || match.savedAt) || 0;
  const recordAt = Number(r.analyzedAt) || 0;
  if (importedAt > 0 && (resultAt >= importedAt || recordAt >= importedAt)) return false;
  // No import timestamp — if both sides already have analysis, treat as done.
  if (resultAt > 0 && recordAt > 0) return false;
  if (resultAt > 0 && !importedAt) return false;
  return true;
}

function isRecordAlreadyScanned(r, known, existingIdentityKeys, resultIndex = null) {
  if (!r) return true;

  const index = resultIndex || null;
  const match = index ? matchingResult(r, index) : null;

  if (r.forceRescan) {
    return !forceRescanStillPending(r, match);
  }

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
  const resultIndex = buildResultMatchIndex(results);
  return list.filter((r) => !isRecordAlreadyScanned(r, known, existingIdentityKeys, resultIndex));
}

function countPendingUnscanned(session) {
  const results = Array.isArray(session?.results) ? session.results : [];
  const records = Array.isArray(session?.records) ? session.records : [];
  if (!records.length) return 0;
  return filterUnscannedRecords(records, results).length;
}

/**
 * Clear stale forceRescan flags after a completed scan so the queue and disk agree.
 * @returns {{ cleared: number, session }}
 */
function healStaleForceRescanFlags(session) {
  if (!session || typeof session !== 'object') return { cleared: 0, session };
  const results = Array.isArray(session.results) ? session.results : [];
  const records = Array.isArray(session.records) ? session.records : [];
  if (!results.length && !records.length) return { cleared: 0, session };

  const known = buildKnownAddressKeySet(results, []);
  const existingIdentityKeys = buildResultIdentitySet(results);
  const resultIndex = buildResultMatchIndex(results);
  let cleared = 0;
  for (const r of records) {
    if (!r || !r.forceRescan) continue;
    if (isRecordAlreadyScanned(r, known, existingIdentityKeys, resultIndex)) {
      delete r.forceRescan;
      cleared++;
    }
  }
  // Scan copies forceRescan onto result rows (`{ ...record, ...analysis }`).
  // Leaving it there makes the UI recount completed rows as "to scan" after refresh.
  for (const r of results) {
    if (!r || !r.forceRescan) continue;
    if (isRecordAlreadyScanned(r, known, existingIdentityKeys, resultIndex)) {
      delete r.forceRescan;
      cleared++;
    }
  }
  return { cleared, session };
}

module.exports = {
  identityKey,
  buildResultIdentitySet,
  buildResultMatchIndex,
  matchingResult,
  forceRescanStillPending,
  isRecordAlreadyScanned,
  filterUnscannedRecords,
  countPendingUnscanned,
  healStaleForceRescanFlags
};
