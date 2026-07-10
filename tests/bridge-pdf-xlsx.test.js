const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  aoaToXlsxBuffer,
  parseAoaAsSpreadsheet,
  collectTablesFromResult,
  textToAoa,
  normalizeTable
} = require('../lib/bridge-engine/parsers/pdf');
const { parseSpreadsheet } = require('../lib/bridge-engine/parsers/spreadsheet');

const FIXTURES = path.join(__dirname, 'fixtures', 'bridge');

test('aoaToXlsxBuffer produces a real workbook parseable as spreadsheet', () => {
  const aoa = [
    ['Property Address', 'Violation Type'],
    ['123 Main St', 'Overgrown weeds'],
    ['456 Oak Ave', 'Junk vehicles']
  ];
  const buf = aoaToXlsxBuffer(aoa);
  assert.ok(Buffer.isBuffer(buf));
  const parsed = parseSpreadsheet(buf, 'from-pdf.xlsx');
  assert.equal(parsed.parser, 'spreadsheet');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]['Property Address'], '123 Main St');
});

test('parseAoaAsSpreadsheet tags pdf-xlsx parser', () => {
  const parsed = parseAoaAsSpreadsheet(
    [
      ['Street', 'Type'],
      ['10 Elm St', 'weeds']
    ],
    { parseMode: 'table-to-xlsx', pageCount: 2 }
  );
  assert.equal(parsed.parser, 'pdf-xlsx');
  assert.equal(parsed.parseMode, 'table-to-xlsx');
  assert.equal(parsed.pageCount, 2);
  assert.equal(parsed.rows[0].Street, '10 Elm St');
});

test('collectTablesFromResult picks largest multi-column grid', () => {
  const result = {
    total: 2,
    mergedTables: [],
    pages: [
      {
        num: 1,
        tables: [
          [['Tiny'], ['x']],
          [
            ['Address', 'Issue'],
            ['123 Main St', 'weeds'],
            ['456 Oak Ave', 'trash']
          ]
        ]
      }
    ]
  };
  const aoa = collectTablesFromResult(result);
  assert.ok(aoa);
  assert.equal(aoa[0][0], 'Address');
  assert.equal(aoa.length, 3);
});

test('textToAoa preserves original headers from plain-text PDF fixture', () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'violation-list-plain.txt'), 'utf8');
  const aoa = textToAoa(text);
  assert.ok(aoa);
  assert.ok(/address/i.test(aoa[0].join(' ')));
  assert.ok(aoa.some((row) => row.some((c) => /123 Main/i.test(c))));
  assert.ok(aoa.length >= 4); // header + 3 data rows
});

test('normalizeTable dedupes blank header labels', () => {
  const out = normalizeTable([
    ['Address', '', 'Type'],
    ['1 A St', 'x', 'weeds']
  ]);
  assert.ok(out);
  assert.equal(out[0][0], 'Address');
  assert.ok(out[0][1]); // Column N placeholder
  assert.equal(out[0][2], 'Type');
});
