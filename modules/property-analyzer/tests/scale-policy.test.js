const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  SCALE_POLICY,
  shouldReuseSatelliteClassification,
  estimateApiCallsPer1kLeads,
  formatCostEstimate
} = require('../lib/scale-policy');
const { retierRecordWithoutVision, retierResultsWithoutVision } = require('../lib/retier-without-vision');

describe('scale-policy', () => {
  it('documents cache-first policy flags', () => {
    assert.equal(SCALE_POLICY.streetViewFirst, true);
    assert.equal(SCALE_POLICY.satelliteOnDemandOnly, false);
    assert.equal(SCALE_POLICY.satelliteAlwaysForProperty, true);
    assert.equal(SCALE_POLICY.imageryCacheFirst, true);
    assert.equal(SCALE_POLICY.retierWithoutVision, true);
  });

  it('reuses satellite classification on cache hit with prior record', () => {
    const prior = {
      satelliteClassification: { category: 'property', confidence: 72, aerialDistressScore: 6 }
    };
    assert.equal(shouldReuseSatelliteClassification(prior, { fromCache: true }), true);
    assert.equal(shouldReuseSatelliteClassification(prior, { fromCache: false }), false);
    assert.equal(shouldReuseSatelliteClassification({}, { fromCache: true }), false);
  });

  it('estimates API calls per 1k leads with always-on satellite', () => {
    const est = estimateApiCallsPer1kLeads();
    assert.equal(est.leads, 1000);
    assert.ok(est.maps.streetView >= 1000);
    assert.ok(est.maps.satellite >= 350);
    assert.ok(est.gemini.street >= 1000);
    assert.ok(est.gemini.satellite >= 400);
    assert.ok(est.perLead.all > 2);
    assert.ok(formatCostEstimate(est).includes('1000 leads'));
  });

  it('recalibratePropertyScores does not call Gemini', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    const fn = src.slice(src.indexOf('R.recalibratePropertyScores'), src.indexOf('R.repairFalseFetchFailures'));
    assert.ok(!fn.includes('classifyWithSatellite'));
    assert.ok(!fn.includes('callGeminiVision'));
    assert.ok(!fn.includes('analyzeWithGemini'));
    assert.ok(fn.includes('retieredWithoutVision'));
  });
});

describe('retier-without-vision', () => {
  it('re-tiers from saved indicators without vision fields', () => {
    const { record, changed } = retierRecordWithoutVision({
      category: 'property',
      score: 8,
      indicators: ['junk_or_hoarding_yard', 'overgrown_landscaping'],
      reason: 'Junk and weeds visible'
    });
    assert.equal(record.leadTier, 'distressed');
    assert.equal(record.retieredWithoutVision, true);
    assert.equal(typeof changed, 'boolean');
  });

  it('skips manual overrides', () => {
    const { record, changed } = retierRecordWithoutVision({
      category: 'property',
      score: 8,
      manualOverride: 'distressed',
      leadTier: 'distressed'
    });
    assert.equal(changed, false);
    assert.equal(record.manualOverride, 'distressed');
  });

  it('batch retier counts changes', () => {
    const { results, changed } = retierResultsWithoutVision([
      { category: 'property', score: 2, leadTier: 'well_maintained', indicators: ['boarded_windows'] },
      { category: 'vacant_lot', score: 0 }
    ]);
    assert.equal(results[0].leadTier, 'distressed');
    assert.equal(changed, 1);
  });
});