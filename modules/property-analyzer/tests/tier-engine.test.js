const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeLeadTier, normalizeLeadTier } = require('../lib/tier-engine');
const cases = require('./fixtures/tier-cases.json');

describe('computeLeadTier fixtures', () => {
  for (const c of cases) {
    it(c.id, () => {
      assert.equal(computeLeadTier(c.score, c.category, c.ctx || null), c.expected);
    });
  }
});

describe('normalizeLeadTier', () => {
  it('maps hot_lead to distressed', () => assert.equal(normalizeLeadTier('hot_lead'), 'distressed'));
  it('maps well-maintained hyphen', () => assert.equal(normalizeLeadTier('well-maintained'), 'well_maintained'));
  it('maps unknown garbage to unavailable', () => assert.equal(normalizeLeadTier('banana_tier'), 'unavailable'));
});