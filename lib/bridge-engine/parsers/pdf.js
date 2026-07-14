const { PDFParse } = require('pdf-parse');
const XLSX = require('xlsx');
const { parseSpreadsheet } = require('./spreadsheet');
const {
  extractRowsFromText,
  normalizeLines,
  detectLineDelimiter
} = require('./row-extract');
const { extractEgovPirFromText } = require('./pdf-egov');
const { ocrPdfBuffer, needsPdfOcr, ocrPageCapMessage, MAX_OCR_PAGES } = require('./pdf-ocr');
const { extractCodeComplianceAoa } = require('./pdf-code-compliance');
const { extractCodeCasesStatusAoa } = require('./pdf-code-cases-status');
const { extractEnforcementDetailAoa } = require('./pdf-enforcement-detail');
const {
  resolveHorizontalPageBands,
  groupTablesByHeaderFingerprint,
  mergeTableGroups
} = require('./pdf-horizontal-bands');

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
 * Tables with different headers are not stacked as extra rows (horizontal
 * overflow pages share width but not schema). Matching-row continuations
 * are zip-joined as extra columns when safe.
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

  // Group by width + header fingerprint so parcel/owner strips don't become
  // fake violation rows under ADDRESS/DESC.
  const groups = groupTablesByHeaderFingerprint(normalized);
  const combined = mergeTableGroups(groups);
  if (combined) return combined;

  // Fallback: legacy best-by-width (same headers only already handled above)
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
      // Only stack if header matches the chosen representative
      const sameHeader =
        t[0].length === header.length &&
        t[0].every((h, i) => String(h).toLowerCase() === String(header[i]).toLowerCase());
      if (!sameHeader) continue;
      for (const row of t.slice(1)) {
        const key = row.join('\u0001');
        if (seen.has(key)) continue;
        seen.add(key);
        dataRows.push(row);
      }
    }
    if (!dataRows.length) continue;
    const combinedWidth = [header, ...dataRows];
    const score = dataRows.length * header.length + (header.some((h) =>
      /address|street|property|location|violation|type|date|issue|description|action\s*form|form\s*name/i.test(h)
    ) ? 50 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = combinedWidth;
    }
  }
  return best;
}

/**
 * Rebuild a table matrix from plain text when PDF has no vector table grid.
 * Preserves original header labels — no early remapping.
 * Scores multiple header candidates (not just the first hint match).
 */
function textToAoa(text) {
  const lines = normalizeLines(text);
  if (lines.length < 2) return null;

  const HEADER_HINT =
    /\b(address|location|street|property|site|service|violation|issue|notice|date|description|type|case|status|action\s*form|form\s*name|department|tracking|form\s*values|category|offense|complaint|record|code)\b/i;

  const ADDRESS_CELL_RE = /\b\d{1,6}\s+[A-Za-z#]/;

  function splitLine(line, delim) {
    if (delim === 'space') {
      return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    }
    return line.split(delim).map((c) => c.trim()).filter((c) => c.length > 0);
  }

  function scoreCandidate(headerIndex, delimiter, headerCells) {
    let addressRows = 0;
    let dataRows = 0;
    let widthMatches = 0;
    for (const line of lines.slice(headerIndex + 1, headerIndex + 1 + 40)) {
      const cells = splitLine(line, delimiter);
      if (!cells.length) continue;
      dataRows += 1;
      if (Math.abs(cells.length - headerCells.length) <= 2) widthMatches += 1;
      if (cells.some((c) => ADDRESS_CELL_RE.test(c))) addressRows += 1;
    }
    const typeish = headerCells.some((h) =>
      /\b(type|category|violation|offense|complaint|case\s*type|action\s*form|issue)\b/i.test(h)
    );
    return (
      addressRows * 10 +
      widthMatches * 2 +
      (typeish ? 15 : 0) +
      Math.min(headerCells.length, 8) +
      (dataRows >= 2 ? 5 : 0)
    );
  }

  const candidates = [];
  const scanLimit = Math.min(lines.length, 45);
  for (let i = 0; i < scanLimit; i += 1) {
    const line = lines[i];
    if (!HEADER_HINT.test(line)) continue;
    const delim = detectLineDelimiter(line);
    const cells = splitLine(line, delim);
    if (cells.length < 2 || cells.length > 16) continue;
    candidates.push({
      headerIndex: i,
      delimiter: delim,
      headerCells: cells,
      score: scoreCandidate(i, delim, cells)
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  let { headerIndex, delimiter, headerCells } = candidates[0];
  if (candidates[0].score < 8) {
    // Weak — still try best candidate if it has ≥2 cells
    if (headerCells.length < 2) return null;
  }

  // Stitch multi-line E-Gov headers: "Action Form" + "Name" → keep as separate
  // tokens if already split, or merge next header line when it looks like header continuations
  if (headerIndex + 1 < lines.length) {
    const next = lines[headerIndex + 1];
    if (
      /\b(name|submitted|department|number|values|tracking)\b/i.test(next) &&
      !/\d{5,}/.test(next)
    ) {
      const nextCells = splitLine(next, delimiter);
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
    const cells = splitLine(line, delimiter);
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
    if (!r || typeof r !== 'object') return false;
    const street =
      r['Street Address'] ||
      r['Property Address'] ||
      r['Main Address'] ||
      r['Issue Street Name'] ||
      r['Street Name'] ||
      r.streetAddress ||
      r.ADDRESS ||
      r.Address ||
      r.Location ||
      '';
    // Prefer full "123 N MAIN" but also accept "123 MAIN" / composed parts
    if (/\d{1,6}\s+[A-Za-z#]/.test(String(street))) return true;
    const num = r['Street #'] || r['Street Number'] || '';
    const name = r['Street Name'] || '';
    if (/^\d{1,6}$/.test(String(num).trim()) && /[A-Za-z]{2,}/.test(String(name))) return true;
    // Wide-sheet PDFs keep raw header "ADDRESS" — scan address-ish keys + values
    for (const [key, val] of Object.entries(r)) {
      if (key === '_meta') continue;
      if (/address|street|location|site|property/i.test(key) &&
          /\d{1,6}\s+[A-Za-z#]/.test(String(val || ''))) {
        return true;
      }
    }
    return Object.values(r).some(
      (v) =>
        v != null &&
        v !== r._meta &&
        /\d{1,6}\s+[A-Za-z#].{0,40}\b(RD|AVE?|ST|LN|DR|CT|WY|CIR|BLVD|PL|ROAD|STREET|DRIVE|LANE)\b/i.test(
          String(v)
        )
    );
  }).length;
}

function xlsxName(filename) {
  return String(filename || 'import.pdf').replace(/\.pdf$/i, '') + '.xlsx';
}

/**
 * Code-compliance OCR tables (Application Name / Street # / Dir / Street Name).
 */
function tryCodeComplianceToSpreadsheet(text, meta = {}) {
  const extracted = extractCodeComplianceAoa(text);
  if (!extracted || !extracted.aoa || extracted.aoa.length < 3) return null;
  return parseAoaAsSpreadsheet(extracted.aoa, {
    parseMode: meta.fromOcr
      ? 'code-compliance-ocr-to-xlsx'
      : 'code-compliance-text-to-xlsx',
    pageCount: meta.pageCount || 0,
    filename: meta.filename,
    sheetName: 'Code Compliance',
    ocrConfidence: meta.ocrConfidence
  });
}

/**
 * Gainesville-style Enforcement Cases Detail (GENF record IDs) — often
 * sideways image scans with black-box redactions. Rebuilds Record ID /
 * Location / Description columns for the Excel path.
 */
function tryEnforcementDetailToSpreadsheet(text, meta = {}) {
  const extracted = extractEnforcementDetailAoa(text);
  if (!extracted || !extracted.aoa || extracted.aoa.length < 3) return null;
  const parsed = parseAoaAsSpreadsheet(extracted.aoa, {
    parseMode: meta.fromOcr
      ? 'enforcement-detail-ocr-to-xlsx'
      : 'enforcement-detail-text-to-xlsx',
    pageCount: meta.pageCount || 0,
    filename: meta.filename,
    sheetName: 'Enforcement Detail',
    ocrConfidence: meta.ocrConfidence
  });
  if (extracted.redactedSkipped) {
    parsed.redactedSkipped = extracted.redactedSkipped;
  }
  return parsed;
}

/**
 * Lawrenceville-style CODE CASES OPENED BY STATUS / CEU#### grids.
 * Preserves real Case Type so the Type-column confirm dialog can offer it.
 */
function tryCodeCasesStatusToSpreadsheet(text, meta = {}) {
  const extracted = extractCodeCasesStatusAoa(text);
  if (!extracted || !extracted.aoa || extracted.aoa.length < 3) return null;
  return parseAoaAsSpreadsheet(extracted.aoa, {
    parseMode: meta.fromOcr
      ? 'code-cases-status-ocr-to-xlsx'
      : 'code-cases-status-to-xlsx',
    pageCount: meta.pageCount || 0,
    filename: meta.filename,
    sheetName: 'Code Cases',
    ocrConfidence: meta.ocrConfidence
  });
}

/**
 * When PDF pages are a wide sheet split horizontally, build a spreadsheet
 * from primary pages (+ zip-joined parcel/owner columns) instead of stacking
 * continuation rows under ADDRESS/DESC.
 */
function tryHorizontalBandsToSpreadsheet(pages, meta = {}) {
  if (!Array.isArray(pages) || pages.length < 2) return null;
  const resolved = resolveHorizontalPageBands(pages);
  if (!resolved || !resolved.applied) return null;

  if (resolved.aoa && resolved.aoa.length >= 2) {
    try {
      const parsed = parseAoaAsSpreadsheet(resolved.aoa, {
        parseMode: meta.fromOcr
          ? 'ocr-horizontal-bands-to-xlsx'
          : 'horizontal-bands-to-xlsx',
        pageCount: meta.pageCount || pages.length,
        filename: meta.filename,
        sheetName: 'PDF Wide Table',
        ocrConfidence: meta.ocrConfidence
      });
      parsed.horizontalBands = resolved.stats;
      if (countUsableStreets(parsed) >= 1) return parsed;
    } catch {
      // fall through to primary-text path
    }
  }

  // Primary pages only — still prevents parcel IDs in the type column
  if (resolved.primaryText) {
    const fromPrimary = parseTextBlob(resolved.primaryText, {
      ...meta,
      pageCount: meta.pageCount || pages.length,
      // Avoid re-entering band detection without pages
      pages: null
    });
    if (fromPrimary) {
      fromPrimary.horizontalBands = resolved.stats;
      fromPrimary.parseMode = (fromPrimary.parseMode || 'text') + '+horizontal-primary';
      return fromPrimary;
    }
  }
  return null;
}

/**
 * Run structured extractors on a text blob (embedded or OCR).
 * Optional meta.pages enables horizontal page-band detection.
 */
function parseTextBlob(text, meta = {}) {
  // Wide-sheet horizontal overflow (Whitehall-style): fix before generic stack
  if (Array.isArray(meta.pages) && meta.pages.length >= 2) {
    const banded = tryHorizontalBandsToSpreadsheet(meta.pages, meta);
    if (banded && countUsableStreets(banded) >= 1) return banded;
  }

  // CEU / CODE CASES OPENED BY STATUS — before generic remap so Case Type survives
  const codeCases = tryCodeCasesStatusToSpreadsheet(text, meta);
  if (codeCases && countUsableStreets(codeCases) >= 1) return codeCases;

  // GENF / Enforcement Cases Detail (sideways + redacted image scans)
  const enfDetail = tryEnforcementDetailToSpreadsheet(text, meta);
  if (enfDetail && countUsableStreets(enfDetail) >= 1) return enfDetail;

  // Prefer E-Gov PIR so Action Form Name is a real Type column
  const egov = tryEgovToSpreadsheet(text, meta);
  if (egov && countUsableStreets(egov) >= 1) return egov;

  // Municipal code-compliance grids (often sideways image scans)
  const codeComp = tryCodeComplianceToSpreadsheet(text, meta);
  if (codeComp && countUsableStreets(codeComp) >= 1) return codeComp;

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

  // Prefer structured recoveries even with fewer streets
  if (enfDetail) return enfDetail;
  if (codeComp) return codeComp;
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
  const textPages =
    textResult && Array.isArray(textResult.pages) ? textResult.pages : null;

  // Path B: embedded text → E-Gov / text table → Excel
  // Pass per-page text so horizontal overflow (parcel strip) is not stacked
  // under ADDRESS/DESC as fake violation rows.
  let fromText = text
    ? parseTextBlob(text, { pageCount, filename: xlsxFile, pages: textPages })
    : null;

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
        maxPages: Math.min(MAX_OCR_PAGES, pageCount || MAX_OCR_PAGES)
      });
      if (ocr && ocr.text) {
        fromOcr = true;
        ocrConfidence = ocr.ocrConfidence;
        if (ocr.pageCount) pageCount = Math.max(pageCount, ocr.pageCount);
        const ocrPages =
          ocr.pages && Array.isArray(ocr.pages) ? ocr.pages : null;
        const fromOcrParsed = parseTextBlob(ocr.text, {
          pageCount,
          filename: xlsxFile,
          fromOcr: true,
          ocrConfidence,
          parseMode: 'egov-pir-ocr-to-xlsx',
          pages: ocrPages
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
            if (ocr.ocrTruncated) {
              fromOcrParsed.ocrTruncated = true;
              fromOcrParsed.ocrMaxPages = ocr.ocrMaxPages;
              fromOcrParsed.ocrTotalPages = ocr.ocrTotalPages;
              fromOcrParsed.ocrPageCapNote = ocr.ocrPageCapNote;
            }
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
      `PDF contains no extractable text or tables. Try a scan with clearer contrast, or upload Excel/CSV. ${ocrPageCapMessage(MAX_OCR_PAGES)}`
    );
  }

  // Path E: legacy line/address extract → still convert to Excel.
  // Prefer primary band text when wide-sheet horizontal overflow was detected
  // so parcel/owner strips are not stacked as fake type rows.
  let extractText = text;
  let horizontalBandMeta = null;
  if (textPages && textPages.length >= 2) {
    const resolved = resolveHorizontalPageBands(textPages);
    if (resolved && resolved.applied && resolved.primaryText) {
      extractText = resolved.primaryText;
      horizontalBandMeta = resolved.stats;
    }
  }
  const extracted = extractRowsFromText(extractText, {
    parser: fromOcr ? 'ocr' : 'pdf',
    ocrConfidence: ocrConfidence != null ? ocrConfidence : undefined
  });
  const extractedAoa = extractedRowsToAoa(extracted);
  if (extractedAoa) {
    try {
      const parsed = parseAoaAsSpreadsheet(extractedAoa, {
        parseMode: (extracted.parseMode || 'rows') + '-to-xlsx' +
          (horizontalBandMeta ? '+horizontal-primary' : ''),
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
      if (horizontalBandMeta) parsed.horizontalBands = horizontalBandMeta;
      return parsed;
    } catch {
      // fall through
    }
  }

  return {
    ...extracted,
    pageCount,
    ocrConfidence,
    horizontalBands: horizontalBandMeta || undefined
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
  normalizeTable,
  tryCodeComplianceToSpreadsheet,
  tryCodeCasesStatusToSpreadsheet,
  tryEnforcementDetailToSpreadsheet,
  parseTextBlob,
  tryHorizontalBandsToSpreadsheet
};
