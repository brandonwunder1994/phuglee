'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dedupePreLienRows } = require('../lib/pre-lien-extract');

test('dedupePreLienRows collapses same address variants', () => {
  const { rows, removed } = dedupePreLienRows([
    {
      streetAddress: '123 Main Street',
      city: 'Newark',
      state: 'OH',
      zip: '43055',
      defendantName: 'John Public',
      ownerMatch: 'unchecked',
      sourceFile: 'a.pdf'
    },
    {
      streetAddress: '123 Main St',
      city: 'Newark',
      state: 'Ohio',
      zip: '43055',
      defendantName: 'John Q Public',
      ownerMatch: 'matched',
      ownerMatchScore: 95,
      ownerName: 'John Q Public',
      sourceFile: 'b.pdf'
    }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(removed, 1);
  assert.equal(rows[0].ownerMatch, 'matched');
  assert.match(String(rows[0].sourceFile || rows[0].descriptionNotes || ''), /a\.pdf|b\.pdf/);
});

test('dedupePreLienRows keeps different addresses', () => {
  const { rows, removed } = dedupePreLienRows([
    { streetAddress: '1 Oak St', city: 'Newark', state: 'OH', zip: '43055', ownerMatch: 'matched' },
    { streetAddress: '2 Oak St', city: 'Newark', state: 'OH', zip: '43055', ownerMatch: 'matched' }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(removed, 0);
});

test('dedupePreLienRows keeps rows without address separately', () => {
  const { rows } = dedupePreLienRows([
    { streetAddress: '', defendantName: 'A', ownerMatch: 'unchecked' },
    { streetAddress: '', defendantName: 'B', ownerMatch: 'unchecked' }
  ]);
  assert.equal(rows.length, 2);
});
