const XLSX = require('xlsx');
const path = require('path');
const { parseDelimitedText } = require('./text');

function extension(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function isSpreadsheetFile(filename) {
  return /\.(xlsx|xls|xlsm|csv|tsv)$/i.test(String(filename || ''));
}

function parseSpreadsheet(buffer, filename) {
  const ext = extension(filename);
  if (!isSpreadsheetFile(filename)) {
    throw new Error('Not a spreadsheet file');
  }

  if (ext === '.csv' || ext === '.tsv') {
    const parsed = parseDelimitedText(buffer.toString('utf8'), ext === '.tsv' ? 'tsv' : 'csv');
    if (!parsed.rows.length) {
      throw new Error('Spreadsheet is empty');
    }
    return parsed;
  }

  const readOptions = { type: 'buffer', cellDates: true };

  const workbook = XLSX.read(buffer, readOptions);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet contains no sheets');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
  if (!rows.length) {
    throw new Error('Spreadsheet is empty');
  }

  const headers = Object.keys(rows[0]).filter((key) => String(key).trim());
  if (!headers.length) {
    throw new Error('Spreadsheet has no usable headers');
  }

  return {
    parser: ext === '.csv' || ext === '.tsv' ? 'csv' : 'spreadsheet',
    sheetName,
    headers,
    rows
  };
}

module.exports = {
  isSpreadsheetFile,
  parseSpreadsheet
};