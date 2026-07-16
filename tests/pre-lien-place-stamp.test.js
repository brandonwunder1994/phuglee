'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { stampPlaybookPlace, rowsToSkipCsv } = require('../lib/pre-lien-extract');

test('stampPlaybookPlace fills missing state and county only', () => {
  const { rows, stamped } = stampPlaybookPlace(
    [
      { streetAddress: '123 Main St', city: '', state: '', zip: '43055' },
      { streetAddress: '9 Oak St', city: 'Newark', state: 'OH', zip: '43055' }
    ],
    { county: 'Licking', state: 'OH' }
  );
  assert.equal(stamped, 2); // row0 state+county, row1 county only
  assert.equal(rows[0].state, 'OH');
  assert.equal(rows[0].county, 'Licking');
  assert.equal(rows[0].city, ''); // do not invent city from county
  assert.equal(rows[1].city, 'Newark');
  assert.equal(rows[1].state, 'OH');
  assert.equal(rows[1].county, 'Licking');
});

test('stampPlaybookPlace can fill default city when provided', () => {
  const { rows, stamped } = stampPlaybookPlace(
    [{ streetAddress: '1 A St', city: '', state: '' }],
    { county: 'Tarrant', state: 'TX', city: 'Fort Worth' }
  );
  assert.equal(stamped, 1);
  assert.equal(rows[0].city, 'Fort Worth');
  assert.equal(rows[0].state, 'TX');
});

test('rowsToSkipCsv includes County when present', () => {
  const csv = rowsToSkipCsv([
    {
      streetAddress: '1 A',
      city: 'Newark',
      state: 'OH',
      county: 'Licking',
      ownerMatch: 'matched',
      ownerName: 'Ann'
    }
  ]);
  assert.match(csv, /County/);
  assert.match(csv, /Licking/);
});

test('pre-liens app stamps playbook place', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pre-liens-app.js'), 'utf8');
  assert.ok(app.includes('stampRowsFromPlaybook') || app.includes('playbookPlaceHints'));
});
