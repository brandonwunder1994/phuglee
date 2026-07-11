const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const {
  parsePasteTable,
  pasteTextToExcel,
  matrixToStyledXlsxBuffer,
  detectPasteDelimiter,
  colLetter
} = require('../lib/paste-to-excel');

test('detects tab delimiter', () => {
  assert.equal(detectPasteDelimiter('A\tB\tC'), '\t');
});

test('detects comma delimiter', () => {
  assert.equal(detectPasteDelimiter('A,B,C'), ',');
});

test('detects multi-space columns via parse', () => {
  const parsed = parsePasteTable('File#    Address    Status\nCE-1    123 Main    Open');
  assert.equal(parsed.delimiter, 'multi-space');
  assert.deepEqual(parsed.headers, ['File#', 'Address', 'Status']);
  assert.equal(parsed.rowCount, 1);
  assert.equal(parsed.matrix[1][1], '123 Main');
});

test('parses tab-separated paste', () => {
  const text = ['File#\tAddress\tStatus', 'CE-100\t123 Main St\tOpen', 'CE-101\t456 Oak Ave\tClosed'].join('\n');
  const parsed = parsePasteTable(text);
  assert.equal(parsed.delimiter, '\t');
  assert.equal(parsed.colCount, 3);
  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.matrix[1][0], 'CE-100');
  assert.equal(parsed.matrix[2][1], '456 Oak Ave');
});

test('parses CSV with quoted fields', () => {
  const text = [
    'Case,Address,Notes',
    '1,"123 Main, Unit B","Tall weeds"',
    '2,456 Oak,"OK"'
  ].join('\n');
  const parsed = parsePasteTable(text);
  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.matrix[1][1], '123 Main, Unit B');
});

test('fills blank header cells', () => {
  const text = 'A\t\tC\nv1\tv2\tv3';
  const parsed = parsePasteTable(text);
  assert.equal(parsed.headers[1], 'Column 2');
});

test('rejects empty paste', () => {
  assert.throws(() => parsePasteTable('   \n  '), /empty/i);
});

test('colLetter maps correctly', () => {
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(25), 'Z');
  assert.equal(colLetter(26), 'AA');
});

test('builds xlsx with AutoFilter and Arial styles', async () => {
  const matrix = [
    ['File#', 'Address', 'Status'],
    ['CE-1', '123 Main', 'Open'],
    ['CE-2', '456 Oak', 'Closed']
  ];
  const buffer = await matrixToStyledXlsxBuffer(matrix);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 500);

  // Readable by SheetJS
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.deepEqual(rows[0], ['File#', 'Address', 'Status']);
  assert.equal(rows.length, 3);

  // OOXML: autoFilter + Arial in styles
  const zip = await JSZip.loadAsync(buffer);
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheetXml, /<autoFilter\s+ref="A1:C3"/);
  assert.match(sheetXml, /<cols>/);
  const stylesXml = await zip.file('xl/styles.xml').async('string');
  assert.match(stylesXml, /Arial/);
  assert.match(stylesXml, /<b\s*\/>|<b>/);
});

test('pasteTextToExcel end-to-end', async () => {
  const text = 'Name,City\nAlice,Austin\nBob,Boston\n';
  const result = await pasteTextToExcel(text);
  assert.equal(result.rowCount, 2);
  assert.equal(result.colCount, 2);
  assert.match(result.filename, /\.xlsx$/i);
  assert.ok(result.buffer.length > 400);

  const wb = XLSX.read(result.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  assert.deepEqual(rows[0], ['Name', 'City']);
  assert.deepEqual(rows[1], ['Alice', 'Austin']);
});
