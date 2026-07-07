const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  extractRowsFromText,
  scoreFromOcr,
  detectLineDelimiter
} = require('../lib/bridge-engine/parsers/row-extract');

const FIXTURES = path.join(__dirname, 'fixtures', 'bridge');

test('detects space-delimited table headers in plain text', () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'violation-list-plain.txt'), 'utf8');
  const extracted = extractRowsFromText(text, { parser: 'pdf' });
  assert.equal(extracted.parseMode, 'table');
  assert.equal(extracted.rows.length, 3);
  assert.equal(extracted.rows[0]['Street Address'], '123 Main St');
  assert.match(extracted.rows[2]['Violation/Issue Type'], /vehicle/i);
});

test('extracts address lines when no table header exists', () => {
  const text = [
    'Violation list',
    '999 Desert Rd - overgrown weeds',
    '101 Lake View Ct junk in yard'
  ].join('\n');
  const extracted = extractRowsFromText(text, { parser: 'pdf' });
  assert.equal(extracted.parseMode, 'address-lines');
  assert.ok(extracted.rows.length >= 2);
});

test('scoreFromOcr maps confidence bands', () => {
  assert.equal(scoreFromOcr(90).confidenceLevel, 'high');
  assert.equal(scoreFromOcr(70).confidenceLevel, 'medium');
  assert.equal(scoreFromOcr(40).needsReview, true);
});

test('detectLineDelimiter prefers tabs over spaces', () => {
  assert.equal(detectLineDelimiter('Address\tType\tDate'), '\t');
});