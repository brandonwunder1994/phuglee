const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function reviewProgressLabel(pos, total, snap) {
  if (snap && snap.total > total) {
    const left = Math.max(0, snap.pendingAtStart - (pos - 1));
    return `${pos} / ${total} queued · ${snap.total.toLocaleString()} total · ${left.toLocaleString()} left`;
  }
  return `${pos} / ${total}`;
}

function shouldPersistReviewNow(advancesSinceSave, opts = {}) {
  const everyN = opts.everyN ?? 8;
  return !opts.defer && advancesSinceSave >= everyN;
}

function scanReviewFilterSnapshot(results, filter) {
  let total = 0;
  let pending = 0;
  let reviewedInFilter = 0;
  const pendingKeys = [];
  for (const r of results) {
    const tier = r.leadTier || (r.score >= 6 ? 'distressed' : 'well_maintained');
    if (filter === 'well_maintained' && (r.category !== 'property' || tier !== 'well_maintained')) continue;
    total++;
    const key = `${r.email}|${r.phone}|${r.address}`;
    if (r.manuallyReviewed) {
      reviewedInFilter++;
    } else {
      pending++;
      pendingKeys.push(key);
    }
  }
  return { total, pending, reviewedInFilter, pendingKeys };
}

describe('review perf helpers', () => {
  it('scanReviewFilterSnapshot returns queue and stats in one pass', () => {
    const results = [
      { email: 'a', phone: '1', address: '1', category: 'property', leadTier: 'well_maintained' },
      { email: 'b', phone: '2', address: '2', category: 'property', leadTier: 'well_maintained', manuallyReviewed: true },
      { email: 'c', phone: '3', address: '3', category: 'property', leadTier: 'distressed', score: 8 }
    ];
    const snap = scanReviewFilterSnapshot(results, 'well_maintained');
    assert.equal(snap.total, 2);
    assert.equal(snap.pending, 1);
    assert.equal(snap.reviewedInFilter, 1);
    assert.deepEqual(snap.pendingKeys, ['a|1|1']);
  });
  it('reviewProgressLabel uses cached stats without rescanning', () => {
    const snap = { total: 1494, pendingAtStart: 800 };
    assert.equal(reviewProgressLabel(3, 750, snap), '3 / 750 queued · 1,494 total · 798 left');
    assert.equal(reviewProgressLabel(2, 10, null), '2 / 10');
  });

  it('persistReviewProgress never forces sync save on single advance', () => {
    assert.equal(shouldPersistReviewNow(1), false);
    assert.equal(shouldPersistReviewNow(7), false);
    assert.equal(shouldPersistReviewNow(8), true);
    assert.equal(shouldPersistReviewNow(8, { defer: true }), false);
  });
});