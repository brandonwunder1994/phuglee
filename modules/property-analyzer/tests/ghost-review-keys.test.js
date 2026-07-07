const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const REVIEW_FILTER_BUCKETS = ['distressed', 'well_maintained', 'vacant', 'review', 'low_confidence'];

function recordKey(r) {
  return `${r.email}|${r.phone}|${r.address}`;
}

function purgeGhostReviewedKeys(results, reviewedKeysByFilter) {
  const byKey = new Map(results.map((r, i) => [recordKey(r), i]));
  let changed = 0;
  for (const f of REVIEW_FILTER_BUCKETS) {
    const bucket = reviewedKeysByFilter[f] || [];
    const kept = [];
    for (const key of bucket) {
      const idx = byKey.get(key);
      const r = idx != null ? results[idx] : null;
      if (!r || r.manuallyReviewed || r.reviewResolved) {
        kept.push(key);
        continue;
      }
      changed++;
    }
    reviewedKeysByFilter[f] = kept;
  }
  return changed;
}

describe('purgeGhostReviewedKeys', () => {
  it('removes bucket keys when lead was never manually reviewed', () => {
    const reviewed = {
      email: 'a@test.com', phone: '1', address: '1 Main',
      category: 'property', leadTier: 'well_maintained', manuallyReviewed: true
    };
    const ghost = {
      email: 'b@test.com', phone: '2', address: '2 Oak',
      category: 'property', leadTier: 'well_maintained', score: 3
    };
    const results = [reviewed, ghost];
    const buckets = {
      distressed: [recordKey(reviewed), recordKey(ghost)],
      well_maintained: [recordKey(reviewed), recordKey(ghost)],
      vacant: [],
      review: [],
      low_confidence: []
    };
    const changed = purgeGhostReviewedKeys(results, buckets);
    assert.equal(changed, 2);
    assert.deepEqual(buckets.well_maintained, [recordKey(reviewed)]);
    assert.deepEqual(buckets.distressed, [recordKey(reviewed)]);
  });
});