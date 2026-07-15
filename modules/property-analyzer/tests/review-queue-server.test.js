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
    // Page fetches omit the full key list (payload was dominating Review open latency).
    assert.deepEqual(page.pendingKeys, []);
    assert.equal(page.keysOmitted, true);
  });

  it('resultsOnly omits keys even at offset 0', () => {
    const q = buildSessionReviewQueue(rows, 'distressed', { limit: 50, resultsOnly: true });
    assert.equal(q.ok, true);
    assert.equal(q.pending, 1);
    assert.deepEqual(q.pendingKeys, []);
    assert.equal(q.results.length, 1);
  });

  it('caches pending build across pages for the same results array', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      email: `c${i}@t.com`, phone: `${i}`, address: `${i} Pine`,
      category: 'property', leadTier: 'distressed', score: 5
    }));
    const a = buildSessionReviewQueue(many, 'distressed', { offset: 0, limit: 3 });
    const b = buildSessionReviewQueue(many, 'distressed', { offset: 3, limit: 3, resultsOnly: true });
    assert.equal(a.pending, 8);
    assert.equal(b.pending, 8);
    assert.equal(a.results[0].address, '0 Pine');
    assert.equal(b.results[0].address, '3 Pine');
  });
});
