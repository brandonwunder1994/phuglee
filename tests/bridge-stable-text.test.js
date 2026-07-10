const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  stripIncidentalTimestamps,
  stripIncidentalNoise,
  extractLeadingTypeCodes,
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

// --- Phase stack: incidental noise beyond timestamps ---

test('stripIncidentalNoise: case IDs removed, category code kept', () => {
  const out = stripIncidentalNoise(
    'HGWx2- entire property \nPS-2026-04-3104-ICS; April 22, 2026'
  );
  assert.ok(/HGW/i.test(out), `expected HGW in "${out}"`);
  assert.ok(!/PS-2026/i.test(out), `case id left in "${out}"`);
  assert.ok(!/April 22/i.test(out), `date phrase left in "${out}"`);
});

test('stripIncidentalNoise: asterisk meta and X2 multipliers stripped', () => {
  const out = stripIncidentalNoise('HGW\n*CALL BACK WITH UPDATES* X2');
  assert.ok(/HGW/i.test(out));
  assert.ok(!/CALL BACK/i.test(out), `meta left in "${out}"`);
  assert.ok(!/\bX2\b/i.test(out), `multiplier left in "${out}"`);
});

test('stripIncidentalNoise: ordinance-like short numbers not stripped as dates', () => {
  assert.equal(stripIncidentalNoise('Code 12-3457'), 'Code 12-3457');
});

// --- Leading municipal type codes ---

test('extractLeadingTypeCodes: pure HGW and HGW with notes → [hgw]', () => {
  assert.deepEqual(extractLeadingTypeCodes('HGW'), ['hgw']);
  assert.deepEqual(extractLeadingTypeCodes('HGW - OVERGROWN GRASS'), ['hgw']);
  assert.deepEqual(
    extractLeadingTypeCodes('HGW\n*CALL BACK WITH UPDATES*'),
    ['hgw']
  );
});

test('extractLeadingTypeCodes: combos sort unique (HGW/TD, HGW, TD)', () => {
  assert.deepEqual(extractLeadingTypeCodes('HGW/TD'), ['hgw', 'td']);
  assert.deepEqual(extractLeadingTypeCodes('HGW, TD - trash'), ['hgw', 'td']);
  assert.deepEqual(extractLeadingTypeCodes('TD/HGW'), ['hgw', 'td']);
});

test('extractLeadingTypeCodes: O/S is one code (os), not o+s', () => {
  assert.deepEqual(extractLeadingTypeCodes('O/S - washer in driveway'), ['os']);
  assert.deepEqual(extractLeadingTypeCodes('O/S, TD - move out'), ['os', 'td']);
});

test('extractLeadingTypeCodes: denylist English pseudo-codes', () => {
  assert.equal(extractLeadingTypeCodes('OTHER - gas meter tree'), null);
  assert.equal(extractLeadingTypeCodes('STOP SIGN DOWN BETWEEN BANKS'), null);
  assert.equal(extractLeadingTypeCodes('Test case for workflow'), null);
});

test('extractLeadingTypeCodes: free-text English without codes → null', () => {
  assert.equal(extractLeadingTypeCodes('High Grass and Weeds'), null);
  assert.equal(extractLeadingTypeCodes('fence permit only'), null);
  assert.equal(extractLeadingTypeCodes('pool permit expired'), null);
});

test('stableTypeKey: HGW note variants share key; combo distinct', () => {
  const a = stableTypeKey('HGW');
  const b = stableTypeKey('HGW - OVERGROWN GRASS');
  const c = stableTypeKey('HGW\n*CALL BACK*');
  const combo = stableTypeKey('HGW/TD - front yard');
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(a, 'hgw');
  assert.equal(combo, 'hgw+td');
  assert.notEqual(a, combo);
});

test('stableTypeKey: clean English High Grass still normalizes (no false code)', () => {
  const k = stableTypeKey('High Grass and Weeds');
  assert.equal(k, violationTypeKey('High Grass and Weeds'));
  assert.notEqual(k, 'hgw');
});

test('stableDescriptionKey: empty-type HGW tails stack on hgw', () => {
  assert.equal(stableDescriptionKey('HGW - SIDEWALK'), 'hgw');
  assert.equal(stableDescriptionKey('HGW X2'), 'hgw');
  assert.equal(stableDescriptionKey('fence permit only'), 'fence permit only');
});
