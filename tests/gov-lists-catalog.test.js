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

test('getSources with TX returns only that state', () => {
  const { sources, total, state } = getSources({ state: 'TX' });
  assert.equal(state, 'TX');
  assert.ok(sources.length > 0);
  assert.equal(sources.length, total);
  assert.ok(sources.every((s) => String(s.state || '').toUpperCase() === 'TX'));
  assert.ok(sources.every((s) => !s.isPlaybook));
});

test('getSources with empty/all returns nationwide catalog', () => {
  const allA = getSources({ state: '' });
  const allB = getSources({ state: 'all' });
  const meta = getMeta();
  assert.equal(allA.state, 'all');
  assert.equal(allB.state, 'all');
  assert.equal(allA.total, allB.total);
  assert.ok(allA.total >= meta.sourceCount - 50);
  assert.ok(allA.total > 5000);
  assert.ok(allA.sources.every((s) => !s.isPlaybook));
  // Includes multiple states
  const states = new Set(allA.sources.map((s) => s.state));
  assert.ok(states.size > 20);
});

test('getSources maps full state names into TX (research + forge rows)', () => {
  const byCode = getSources({ state: 'TX' });
  const byName = getSources({ state: 'Texas' });
  assert.equal(byCode.total, byName.total);
  // Must include both former TX-code and Texas-name rows (was ~823 vs ~1006)
  assert.ok(byCode.total > 900, `expected full TX universe, got ${byCode.total}`);
  assert.ok(byCode.sources.every((s) => s.state === 'TX'));
});

test('getMeta stateCounts uses normalized 2-letter keys only', () => {
  const meta = getMeta();
  assert.ok(meta.stateCounts.TX > 900);
  assert.equal(meta.stateCounts.Texas, undefined);
  assert.equal(meta.stateCounts.TEXAS, undefined);
  // ~50 states + DC, not 69 fragmented keys
  assert.ok(Object.keys(meta.stateCounts).length <= 60);
});

test('TX sources payload is far smaller than full catalog source count', () => {
  const meta = getMeta();
  const { total } = getSources({ state: 'TX' });
  assert.ok(total < meta.sourceCount);
  assert.ok(total < 2000);
});
