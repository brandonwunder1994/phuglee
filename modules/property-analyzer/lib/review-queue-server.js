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

/**
 * Must stay aligned with public/js/session.js matchesReviewFilter.
 * Distressed / Well Maintained only include fully classified homes — borderline /
 * low-confidence rows belong in Needs Review (computeNeedsReview), not Distressed.
 * Bug: server previously counted those as Distressed pending → KPI 104 while the
 * client open-queue skipped every row as noMatch (0 left to review).
 */
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

  // Same gate as client isClassifiedResultFast / isClassifiedResult:
  // needs-review rows are NOT distressed/WM bucket members.
  if (isBlurredImagery(r)) {
    // Blurred is its own bucket — never count as property tier here.
    return false;
  }
  if (r.reviewResolved) {
    // resolved stays out via isExcludedFromReview; still allow filter match for totals
  } else if (r.manuallyReviewed && !r.needsReviewLater) {
    // hard-reviewed classified
  } else if (r.needsReviewLater || computeNeedsReview(r)) {
    return false;
  }

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

function buildPendingForFilter(list, f, reviewedKeySet = null) {
  let totalInFilter = 0;
  let reviewedInFilter = 0;
  const pendingRows = [];
  const pendingKeys = [];

  for (const r of list) {
    if (!matchesReviewFilter(r, f)) continue;
    totalInFilter += 1;
    const key = recordKeyFromResult(r);
    // Exclude hard-reviewed stamps on the row OR keys saved in reviewedKeysByFilter
    // (Exit Review partial sync may land the bucket before every result field merges).
    if (isExcludedFromReview(r, f) || (key && reviewedKeySet && reviewedKeySet.has(key))) {
      reviewedInFilter += 1;
      continue;
    }
    pendingKeys.push(key);
    pendingRows.push(r);
  }

  return { pendingKeys, pendingRows, totalInFilter, reviewedInFilter };
}

function reviewedKeySetForFilter(reviewedKeysByFilter, f) {
  const buckets = reviewedKeysByFilter && typeof reviewedKeysByFilter === 'object'
    ? reviewedKeysByFilter
    : null;
  if (!buckets) return null;
  const set = new Set();
  const primary = Array.isArray(buckets[f]) ? buckets[f] : [];
  for (const k of primary) if (k) set.add(k);
  // Soft cross-bucket: if a lead was reviewed under any filter, keep it out of all queues.
  for (const name of Object.keys(buckets)) {
    const arr = Array.isArray(buckets[name]) ? buckets[name] : [];
    for (const k of arr) if (k) set.add(k);
  }
  return set.size ? set : null;
}

function getCachedPending(list, f, reviewedKeySet = null) {
  if (!list || typeof list !== 'object') {
    return buildPendingForFilter(Array.isArray(list) ? list : [], f, reviewedKeySet);
  }
  // Cache key includes whether we have reviewed-key exclusions (session progress changes often).
  const cacheToken = reviewedKeySet && reviewedKeySet.size
    ? `${f}::rk${reviewedKeySet.size}`
    : f;
  let byFilter = queueCacheByResults.get(list);
  if (!byFilter) {
    byFilter = new Map();
    queueCacheByResults.set(list, byFilter);
  }
  let built = byFilter.get(cacheToken);
  if (!built) {
    built = buildPendingForFilter(list, f, reviewedKeySet);
    byFilter.set(cacheToken, built);
  }
  return built;
}

/**
 * @param {object[]} results
 * @param {string} filter
 * @param {{ offset?: number, limit?: number, includeKeys?: boolean, resultsOnly?: boolean, reviewedKeysByFilter?: object }} [opts]
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

  const reviewedKeySet = reviewedKeySetForFilter(opts.reviewedKeysByFilter, f);
  const built = getCachedPending(list, f, reviewedKeySet);
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

/**
 * Awaiting-review pending counts for every bucket, computed in one server pass.
 * Reuses the same exclusion rules as the review queue (including reviewedKeysByFilter)
 * so Session Buckets KPIs match "open Distressed → empty queue" exactly.
 * @param {object[]} results
 * @param {{ reviewedKeysByFilter?: object }} [opts]
 * @returns {{ ok: true, scanned: number, awaiting: Record<string, number>, totalInFilter: Record<string, number> }}
 */
function buildAwaitingCounts(results, opts = {}) {
  const list = Array.isArray(results) ? results : [];
  const awaiting = {};
  const totalInFilter = {};
  for (const f of REVIEW_FILTERS) {
    const reviewedKeySet = reviewedKeySetForFilter(opts.reviewedKeysByFilter, f);
    const built = getCachedPending(list, f, reviewedKeySet);
    awaiting[f] = built.pendingKeys.length;
    totalInFilter[f] = built.totalInFilter;
  }
  return {
    ok: true,
    scanned: list.length,
    awaiting,
    totalInFilter
  };
}

module.exports = {
  REVIEW_FILTERS,
  matchesReviewFilter,
  isExcludedFromReview,
  buildSessionReviewQueue,
  buildAwaitingCounts,
  clearReviewQueueCache
};
