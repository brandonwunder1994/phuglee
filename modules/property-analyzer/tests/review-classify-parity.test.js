const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const rc = require('../lib/result-classify');
const cc = require('../lib/classification-confidence');

describe('result-classify parity exports', () => {
  it('computeNeedsReview matches enrichClassificationFields low-confidence path', () => {
    const record = rc.enrichClassificationFields({
      category: 'property',
      score: 6,
      confidence: 40,
      indicators: ['overgrown_landscaping'],
      leadTier: 'distressed'
    });
    assert.equal(rc.computeNeedsReview(record), true);
    assert.equal(record.reviewReason, 'low_confidence');
  });

  it('isBlurredImagery uses shared imagery quality', () => {
    const record = {
      category: 'property',
      reason: 'Google privacy blur on facade'
    };
    assert.equal(cc.inferImageryQuality(record), cc.IMAGERY_QUALITY.BLURRED);
    assert.equal(rc.isBlurredImagery(record), true);
    assert.equal(rc.computeNeedsReview(record), false);
  });

  it('unknown tier normalizes to unavailable not distressed', () => {
    const { normalizeLeadTier } = require('../lib/tier-engine');
    assert.equal(normalizeLeadTier('mystery_bucket'), 'unavailable');
  });
});
