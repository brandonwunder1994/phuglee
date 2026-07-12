const XLSX = require('xlsx');

/** Enrichment export only — skip-trace friendly. */
const ADDRESS_EXPORT_HEADERS = Object.freeze([
  'Street Address',
  'City',
  'State',
  'Postal Code'
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
  toAddressExportRow,
  rowsToCsv,
  rowsToXlsxBuffer,
  parseResponseReceivedAt
};
