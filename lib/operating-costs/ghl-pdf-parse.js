'use strict';

/**
 * Extract billing-like tables / line items from GHL (and similar) PDF exports.
 * Prefer embedded tables; then HighLevel Tax Invoice summaries; then text scraping.
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

const MONEY_RE =
  /(?:USD\s*)?(?:\$\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2})|(-?\d{1,3}(?:,\d{3})*\.\d{2}))\b/;
const DATE_RE =
  /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i;

function moneyFromMatch(m) {
  if (!m) return null;
  return m[1] || m[2] || null;
}

function extractFilenameDate(filename) {
  const m = String(filename || '').match(/(20\d{2}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractDocumentDate(text, filename) {
  const blob = String(text || '');
  const labeled = blob.match(
    /(?:^|\n)\s*(?:Invoice\s*)?Date\s*:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
  );
  if (labeled) return labeled[1];
  const fromName = extractFilenameDate(filename);
  if (fromName) return fromName;
  const first = blob.match(DATE_RE);
  return first ? first[1] : null;
}

function labeledMoney(text, labelRe) {
  const re = new RegExp(
    String.raw`(?:^|\n)\s*${labelRe.source}\s*:?\s*(?:USD\s*)?\$?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2})\b`,
    'i'
  );
  const m = String(text || '').match(re);
  return m ? m[1] : null;
}

/**
 * HighLevel "Tax Invoice" / WALLET_SALES_TAX PDFs put Date and Total on separate labeled lines
 * (no per-line date next to amount). The cash charge is Final Tax / Total Charged.
 */
function parseHighLevelTaxInvoice(text, filename) {
  const blob = String(text || '');
  const name = String(filename || '');
  const isTaxInvoice =
    /\bTax\s*Invoice\b/i.test(blob) ||
    /\bWALLET[_ ]?SALES[_ ]?TAX\b/i.test(name) ||
    /\bFinal\s*Tax\s*Calculated\b/i.test(blob) ||
    /\bTotal\s*Charged\b/i.test(blob);

  if (!isTaxInvoice) return null;

  const date = extractDocumentDate(blob, name);
  if (!date) return null;

  const charged =
    labeledMoney(blob, /Total\s*Charged/) ||
    labeledMoney(blob, /Final\s*Tax\s*Calculated/) ||
    labeledMoney(blob, /Amount\s*Due/);
  if (charged == null) return null;

  const amountNum = Number(String(charged).replace(/,/g, ''));
  // Amount Due can be $0 after wallet debit — still import the charged tax when available.
  if (!Number.isFinite(amountNum)) return null;

  // Prefer non-zero charged amount; Amount Due is often $0 after wallet debit.
  let finalAmount = charged;
  if (amountNum === 0) {
    finalAmount =
      labeledMoney(blob, /Total\s*Charged/) || labeledMoney(blob, /Final\s*Tax\s*Calculated/);
    if (finalAmount == null || Number(String(finalAmount).replace(/,/g, '')) === 0) return null;
  }

  let description = /\bWALLET[_ ]?SALES[_ ]?TAX\b/i.test(name)
    ? 'Wallet Sales Tax'
    : 'HighLevel Tax Invoice';
  const idMatch = blob.match(/\bID:\s*([A-Za-z0-9_]+)/);
  if (idMatch) description = `${description} (${idMatch[1]})`;
  const duration = blob.match(
    /Start\s*Date:\s*(\d{4}-\d{2}-\d{2})[\s\S]*?End\s*Date:\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (duration) {
    description = `${description} · ${duration[1]} → ${duration[2]}`;
  }

  return {
    headers: ['Date', 'Amount', 'Description', 'Category'],
    rows: [
      {
        Date: date,
        Amount: finalAmount,
        Description: description,
        Category: 'Tax'
      }
    ],
    parser: 'pdf-hl-tax-invoice'
  };
}

/**
 * Generic invoice: pick invoice date + a primary total when line scraping fails.
 */
function parseInvoiceSummary(text, filename) {
  const blob = String(text || '');
  if (!/\binvoice\b/i.test(blob) && !/\binvoice\b/i.test(filename || '')) return null;
  if (parseHighLevelTaxInvoice(blob, filename)) return null;

  const date = extractDocumentDate(blob, filename);
  if (!date) return null;

  const amount =
    labeledMoney(blob, /Total\s*Charged/) ||
    labeledMoney(blob, /Amount\s*Due/) ||
    labeledMoney(blob, /Grand\s*Total/) ||
    labeledMoney(blob, /Invoice\s*Total/) ||
    labeledMoney(blob, /Total\s*Due/) ||
    labeledMoney(blob, /^Total$/);
  if (amount == null) return null;
  const n = Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return null;

  return {
    headers: ['Date', 'Amount', 'Description'],
    rows: [
      {
        Date: date,
        Amount: amount,
        Description: String(filename || 'Invoice').replace(/\.pdf$/i, '')
      }
    ],
    parser: 'pdf-invoice-summary'
  };
}

/**
 * Tab-ish product rows with a trailing $amount, using the invoice Date for all lines.
 * Useful when getTable() returns empty but text still has ITEM / TOTAL columns.
 */
function lineItemsWithDocDate(text, filename) {
  const blob = String(text || '');
  const date = extractDocumentDate(blob, filename);
  if (!date) return null;

  const lines = blob
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const headers = ['Date', 'Amount', 'Description'];
  const rows = [];
  const seen = new Set();
  let inItems = false;

  for (const line of lines) {
    if (/ITEM\s*NAME/i.test(line) && /TOTAL|SUBTOTAL/i.test(line)) {
      inItems = true;
      continue;
    }
    if (/^(Taxable\s*Products\s*Amount|Non-Taxable|Total\s*\(|Final\s*Tax|Total\s*Charged|Amount\s*Due)/i.test(line)) {
      inItems = false;
      continue;
    }
    if (!inItems && !/\$\s*\d/.test(line)) continue;

    const moneyMatch = line.match(MONEY_RE);
    if (!moneyMatch) continue;
    // Prefer the last money token on the line (line TOTAL), not unit price.
    let amount = null;
    let m;
    const global = new RegExp(MONEY_RE.source, 'g');
    while ((m = global.exec(line)) != null) {
      amount = moneyFromMatch(m);
    }
    if (amount == null) continue;
    const amountNum = Number(String(amount).replace(/,/g, ''));
    if (!Number.isFinite(amountNum) || amountNum === 0) continue;

    let description = line
      .replace(new RegExp(MONEY_RE.source, 'g'), ' ')
      .replace(/\b\d+(\.\d+)?%\b/g, ' ')
      .replace(/\b\d{1,7}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description || description.length < 2) continue;
    if (/^(ITEM NAME|UNIT PRICE|TAX RATE|QTY|TOTAL|SUBTOTAL)$/i.test(description)) continue;
    if (/^No Non-Taxable/i.test(description)) continue;

    const key = `${date}|${amount}|${description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ Date: date, Amount: amount, Description: description });
  }

  if (rows.length < 2) return null;
  return { headers, rows, parser: 'pdf-line-items-doc-date' };
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

  const headers = ['Date', 'Amount', 'Description'];
  const rows = [];
  const seen = new Set();

  for (const line of lines) {
    if (line.length < 6) continue;
    if (/^page\s+\d+/i.test(line)) continue;
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;
    const withoutDate = line.replace(dateMatch[0], ' ');
    const moneyMatch = withoutDate.match(MONEY_RE);
    if (!moneyMatch) continue;

    const date = dateMatch[1];
    const amount = moneyFromMatch(moneyMatch);
    let description = withoutDate
      .replace(moneyMatch[0], ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description) description = 'PDF line item';
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
  const text = String((textResult && textResult.text) || '').trim();

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

  // HighLevel Wallet Sales Tax invoices: labeled Date + Total Charged (not table-shaped).
  const taxInvoice = parseHighLevelTaxInvoice(text, filename);
  if (taxInvoice) {
    return { ...taxInvoice, pageCount, source: 'pdf' };
  }

  const fromText = linesToBillingRows(text);
  if (fromText) {
    return { ...fromText, pageCount, source: 'pdf' };
  }

  const summary = parseInvoiceSummary(text, filename);
  if (summary) {
    return { ...summary, pageCount, source: 'pdf' };
  }

  const withDocDate = lineItemsWithDocDate(text, filename);
  if (withDocDate) {
    return { ...withDocDate, pageCount, source: 'pdf' };
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
  aoaToHeadersRows,
  parseHighLevelTaxInvoice,
  extractDocumentDate
};
