const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createReviewTrainingBuffer, popLastMatching } = require('../lib/review-training');

describe('review-training buffer', () => {
  it('stores and takes pending actions per recordKey', () => {
    const buf = createReviewTrainingBuffer();
    buf.setPending('addr-1', { type: 'affirmation', tier: 'distressed' });
    assert.equal(buf.pendingCount(), 1);
    const taken = buf.takePending('addr-1');
    assert.equal(taken.type, 'affirmation');
    assert.equal(buf.pendingCount(), 0);
  });

  it('clearPending drops without commit', () => {
    const buf = createReviewTrainingBuffer();
    buf.setPending('addr-2', { type: 'tier_change', fromTier: 'well_maintained', toTier: 'distressed' });
    buf.clearPending('addr-2');
    assert.equal(buf.getPending('addr-2'), null);
  });

  it('dedupes gemini per recordKey and action type', () => {
    const buf = createReviewTrainingBuffer();
    assert.equal(buf.shouldDedupeGemini('k1', 'affirmation'), false);
    assert.equal(buf.shouldDedupeGemini('k1', 'affirmation'), true);
    assert.equal(buf.shouldDedupeGemini('k1', 'tier_change'), false);
  });

  it('reset clears session state', () => {
    const buf = createReviewTrainingBuffer();
    buf.setPending('a', { type: 'affirmation' });
    buf.markCommitted('a', { eventId: 'E1' });
    buf.shouldDedupeGemini('a', 'affirmation');
    buf.reset();
    assert.equal(buf.pendingCount(), 0);
    assert.equal(buf.getCommitted('a'), null);
    assert.equal(buf.shouldDedupeGemini('a', 'affirmation'), false);
  });
});

describe('popLastMatching', () => {
  it('removes last matching item', () => {
    const arr = [
      { address: 'A', aiTier: 'well_maintained' },
      { address: 'B', aiTier: 'distressed' },
      { address: 'A', aiTier: 'distressed' }
    ];
    const removed = popLastMatching(arr, (x) => x.address === 'A');
    assert.equal(removed.userTier || removed.aiTier, 'distressed');
    assert.equal(arr.length, 2);
    assert.equal(arr[1].address, 'B');
  });
});