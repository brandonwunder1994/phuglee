/**
 * LBL-01 pure display short-label matrix.
 *
 * Wave 0 RED (Plan 53-01) → green pure helper (Plan 53-02).
 * Groups wire is Plan 03; Train UI is Plan 04.
 *
 * Display-only: never used for keys, export, or brain rule labels.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Module does not exist until Plan 02 — MODULE_NOT_FOUND is intentional RED.
const {
  shortLabelForDisplay,
  DEFAULT_MAX
} = require('../lib/bridge-short-label');

// ---------------------------------------------------------------------------
// DEFAULT_MAX contract (48–64 band; research lock: 56)
// ---------------------------------------------------------------------------

test('LBL-01: DEFAULT_MAX exported in 48–64 inclusive', () => {
  assert.equal(typeof DEFAULT_MAX, 'number', 'DEFAULT_MAX must be a number');
  assert.ok(
    DEFAULT_MAX >= 48 && DEFAULT_MAX <= 64,
    `DEFAULT_MAX must be in 48–64 band (got ${DEFAULT_MAX})`
  );
  // Research discretion lock
  assert.equal(DEFAULT_MAX, 56, 'v1.8 discretion lock: DEFAULT_MAX === 56');
});

// ---------------------------------------------------------------------------
// Short passthrough
// ---------------------------------------------------------------------------

test('LBL-01: short label passes through unchanged (no ellipsis)', () => {
  const input = 'High Grass';
  const out = shortLabelForDisplay(input);
  assert.equal(out, 'High Grass');
  assert.ok(!out.includes('…'), 'must not append ellipsis when under max');
  assert.ok(!out.includes('...'), 'must not use three-dot ellipsis');
  assert.equal(out.length, input.length);
});

test('LBL-01: label at exactly DEFAULT_MAX passes through', () => {
  const input = 'A'.repeat(DEFAULT_MAX);
  const out = shortLabelForDisplay(input);
  assert.equal(out, input);
  assert.ok(!out.endsWith('…'));
});

// ---------------------------------------------------------------------------
// Em-dash / en-dash / spaced hyphen preferred breaks
// ---------------------------------------------------------------------------

test('LBL-01: em-dash cut prefers left clause without ellipsis when left fits', () => {
  const input =
    'High Grass and Weeds — Sec. 12-34 of the municipal code regarding vegetation height';
  const out = shortLabelForDisplay(input);
  assert.ok(
    out.startsWith('High Grass and Weeds'),
    `expected left of em-dash, got: ${out}`
  );
  assert.ok(out.length <= DEFAULT_MAX, `length ${out.length} > DEFAULT_MAX ${DEFAULT_MAX}`);
  assert.ok(
    !out.includes('…'),
    'natural dash-break that fits must not force ellipsis'
  );
  assert.ok(
    !out.includes('Sec. 12-34') || out === 'High Grass and Weeds',
    'should drop ordinance wall after em-dash when left part is meaningful'
  );
  // Prefer exact left clause when it is meaningful (≥12) and ≤ max
  assert.equal(out, 'High Grass and Weeds');
});

test('LBL-01: en-dash break preferred when left part meaningful', () => {
  const input =
    'Trash and Debris – City Code Chapter 8 Article IV regarding accumulation of refuse';
  const out = shortLabelForDisplay(input);
  assert.equal(out, 'Trash and Debris');
  assert.ok(out.length <= DEFAULT_MAX);
  assert.ok(!out.includes('…'));
});

test('LBL-01: spaced hyphen " - " break preferred when left part meaningful', () => {
  const input =
    'Vacant Structure - Ordinance 2020-15 requiring registration of abandoned buildings downtown';
  const out = shortLabelForDisplay(input);
  assert.equal(out, 'Vacant Structure');
  assert.ok(out.length <= DEFAULT_MAX);
  assert.ok(!out.includes('…'));
});

// ---------------------------------------------------------------------------
// First clause (period / semicolon / pipe)
// ---------------------------------------------------------------------------

test('LBL-01: first clause before ". " when left ≥12 and ≤ maxLen', () => {
  const input =
    'Boarded vacant residential structure. Additional notes about ownership and lien status that go on for a very long time without a dash separator.';
  const out = shortLabelForDisplay(input);
  assert.equal(out, 'Boarded vacant residential structure');
  assert.ok(out.length <= DEFAULT_MAX);
  assert.ok(!out.includes('…'));
});

test('LBL-01: first clause before semicolon when meaningful', () => {
  const input =
    'Illegal dumping on vacant lot; further inspection required with photographic evidence and neighbor statements collected over multiple visits.';
  const out = shortLabelForDisplay(input);
  assert.equal(out, 'Illegal dumping on vacant lot');
  assert.ok(!out.includes('…'));
});

// ---------------------------------------------------------------------------
// Hard max + unicode ellipsis
// ---------------------------------------------------------------------------

test('LBL-01: hard max without natural break ends with unicode …', () => {
  // Long continuous text — no em-dash, no early clause break that fits
  const input =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 repeated wall of text without any natural dash or clause break markers at all so we must hard truncate';
  const out = shortLabelForDisplay(input);
  assert.ok(out.length <= DEFAULT_MAX, `length ${out.length} must be ≤ ${DEFAULT_MAX}`);
  assert.ok(out.endsWith('…'), 'hard-slice path must append unicode ellipsis … (not ...)');
  assert.ok(!out.endsWith('...'), 'must not use three ASCII dots');
  assert.notEqual(out, input);
});

// ---------------------------------------------------------------------------
// Empty / null / whitespace
// ---------------------------------------------------------------------------

test('LBL-01: empty / null / whitespace → empty string', () => {
  assert.equal(shortLabelForDisplay(''), '');
  assert.equal(shortLabelForDisplay(null), '');
  assert.equal(shortLabelForDisplay(undefined), '');
  assert.equal(shortLabelForDisplay('   '), '');
  assert.equal(shortLabelForDisplay('\t\n'), '');
});

// ---------------------------------------------------------------------------
// Timestamps stripped before shorten
// ---------------------------------------------------------------------------

test('LBL-01: timestamps stripped before shorten (clean short display)', () => {
  // Embedded US date/time should not appear in short label; category words remain
  const input =
    'High Grass and Weeds - 01/15/2024 10:30 — Sec. 12-34 of the municipal code regarding vegetation height limits on residential parcels';
  const out = shortLabelForDisplay(input);
  assert.ok(
    !/01\/15\/2024/.test(out),
    `timestamp date must be stripped from display short, got: ${out}`
  );
  assert.ok(!/10:30/.test(out), `timestamp time must be stripped, got: ${out}`);
  assert.ok(
    /high grass/i.test(out) || /weeds/i.test(out),
    `category words must remain, got: ${out}`
  );
  assert.ok(out.length <= DEFAULT_MAX);
  assert.ok(out.length > 0, 'non-empty input must not yield empty after strip+shorten');
});

// ---------------------------------------------------------------------------
// maxLen option
// ---------------------------------------------------------------------------

test('LBL-01: maxLen option overrides default', () => {
  const input = 'High Grass and Weeds are present throughout the entire rear yard area';
  const out = shortLabelForDisplay(input, { maxLen: 20 });
  assert.ok(out.length <= 20, `length ${out.length} must be ≤ 20`);
  // Under hard max path or dash/clause — must be shorter than full
  assert.ok(out.length < input.length);
});

// ---------------------------------------------------------------------------
// Non-empty input never returns empty
// ---------------------------------------------------------------------------

test('LBL-01: non-empty input never returns empty string', () => {
  const samples = [
    'X',
    'AB',
    'Short',
    'High Grass and Weeds',
    'A'.repeat(200),
    'Word '.repeat(40).trim()
  ];
  for (const s of samples) {
    const out = shortLabelForDisplay(s);
    assert.ok(
      typeof out === 'string' && out.length > 0,
      `non-empty input ${JSON.stringify(s.slice(0, 40))} must not return empty`
    );
  }
});
