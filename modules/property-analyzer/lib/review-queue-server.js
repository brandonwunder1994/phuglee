'use strict';

/**
 * Server-side Review Leads queue builder.
 * Lets the client open a bucket without waiting to hydrate all ~16k session results.
 *
 * Built queues are cached against the results array identity so paging / rapid Keep
 * does not re-scan 16k rows or re-emit giant pendingKeys payloads.
 */

const { recordKeyFromResult } = require('./backup-logic');
const { leanResultsForList } = require('./result-lean');
const {
  resultCategory,
  resultLeadTier,
  computeNeedsReview,
  isBlurredImagery
} = require('./result-classify');

const REVIEW_FILTERS = new Set([
  'distressed',
  'well_maintained',
  'vacant',
  'blurred',
  'review',
  'satellite_only'
]);

/** @type {WeakMap<object, Map<string, { pendingKeys: string[], pendingRows: object[], totalInFilter: number, reviewedInFilter: number }>>} */
const queueCacheByResults = new WeakMap();

function isSoftManualVia(r) {
  const via = String(r?.manuallyReviewedVia || '');
  return via === 'review_session' || via === 'review_skip' || via === 'review_missing';
}

function isExcludedFromReview(r, filter) {
  if (!r) return true;
  if (r.satelliteOnly && filter === 'satellite_only') return false;
  if (r.satelliteOnly) return true;
  if (r.needsReviewLater && filter === 'review') return false;
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed && !isSoftManualVia(r)) return true;
  return false;
}

function matchesReviewFilter(r, filter) {
  if (!r || !filter || filter === 'all') return !!r;
  if (r.satelliteOnly) return filter === 'satellite_only';
  if (filter === 'satellite_only') return false;
  if (filter === 'review') return computeNeedsReview(r);
  if (filter === 'vacant') {
    const cat = String(r.category || '').toLowerCase();
    if (cat === 'vacant_lot' || cat === 'vacant' || cat === 'land') return true;
    return resultCategory(r) === 'vacant_lot';
  }
  if (filter === 'blurred') return isBlurredImagery(r);
  const cat = String(r.category || '').toLowerCase() === 'property'
    ? 'property'
    : resultCategory(r);
  if (cat !== 'property') return false;
  let tier = String(r.leadTier || '').toLowerCase().replace(/-/g, '_');
  if (tier === 'hot_lead') tier = 'distressed';
  if (!tier) tier = String(resultLeadTier(r) || '').toLowerCase().replace(/-/g, '_');
  if (filter === 'distressed' || filter === 'light') return tier === 'distressed';
  if (filter === 'well_maintained') return tier === 'well_maintained';
  return false;
}

function buildPendingForFilter(list, f) {
  let totalInFilter = 0;
  let reviewedInFilter = 0;
  const pendingRows = [];
  const pendingKeys = [];

  for (const r of list) {
    if (!matchesReviewFilter(r, f)) continue;
    totalInFilter += 1;
    const key = recordKeyFromResult(r);
    if (isExcludedFromReview(r, f)) {
      reviewedInFilter += 1;
      continue;
    }
    pendingKeys.push(key);
    pendingRows.push(r);
  }

  return { pendingKeys, pendingRows, totalInFilter, reviewedInFilter };
}

function getCachedPending(list, f) {
  if (!list || typeof list !== 'object') {
    return buildPendingForFilter(Array.isArray(list) ? list : [], f);
  }
  let byFilter = queueCacheByResults.get(list);
  if (!byFilter) {
    byFilter = new Map();
    queueCacheByResults.set(list, byFilter);
  }
  let built = byFilter.get(f);
  if (!built) {
    built = buildPendingForFilter(list, f);
    byFilter.set(f, built);
  }
  return built;
}

/**
 * @param {object[]} results
 * @param {string} filter
 * @param {{ offset?: number, limit?: number, includeKeys?: boolean, resultsOnly?: boolean }} [opts]
 */
function buildSessionReviewQueue(results, filter, opts = {}) {
  const f = String(filter || '').toLowerCase().replace(/-/g, '_');
  if (!REVIEW_FILTERS.has(f)) {
    return { ok: false, error: 'invalid_filter', filter: f };
  }
  const list = Array.isArray(results) ? results : [];
  const offset = Math.max(0, Number(opts.offset) || 0);
  const limit = Math.min(1000, Math.max(1, Number(opts.limit) || 300));
  const resultsOnly = opts.resultsOnly === true || opts.resultsOnly === 1 || opts.resultsOnly === '1';
  // Page fetches never need the full key list — that payload was dominating open latency.
  const includeKeys = resultsOnly
    ? false
    : (opts.includeKeys === false || opts.includeKeys === 0 || opts.includeKeys === '0'
      ? false
      : offset === 0);

  const built = getCachedPending(list, f);
  const slice = built.pendingRows.slice(offset, offset + limit);

  return {
    ok: true,
    filter: f,
    totalInFilter: built.totalInFilter,
    pending: built.pendingKeys.length,
    reviewedInFilter: built.reviewedInFilter,
    pendingKeys: includeKeys ? built.pendingKeys : [],
    keysOmitted: !includeKeys,
    offset,
    limit,
    hasMoreResults: offset + slice.length < built.pendingRows.length,
    results: leanResultsForList(slice)
  };
}

function clearReviewQueueCache(results) {
  if (results && typeof results === 'object') queueCacheByResults.delete(results);
}

module.exports = {
  REVIEW_FILTERS,
  matchesReviewFilter,
  isExcludedFromReview,
  buildSessionReviewQueue,
  clearReviewQueueCache
};
