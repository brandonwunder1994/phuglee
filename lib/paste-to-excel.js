/**
 * Paste Text → clean .xlsx
 * Parses tabular text (tabs, commas, pipes, semicolons, or multi-space columns)
 * and builds a professional workbook with AutoFilter, Arial, bold headers, column widths.
 * No categorization / distress tagging — pure text-to-spreadsheet.
 */

const JSZip = require('jszip');
const {
  detectDelimiter,
  splitRecords,
  normalizeCell
} = require('./bridge-engine/parsers/text');

const MAX_PASTE_CHARS = 5_000_000;
const MULTI_SPACE = Symbol('multi-space');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 0-based column index → Excel letter (0 → A). */
function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function detectPasteDelimiter(headerLine) {
  const line = String(headerLine || '');
  const tabCount = (line.match(/\t/g) || []).length;
  if (tabCount > 0) return '\t';

  const candidates = [
    { char: ',', count: (line.match(/,/g) || []).length },
    { char: '|', count: (line.match(/\|/g) || []).length },
    { char: ';', count: (line.match(/;/g) || []).length }
  ].sort((a, b) => b.count - a.count);

  if (candidates[0].count > 0) return candidates[0].char;

  // Fixed-width / report paste: two or more spaces between columns
  if (/\S\s{2,}\S/.test(line)) return MULTI_SPACE;

  // Single-column fallback
  return detectDelimiter(line);
}

function splitMultiSpaceLine(line) {
  return String(line || '')
    .trim()
    .split(/\s{2,}/)
    .map((cell) => normalizeCell(cell));
}

/**
 * Parse pasted tabular text into a matrix (first row = headers).
 * @returns {{ headers: string[], matrix: string[][], delimiter: string }}
 */
function parsePasteTable(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (raw.length > MAX_PASTE_CHARS) {
    throw new Error(`Paste is too large (max ${MAX_PASTE_CHARS.toLocaleString()} characters)`);
  }
  if (!raw.trim()) {
    throw new Error('Paste is empty — paste tabular text first');
  }

  const firstNl = raw.search(/\r?\n/);
  const headerProbe = (firstNl >= 0 ? raw.slice(0, firstNl) : raw).trim();
  if (!headerProbe) {
    throw new Error('Paste has no usable header row');
  }

  const delimiter = detectPasteDelimiter(headerProbe);
  let matrix;

  if (delimiter === MULTI_SPACE) {
    matrix = raw
      .split(/\r?\n/)
      .map((line) => line.replace(/\r/g, ''))
      .filter((line) => line.trim())
      .map(splitMultiSpaceLine);
  } else {
    matrix = splitRecords(raw, delimiter);
  }

  if (!matrix.length) {
    throw new Error('Could not parse any rows from the paste');
  }

  // Normalize width to the widest row so ragged pastes stay rectangular
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (width < 1) {
    throw new Error('Paste has no columns');
  }

  const normalized = matrix.map((row) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out.map((c) => String(c ?? '').trim());
  });

  // Header cells: fill blanks so Excel has real column names
  const headers = normalized[0].map((h, i) => {
    const cleaned = String(h || '').trim();
    return cleaned || `Column ${i + 1}`;
  });

  // Drop fully empty data rows
  const dataRows = normalized.slice(1).filter((row) => row.some((c) => String(c).trim()));

  // Allow header-only paste (still a valid sheet)
  const fullMatrix = [headers, ...dataRows];

  return {
    headers,
    matrix: fullMatrix,
    rowCount: dataRows.length,
    colCount: width,
    delimiter: delimiter === MULTI_SPACE ? 'multi-space' : delimiter
  };
}

function estimateColWidths(matrix) {
  const colCount = matrix[0]?.length || 0;
  const widths = Array.from({ length: colCount }, () => 10);

  for (const row of matrix) {
    for (let c = 0; c < colCount; c += 1) {
      const len = String(row[c] ?? '').length;
      // Slight pad; clamp for usability
      const w = Math.min(60, Math.max(10, len + 2));
      if (w > widths[c]) widths[c] = w;
    }
  }
  return widths;
}

/**
 * Build a styled .xlsx buffer (Arial, bold headers, AutoFilter, column widths).
 * @param {string[][]} matrix - first row headers
 * @returns {Buffer}
 */
async function matrixToStyledXlsxBuffer(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) {
    throw new Error('No table data to export');
  }

  const rows = matrix.length;
  const cols = matrix[0].length;
  const lastCol = colLetter(cols - 1);
  const lastRow = rows;
  const ref = `A1:${lastCol}${lastRow}`;
  const widths = estimateColWidths(matrix);

  const colXml = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const sheetRows = matrix
    .map((row, rIdx) => {
      const excelRow = rIdx + 1;
      const isHeader = rIdx === 0;
      const cells = row
        .map((value, cIdx) => {
          const refCell = `${colLetter(cIdx)}${excelRow}`;
          const style = isHeader ? '1' : '0';
          const text = escapeXml(value);
          // Inline string (t="inlineStr") — no shared-strings table needed
          return `<c r="${refCell}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
        })
        .join('');
      return `<row r="${excelRow}">${cells}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${ref}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colXml}</cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="${ref}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  // style 0 = body (Arial 11), style 1 = header (Arial 11 bold + light fill)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font>
      <sz val="11"/>
      <color theme="1"/>
      <name val="Arial"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color theme="1"/>
      <name val="Arial"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FFE8E8E8"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="1">
    <border>
      <left/><right/><top/><bottom/><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="0"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rootRels);
  const xl = zip.folder('xl');
  xl.file('workbook.xml', workbookXml);
  xl.file('styles.xml', stylesXml);
  xl.folder('_rels').file('workbook.xml.rels', workbookRels);
  xl.folder('worksheets').file('sheet1.xml', sheetXml);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  return buffer;
}

/**
 * Full pipeline: pasted text → professional .xlsx buffer + meta.
 * @param {string} text
 * @param {{ filename?: string }} [opts]
 */
async function pasteTextToExcel(text, opts = {}) {
  const parsed = parsePasteTable(text);
  const buffer = await matrixToStyledXlsxBuffer(parsed.matrix);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = String(opts.filename || `pasted-table-${stamp}.xlsx`)
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/\.xlsx$/i, '') + '.xlsx';

  return {
    buffer,
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    rowCount: parsed.rowCount,
    colCount: parsed.colCount,
    headers: parsed.headers,
    delimiter: parsed.delimiter
  };
}

module.exports = {
  MAX_PASTE_CHARS,
  parsePasteTable,
  matrixToStyledXlsxBuffer,
  pasteTextToExcel,
  detectPasteDelimiter,
  colLetter,
  estimateColWidths
};
