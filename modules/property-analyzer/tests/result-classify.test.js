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
  it('returns well_maintained not distressed', () => {
    const tier = resultLeadTier({
      score: 8,
      category: 'property',
      indicators: ['overgrown_landscaping'],
      satelliteClassification: { roofCondition: 'good', yardCondition: 'good' }
    });
    assert.equal(tier, 'well_maintained');
  });
});