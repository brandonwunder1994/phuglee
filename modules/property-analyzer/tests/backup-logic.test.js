const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldReplaceSessionResult,
  isIncomingSessionWorse,
  isManuallyEditedResult
} = require('../lib/backup-logic');

describe('shouldReplaceSessionResult', () => {
  it('prefers manual override over auto scan', () => {
    const prev = { score: 5, manualScore: true, manualEditedAt: 100 };
    const inc = { score: 8, analyzedAt: 200 };
    assert.equal(shouldReplaceSessionResult(prev, inc), false);
  });
  it('accepts manual override over plain result', () => {
    const prev = { score: 8, analyzedAt: 200 };
    const inc = { score: 5, manualScore: true, manualEditedAt: 100 };
    assert.equal(shouldReplaceSessionResult(prev, inc), true);
  });
  it('prefers newer timestamp when both auto', () => {
    const prev = { score: 5, analyzedAt: 100 };
    const inc = { score: 5, analyzedAt: 200 };
    assert.equal(shouldReplaceSessionResult(prev, inc), true);
  });
});

describe('isManuallyEditedResult', () => {
  it('detects manual score flag', () => {
    assert.equal(isManuallyEditedResult({ manualScore: true }), true);
    assert.equal(isManuallyEditedResult({ score: 5 }), false);
  });
});

describe('isIncomingSessionWorse', () => {
  it('rejects fewer results', () => {
    assert.equal(isIncomingSessionWorse(
      { existingResults: 100, existingProcessed: 100, existingProgress: 10, existingBytes: 1000, existingSavedAt: 200 },
      { results: 99, processed: 100, incomingProgress: 10, incomingBytes: 1000, incomingSavedAt: 300 }
    ), true);
  });
  it('accepts more results', () => {
    assert.equal(isIncomingSessionWorse(
      { existingResults: 100, existingProcessed: 100, existingProgress: 10, existingBytes: 1000, existingSavedAt: 200 },
      { results: 101, processed: 100, incomingProgress: 10, incomingBytes: 1000, incomingSavedAt: 300 }
    ), false);
  });
  it('allows smaller bytes when save is newer (client may omit hydrated fields)', () => {
    assert.equal(isIncomingSessionWorse(
      { existingResults: 100, existingProcessed: 100, existingProgress: 10, existingBytes: 1000, existingSavedAt: 200 },
      { results: 100, processed: 100, incomingProgress: 10, incomingBytes: 900, incomingSavedAt: 300 }
    ), false);
  });
  it('rejects smaller bytes when save is older', () => {
    assert.equal(isIncomingSessionWorse(
      { existingResults: 100, existingProcessed: 100, existingProgress: 10, existingBytes: 1000, existingSavedAt: 300 },
      { results: 100, processed: 100, incomingProgress: 10, incomingBytes: 900, incomingSavedAt: 200 }
    ), true);
  });
});