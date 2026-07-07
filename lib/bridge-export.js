const XLSX = require('xlsx');
const { EXPORT_COLUMN_ORDER, toExportRow } = require('./bridge-intake-schema');

function rowsToCsv(rows) {
  const exported = rows.map(toExportRow);
  const headers = EXPORT_COLUMN_ORDER;
  const escape = (value) => {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const lines = [
    headers.map(escape).join(','),
    ...exported.map((row) => headers.map((header) => escape(row[header])).join(','))
  ];
  return `${lines.join('\n')}\n`;
}

function rowsToXlsxBuffer(rows) {
  const exported = rows.map(toExportRow);
  const sheet = XLSX.utils.json_to_sheet(exported, { header: EXPORT_COLUMN_ORDER });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Bridge Export');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function parseResponseReceivedAt(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('Response received date/time is required');
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new Error('Invalid response received date/time');
  }
  return new Date(ms).toISOString();
}

module.exports = {
  rowsToCsv,
  rowsToXlsxBuffer,
  parseResponseReceivedAt
};