const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  stripIncidentalTimestamps,
  stableTypeKey,
  stableDescriptionKey
} = require('../lib/bridge-stable-text');

const { violationTypeKey } = require('../lib/bridge-brain-store');

// --- stripIncidentalTimestamps ---

test('stripIncidentalTimestamps: US date + time leaves category phrase', () => {
  const out = stripIncidentalTimestamps('High Grass and Weeds - 01/15/2024 10:30');
  assert.ok(out.includes('High Grass and Weeds'), `expected category phrase in "${out}"`);
  assert.ok(!out.includes('01/15/2024'), `date should be stripped from "${out}"`);
  assert.ok(!out.includes('10:30'), `time should be stripped from "${out}"`);
});

test('stripIncidentalTimestamps: clean label is unchanged (aside from trim)', () => {
  assert.equal(stripIncidentalTimestamps('High Grass and Weeds'), 'High Grass and Weeds');
  assert.equal(stripIncidentalTimestamps('  High Grass and Weeds  '), 'High Grass and Weeds');
});

test('stripIncidentalTimestamps: ISO date and datetime', () => {
  const isoDate = stripIncidentalTimestamps('High Grass 2024-01-15');
  assert.ok(isoDate.includes('High Grass'));
  assert.ok(!isoDate.includes('2024-01-15'));

  const isoDt = stripIncidentalTimestamps('High Grass 2024-01-15T10:30:00');
  assert.ok(isoDt.includes('High Grass'));
  assert.ok(!isoDt.includes('2024-01-15'));
  assert.ok(!isoDt.includes('10:30'));
});

test('stripIncidentalTimestamps: 12h AM/PM time suffixes', () => {
  const am = stripIncidentalTimestamps('High Grass 10:30 AM');
  assert.ok(am.includes('High Grass'));
  assert.ok(!/10:30/i.test(am));
  assert.ok(!/\bAM\b/i.test(am));

  const pm = stripIncidentalTimestamps('High Grass 10:30:00 pm');
  assert.ok(pm.includes('High Grass'));
  assert.ok(!/10:30/i.test(pm));
  assert.ok(!/\bpm\b/i.test(pm));
});

test('stripIncidentalTimestamps: ordinance-like short numbers not stripped as dates', () => {
  const out = stripIncidentalTimestamps('Code 12-3457');
  assert.equal(out, 'Code 12-3457');
});

test('stripIncidentalTimestamps: no dangling trailing dash or double spaces', () => {
  const out = stripIncidentalTimestamps('High Grass and Weeds - 01/15/2024 10:30');
  assert.ok(!out.endsWith('-'), `trailing dash left in "${out}"`);
  assert.ok(!/\s{2,}/.test(out), `double spaces left in "${out}"`);
  assert.equal(out, 'High Grass and Weeds');
});

test('stripIncidentalTimestamps: different phrases stay distinct', () => {
  const fence = stripIncidentalTimestamps('fence permit only');
  const pool = stripIncidentalTimestamps('pool permit expired');
  assert.notEqual(fence, pool);
  assert.equal(fence, 'fence permit only');
  assert.equal(pool, 'pool permit expired');
});

// --- stableTypeKey ---

test('stableTypeKey: timestamped variants of same phrase share key', () => {
  const a = stableTypeKey('High Grass and Weeds - 01/15/2024 10:30');
  const b = stableTypeKey('High Grass and Weeds - 01/16/2024 11:00');
  const clean = stableTypeKey('High Grass and Weeds');
  assert.equal(a, b);
  assert.equal(a, clean);
  assert.equal(a, violationTypeKey('High Grass and Weeds'));
});

test('stableTypeKey: empty / whitespace → __unknown__', () => {
  assert.equal(stableTypeKey(''), '__unknown__');
  assert.equal(stableTypeKey('   '), '__unknown__');
  assert.equal(stableTypeKey(null), '__unknown__');
});

// --- stableDescriptionKey ---

test('stableDescriptionKey: lowercases and collapses spaces', () => {
  assert.equal(
    stableDescriptionKey('  High   Grass  And Weeds  '),
    'high grass and weeds'
  );
});

test('stableDescriptionKey: strips timestamps then normalizes', () => {
  const a = stableDescriptionKey('High Grass and Weeds - 01/15/2024 10:30');
  const b = stableDescriptionKey('High Grass and Weeds - 01/16/2024 11:00');
  assert.equal(a, b);
  assert.equal(a, 'high grass and weeds');
});

test('stableDescriptionKey: empty-after-strip → empty string (not __unknown__)', () => {
  assert.equal(stableDescriptionKey(''), '');
  assert.equal(stableDescriptionKey('   '), '');
  // pure timestamp / noise only
  assert.equal(stableDescriptionKey('01/15/2024 10:30'), '');
  assert.notEqual(stableDescriptionKey('01/15/2024'), '__unknown__');
});
