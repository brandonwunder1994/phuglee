const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resultLeadTier } = require('../lib/result-classify');
const fixtures = require('./fixtures/tier-count-cases.json');

describe('resultLeadTier parity records', () => {
  for (const c of fixtures.parityRecords) {
    it(`${c.id} → ${c.expectedTier}`, () => {
      assert.equal(resultLeadTier(c.record), c.expectedTier);
    });
  }
});

describe('resultLeadTier score8 cosmetic', () => {
  // Score 6+ with soft flags stays Distressed (see tier-engine score8_cosmetic_only).
  // Manicured exemption is for score 1–5 or empty-indicator manicured sat only.
  it('returns distressed when model score is 6+ with soft flags', () => {
    const tier = resultLeadTier({
      score: 8,
      category: 'property',
      indicators: ['overgrown_landscaping'],
      satelliteClassification: { roofCondition: 'good', yardCondition: 'good' }
    });
    assert.equal(tier, 'distressed');
  });
});