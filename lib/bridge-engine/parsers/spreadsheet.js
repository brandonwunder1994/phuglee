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
  // AOA first so we can promote a real header row when row 0 is a title banner
  // (e.g. Lawrenceville "City of … Code Cases …" then Case # / Case Type / …).
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const matrix = promoteHeaderRow(aoa);
  if (!matrix || matrix.length < 2) {
    throw new Error('Spreadsheet is empty');
  }

  const headers = matrix[0].map((h, i) => {
    const label = String(h ?? '').trim();
    return label || `__EMPTY${i === 0 ? '' : `_${i}`}`;
  });
  const rows = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const obj = {};
    let any = false;
    for (let c = 0; c < headers.length; c += 1) {
      const val = line[c] != null ? String(line[c]).trim() : '';
      if (val) any = true;
      obj[headers[c]] = val;
    }
    if (any) rows.push(obj);
  }
  if (!rows.length) {
    throw new Error('Spreadsheet is empty');
  }
  if (!headers.some((h) => String(h).trim() && !/^__EMPTY/i.test(h))) {
    throw new Error('Spreadsheet has no usable headers');
  }

  return {
    parser: ext === '.csv' || ext === '.tsv' ? 'csv' : 'spreadsheet',
    sheetName,
    headers,
    rows
  };
}

/**
 * When the first row is a long title and a later row looks like real column
 * labels (Case Type, Main Address, …), use that later row as the header.
 */
function promoteHeaderRow(aoa) {
  const matrix = (aoa || [])
    .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : []))
    .filter((row) => row.some((c) => c.length > 0));
  if (matrix.length < 2) return matrix;

  const scoreHeader = (cells) => {
    const joined = cells.join(' ').toLowerCase();
    let score = 0;
    if (/\b(case\s*#|case\s*number|case\s*type|main\s*address|property\s*address|violation\s*type|opened\s*date|street\s*address)\b/i.test(joined)) {
      score += 3;
    }
    if (/\b(address|type|status|parcel|district|assigned|date)\b/i.test(joined)) score += 1;
    // Prefer short label cells over a single title sentence
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length >= 3 && nonEmpty.every((c) => c.length <= 40)) score += 2;
    if (nonEmpty.length === 1 && nonEmpty[0].length > 50) score -= 3;
    if (/^city of\b/i.test(nonEmpty[0] || '')) score -= 2;
    return score;
  };

  const firstScore = scoreHeader(matrix[0]);
  let bestIdx = 0;
  let bestScore = firstScore;
  for (let i = 1; i < Math.min(6, matrix.length); i += 1) {
    const s = scoreHeader(matrix[i]);
    // Only promote when clearly better (real labels vs title banner)
    if (s >= bestScore + 2) {
      bestScore = s;
      bestIdx = i;
    }
  }
  if (bestIdx === 0) return matrix;
  return matrix.slice(bestIdx);
}

module.exports = {
  isSpreadsheetFile,
  parseSpreadsheet,
  promoteHeaderRow
};