const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const {
  parsePasteTable,
  pasteTextToExcel
} = require('../lib/paste-to-excel');

test('single column paste', () => {
  const p = parsePasteTable('Name\nAlice\nBob');
  assert.equal(p.colCount, 1);
  assert.equal(p.rowCount, 2);
});

test('pipe delimiter', () => {
  const p = parsePasteTable('A|B|C\n1|2|3');
  assert.equal(p.delimiter, '|');
  assert.equal(p.rowCount, 1);
});

test('semicolon delimiter', () => {
  const p = parsePasteTable('A;B\nx;y');
  assert.equal(p.delimiter, ';');
});

test('header-only paste still builds xlsx', async () => {
  const p = parsePasteTable('Col1\tCol2\tCol3');
  assert.equal(p.rowCount, 0);
  assert.equal(p.colCount, 3);
  const r = await pasteTextToExcel('Col1\tCol2\tCol3');
  assert.ok(r.buffer.length > 200);
  const wb = XLSX.read(r.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  assert.deepEqual(rows[0], ['Col1', 'Col2', 'Col3']);
});

test('xml special characters survive round-trip', async () => {
  const text = 'A,B\n"<tag>&amp;","a""b"';
  const r = await pasteTextToExcel(text);
  const wb = XLSX.read(r.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  assert.equal(rows.length, 2);
  assert.match(String(rows[1][0]), /tag/);
  assert.match(String(rows[1][0]), /&/);
});

test('CRLF line endings', () => {
  const p = parsePasteTable('A,B\r\n1,2\r\n3,4\r\n');
  assert.equal(p.rowCount, 2);
});

test('ragged rows pad to max width', () => {
  const p = parsePasteTable('A,B,C\n1,2\n3,4,5,6');
  assert.equal(p.colCount, 4);
  assert.equal(p.matrix[1].length, 4);
  assert.equal(p.matrix[0][3], 'Column 4');
});

test('BOM is stripped', () => {
  const p = parsePasteTable('\uFEFFName,City\nAlice,Austin');
  assert.equal(p.headers[0], 'Name');
});

test('multiline quoted CSV cell', () => {
  const p = parsePasteTable('A,B\n"line1\nline2",ok');
  assert.equal(p.rowCount, 1);
  assert.match(String(p.matrix[1][0]), /line1/);
});

test('unicode content', async () => {
  const r = await pasteTextToExcel('Street,Note\n123 Café St,Weeds — tall');
  assert.equal(r.rowCount, 1);
  const wb = XLSX.read(r.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  assert.match(String(rows[1][0]), /Café/);
});

test('empty and whitespace throw', () => {
  assert.throws(() => parsePasteTable(''), /empty/i);
  assert.throws(() => parsePasteTable('   \n\n'), /empty/i);
});

test('frozen header + autofilter present in OOXML', async () => {
  const r = await pasteTextToExcel('X\tY\n1\t2');
  const zip = await JSZip.loadAsync(r.buffer);
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheetXml, /autoFilter/);
  assert.match(sheetXml, /ySplit="1"/);
  assert.match(sheetXml, /state="frozen"/);
});
