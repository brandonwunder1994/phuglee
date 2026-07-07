const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeNeedsReview } = require('../lib/result-classify');

function recordKey(r) {
  return `${r.email}|${r.phone}|${r.address}`;
}

const REVIEW_FILTER_BUCKETS = ['distressed', 'well_maintained', 'vacant', 'review', 'low_confidence'];

function matchesReviewFilter(r, filter) {
  if (!r || !filter || filter === 'all') return !!r;
  if (filter === 'review') return computeNeedsReview(r);
  if (filter === 'distressed') return r.leadTier === 'distressed' && r.category === 'property';
  if (filter === 'well_maintained') return r.leadTier === 'well_maintained' && r.category === 'property';
  return false;
}

function getReviewedKeySet(buckets, filter) {
  return new Set(buckets?.[filter] || []);
}

function isExcludedFromAllReviewQueues(r, buckets, filter = null) {
  if (!r) return true;
  if (r.needsReviewLater && filter === 'review') return false;
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed) return true;
  return false;
}

function buildReviewQueue(results, filter, reviewedKeysByFilter) {
  return results
    .filter(r => matchesReviewFilter(r, filter))
    .filter(r => !isExcludedFromAllReviewQueues(r, reviewedKeysByFilter, filter))
    .map(r => recordKey(r));
}

describe('review queue global exclusion', () => {
  const distressedA = {
    email: 'a@test.com', phone: '1', address: '1 Main St',
    category: 'property', leadTier: 'distressed', score: 8
  };
  const distressedB = {
    email: 'b@test.com', phone: '2', address: '2 Oak Ave',
    category: 'property', leadTier: 'distressed', score: 7,
    manuallyReviewed: true,
    manuallyReviewedVia: 'low_confidence_review'
  };
  const distressedC = {
    email: 'c@test.com', phone: '3', address: '3 Pine Rd',
    category: 'property', leadTier: 'distressed', score: 6,
    manuallyReviewed: true,
    manuallyReviewedVia: 'review_change'
  };
  const distressedD = {
    email: 'd@test.com', phone: '4', address: '4 Elm St',
    category: 'property', leadTier: 'distressed', score: 9,
    manuallyReviewed: true,
    manuallyReviewedVia: 'review_keep'
  };
  const movedToWell = {
    email: 'e@test.com', phone: '5', address: '5 Maple Dr',
    category: 'property', leadTier: 'well_maintained', score: 1,
    manuallyReviewed: true,
    manuallyReviewedVia: 'review_change',
    manualScore: true
  };

  const results = [distressedA, distressedB, distressedC, distressedD, movedToWell];
  const reviewedKeysByFilter = {
    distressed: [recordKey(distressedD), recordKey(movedToWell)],
    low_confidence: [recordKey(distressedB)],
    well_maintained: [],
    vacant: [],
    review: []
  };

  it('distressed queue only shows unreviewed distressed leads', () => {
    const queue = buildReviewQueue(results, 'distressed', reviewedKeysByFilter);
    assert.deepEqual(queue, [recordKey(distressedA)]);
  });

  it('well maintained queue excludes leads changed during distressed review', () => {
    const queue = buildReviewQueue(results, 'well_maintained', reviewedKeysByFilter);
    assert.deepEqual(queue, []);
  });

  it('manually reviewed flag excludes lead from every review queue', () => {
    assert.equal(isExcludedFromAllReviewQueues(distressedB, reviewedKeysByFilter), true);
    assert.equal(isExcludedFromAllReviewQueues(movedToWell, reviewedKeysByFilter), true);
    assert.equal(isExcludedFromAllReviewQueues(distressedA, reviewedKeysByFilter), false);
  });

  it('well maintained queue ignores reviewed keys from other filters', () => {
    const wellA = {
      email: 'w@test.com', phone: '1', address: '1 Oak',
      category: 'property', leadTier: 'well_maintained', score: 1
    };
    const buckets = {
      distressed: [],
      well_maintained: [],
      vacant: [],
      review: [],
      low_confidence: [recordKey(wellA)]
    };
    const queue = buildReviewQueue([wellA], 'well_maintained', buckets);
    assert.deepEqual(queue, [recordKey(wellA)]);
  });

  it('ghost key in well maintained bucket without manuallyReviewed is not excluded', () => {
    const ghost = {
      email: 'g@test.com', phone: '1', address: '1 Ghost Ln',
      category: 'property', leadTier: 'well_maintained', score: 3
    };
    const buckets = {
      distressed: [],
      well_maintained: [recordKey(ghost)],
      vacant: [],
      review: [],
      low_confidence: []
    };
    assert.equal(isExcludedFromAllReviewQueues(ghost, buckets, 'well_maintained'), false);
    const queue = buildReviewQueue([ghost], 'well_maintained', buckets);
    assert.deepEqual(queue, [recordKey(ghost)]);
  });

  it('deferred manual-review leads stay in the manual review queue', () => {
    const deferred = {
      email: 'd@test.com', phone: '1', address: '1 Later Ln',
      category: 'property', leadTier: 'distressed', score: 6,
      manuallyReviewed: true, needsReviewLater: true, manuallyReviewedVia: 'review_defer'
    };
    const buckets = {
      distressed: [],
      well_maintained: [],
      vacant: [],
      review: [recordKey(deferred)],
      low_confidence: []
    };
    assert.equal(isExcludedFromAllReviewQueues(deferred, buckets, 'review'), false);
    assert.equal(isExcludedFromAllReviewQueues(deferred, buckets, 'distressed'), true);
    const queue = buildReviewQueue([deferred], 'review', buckets);
    assert.deepEqual(queue, [recordKey(deferred)]);
  });

  it('reviewResolved excludes lead from vacant queue', () => {
    const land = {
      email: 'v@test.com', phone: '9', address: '9 Field Rd',
      category: 'vacant_lot', score: 0, reviewResolved: true
    };
    const results = [land];
    const buckets = { distressed: [], well_maintained: [], vacant: [], review: [], low_confidence: [] };
    assert.equal(isExcludedFromAllReviewQueues(land, buckets), true);
    const queue = results
      .filter(r => r.category === 'vacant_lot')
      .filter(r => !isExcludedFromAllReviewQueues(r, buckets))
      .map(r => recordKey(r));
    assert.deepEqual(queue, []);
  });
});