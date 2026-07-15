const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  rowsToCsv,
  rowsToXlsxBuffer,
  rowsToFullCsv,
  rowsToFullXlsxBuffer,
  parseResponseReceivedAt,
  ADDRESS_EXPORT_HEADERS,
  FULL_BULK_EXPORT_HEADERS,
  toAddressExportRow,
  toFullExportRow
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

test('ADDRESS_EXPORT_HEADERS are the four enrichment columns', () => {
  assert.deepEqual([...ADDRESS_EXPORT_HEADERS], [
    'Street Address',
    'City',
    'State',
    'Postal Code'
  ]);
});

test('toAddressExportRow maps zip → Postal Code and drops other fields', () => {
  const out = toAddressExportRow(sampleRow);
  assert.deepEqual(out, {
    'Street Address': '123 Main St',
    City: 'Marana',
    State: 'Arizona',
    'Postal Code': '85704'
  });
  assert.equal(Object.keys(out).length, 4);
});

test('rowsToCsv includes only Street Address, City, State, Postal Code', () => {
  const csv = rowsToCsv([sampleRow]);
  const header = csv.split('\n')[0];
  assert.equal(header, 'Street Address,City,State,Postal Code');
  assert.match(csv, /123 Main St/);
  assert.match(csv, /Marana/);
  assert.match(csv, /85704/);
  assert.doesNotMatch(csv, /Strong Distressed Signal/);
  assert.doesNotMatch(csv, /Overgrown weeds/);
  assert.doesNotMatch(csv, /List Name/);
  assert.doesNotMatch(csv, /Violation/);
});

test('rowsToCsv falls back to list city/state when row lacks them', () => {
  const csv = rowsToCsv([
    {
      streetAddress: '9 Oak',
      zip: '75001',
      savedListCity: 'Commerce',
      savedListState: 'TX'
    }
  ]);
  assert.match(csv, /9 Oak/);
  assert.match(csv, /Commerce/);
  assert.match(csv, /TX/);
  assert.match(csv, /75001/);
});

test('rowsToXlsxBuffer returns non-empty buffer', () => {
  const buffer = rowsToXlsxBuffer([sampleRow]);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
});

test('FULL_BULK_EXPORT_HEADERS include list provenance + normalized columns', () => {
  assert.ok(FULL_BULK_EXPORT_HEADERS.includes('List Name'));
  assert.ok(FULL_BULK_EXPORT_HEADERS.includes('Street Address'));
  assert.ok(FULL_BULK_EXPORT_HEADERS.includes('Distressed Signal Tag'));
  assert.ok(FULL_BULK_EXPORT_HEADERS.includes('Violation/Issue Type'));
  assert.ok(FULL_BULK_EXPORT_HEADERS.includes('Description/Notes'));
  assert.ok(!FULL_BULK_EXPORT_HEADERS.includes('Postal Code'));
});

test('toFullExportRow keeps tags and types intact', () => {
  const out = toFullExportRow({
    ...sampleRow,
    savedListName: 'Marana CV',
    savedListCity: 'Marana',
    savedListState: 'Arizona'
  });
  assert.equal(out['List Name'], 'Marana CV');
  assert.equal(out['Street Address'], '123 Main St');
  assert.equal(out['Distressed Signal Tag'], 'Strong Distressed Signal');
  assert.equal(out['Violation/Issue Type'], 'Overgrown weeds');
  assert.equal(out['Description/Notes'], 'Front yard');
  assert.equal(out.Zip, '85704');
});

test('rowsToFullCsv keeps raw Filter columns (not address-only)', () => {
  const csv = rowsToFullCsv([
    {
      ...sampleRow,
      savedListName: 'Marana CV',
      savedListCity: 'Marana',
      savedListState: 'Arizona'
    }
  ]);
  const header = csv.split('\n')[0];
  assert.match(header, /^List Name,List City,List State,Street Address/);
  assert.match(csv, /Strong Distressed Signal/);
  assert.match(csv, /Overgrown weeds/);
  assert.match(csv, /Front yard/);
  assert.match(csv, /Marana CV/);
  assert.doesNotMatch(header, /Postal Code/);
});

test('rowsToFullXlsxBuffer returns non-empty buffer', () => {
  const buffer = rowsToFullXlsxBuffer([sampleRow]);
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
