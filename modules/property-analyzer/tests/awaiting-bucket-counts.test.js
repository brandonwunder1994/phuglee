const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAwaitingCounts,
  buildSessionReviewQueue,
  REVIEW_FILTERS
} = require('../lib/review-queue-server');

describe('awaiting bucket counts', () => {
  const rows = [
    // pending distressed
    { email: 'a@t.com', phone: '1', address: '1 Main', category: 'property', leadTier: 'distressed', score: 8 },
    // reviewed distressed (excluded)
    { email: 'b@t.com', phone: '2', address: '2 Main', category: 'property', leadTier: 'distressed', score: 7,
      manuallyReviewed: true, manuallyReviewedVia: 'review_keep', reviewResolved: true },
    // pending well_maintained
    { email: 'c@t.com', phone: '3', address: '3 Main', category: 'property', leadTier: 'well_maintained', score: 2 },
    // pending vacant / land
    { email: 'd@t.com', phone: '4', address: '4 Main', category: 'vacant_lot', leadTier: 'vacant' },
    // satellite only
    { email: 'e@t.com', phone: '5', address: '5 Main', category: 'property', leadTier: 'distressed', score: 6, satelliteOnly: true }
  ];

  it('returns pending counts for every review filter + scanned total', () => {
    const c = buildAwaitingCounts(rows);
    assert.equal(c.ok, true);
    assert.equal(c.scanned, rows.length);
    assert.equal(c.awaiting.distressed, 1);
    assert.equal(c.awaiting.well_maintained, 1);
    assert.equal(c.awaiting.vacant, 1);
    assert.equal(c.awaiting.satellite_only, 1);
    for (const f of REVIEW_FILTERS) {
      assert.ok(typeof c.awaiting[f] === 'number', `missing count for ${f}`);
    }
  });

  it('matches buildSessionReviewQueue pending per filter (single pass == six passes)', () => {
    const c = buildAwaitingCounts(rows);
    for (const f of REVIEW_FILTERS) {
      const q = buildSessionReviewQueue(rows, f, { limit: 1000 });
      assert.equal(c.awaiting[f], q.pending, `awaiting ${f} should equal queue pending`);
      assert.equal(c.totalInFilter[f], q.totalInFilter, `totalInFilter ${f} mismatch`);
    }
  });

  it('handles empty / non-array input safely', () => {
    const c = buildAwaitingCounts(null);
    assert.equal(c.ok, true);
    assert.equal(c.scanned, 0);
    assert.equal(c.awaiting.distressed, 0);
  });

  it('excludes reviewedKeysByFilter even when result row is not stamped yet', () => {
    const unstamped = {
      email: 'z@t.com', phone: '9', address: '9 Main',
      category: 'property', leadTier: 'distressed', score: 9,
      confidence: 0.95, imageryQuality: 'clear'
    };
    const key = 'z@t.com|9|9 Main';
    const c = buildAwaitingCounts([unstamped], {
      reviewedKeysByFilter: { distressed: [key] }
    });
    assert.equal(c.awaiting.distressed, 0, 'KPI must hit 0 when key is in reviewedKeysByFilter');
    const q = buildSessionReviewQueue([unstamped], 'distressed', {
      limit: 10,
      reviewedKeysByFilter: { distressed: [key] }
    });
    assert.equal(q.pending, 0);
  });

  it('puts borderline/low-confidence distress in Needs Review, not Distressed KPI', () => {
    // Mirrors prod gap: client isClassifiedResultFast=false → open Distressed skips row,
    // while old server still counted leadTier=distressed as Distressed pending.
    const borderline = {
      email: 'b@t.com', phone: '10', address: '10 Main',
      category: 'property', leadTier: 'distressed', score: 6,
      confidence: 40, imageryQuality: 'ok', reason: 'junk yard',
      indicators: ['junk_or_hoarding_yard']
    };
    const solid = {
      email: 's@t.com', phone: '11', address: '11 Main',
      category: 'property', leadTier: 'distressed', score: 9,
      confidence: 90, imageryQuality: 'clear', reason: 'boarded windows',
      indicators: ['boarded_windows']
    };
    const c = buildAwaitingCounts([borderline, solid]);
    const qd = buildSessionReviewQueue([borderline, solid], 'distressed', { limit: 10 });
    const qr = buildSessionReviewQueue([borderline, solid], 'review', { limit: 10 });
    assert.equal(c.awaiting.distressed, qd.pending, 'awaiting distressed == queue');
    assert.equal(c.awaiting.distressed, 1, 'only solid classified distressed is pending');
    assert.ok(c.awaiting.review >= 1 && qr.pending >= 1, 'borderline lands in Needs Review');
  });

  it('stays fast + correct at 17k-row scale (single-pass budget)', () => {
    const N = 17000;
    const big = new Array(N);
    for (let i = 0; i < N; i++) {
      const tier = i % 3 === 0 ? 'distressed' : (i % 3 === 1 ? 'well_maintained' : 'vacant');
      const category = tier === 'vacant' ? 'vacant_lot' : 'property';
      big[i] = {
        email: `u${i}@t.com`, phone: String(i), address: `${i} Main`,
        category, leadTier: tier, score: tier === 'distressed' ? 8 : 2
      };
    }
    const t0 = Date.now();
    const c = buildAwaitingCounts(big);
    const ms = Date.now() - t0;
    assert.equal(c.scanned, N);
    // Single pass over 17k rows must be well under the summary-paint budget.
    assert.ok(ms < 500, `buildAwaitingCounts took ${ms}ms for ${N} rows (budget 500ms)`);
    // Correctness cross-check against per-filter queue builder.
    for (const f of REVIEW_FILTERS) {
      const q = buildSessionReviewQueue(big, f, { limit: N });
      assert.equal(c.awaiting[f], q.pending, `awaiting ${f} mismatch at scale`);
    }
  });
});
