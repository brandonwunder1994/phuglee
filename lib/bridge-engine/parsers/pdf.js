const { PDFParse } = require('pdf-parse');
const XLSX = require('xlsx');
const { parseSpreadsheet } = require('./spreadsheet');
const {
  extractRowsFromText,
  normalizeLines,
  detectLineDelimiter
} = require('./row-extract');

function isPdfFile(filename) {
  return /\.pdf$/i.test(String(filename || ''));
}

/**
 * Build an in-memory .xlsx buffer from a 2D array of cells (first row = headers).
 * Filter then reads this the same way as a real Excel upload.
 */
function aoaToXlsxBuffer(aoa, sheetName = 'Sheet1') {
  const matrix = (aoa || [])
    .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : []))
    .filter((row) => row.some((c) => c.length > 0));
  if (matrix.length < 2) {
    throw new Error('Not enough rows to build spreadsheet from PDF');
  }
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31) || 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parse AOA via the real spreadsheet path so column detection matches Excel imports.
 */
function parseAoaAsSpreadsheet(aoa, meta = {}) {
  const buffer = aoaToXlsxBuffer(aoa, meta.sheetName || 'PDF Import');
  const parsed = parseSpreadsheet(buffer, meta.filename || 'pdf-import.xlsx');
  return {
    ...parsed,
    parser: 'pdf-xlsx',
    parseMode: meta.parseMode || 'table-to-xlsx',
    pageCount: meta.pageCount || 0,
    source: 'pdf'
  };
}

function cellCount(table) {
  if (!Array.isArray(table) || !table.length) return 0;
  return table.reduce((n, row) => n + (Array.isArray(row) ? row.length : 0), 0);
}

function normalizeTable(table) {
  if (!Array.isArray(table) || table.length < 2) return null;
  const rows = table
    .map((row) => {
      if (!Array.isArray(row)) return [];
      return row.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim());
    })
    .filter((row) => row.some((c) => c.length > 0));
  if (rows.length < 2) return null;

  // Drop leading empty columns that PDFs sometimes invent
  let minCol = Infinity;
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (row[i]) minCol = Math.min(minCol, i);
    }
  }
  if (!Number.isFinite(minCol) || minCol === Infinity) return null;
  const trimmed = rows.map((row) => row.slice(minCol));

  // Ensure rectangular matrix (pad short rows)
  const width = Math.max(...trimmed.map((r) => r.length));
  if (width < 1) return null;
  const rect = trimmed.map((row) => {
    const next = row.slice();
    while (next.length < width) next.push('');
    return next;
  });

  // Headers must be non-empty unique-ish labels
  const headers = rect[0].map((h, i) => {
    const label = String(h || '').trim();
    return label || `Column ${i + 1}`;
  });
  // Deduplicate headers (SheetJS overwrites same-key columns)
  const seen = new Map();
  const uniqueHeaders = headers.map((h) => {
    const count = (seen.get(h) || 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h} (${count})`;
  });
  rect[0] = uniqueHeaders;

  if (rect.length < 2 || uniqueHeaders.every((h) => /^Column \d+$/.test(h))) {
    // Still usable if data rows look like addresses
    const dataHasAddress = rect.slice(1).some((row) =>
      row.some((c) => /\b\d{1,6}\s+[A-Za-z#]/.test(c))
    );
    if (!dataHasAddress) return null;
  }

  return rect;
}

/**
 * Collect and rank tables from pdf-parse getTable() result.
 * Prefer largest multi-column grids; merge same-width tables across pages.
 */
function collectTablesFromResult(tableResult) {
  const raw = [];
  const merged = tableResult && Array.isArray(tableResult.mergedTables)
    ? tableResult.mergedTables
    : [];
  for (const t of merged) {
    if (Array.isArray(t) && t.length) raw.push(t);
  }
  const pages = tableResult && Array.isArray(tableResult.pages) ? tableResult.pages : [];
  for (const page of pages) {
    for (const t of page.tables || []) {
      if (Array.isArray(t) && t.length) raw.push(t);
    }
  }

  const normalized = raw.map(normalizeTable).filter(Boolean);
  if (!normalized.length) return null;

  // Group by column width and concatenate data rows (shared header from largest)
  const byWidth = new Map();
  for (const table of normalized) {
    const w = table[0].length;
    if (!byWidth.has(w)) byWidth.set(w, []);
    byWidth.get(w).push(table);
  }

  let best = null;
  let bestScore = -1;
  for (const tables of byWidth.values()) {
    // Prefer the table whose header row looks most like column labels
    tables.sort((a, b) => cellCount(b) - cellCount(a));
    const header = tables[0][0];
    const dataRows = [];
    const seen = new Set();
    for (const t of tables) {
      for (const row of t.slice(1)) {
        const key = row.join('\u0001');
        if (seen.has(key)) continue;
        seen.add(key);
        dataRows.push(row);
      }
    }
    if (!dataRows.length) continue;
    const combined = [header, ...dataRows];
    const score = dataRows.length * header.length + (header.some((h) =>
      /address|street|property|location|violation|type|date|issue|description/i.test(h)
    ) ? 50 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = combined;
    }
  }
  return best;
}

/**
 * Rebuild a table matrix from plain text when PDF has no vector table grid
 * (common for text-layer "tables" that are only aligned columns).
 * Preserves original header labels — no early remapping — so Excel path scores columns.
 */
function textToAoa(text) {
  const lines = normalizeLines(text);
  if (lines.length < 2) return null;

  const HEADER_HINT =
    /\b(address|location|street|property|site|service|violation|issue|notice|date|description|type|case|status)\b/i;

  let headerIndex = -1;
  let delimiter = 'space';
  let headerCells = null;

  for (let i = 0; i < Math.min(lines.length, 20); i += 1) {
    const line = lines[i];
    if (!HEADER_HINT.test(line)) continue;
    const delim = detectLineDelimiter(line);
    const cells =
      delim === 'space'
        ? line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
        : line.split(delim).map((c) => c.trim());
    if (cells.length < 2 || cells.length > 16) continue;
    headerIndex = i;
    delimiter = delim;
    headerCells = cells;
    break;
  }

  if (headerIndex < 0 || !headerCells) return null;

  const rows = [headerCells];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells =
      delimiter === 'space'
        ? line.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0)
        : line.split(delimiter).map((c) => c.trim());
    if (!cells.length) continue;
    // Pad / trim to header width
    while (cells.length < headerCells.length) cells.push('');
    rows.push(cells.slice(0, Math.max(headerCells.length, cells.length)));
  }

  return normalizeTable(rows);
}

/**
 * Last-resort: object rows from extractRowsFromText → AOA → spreadsheet.
 */
function extractedRowsToAoa(extracted) {
  if (!extracted || !Array.isArray(extracted.rows) || !extracted.rows.length) return null;
  const headers = (extracted.headers && extracted.headers.length
    ? extracted.headers
    : Object.keys(extracted.rows[0]).filter((k) => k !== '_meta')
  ).filter(Boolean);
  if (!headers.length) return null;
  const aoa = [headers];
  for (const row of extracted.rows) {
    aoa.push(headers.map((h) => String(row[h] ?? '').trim()));
  }
  return normalizeTable(aoa);
}

async function parsePdf(buffer, filename) {
  if (!isPdfFile(filename)) {
    throw new Error('Not a PDF file');
  }

  // pdf-parse v2 is class-based.
  const parser = new PDFParse({ data: buffer });
  let tableResult = null;
  let textResult = null;
  try {
    // 1) Prefer native table detection (vector grids → cell matrix)
    try {
      tableResult = await parser.getTable();
    } catch {
      tableResult = null;
    }

    // 2) Always load text as fallback / glue for non-grid layouts
    try {
      textResult = await parser.getText();
    } catch {
      textResult = null;
    }
  } finally {
    await parser.destroy().catch(() => {});
  }

  const pageCount =
    (tableResult && tableResult.total) ||
    (textResult && textResult.total) ||
    0;

  // Path A: PDF table grid → Excel → spreadsheet column pipeline
  const tableAoa = collectTablesFromResult(tableResult);
  if (tableAoa) {
    try {
      return parseAoaAsSpreadsheet(tableAoa, {
        parseMode: 'table-to-xlsx',
        pageCount,
        filename: String(filename || 'import.pdf').replace(/\.pdf$/i, '') + '.xlsx',
        sheetName: 'PDF Table'
      });
    } catch {
      // fall through
    }
  }

  const text = String((textResult && textResult.text) || '').trim();
  if (!text) {
    throw new Error('PDF contains no extractable text or tables. Try a scan/image upload for OCR.');
  }

  // Path B: aligned text columns → Excel → spreadsheet pipeline
  const textAoa = textToAoa(text);
  if (textAoa) {
    try {
      return parseAoaAsSpreadsheet(textAoa, {
        parseMode: 'text-table-to-xlsx',
        pageCount,
        filename: String(filename || 'import.pdf').replace(/\.pdf$/i, '') + '.xlsx',
        sheetName: 'PDF Text'
      });
    } catch {
      // fall through
    }
  }

  // Path C: legacy line/address extract → still convert to Excel so Type column scoring matches
  const extracted = extractRowsFromText(text, { parser: 'pdf' });
  const extractedAoa = extractedRowsToAoa(extracted);
  if (extractedAoa) {
    try {
      const parsed = parseAoaAsSpreadsheet(extractedAoa, {
        parseMode: (extracted.parseMode || 'rows') + '-to-xlsx',
        pageCount,
        filename: String(filename || 'import.pdf').replace(/\.pdf$/i, '') + '.xlsx',
        sheetName: 'PDF Extract'
      });
      // Preserve per-row confidence meta from line extract when present
      if (extracted.rows && extracted.rows[0] && extracted.rows[0]._meta) {
        parsed.rows = parsed.rows.map((row, i) => {
          const meta = extracted.rows[i] && extracted.rows[i]._meta;
          return meta ? { ...row, _meta: meta } : row;
        });
      }
      return parsed;
    } catch {
      // fall through to raw extract
    }
  }

  return {
    ...extracted,
    pageCount
  };
}

module.exports = {
  isPdfFile,
  parsePdf,
  // exported for unit tests
  aoaToXlsxBuffer,
  parseAoaAsSpreadsheet,
  collectTablesFromResult,
  textToAoa,
  extractedRowsToAoa,
  normalizeTable
};
