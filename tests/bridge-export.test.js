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

test('parseResponseReceivedAt rejects empty values', () => {
  assert.throws(() => parseResponseReceivedAt(''), /required/i);
});