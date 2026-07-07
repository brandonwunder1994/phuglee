const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeSessionSave,
  mergePartialSessionSave,
  isIncomingSessionWorse,
  countSessionProgress
} = require('../lib/backup-logic');

describe('mergePartialSessionSave', () => {
  it('merges manual edits from partial save into full server session', () => {
    const existing = {
      results: [
        { email: 'a@test.com', phone: '1', address: '1 Main', leadTier: 'well_maintained', score: 8 },
        { email: 'b@test.com', phone: '2', address: '2 Oak', leadTier: 'well_maintained', score: 7 }
      ],
      records: [
        { email: 'a@test.com', phone: '1', address: '1 Main' },
        { email: 'b@test.com', phone: '2', address: '2 Oak' }
      ],
      processed: 2
    };
    const incoming = {
      results: [
        { email: 'a@test.com', phone: '1', address: '1 Main', leadTier: 'distressed', score: 3, manualScore: true }
      ],
      processed: 2,
      reviewStats: { kept: 0, changed: 1, deferred: 0, blurred: 0 },
      savedAt: Date.now()
    };
    const merged = mergePartialSessionSave(existing, incoming);
    assert.equal(merged.results.length, 2);
    assert.equal(merged.results[0].leadTier, 'distressed');
    assert.equal(merged.results[0].manualScore, true);
    assert.equal(merged.results[1].leadTier, 'well_maintained');
    assert.equal(merged.reviewStats.changed, 1);
    assert.equal(merged.records.length, 2);
  });

  it('merged session is not worse than existing when only count differed', () => {
    const existing = {
      results: Array.from({ length: 10 }, (_, i) => ({
        email: `u${i}@t.com`, phone: String(i), address: `${i} St`, leadTier: 'well_maintained'
      })),
      processed: 10,
      savedAt: 1000
    };
    const incoming = {
      results: existing.results.slice(0, 6).map((r, i) => (
        i === 0 ? { ...r, leadTier: 'distressed', manualScore: true } : r
      )),
      processed: 10,
      savedAt: 2000
    };
    const merged = mergePartialSessionSave(existing, incoming);
    const worse = isIncomingSessionWorse(
      {
        existingResults: 10,
        existingProcessed: 10,
        existingProgress: countSessionProgress(existing),
        existingBytes: 1000,
        existingSavedAt: 1000
      },
      {
        results: merged.results.length,
        processed: merged.processed,
        incomingProgress: countSessionProgress(merged),
        incomingBytes: 1200,
        incomingSavedAt: 2000
      }
    );
    assert.equal(merged.results.length, 10);
    assert.equal(worse, false);
  });

  it('same result count with smaller bytes but newer savedAt is not a downgrade', () => {
    const worse = isIncomingSessionWorse(
      { existingResults: 100, existingProcessed: 100, existingProgress: 50, existingBytes: 10000, existingSavedAt: 1000 },
      { results: 100, processed: 100, incomingProgress: 50, incomingBytes: 9000, incomingSavedAt: 2000 }
    );
    assert.equal(worse, false);
  });

  it('mergeSessionSave applies per-record edits at full count', () => {
    const existing = {
      results: [{ email: 'a@t.com', phone: '1', address: '1 Main', leadTier: 'well_maintained', score: 8, indicators: ['a', 'b'] }],
      processed: 1,
      savedAt: 1000
    };
    const incoming = {
      results: [{ email: 'a@t.com', phone: '1', address: '1 Main', leadTier: 'distressed', score: 3, manualScore: true }],
      processed: 1,
      savedAt: 2000
    };
    const merged = mergeSessionSave(existing, incoming);
    assert.equal(merged.results[0].leadTier, 'distressed');
    assert.equal(merged.results[0].manualScore, true);
  });
});