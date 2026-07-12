const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeTierCounts, computeGeoTierCounts, normalizeStateAbbr } = require('../lib/tier-counts');
const fixtures = require('./fixtures/tier-count-cases.json');

describe('computeTierCounts', () => {
  it('matches countFixture expected shape', () => {
    const counts = computeTierCounts(fixtures.countFixture.results);
    assert.deepEqual(counts, fixtures.countFixture.expected);
  });

  it('counts every scanned record in all', () => {
    const counts = computeTierCounts(fixtures.countFixture.results);
    assert.equal(counts.all, fixtures.countFixture.results.length);
    assert.equal(counts.review, 1);
  });

  it('returns exactly six count keys', () => {
    const counts = computeTierCounts(fixtures.countFixture.results);
    assert.deepEqual(Object.keys(counts).sort(), [
      'all', 'blurred', 'distressed', 'review', 'vacant', 'well_maintained'
    ]);
  });
});

describe('computeGeoTierCounts', () => {
  it('merges Tx and TX into one state bucket', () => {
    const geo = computeGeoTierCounts([
      { state: 'Tx', city: 'Dallas', score: 8, leadTier: 'distressed', category: 'property', reason: 'ok' },
      { state: 'TX', city: 'Austin', score: 2, leadTier: 'well_maintained', category: 'property', reason: 'ok' },
      { state: 'tx', city: 'Dallas', score: 9, leadTier: 'distressed', category: 'property', reason: 'ok' }
    ]);
    const tx = geo.states.find((s) => s.abbr === 'TX');
    assert.ok(tx);
    assert.equal(tx.total, 3);
    assert.equal(tx.tierCounts.all, 3);
    const dallas = tx.cities.find((c) => c.name === 'Dallas');
    assert.equal(dallas.total, 2);
  });

  it('normalizeStateAbbr uppercases two-letter codes', () => {
    assert.equal(normalizeStateAbbr('tx'), 'TX');
    assert.equal(normalizeStateAbbr('Texas'), 'TX');
  });
});