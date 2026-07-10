const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  rowsToCsv,
  rowsToXlsxBuffer,
  parseResponseReceivedAt
} = require('../lib/bridge-export');

const sampleRow = {
  streetAddress: '123 Main St',
  city: 'Marana',
  state: 'Arizona',
  zip: '85704',
  violationIssueType: 'Overgrown weeds',
  violationDate: '2026-04-02',
  descriptionNotes: 'Front yard',
  distressedSignalTag: 'Strong Distressed Signal',
  matchedIndicators: 'overgrown',
  confidenceLevel: 'high',
  sourceFile: 'violations.csv',
  uploadType: 'code_violation',
  processedAt: '2026-07-06T12:00:00.000Z'
};

test('rowsToCsv includes headers and escaped values', () => {
  const csv = rowsToCsv([sampleRow]);
  assert.match(csv, /Street Address/);
  assert.match(csv, /123 Main St/);
  assert.match(csv, /Strong Distressed Signal/);
});

test('rowsToXlsxBuffer returns non-empty buffer', () => {
  const buffer = rowsToXlsxBuffer([sampleRow]);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
});

test('parseResponseReceivedAt accepts datetime-local style values', () => {
  const iso = parseResponseReceivedAt('2026-07-04T09:42');
  assert.match(iso, /^2026-07-04T/);
});

test('parseResponseReceivedAt accepts date-only YYYY-MM-DD', () => {
  const iso = parseResponseReceivedAt('2026-07-04');
  assert.match(iso, /^2026-07-0[34]T/); // noon local may shift UTC day near TZ edges
  const d = new Date(iso);
  assert.equal(Number.isNaN(d.getTime()), false);
});

test('parseResponseReceivedAt rejects empty values', () => {
  assert.throws(() => parseResponseReceivedAt(''), /required/i);
});

// SHAPE-02: array indicators → single CSV cell joined with '; '
test('rowsToCsv joins array matchedIndicators with semicolon space', () => {
  const arrayRow = {
    ...sampleRow,
    matchedIndicators: [
      'Tall/overgrown/high grass or weeds',
      'Accumulation of trash or debris'
    ]
  };
  const csv = rowsToCsv([arrayRow]);
  assert.match(csv, /Tall\/overgrown\/high grass or weeds/);
  assert.match(csv, /Accumulation of trash or debris/);
  assert.ok(
    csv.includes('Tall/overgrown/high grass or weeds; Accumulation of trash or debris'),
    'CSV must join array indicators with "; " (not Array.toString commas alone)'
  );
});

// LBL-02: export always uses full row.violationIssueType — never shortLabel / …
test('LBL-02: rowsToCsv emits full long violationIssueType (not shortLabel or ellipsis)', () => {
  const longType =
    'High Grass and Weeds — Sec. 12-34 of the municipal code regarding vegetation height limits on residential parcels and enforcement procedures';
  assert.ok(longType.length > 64, 'fixture must be longer than short-label max');
  const longRow = {
    ...sampleRow,
    violationIssueType: longType
    // intentionally no shortLabel on the row
  };
  const csv = rowsToCsv([longRow]);
  assert.ok(
    csv.includes(longType),
    'LBL-02: export CSV must contain the full Violation/Issue Type from the row'
  );
  assert.ok(
    !csv.includes('…'),
    'LBL-02: export must not substitute shortLabel ellipsis for full type'
  );
});
