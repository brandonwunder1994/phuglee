const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createReviewTrainingBuffer, popLastMatching } = require('../lib/review-training');

/**
 * Simulates scan.js rollbackReviewTrainingForKey against in-memory brain state.
 * Guards the Keep → advance → Undo → Change regression from Phase 25 research.
 */
function rollbackCommittedTraining(state, key, committed, address) {
  const pop = popLastMatching;
  const addr = String(address || committed.address || '').slice(0, 80);
  const recent = committed.committedAt ? committed.committedAt - 30000 : 0;

  const ev = pop(state.correctionEvents, (e) => {
    if (e.superseded) return false;
    if (committed.eventId && e.id === committed.eventId) return true;
    if (e.recordKey === key && (e.at || 0) >= recent) return true;
    return false;
  });
  if (ev) ev.superseded = true;
  pop(state.tierCorrections, (c) => addr && String(c.address || '').slice(0, 80) === addr && (c.at || 0) >= recent);
  pop(state.scoreCorrections, (c) => addr && String(c.address || '').slice(0, 80) === addr && (c.at || 0) >= recent);
}

function commitPending(buf, state, key, action) {
  buf.setPending(key, action);
  const taken = buf.takePending(key);
  assert.ok(taken);

  const event = {
    id: `E-${state.correctionEvents.length + 1}`,
    kind: taken.type === 'affirmation' ? 'affirmation' : 'correction',
    recordKey: key,
    address: taken.record?.address || '123 Main St',
    fromTier: taken.fromTier || 'well_maintained',
    toTier: taken.toTier || taken.tier || 'distressed',
    at: Date.now(),
    superseded: false
  };
  state.correctionEvents.push(event);
  if (taken.type === 'tier_change') {
    state.tierCorrections.push({ address: event.address, aiTier: taken.fromTier, userTier: taken.toTier, at: Date.now() });
    state.scoreCorrections.push({ address: event.address, aiScore: 8, userScore: 6, at: Date.now() });
  }
  buf.markCommitted(key, { eventId: event.id, address: event.address, type: taken.type, committedAt: Date.now() });
  return event;
}

describe('review training flow integration', () => {
  it('Keep → advance → Undo rolls back committed affirmation', () => {
    const buf = createReviewTrainingBuffer();
    const state = { correctionEvents: [], tierCorrections: [], scoreCorrections: [] };
    const key = 'addr-keep-undo';

    const event = commitPending(buf, state, key, {
      type: 'affirmation',
      record: { address: '123 Main St' },
      tier: 'distressed'
    });
    assert.equal(state.correctionEvents.length, 1);

    const committed = buf.getCommitted(key);
    rollbackCommittedTraining(state, key, committed, '123 Main St');
    buf.clearCommitted(key);

    assert.equal(state.correctionEvents.length, 0);
    assert.equal(state.tierCorrections.length, 0);
  });

  it('Keep → Undo → Change leaves single active correction after re-commit', () => {
    const buf = createReviewTrainingBuffer();
    const state = { correctionEvents: [], tierCorrections: [], scoreCorrections: [] };
    const key = 'addr-kuc';

    commitPending(buf, state, key, {
      type: 'affirmation',
      record: { address: '456 Oak Ave' },
      tier: 'well_maintained'
    });
    rollbackCommittedTraining(state, key, buf.getCommitted(key), '456 Oak Ave');
    buf.clearCommitted(key);

    commitPending(buf, state, key, {
      type: 'tier_change',
      record: { address: '456 Oak Ave' },
      fromTier: 'well_maintained',
      toTier: 'distressed'
    });

    const active = state.correctionEvents.filter((e) => !e.superseded);
    assert.equal(active.length, 1);
    assert.equal(active[0].kind, 'correction');
    assert.equal(state.tierCorrections.length, 1);
  });

  it('pending replaced when user changes mind before advance', () => {
    const buf = createReviewTrainingBuffer();
    const key = 'addr-pending-replace';

    buf.setPending(key, { type: 'affirmation', tier: 'distressed' });
    buf.setPending(key, { type: 'tier_change', fromTier: 'well_maintained', toTier: 'distressed' });

    const taken = buf.takePending(key);
    assert.equal(taken.type, 'tier_change');
    assert.equal(buf.pendingCount(), 0);
  });

  it('gemini dedupe blocks duplicate jobs per key and action type', () => {
    const buf = createReviewTrainingBuffer();
    assert.equal(buf.shouldDedupeGemini('k1', 'affirmation'), false);
    assert.equal(buf.shouldDedupeGemini('k1', 'affirmation'), true);
    assert.equal(buf.shouldDedupeGemini('k1', 'tier_change'), false);
    assert.equal(buf.shouldDedupeGemini('k2', 'affirmation'), false);
  });
});