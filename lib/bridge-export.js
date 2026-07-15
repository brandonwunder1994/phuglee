const XLSX = require('xlsx');
const { EXPORT_COLUMN_ORDER, toExportRow } = require('./bridge-intake-schema');

/** Enrichment export only — skip-trace friendly. */
const ADDRESS_EXPORT_HEADERS = Object.freeze([
  'Street Address',
  'City',
  'State',
  'Postal Code'
]);

/** Bulk FULL export — list provenance + every normalized Filter column. */
const FULL_BULK_EXPORT_HEADERS = Object.freeze([
  'List Name',
  'List City',
  'List State',
  ...EXPORT_COLUMN_ORDER
]);

/**
 * Map a kept Filter row to the 4-column enrichment shape.
 * City/state fall back to list-level values when the row is missing them.
 */
function toAddressExportRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  return {
    'Street Address': String(r.streetAddress || r.address || '').trim(),
    City: String(r.city || r.savedListCity || '').trim(),
    State: String(r.state || r.savedListState || '').trim(),
    'Postal Code': String(r.zip || r.postalCode || r.postal || '').trim()
  };
}

/**
 * Map a kept Filter row to the full pre-enrichment export shape
 * (tags, types, notes, confidence, source — not address-only).
 */
function toFullExportRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  const exported = toExportRow(r);
  return {
    'List Name': String(r.savedListName || '').trim(),
    'List City': String(r.savedListCity || r.city || '').trim(),
    'List State': String(r.savedListState || r.state || '').trim(),
    ...exported
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Inventory / batch export CSV — Street Address, City, State, Postal Code only. */
function rowsToCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const headers = ADDRESS_EXPORT_HEADERS;
  const lines = [
    headers.join(','),
    ...list.map((row) => {
      const exported = toAddressExportRow(row);
      return headers.map((h) => escapeCsvCell(exported[h])).join(',');
    })
  ];
  return `${lines.join('\n')}\n`;
}

/** Inventory / batch export XLSX — same 4 columns only. */
function rowsToXlsxBuffer(rows, sheetName = 'Leads') {
  const list = Array.isArray(rows) ? rows : [];
  const headers = ADDRESS_EXPORT_HEADERS;
  const data = list.map(toAddressExportRow);
  const sheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  const safeName = String(sheetName || 'Leads').slice(0, 31) || 'Leads';
  XLSX.utils.book_append_sheet(workbook, sheet, safeName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/** Full raw inventory CSV — all normalized columns + list provenance. */
function rowsToFullCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const headers = FULL_BULK_EXPORT_HEADERS;
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...list.map((row) => {
      const exported = toFullExportRow(row);
      return headers.map((h) => escapeCsvCell(exported[h] ?? '')).join(',');
    })
  ];
  return `${lines.join('\n')}\n`;
}

/** Full raw inventory XLSX — same full columns (not address-only enrichment). */
function rowsToFullXlsxBuffer(rows, sheetName = 'Full Filter Export') {
  const list = Array.isArray(rows) ? rows : [];
  const headers = [...FULL_BULK_EXPORT_HEADERS];
  const data = list.map(toFullExportRow);
  const sheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  const safeName = String(sheetName || 'Full Filter Export').slice(0, 31) || 'Full Filter Export';
  XLSX.utils.book_append_sheet(workbook, sheet, safeName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function parseResponseReceivedAt(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('Response received date is required');
  }
  // Date-only (YYYY-MM-DD): treat as local calendar day at noon so KPI day stays stable
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const local = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(local.getTime())) {
      throw new Error('Invalid response received date');
    }
    return local.toISOString();
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new Error('Invalid response received date');
  }
  return new Date(ms).toISOString();
}

module.exports = {
  ADDRESS_EXPORT_HEADERS,
  FULL_BULK_EXPORT_HEADERS,
  toAddressExportRow,
  toFullExportRow,
  rowsToCsv,
  rowsToXlsxBuffer,
  rowsToFullCsv,
  rowsToFullXlsxBuffer,
  parseResponseReceivedAt
};
