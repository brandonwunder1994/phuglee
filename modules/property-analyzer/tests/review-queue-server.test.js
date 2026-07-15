const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionReviewQueue } = require('../lib/review-queue-server');

describe('server review queue', () => {
  const rows = [
    {
      email: 'a@t.com', phone: '1', address: '1 Main',
      category: 'property', leadTier: 'distressed', score: 8
    },
    {
      email: 'b@t.com', phone: '2', address: '2 Main',
      category: 'property', leadTier: 'distressed', score: 7,
      manuallyReviewed: true, manuallyReviewedVia: 'review_keep', reviewResolved: true
    },
    {
      email: 'c@t.com', phone: '3', address: '3 Main',
      category: 'property', leadTier: 'well_maintained', score: 2
    },
    {
      email: 'd@t.com', phone: '4', address: '4 Main',
      category: 'vacant_lot', leadTier: 'vacant'
    }
  ];

  it('returns pending distressed keys only', () => {
    const q = buildSessionReviewQueue(rows, 'distressed', { limit: 50 });
    assert.equal(q.ok, true);
    assert.equal(q.pending, 1);
    assert.equal(q.totalInFilter, 2);
    assert.equal(q.reviewedInFilter, 1);
    assert.deepEqual(q.pendingKeys, ['a@t.com|1|1 Main']);
    assert.equal(q.results.length, 1);
  });

  it('pages pending well_maintained results', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      email: `w${i}@t.com`, phone: `${i}`, address: `${i} Oak`,
      category: 'property', leadTier: 'well_maintained', score: 1
    }));
    const page = buildSessionReviewQueue(many, 'well_maintained', { offset: 2, limit: 2 });
    assert.equal(page.pending, 5);
    assert.equal(page.results.length, 2);
    assert.equal(page.hasMoreResults, true);
  });
});
