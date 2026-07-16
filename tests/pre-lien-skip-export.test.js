'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  filterOwnerMatchedRows,
  rowsToSkipCsv,
  toFilterRows
} = require('../lib/pre-lien-extract');

test('filterOwnerMatchedRows keeps matched and optional possible', () => {
  const rows = [
    { streetAddress: '1 A St', ownerMatch: 'matched', ownerName: 'Ann' },
    { streetAddress: '2 B St', ownerMatch: 'possible', ownerName: 'Bob' },
    { streetAddress: '3 C St', ownerMatch: 'no_match', ownerName: 'Cat' },
    { streetAddress: '4 D St', ownerMatch: 'unchecked' }
  ];
  const matchedOnly = filterOwnerMatchedRows(rows, { includePossible: false });
  assert.equal(matchedOnly.length, 1);
  assert.equal(matchedOnly[0].streetAddress, '1 A St');

  const withPossible = filterOwnerMatchedRows(rows, { includePossible: true });
  assert.equal(withPossible.length, 2);
});

test('rowsToSkipCsv exports skip-tool columns for matched owners', () => {
  const csv = rowsToSkipCsv([
    {
      streetAddress: '123 Main St',
      city: 'Newark',
      state: 'OH',
      zip: '43055',
      defendantName: 'John Public',
      ownerName: 'John Q Public',
      mailingAddress: 'PO Box 9',
      caseNumber: '2026CV1',
      plaintiff: 'Capital One',
      amountClaimed: '1000',
      ownerMatch: 'matched',
      ownerMatchScore: 95
    },
    {
      streetAddress: '9 Skip Me',
      ownerMatch: 'no_match',
      ownerName: 'Other'
    }
  ]);
  assert.match(csv, /Owner Name/);
  assert.match(csv, /Mailing Address/);
  assert.match(csv, /John Q Public/);
  assert.match(csv, /123 Main St/);
  assert.doesNotMatch(csv, /9 Skip Me/);
  assert.doesNotMatch(csv, /Owner Match Reason/);
});

test('toFilterRows still includes all rows for full export', () => {
  const rows = toFilterRows([
    { streetAddress: '1', ownerMatch: 'no_match' },
    { streetAddress: '2', ownerMatch: 'matched' }
  ]);
  assert.equal(rows.length, 2);
});

test('pre-liens UI has matched skip download', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'pre-liens.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pre-liens-app.js'), 'utf8');
  assert.ok(html.includes('pl-download-skip') || html.includes('Download matched'));
  assert.ok(app.includes('downloadSkipCsv') || app.includes('matched for skip') || app.includes('buildSkipCsv'));
});
