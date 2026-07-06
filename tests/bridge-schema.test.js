const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectColumnMap,
  convertRows,
  toAnalyzerSheetRows,
  isSpreadsheetFile
} = require('../lib/bridge-schema');

test('detects common FOIA list column names', () => {
  const headers = ['Owner First', 'Owner Last', 'Phone', 'Email', 'Property Address', 'City', 'ST', 'ZIP'];
  const map = detectColumnMap(headers);
  assert.ok(map.firstName);
  assert.ok(map.street);
  assert.ok(map.postal);
});

test('converts rows to Property Analyzer import shape', () => {
  const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Street Address', 'City', 'State', 'Postal Code'];
  const map = detectColumnMap(headers);
  const converted = convertRows([
    {
      'First Name': 'Jane',
      'Last Name': 'Doe',
      Phone: '555-0100',
      Email: 'jane@example.com',
      'Street Address': '123 Main St',
      City: 'Phoenix',
      State: 'AZ',
      'Postal Code': '85001'
    }
  ], map);
  const sheet = toAnalyzerSheetRows(converted);
  assert.equal(sheet[0]['First Name'], 'Jane');
  assert.equal(sheet[0]['Street Address'], '123 Main St');
  assert.equal(sheet[0]['Postal Code'], '85001');
});

test('rejects spreadsheets missing required columns', () => {
  const map = detectColumnMap(['Address', 'City']);
  assert.throws(() => convertRows([{ Address: '1 Main', City: 'X' }], map), /Missing columns/);
});

test('identifies spreadsheet file extensions', () => {
  assert.equal(isSpreadsheetFile('violations.xlsx'), true);
  assert.equal(isSpreadsheetFile('scan.pdf'), false);
});