const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  REVIEW_THRESHOLD,
  inferImageryQuality,
  computeClassificationConfidence,
  isLowConfidenceReview,
  isBorderlineDistressReview,
  enrichClassificationFields,
  IMAGERY_QUALITY
} = require('../lib/classification-confidence');
const {
  isBlurredImagery,
  computeNeedsReview,
  resultCategory
} = require('../lib/result-classify');

describe('inferImageryQuality', () => {
  it('returns blurred for privacy blur reason', () => {
    assert.equal(inferImageryQuality({
      category: 'property',
      reason: 'Google privacy blur on facade'
    }), IMAGERY_QUALITY.BLURRED);
  });

  it('returns retry for transient Gemini failure', () => {
    assert.equal(inferImageryQuality({
      category: 'unavailable',
      qualityFlags: ['street_ai_failed'],
      reason: '503 high demand — retry later'
    }), IMAGERY_QUALITY.RETRY);
  });

  it('returns unavailable for land/home conflict without blur', () => {
    assert.equal(inferImageryQuality({
      category: 'unavailable',
      landHomeConflict: true,
      reason: 'Cannot see structure on lot'
    }), IMAGERY_QUALITY.DEGRADED);
  });

  it('returns obstructed for blocked facade', () => {
    assert.equal(inferImageryQuality({
      category: 'property',
      reason: 'Trees block the home facade'
    }), IMAGERY_QUALITY.OBSTRUCTED);
  });

  it('tree-blocked facade is obstructed not blurred', () => {
    assert.equal(inferImageryQuality({
      category: 'property',
      reason: 'Facade blurred by trees — cannot assess siding.'
    }), IMAGERY_QUALITY.OBSTRUCTED);
  });
});

describe('computeClassificationConfidence', () => {
  it('composites street and satellite confidence when both present', () => {
    const conf = computeClassificationConfidence({
      category: 'property',
      score: 6,
      confidence: 80,
      usedSatellite: true,
      indicators: ['junk_or_hoarding_yard'],
      satelliteClassification: { category: 'property', confidence: 70 }
    });
    assert.ok(conf >= 70 && conf <= 85);
  });

  it('returns low score for blurred imagery', () => {
    assert.equal(computeClassificationConfidence({
      category: 'blurred',
      reason: 'privacy blur'
    }), 0);
  });
});

describe('computeNeedsReview confidence routing', () => {
  it('routes low confidence property to review', () => {
    const record = enrichClassificationFields({
      category: 'property',
      score: 6,
      confidence: 40,
      indicators: ['overgrown_landscaping'],
      leadTier: 'distressed'
    });
    assert.ok(record.classificationConfidence < REVIEW_THRESHOLD);
    assert.equal(isLowConfidenceReview(record), true);
    assert.equal(computeNeedsReview(record), true);
  });

  it('routes borderline distress (score 6 + moderate indicator) to review', () => {
    const record = {
      category: 'property',
      score: 6,
      confidence: 85,
      indicators: ['junk_or_hoarding_yard'],
      leadTier: 'distressed'
    };
    assert.equal(isBorderlineDistressReview(record), true);
    assert.equal(computeNeedsReview(record), true);
  });

  it('does not treat unavailable land conflict as blurred', () => {
    const record = {
      category: 'unavailable',
      landHomeConflict: true,
      score: 0,
      reason: 'Cannot see structure'
    };
    assert.equal(isBlurredImagery(record), false);
    assert.equal(computeNeedsReview(record), true);
  });

  it('keeps true blurred in blurred bucket not review', () => {
    const record = {
      manualOverride: 'blurred',
      category: 'blurred',
      score: 0
    };
    assert.equal(isBlurredImagery(record), true);
    assert.equal(computeNeedsReview(record), false);
  });

  it('routes retry quality to review not blurred list', () => {
    const record = {
      category: 'unavailable',
      qualityFlags: ['street_ai_failed'],
      reason: 'Gemini 503 overloaded'
    };
    assert.equal(inferImageryQuality(record), IMAGERY_QUALITY.RETRY);
    assert.equal(isBlurredImagery(record), false);
    assert.equal(computeNeedsReview(record), true);
  });

  it('does not send incomplete AI with usable street classification to Needs Review', () => {
    const record = enrichClassificationFields({
      category: 'property',
      score: 2,
      leadTier: 'well_maintained',
      confidence: null,
      indicators: [],
      viewMeta: { heading: 90 },
      qualityFlags: ['ai_response_incomplete', 'street_ai_failed'],
      reason: 'Street View imagery confirmed — defaulting to Well Maintained (AI response incomplete).'
    });
    assert.equal(inferImageryQuality(record), IMAGERY_QUALITY.DEGRADED);
    assert.equal(computeNeedsReview(record), false);
  });

  it('excludes manually reviewed leads from needs review dashboard', () => {
    const record = enrichClassificationFields({
      category: 'property',
      score: 6,
      confidence: 40,
      indicators: ['overgrown_landscaping'],
      leadTier: 'distressed',
      manuallyReviewed: true,
      manuallyReviewedVia: 'review_keep'
    });
    assert.equal(isLowConfidenceReview(record), false);
    assert.equal(computeNeedsReview(record), false);
  });

  it('keeps deferred leads in needs review after manual review', () => {
    const record = {
      category: 'property',
      score: 6,
      confidence: 40,
      indicators: ['overgrown_landscaping'],
      leadTier: 'distressed',
      manuallyReviewed: true,
      needsReviewLater: true
    };
    assert.equal(computeNeedsReview(record), true);
  });

  it('excludes reviewResolved leads even when confidence is low', () => {
    const record = enrichClassificationFields({
      category: 'property',
      score: 6,
      confidence: 40,
      indicators: ['overgrown_landscaping'],
      leadTier: 'distressed',
      reviewResolved: true
    });
    assert.equal(computeNeedsReview(record), false);
  });
});

describe('enrichClassificationFields', () => {
  it('sets additive schema fields only', () => {
    const record = enrichClassificationFields({
      category: 'property',
      score: 5,
      confidence: 55,
      indicators: []
    });
    assert.ok(typeof record.classificationConfidence === 'number');
    assert.ok(typeof record.imageryQuality === 'string');
    assert.equal(record.reviewReason, 'low_confidence');
    assert.equal(resultCategory(record), 'property');
  });
});
