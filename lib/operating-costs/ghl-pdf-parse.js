'use strict';

/**
 * Extract billing-like tables / line items from GHL (and similar) PDF exports.
 * Prefer embedded tables; fall back to date+$amount line scraping from text.
 */

const { PDFParse } = require('pdf-parse');

function isPdfFile(filename) {
  return /\.pdf$/i.test(String(filename || ''));
}

function normalizeCell(c) {
  return String(c ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerLooksBilling(headers) {
  const blob = headers.map((h) => h.toLowerCase()).join(' ');
  const hasDate = /\bdate\b|created|charged|invoice/.test(blob);
  const hasAmount = /\bamount\b|\btotal\b|\bcharge\b|\bcost\b|\bprice\b|\busd\b/.test(blob);
  return hasDate && hasAmount;
}

function aoaToHeadersRows(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return null;
  const matrix = aoa
    .map((row) => (Array.isArray(row) ? row.map(normalizeCell) : []))
    .filter((row) => row.some((c) => c.length > 0));
  if (matrix.length < 2) return null;

  // Prefer a header row that looks like billing columns (skip title banners)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(8, matrix.length - 1); i += 1) {
    if (headerLooksBilling(matrix[i])) {
      headerIdx = i;
      break;
    }
  }
  const headers = matrix[headerIdx].map((h, i) => h || `Column ${i + 1}`);
  if (!headerLooksBilling(headers) && !headers.some((h) => /amount|total|date/i.test(h))) {
    return null;
  }
  const rows = [];
  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
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
  if (!rows.length) return null;
  return { headers, rows, parser: 'pdf-table' };
}

function collectTables(tableResult) {
  const raw = [];
  const merged = tableResult && Array.isArray(tableResult.mergedTables) ? tableResult.mergedTables : [];
  for (const t of merged) {
    if (Array.isArray(t) && t.length) raw.push(t);
  }
  const pages = tableResult && Array.isArray(tableResult.pages) ? tableResult.pages : [];
  for (const page of pages) {
    for (const t of page.tables || []) {
      if (Array.isArray(t) && t.length) raw.push(t);
    }
  }
  return raw;
}

/**
 * Scrape billing-ish lines from plain PDF text when tables aren't available.
 * Returns synthetic headers/rows: Date, Amount, Description.
 */
function linesToBillingRows(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Require $ or decimal cents so date fragments like 07/10 are not treated as amounts.
  const moneyRe =
    /(?:USD\s*)?(?:\$\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2})|(-?\d{1,3}(?:,\d{3})*\.\d{2}))\b/;
  const dateRe =
    /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i;

  const headers = ['Date', 'Amount', 'Description'];
  const rows = [];
  const seen = new Set();

  for (const line of lines) {
    if (line.length < 6) continue;
    if (/^page\s+\d+/i.test(line)) continue;
    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;
    const withoutDate = line.replace(dateMatch[0], ' ');
    const moneyMatch = withoutDate.match(moneyRe);
    if (!moneyMatch) continue;

    const date = dateMatch[1];
    const amount = moneyMatch[1] || moneyMatch[2];
    let description = withoutDate
      .replace(moneyMatch[0], ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description) description = 'PDF line item';
    // Skip obvious total-only footers unless they look like a plan charge
    if (/^total\b/i.test(description) && !/subscription|plan|agency|starter|unlimited/i.test(description)) {
      continue;
    }
    const key = `${date}|${amount}|${description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ Date: date, Amount: amount, Description: description });
  }

  if (!rows.length) return null;
  return { headers, rows, parser: 'pdf-text-lines' };
}

/**
 * @returns {Promise<{ headers: string[], rows: object[], parser: string, pageCount: number }>}
 */
async function parseBillingPdf(buffer, filename) {
  if (!isPdfFile(filename)) {
    const err = new Error('Not a PDF file');
    err.code = 'NOT_PDF';
    throw err;
  }

  const parser = new PDFParse({ data: buffer });
  let tableResult = null;
  let textResult = null;
  try {
    try {
      tableResult = await parser.getTable();
    } catch (_) {
      tableResult = null;
    }
    try {
      textResult = await parser.getText();
    } catch (_) {
      textResult = null;
    }
  } finally {
    await parser.destroy().catch(() => {});
  }

  const pageCount =
    (tableResult && tableResult.total) || (textResult && textResult.total) || 0;

  // Prefer tables that look like billing exports
  const tables = collectTables(tableResult);
  let best = null;
  for (const aoa of tables) {
    const candidate = aoaToHeadersRows(aoa);
    if (!candidate) continue;
    if (!best || candidate.rows.length > best.rows.length) best = candidate;
  }
  if (best) {
    return { ...best, pageCount, source: 'pdf' };
  }

  const text = String((textResult && textResult.text) || '').trim();
  const fromText = linesToBillingRows(text);
  if (fromText) {
    return { ...fromText, pageCount, source: 'pdf' };
  }

  const err = new Error(
    'Could not find billing lines in this PDF. Try exporting CSV/Excel from HighLevel, or a text-based PDF invoice (not a scanned image).'
  );
  err.code = 'GHL_PDF_EMPTY';
  throw err;
}

module.exports = {
  isPdfFile,
  parseBillingPdf,
  linesToBillingRows,
  aoaToHeadersRows
};
