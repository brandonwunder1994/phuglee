const { PDFParse } = require('pdf-parse');
const XLSX = require('xlsx');
const { parseSpreadsheet } = require('./spreadsheet');
const {
  extractRowsFromText,
  normalizeLines,
  detectLineDelimiter
} = require('./row-extract');
const { extractEgovPirFromText } = require('./pdf-egov');
const { ocrPdfBuffer, needsPdfOcr } = require('./pdf-ocr');

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
    source: 'pdf',
    ocrConfidence: meta.ocrConfidence != null ? meta.ocrConfidence : null
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

  const byWidth = new Map();
  for (const table of normalized) {
    const w = table[0].length;
    if (!byWidth.has(w)) byWidth.set(w, []);
    byWidth.get(w).push(table);
  }

  let best = null;
  let bestScore = -1;
  for (const tables of byWidth.values()) {
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
      /address|street|property|location|violation|type|date|issue|description|action\s*form|form\s*name/i.test(h)
    ) ? 50 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = combined;
    }
  }
  return best;
}

/**
 * Rebuild a table matrix from plain text when PDF has no vector table grid.
 * Preserves original header labels — no early remapping.
 */
function textToAoa(text) {
  const lines = normalizeLines(text);
  if (lines.length < 2) return null;

  const HEADER_HINT =
    /\b(address|location|street|property|site|service|violation|issue|notice|date|description|type|case|status|action\s*form|form\s*name|department|tracking|form\s*values)\b/i;

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

  // Stitch multi-line E-Gov headers: "Action Form" + "Name" → keep as separate
  // tokens if already split, or merge next header line when it looks like header continuations
  if (headerIndex + 1 < lines.length) {
    const next = lines[headerIndex + 1];
    if (
      /\b(name|submitted|department|number|values|tracking)\b/i.test(next) &&
      !/\d{5,}/.test(next)
    ) {
      const nextCells =
        delimiter === 'space'
          ? next.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
          : next.split(delimiter).map((c) => c.trim());
      // Pair-wise merge when same width
      if (nextCells.length === headerCells.length) {
        headerCells = headerCells.map((h, i) => `${h} ${nextCells[i] || ''}`.replace(/\s+/g, ' ').trim());
        headerIndex += 1;
      } else if (nextCells.length >= 2 && nextCells.length <= headerCells.length + 2) {
        // Common: "Action Form" row1 + "Name" row2 for same column — rebuild known PIR headers
        const joined = `${headerCells.join(' ')} ${nextCells.join(' ')}`;
        if (/action\s*form/i.test(joined) && /date\s*submitted/i.test(joined)) {
          headerCells = [
            'E-Gov Link Tracking #',
            'Action Form Name',
            'Date Submitted',
            'Department',
            'Issue Street Number',
            'Issue Street Name',
            'Issue City',
            'Form Values'
          ];
          headerIndex += 1;
        }
      }
    }
  }

  const rows = [headerCells];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells =
      delimiter === 'space'
        ? line.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0)
        : line.split(delimiter).map((c) => c.trim());
    if (!cells.length) continue;
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

function tryEgovToSpreadsheet(text, meta = {}) {
  const egov = extractEgovPirFromText(text);
  if (!egov || !egov.aoa || egov.aoa.length < 2) return null;
  // Prefer real Action Form Name column path
  return parseAoaAsSpreadsheet(egov.aoa, {
    parseMode: meta.parseMode || 'egov-pir-to-xlsx',
    pageCount: meta.pageCount || 0,
    filename: meta.filename,
    sheetName: 'E-Gov PIR',
    ocrConfidence: meta.ocrConfidence
  });
}

function countUsableStreets(parsed) {
  if (!parsed || !Array.isArray(parsed.rows)) return 0;
  return parsed.rows.filter((r) => {
    const street =
      r['Street Address'] ||
      r['Issue Street Name'] ||
      r['Property Address'] ||
      r.streetAddress ||
      '';
    return /\d{1,6}\s+[A-Za-z#]/.test(String(street));
  }).length;
}

function xlsxName(filename) {
  return String(filename || 'import.pdf').replace(/\.pdf$/i, '') + '.xlsx';
}

/**
 * Run structured extractors on a text blob (embedded or OCR).
 */
function parseTextBlob(text, meta = {}) {
  // Prefer E-Gov PIR so Action Form Name is a real Type column
  const egov = tryEgovToSpreadsheet(text, meta);
  if (egov && countUsableStreets(egov) >= 1) return egov;

  const textAoa = textToAoa(text);
  if (textAoa) {
    try {
      const parsed = parseAoaAsSpreadsheet(textAoa, {
        parseMode: meta.fromOcr ? 'ocr-text-table-to-xlsx' : 'text-table-to-xlsx',
        pageCount: meta.pageCount || 0,
        filename: meta.filename,
        sheetName: meta.fromOcr ? 'PDF OCR' : 'PDF Text',
        ocrConfidence: meta.ocrConfidence
      });
      if (countUsableStreets(parsed) >= 1) return parsed;
    } catch {
      // fall through
    }
  }

  // E-gov may still win on form-name presence even if street count low
  if (egov) return egov;

  return null;
}

async function parsePdf(buffer, filename) {
  if (!isPdfFile(filename)) {
    throw new Error('Not a PDF file');
  }

  const xlsxFile = xlsxName(filename);
  const parser = new PDFParse({ data: buffer });
  let tableResult = null;
  let textResult = null;
  try {
    try {
      tableResult = await parser.getTable();
    } catch {
      tableResult = null;
    }
    try {
      textResult = await parser.getText();
    } catch {
      textResult = null;
    }
  } finally {
    await parser.destroy().catch(() => {});
  }

  let pageCount =
    (tableResult && tableResult.total) ||
    (textResult && textResult.total) ||
    0;

  // Path A: vector table grid → Excel
  const tableAoa = collectTablesFromResult(tableResult);
  if (tableAoa) {
    try {
      const parsed = parseAoaAsSpreadsheet(tableAoa, {
        parseMode: 'table-to-xlsx',
        pageCount,
        filename: xlsxFile,
        sheetName: 'PDF Table'
      });
      // If grid has Action Form Name (or any type-ish col) keep it
      if (countUsableStreets(parsed) >= 1) return parsed;
    } catch {
      // fall through
    }
  }

  let text = String((textResult && textResult.text) || '').trim();
  let ocrConfidence = null;
  let fromOcr = false;

  // Path B: embedded text → E-Gov / text table → Excel
  let fromText = text ? parseTextBlob(text, { pageCount, filename: xlsxFile }) : null;

  // Path C: OCR when image PDF or encoding garbage, or text path missed Action Form rows
  const textMissedActionForm =
    text &&
    !fromText &&
    (needsPdfOcr(text, tableAoa) ||
      /action\s*form|A.?llon\s*Fom|form\s*values|datesubmitted/i.test(text) ||
      countUsableStreets(fromText) < 2);

  const shouldOcr =
    !fromText ||
    needsPdfOcr(text, tableAoa) ||
    (fromText && fromText.parseMode && /address-lines/.test(fromText.parseMode)) ||
    textMissedActionForm;

  if (shouldOcr) {
    try {
      const ocr = await ocrPdfBuffer(buffer, {
        maxPages: Math.min(12, pageCount || 12)
      });
      if (ocr && ocr.text) {
        fromOcr = true;
        ocrConfidence = ocr.ocrConfidence;
        if (ocr.pageCount) pageCount = Math.max(pageCount, ocr.pageCount);
        const fromOcrParsed = parseTextBlob(ocr.text, {
          pageCount,
          filename: xlsxFile,
          fromOcr: true,
          ocrConfidence,
          parseMode: 'egov-pir-ocr-to-xlsx'
        });
        // Prefer OCR result when it recovers more streets OR has Action Form Name
        if (fromOcrParsed) {
          const ocrStreets = countUsableStreets(fromOcrParsed);
          const textStreets = countUsableStreets(fromText);
          const ocrHasAction = (fromOcrParsed.headers || []).some((h) =>
            /action\s*form/i.test(h)
          );
          const textHasAction = fromText && (fromText.headers || []).some((h) =>
            /action\s*form/i.test(h)
          );
          if (
            !fromText ||
            ocrHasAction && !textHasAction ||
            ocrStreets > textStreets
          ) {
            return fromOcrParsed;
          }
        }
        // Merge OCR text into further fallbacks
        if (!text || text.length < ocr.text.length / 2) {
          text = ocr.text;
        }
      }
    } catch {
      // OCR optional — continue with embedded text
    }
  }

  if (fromText && countUsableStreets(fromText) >= 1) return fromText;
  if (fromText) return fromText;

  // Path D: re-try structured on whatever text we have after OCR merge
  if (text) {
    const again = parseTextBlob(text, {
      pageCount,
      filename: xlsxFile,
      fromOcr,
      ocrConfidence
    });
    if (again) return again;
  }

  if (!text) {
    throw new Error(
      'PDF contains no extractable text or tables. Try a scan with clearer contrast, or upload Excel/CSV.'
    );
  }

  // Path E: legacy line/address extract → still convert to Excel
  const extracted = extractRowsFromText(text, {
    parser: fromOcr ? 'ocr' : 'pdf',
    ocrConfidence: ocrConfidence != null ? ocrConfidence : undefined
  });
  const extractedAoa = extractedRowsToAoa(extracted);
  if (extractedAoa) {
    try {
      const parsed = parseAoaAsSpreadsheet(extractedAoa, {
        parseMode: (extracted.parseMode || 'rows') + '-to-xlsx',
        pageCount,
        filename: xlsxFile,
        sheetName: 'PDF Extract',
        ocrConfidence
      });
      if (extracted.rows && extracted.rows[0] && extracted.rows[0]._meta) {
        parsed.rows = parsed.rows.map((row, i) => {
          const meta = extracted.rows[i] && extracted.rows[i]._meta;
          return meta ? { ...row, _meta: meta } : row;
        });
      }
      return parsed;
    } catch {
      // fall through
    }
  }

  return {
    ...extracted,
    pageCount,
    ocrConfidence
  };
}

module.exports = {
  isPdfFile,
  parsePdf,
  aoaToXlsxBuffer,
  parseAoaAsSpreadsheet,
  collectTablesFromResult,
  textToAoa,
  extractedRowsToAoa,
  normalizeTable
};
