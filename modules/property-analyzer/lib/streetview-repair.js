'use strict';

/**
 * Identify scan results that fell back to satellite-only when Street View may exist.
 */

function parseDateBound(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const ms = Date.parse(`${raw}${suffix}`);
  return Number.isFinite(ms) ? ms : null;
}

function isSatelliteOnlyFallback(result) {
  if (!result || result.manualOverride) return false;
  if (result.skippedStreetView === true) return true;
  if (result.usedSatellite && !result.viewMeta) return true;
  if (result.qualityFlags?.includes('no_streetview')) return true;
  return false;
}

function resultTimestamp(result) {
  return Number(result?.analyzedAt || result?.scannedAt || result?.savedAt || 0) || 0;
}

function analyzedBetween(result, fromMs, toMs) {
  const t = resultTimestamp(result);
  if (!t) return false;
  if (fromMs != null && t < fromMs) return false;
  if (toMs != null && t > toMs) return false;
  return true;
}

function collectStreetViewRepairCandidates(results, opts = {}) {
  const fromMs = parseDateBound(opts.from);
  const toMs = parseDateBound(opts.to, true);
  const list = Array.isArray(results) ? results : [];
  const matches = [];
  for (const result of list) {
    if (!isSatelliteOnlyFallback(result)) continue;
    if (fromMs != null || toMs != null) {
      if (!analyzedBetween(result, fromMs, toMs)) continue;
    }
    if (!result.address) continue;
    matches.push(result);
  }
  return matches;
}

function recordKeyFromResult(record) {
  if (!record) return '';
  return `${record.email || ''}|${record.phone || ''}|${record.address || ''}`;
}

function requeueStreetViewRepairs(session, candidates) {
  const results = Array.isArray(session?.results) ? session.results : [];
  const removeKeys = new Set(candidates.map(recordKeyFromResult).filter(Boolean));
  if (!removeKeys.size) {
    return { session, removed: 0, addresses: [] };
  }
  const kept = [];
  const addresses = [];
  for (const row of results) {
    const key = recordKeyFromResult(row);
    if (key && removeKeys.has(key)) {
      addresses.push(row.address);
      continue;
    }
    kept.push(row);
  }
  const next = {
    ...session,
    results: kept,
    processed: kept.length,
    streetViewRepairMeta: {
      ...(session.streetViewRepairMeta || {}),
      lastRequeueAt: Date.now(),
      lastRequeueCount: addresses.length
    }
  };
  return { session: next, removed: addresses.length, addresses };
}

module.exports = {
  parseDateBound,
  isSatelliteOnlyFallback,
  collectStreetViewRepairCandidates,
  requeueStreetViewRepairs,
  recordKeyFromResult
};
