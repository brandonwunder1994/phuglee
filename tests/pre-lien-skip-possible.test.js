'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { rowsToSkipCsv, filterOwnerMatchedRows } = require('../lib/pre-lien-extract');

test('rowsToSkipCsv can include possible matches', () => {
  const rows = [
    { streetAddress: '1 A', ownerMatch: 'matched', ownerName: 'Ann' },
    { streetAddress: '2 B', ownerMatch: 'possible', ownerName: 'Bob' },
    { streetAddress: '3 C', ownerMatch: 'no_match', ownerName: 'Cat' }
  ];
  const matchedOnly = rowsToSkipCsv(rows, { includePossible: false });
  assert.match(matchedOnly, /1 A/);
  assert.doesNotMatch(matchedOnly, /2 B/);

  const withPossible = rowsToSkipCsv(rows, { includePossible: true });
  assert.match(withPossible, /1 A/);
  assert.match(withPossible, /2 B/);
  assert.doesNotMatch(withPossible, /3 C/);
  assert.equal(filterOwnerMatchedRows(rows, { includePossible: true }).length, 2);
});

test('pre-liens UI has include-possibles control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'pre-liens.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pre-liens-app.js'), 'utf8');
  assert.ok(html.includes('pl-include-possible') || html.includes('Include possibles'));
  assert.ok(app.includes('includePossible') || app.includes('pl-include-possible'));
});
