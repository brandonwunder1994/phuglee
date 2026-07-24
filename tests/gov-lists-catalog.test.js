const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getMeta,
  getSources
} = require('../lib/gov-lists-catalog');

test('getMeta has no sources array and reports stateCounts', () => {
  const meta = getMeta();
  assert.equal(meta.sources, undefined);
  assert.ok(meta.sourceCount > 1000);
  assert.ok(meta.stateCounts.TX > 0);
  assert.ok(Array.isArray(meta.listTypes));
  assert.ok(Array.isArray(meta.howto));
  assert.ok(meta.listTypeCounts && typeof meta.listTypeCounts === 'object');
  assert.ok((meta.listTypeCounts.pre_lien || 0) + (meta.listTypeCounts.code_violation || 0) > 0);
});

test('getSources requires state and returns only that state', () => {
  assert.throws(() => getSources({}), /state/i);
  assert.throws(() => getSources({ state: '' }), /state/i);
  const { sources, total, state } = getSources({ state: 'TX' });
  assert.equal(state, 'TX');
  assert.ok(sources.length > 0);
  assert.equal(sources.length, total);
  assert.ok(sources.every((s) => String(s.state || '').toUpperCase() === 'TX'));
  assert.ok(sources.every((s) => !s.isPlaybook));
});

test('TX sources payload is far smaller than full catalog source count', () => {
  const meta = getMeta();
  const { total } = getSources({ state: 'TX' });
  assert.ok(total < meta.sourceCount);
  assert.ok(total < 2000);
});
