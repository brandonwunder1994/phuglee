/**
 * Generic textToAoa picks the stronger header row when multiple hints exist.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { textToAoa } = require('../lib/bridge-engine/parsers/pdf');

test('textToAoa prefers header with type + address data over title banner', () => {
  const text = [
    'CITY OF EXAMPLE CODE ENFORCEMENT REPORT',
    'Generated 01/15/2024',
    '',
    'Case Type    Location              Status',
    'High Grass   123 Main Street       Open',
    'Trash        456 Oak Avenue        Closed',
    'Weeds        789 Pine Road         Open'
  ].join('\n');

  const aoa = textToAoa(text);
  assert.ok(aoa, 'expected AOA rebuild');
  assert.ok(aoa.length >= 4, `expected header + rows, got ${aoa.length}`);
  const header = aoa[0].map((h) => String(h).toLowerCase()).join(' ');
  assert.ok(
    /case\s*type|type|location|status/.test(header),
    `header should look tabular, got: ${aoa[0].join(' | ')}`
  );
  assert.ok(
    aoa.slice(1).some((row) => row.some((c) => /123 Main/i.test(c))),
    'data rows should include address'
  );
});
