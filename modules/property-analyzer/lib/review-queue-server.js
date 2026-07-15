'use strict';

/**
 * Server-side Review Leads queue builder.
 * Lets the client open a bucket without waiting to hydrate all ~16k session results.
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

/**
 * @param {object[]} results
 * @param {string} filter
 * @param {{ offset?: number, limit?: number }} [opts]
 */
function buildSessionReviewQueue(results, filter, opts = {}) {
  const f = String(filter || '').toLowerCase().replace(/-/g, '_');
  if (!REVIEW_FILTERS.has(f)) {
    return { ok: false, error: 'invalid_filter', filter: f };
  }
  const list = Array.isArray(results) ? results : [];
  const offset = Math.max(0, Number(opts.offset) || 0);
  const limit = Math.min(1000, Math.max(1, Number(opts.limit) || 300));

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

  const slice = pendingRows.slice(offset, offset + limit);
  return {
    ok: true,
    filter: f,
    totalInFilter,
    pending: pendingKeys.length,
    reviewedInFilter,
    pendingKeys,
    offset,
    limit,
    hasMoreResults: offset + slice.length < pendingRows.length,
    results: leanResultsForList(slice)
  };
}

module.exports = {
  REVIEW_FILTERS,
  matchesReviewFilter,
  isExcludedFromReview,
  buildSessionReviewQueue
};
