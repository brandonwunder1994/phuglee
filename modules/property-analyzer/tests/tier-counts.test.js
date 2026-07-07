const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeTierCounts } = require('../lib/tier-counts');
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