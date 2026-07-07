const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BRAIN_CAPS,
  buildLearnedBrainPayload,
  parseLearnedBrainFromSession,
  sessionHasLearnedBrain,
  mergeLearnedBrainForMigration
} = require('../lib/learned-brain');

describe('learned-brain', () => {
  it('caps arrays to configured limits', () => {
    const rules = Array.from({ length: 150 }, (_, i) => ({ id: `R${i}` }));
    const events = Array.from({ length: 250 }, (_, i) => ({ id: `C${i}` }));
    const payload = buildLearnedBrainPayload({ learnedRules: rules, correctionEvents: events });
    assert.equal(payload.learnedRules.length, BRAIN_CAPS.learnedRules);
    assert.equal(payload.correctionEvents.length, BRAIN_CAPS.correctionEvents);
    assert.equal(payload.learnedRules[0].id, 'R30');
    assert.equal(payload.correctionEvents[0].id, 'C50');
  });

  it('detects session brain fields', () => {
    assert.equal(sessionHasLearnedBrain({}), false);
    assert.equal(sessionHasLearnedBrain({ learnedRules: [] }), true);
    assert.equal(sessionHasLearnedBrain({ correctionEvents: [{ id: 'C1' }] }), true);
  });

  it('parses and normalizes session brain payload', () => {
    const parsed = parseLearnedBrainFromSession({
      learnedRules: [{ id: 'R1' }],
      correctionEvents: 'not-an-array',
      scoreCorrections: [{ aiScore: 1, userScore: 2 }]
    });
    assert.deepEqual(parsed.learnedRules, [{ id: 'R1' }]);
    assert.deepEqual(parsed.correctionEvents, []);
    assert.deepEqual(parsed.scoreCorrections, [{ aiScore: 1, userScore: 2 }]);
  });

  it('merges local brain into empty session brain for migration', () => {
    const local = {
      learnedRules: [{ id: 'R-local' }],
      correctionEvents: [{ id: 'C-local' }]
    };
    const merged = mergeLearnedBrainForMigration({}, local);
    assert.deepEqual(merged.learnedRules, local.learnedRules);
    assert.deepEqual(merged.correctionEvents, local.correctionEvents);
  });

  it('dedupes merged brain items and keeps newest capped tail', () => {
    const session = { learnedRules: [{ id: 'R1', tier: 'distressed' }] };
    const local = { learnedRules: [{ id: 'R1', tier: 'distressed' }, { id: 'R2' }] };
    const merged = mergeLearnedBrainForMigration(session, local);
    assert.equal(merged.learnedRules.length, 2);
    assert.deepEqual(merged.learnedRules.map((r) => r.id), ['R1', 'R2']);
  });
});