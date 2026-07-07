const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function shouldTriggerReviewCheckpoint(actionsSince, everyN) {
  return (actionsSince || 0) >= (everyN || 100);
}

function countReviewedKeys(buckets) {
  if (!buckets) return 0;
  let n = 0;
  for (const k of Object.keys(buckets)) {
    if (Array.isArray(buckets[k])) n += buckets[k].length;
  }
  return n;
}

describe('review checkpoint', () => {
  it('triggers at 100 actions', () => {
    assert.equal(shouldTriggerReviewCheckpoint(99, 100), false);
    assert.equal(shouldTriggerReviewCheckpoint(100, 100), true);
  });

  it('counts reviewed keys across filters', () => {
    const n = countReviewedKeys({
      distressed: ['a', 'b'],
      well_maintained: ['c'],
      vacant: [],
      review: ['d', 'e', 'f']
    });
    assert.equal(n, 6);
  });
});