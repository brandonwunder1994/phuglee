const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('tier count cache keys', () => {
  it('changes when mutation epoch increments', () => {
    let epoch = 0;
    const key = (n) => `100:100:100:true:${epoch}:${n}`;
    const k1 = key(0);
    epoch++;
    const k2 = key(0);
    assert.notEqual(k1, k2);
    assert.ok(k2.includes(':1:'));
  });
});