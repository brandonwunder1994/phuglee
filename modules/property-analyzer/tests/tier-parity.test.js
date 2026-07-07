const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../lib/config');
const createBackups = require('../lib/backups');
const { computeTierCounts } = require('../lib/tier-counts');
const { resultLeadTier } = require('../lib/result-classify');
const fixtures = require('./fixtures/tier-count-cases.json');

function resultLeadTierServerLegacy(r) {
  if (!r) return 'review';
  if (r.blurred || r.isBlurred) return 'blurred';
  const cat = r.category || r.resultCategory || 'property';
  if (cat === 'vacant_lot' || cat === 'vacant') return 'vacant';
  const score = Number(r.score ?? r.manualScore ?? 0);
  if (r.manualOverride || r.tierLocked) {
    if (r.manualTier) return r.manualTier;
  }
  if (score >= 7) return 'distressed';
  if (score >= 4) return 'well_maintained';
  return 'review';
}

describe('tier parity vs legacy server', () => {
  for (const c of fixtures.parityRecords) {
    it(`${c.id}: new tier is ${c.expectedTier}`, () => {
      assert.equal(resultLeadTier(c.record), c.expectedTier);
      if (c.oldServerTier) {
        assert.notEqual(
          resultLeadTierServerLegacy(c.record),
          c.expectedTier,
          'legacy server should disagree — proves fix value'
        );
      }
    });
  }

  it('count fixture matches expected tier counts', () => {
    const counts = computeTierCounts(fixtures.countFixture.results);
    assert.deepEqual(counts, fixtures.countFixture.expected);
  });

  it('computeTierCounts counts every scanned result in all', () => {
    const counts = computeTierCounts(fixtures.countFixture.results);
    assert.equal(counts.all, fixtures.countFixture.results.length);
    assert.equal(counts.review, 1);
  });
});

describe('buildSessionSummary integration', () => {
  it('backups.buildSessionSummary returns client-aligned tierCounts', () => {
    const backups = createBackups({
      config,
      fs,
      path,
      crypto,
      getSafety: () => null
    });
    const session = {
      results: fixtures.countFixture.results,
      records: [],
      processed: 5,
      savedAt: Date.now(),
      fileName: 'test.csv'
    };
    const summary = backups.buildSessionSummary(session);
    assert.deepEqual(summary.tierCounts, fixtures.countFixture.expected);
    assert.equal(summary.tierCounts.review, 1);
    assert.ok('well_maintained' in summary.tierCounts);
  });
});