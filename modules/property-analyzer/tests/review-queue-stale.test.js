const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mirrors isReviewQueueStaleVsPending decision rules used by the client.
 * Stash of ~2 after a large scan must rebuild, not resume.
 */
function isReviewQueueStaleVsPending(pendingKeys, queue) {
  const pending = (pendingKeys || []).length;
  if (!pending) return false;
  const cleaned = (queue || []).filter((k) => pendingKeys.includes(k));
  if (!cleaned.length && pending > 0) return true;
  if (pending > cleaned.length + 2) return true;
  const qSet = new Set(cleaned);
  let missing = 0;
  for (const key of pendingKeys) {
    if (!qSet.has(key)) missing++;
    if (missing > 2) return true;
  }
  return false;
}

describe('stale review queue vs pending after large scan', () => {
  it('treats 2-item stash as stale when hundreds are pending', () => {
    const pendingKeys = Array.from({ length: 936 }, (_, i) => `k${i}`);
    const stash = ['k0', 'k1'];
    assert.equal(isReviewQueueStaleVsPending(pendingKeys, stash), true);
  });

  it('keeps a near-complete mid-review queue', () => {
    const pendingKeys = ['a', 'b', 'c', 'd', 'e'];
    const stash = ['a', 'b', 'c', 'd', 'e'];
    assert.equal(isReviewQueueStaleVsPending(pendingKeys, stash), false);
  });

  it('allows a couple of new pending keys without full rebuild signal', () => {
    const pendingKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const stash = ['a', 'b', 'c', 'd', 'e'];
    // missing 2 → not stale (>2 required)
    assert.equal(isReviewQueueStaleVsPending(pendingKeys, stash), false);
  });

  it('flags three or more missing pending keys as stale', () => {
    const pendingKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const stash = ['a', 'b', 'c', 'd', 'e'];
    assert.equal(isReviewQueueStaleVsPending(pendingKeys, stash), true);
  });
});
