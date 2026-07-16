'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  extractComplaintFromText,
  toFilterRows,
  rowsToCsv,
  parseParties,
  findServiceAddress
} = require('../lib/pre-lien-extract');

const SAMPLE = `
IN THE COURT OF COMMON PLEAS
LICKING COUNTY, OHIO
Case No.: 2026CV001234

CAPITAL ONE, N.A.
          Plaintiff,
v.
JOHN Q PUBLIC
          Defendant.

COMPLAINT

1. Defendant JOHN Q PUBLIC resides at 123 Main Street, Newark, OH 43055
   and may be served at that address.

2. Plaintiff claims the sum of $4,812.33 due on a credit card account.

Filed: 07/10/2026
`;

test('parses plaintiff v defendant', () => {
  const parties = parseParties(SAMPLE);
  assert.match(parties.plaintiff, /CAPITAL ONE/i);
  assert.match(parties.defendant, /JOHN Q PUBLIC/i);
});

test('finds service address near reside/served', () => {
  const addr = findServiceAddress(SAMPLE);
  assert.match(addr.streetAddress, /123 Main Street/i);
  assert.equal(addr.city.toLowerCase(), 'newark');
  assert.equal(addr.state, 'OH');
  assert.equal(addr.zip, '43055');
});

test('extractComplaintFromText builds Filter-ready fields', () => {
  const row = extractComplaintFromText(SAMPLE, { sourceFile: 'demo.pdf' });
  assert.match(row.streetAddress, /123 Main Street/i);
  assert.match(row.defendantName, /JOHN Q PUBLIC/i);
  assert.match(row.plaintiff, /CAPITAL ONE/i);
  assert.ok(row.caseNumber);
  const filterRows = toFilterRows([row]);
  assert.equal(filterRows[0].uploadType, 'pre_lien');
  assert.match(filterRows[0].descriptionNotes, /Case/i);
  const csv = rowsToCsv([row]);
  assert.match(csv, /Street Address/);
  assert.match(csv, /123 Main Street/i);
  assert.match(csv, /Newark/i);
});

test('pre-liens page wires extract API client', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'pre-liens.html'), 'utf8');
  assert.ok(html.includes('Pre-liens'));
  assert.ok(html.includes('pre-liens-app.js'));
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pre-liens-app.js'), 'utf8');
  assert.ok(app.includes('/api/pre-lien/extract'));
  assert.ok(app.includes('/api/pre-lien/extract-text'));
});
