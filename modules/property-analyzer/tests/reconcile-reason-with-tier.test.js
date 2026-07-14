'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  reconcileReasonWithTier,
  reasonSuggestsManicured
} = require('../lib/tier-engine');

describe('reconcileReasonWithTier', () => {
  it('rewrites manicured reason on distressed with indicators; keeps tier', () => {
    const out = reconcileReasonWithTier({
      leadTier: 'distressed',
      score: 8,
      indicators: ['junk_or_hoarding_yard', 'overgrown_landscaping'],
      reason: 'The property appears well-maintained with a clean facade and no visible signs of significant distress.',
      needsReview: false
    });
    assert.equal(out.leadTier, 'distressed');
    assert.equal(out.score, 8);
    assert.equal(out.needsReview, false);
    assert.match(out.reason, /^Distressed \(score 8\): junk_or_hoarding_yard, overgrown_landscaping\.$/);
  });

  it('leaves score 3 WM manicured reason unchanged', () => {
    const reason = 'The property appears well-maintained with a clean facade.';
    const out = reconcileReasonWithTier({
      leadTier: 'well_maintained',
      score: 3,
      indicators: [],
      reason,
      needsReview: false
    });
    assert.equal(out.leadTier, 'well_maintained');
    assert.equal(out.reason, reason);
    assert.equal(out.needsReview, false);
  });

  it('flags needsReview when score>=6, empty indicators, manicured reason', () => {
    const out = reconcileReasonWithTier({
      leadTier: 'distressed',
      score: 7,
      indicators: [],
      reason: 'The property appears well-maintained with no visible signs of distress.',
      needsReview: false
    });
    assert.equal(out.leadTier, 'distressed');
    assert.equal(out.needsReview, true);
    assert.match(out.reason, /verify on Street View/);
  });

  it('does not needsReview when sat supports empty-indicator distressed manicured case', () => {
    const out = reconcileReasonWithTier(
      {
        leadTier: 'distressed',
        score: 7,
        indicators: [],
        reason: 'Well-maintained suburban home.',
        needsReview: false
      },
      { satelliteClassification: { yardCondition: 'poor', aerialDistressScore: 7 } }
    );
    assert.equal(out.needsReview, false);
    assert.match(out.reason, /^Distressed \(score 7\):/);
  });

  it('rewrites severe prose on well_maintained tier', () => {
    const out = reconcileReasonWithTier({
      leadTier: 'well_maintained',
      score: 3,
      indicators: ['overgrown_landscaping'],
      reason: 'Looks like a dump house with boarded windows and heavy neglect.',
      needsReview: false
    });
    assert.equal(out.leadTier, 'well_maintained');
    assert.match(out.reason, /^Occupied \/ maintained appearance \(score 3\): overgrown_landscaping\.$/);
  });
});

describe('reasonSuggestsManicured', () => {
  it('detects well-maintained wording', () => {
    assert.equal(reasonSuggestsManicured('appears well-maintained with clean facade'), true);
    assert.equal(reasonSuggestsManicured('Boarded windows and junk piles'), false);
  });
});
