'use strict';

const crypto = require('crypto');
const { parseSpreadsheet } = require('../bridge-engine/parsers/spreadsheet');
const { isPdfFile, parseBillingPdf } = require('./ghl-pdf-parse');

const CATEGORY_RULES = [
  { id: 'subscription', re: /\b(subscription|plan|agency|starter|unlimited|saas\s*pro|membership|monthly fee|invoice)\b/i },
  { id: 'sms', re: /\b(sms|text\s*message|lc\s*sms|twilio\s*sms|message\s*segment)\b/i },
  { id: 'phone', re: /\b(phone|voice|call|minutes|lc\s*phone|twilio\s*voice|inbound|outbound)\b/i },
  { id: 'email', re: /\b(email|mailgun|lc\s*email|smtp)\b/i },
  { id: 'ai', re: /\b(ai\b|conversation\s*ai|voice\s*ai|agent\s*studio|openai|gpt)\b/i },
  { id: 'numbers', re: /\b(phone\s*number|local\s*number|toll[\s-]?free|did|10dlc|a2p)\b/i },
  { id: 'wallet', re: /\b(wallet|top[\s-]?up|recharge|credit\s*purchase)\b/i }
];

const CATEGORY_LABELS = {
  subscription: 'Subscription / plan',
  sms: 'SMS',
  phone: 'Phone / voice',
  email: 'Email',
  ai: 'AI',
  numbers: 'Phone numbers',
  wallet: 'Wallet / top-up',
  other: 'Other'
};

const DATE_HEADERS = [/date/i, /trans(?:action)?\s*date/i, /created/i, /charged/i, /when/i, /invoice\s*date/i];
const TIME_HEADERS = [/^time$/i, /timestamp/i, /created\s*at/i, /charged\s*at/i];
const AMOUNT_HEADERS = [/amount/i, /charge/i, /cost/i, /total/i, /price/i, /usd/i, /balance/i];
const DESC_HEADERS = [/description/i, /desc/i, /details?/i, /memo/i, /item/i, /product/i, /name/i, /line/i];
const CAT_HEADERS = [/categor/i, /type/i, /service/i, /product\s*type/i, /kind/i];
const ID_HEADERS = [/transaction\s*id/i, /invoice\s*#?/i, /invoice\s*number/i, /\bid\b/i, /charge\s*id/i, /reference/i, /txn/i];

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ');
}

function findCol(headers, patterns) {
  const normalized = headers.map(normalizeHeader);
  for (const re of patterns) {
    const idx = normalized.findIndex((h) => re.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAmount(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[($,\s)]/g, '').replace(/^-/, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + Math.floor(n) * 86400000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const iso = new Date(Date.UTC(y, month - 1, day));
    if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }
  return null;
}

function parseTime(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(11, 19);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()) && /T|\d{4}/.test(s)) {
      return d.toISOString().slice(11, 19);
    }
    return null;
  }
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] || 0);
  const ap = (m[4] || '').toUpperCase();
  if (ap === 'PM' && hh < 12) hh += 12;
  if (ap === 'AM' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function categorize(description, categoryHint) {
  const blob = `${categoryHint || ''} ${description || ''}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(blob)) return rule.id;
  }
  return 'other';
}

function chargeKey({ date, time, amountCents, description, category, externalId, kind }) {
  const basis = externalId
    ? `id:${externalId}`
    : `${date}|${time || ''}|${amountCents}|${String(description || '').trim().toLowerCase()}|${category}|${kind || ''}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 24);
}

function detectDocumentKind({ filename, headers, charges }) {
  const name = String(filename || '').toLowerCase();
  const headerBlob = (headers || []).map(normalizeHeader).join(' | ');
  const score = { invoice: 0, transactions: 0 };

  if (/\binvoice\b/.test(name) || /\.pdf$/i.test(name)) score.invoice += 2;
  if (/\b(transaction|wallet|charges?|ledger|usage)\b/.test(name)) score.transactions += 3;

  if (/invoice\s*(#|number|no|id)/.test(headerBlob)) score.invoice += 2;
  if (/transaction|wallet|charge\s*id|txn/.test(headerBlob)) score.transactions += 2;

  const cats = {};
  for (const c of charges || []) {
    cats[c.category] = (cats[c.category] || 0) + 1;
  }
  const total = charges?.length || 0;
  const subShare = total ? (cats.subscription || 0) / total : 0;
  const meterShare =
    total
      ? ((cats.sms || 0) + (cats.phone || 0) + (cats.email || 0) + (cats.ai || 0) + (cats.numbers || 0)) /
        total
      : 0;

  if (total <= 5 && subShare >= 0.4) score.invoice += 2;
  if (total >= 8 && meterShare >= 0.35) score.transactions += 2;
  if (total === 1) score.invoice += 1;

  const kind = score.invoice > score.transactions ? 'invoice' : 'transactions';
  const confidence =
    Math.abs(score.invoice - score.transactions) >= 2
      ? 'high'
      : Math.abs(score.invoice - score.transactions) === 1
        ? 'medium'
        : 'low';

  return {
    kind,
    confidence,
    scores: score,
    label: kind === 'invoice' ? 'Invoice / plan bill' : 'Transaction / usage charges'
  };
}

function chargesFromTable(headers, rows, filename) {
  const dateIdx = findCol(headers, DATE_HEADERS);
  const timeIdx = findCol(headers, TIME_HEADERS);
  const amountIdx = findCol(headers, AMOUNT_HEADERS);
  const descIdx = findCol(headers, DESC_HEADERS);
  const catIdx = findCol(headers, CAT_HEADERS);
  const idIdx = findCol(headers, ID_HEADERS);

  if (dateIdx < 0 || amountIdx < 0) {
    const err = new Error(
      'Could not find Date and Amount columns. Export should include date and amount (CSV, Excel, or PDF).'
    );
    err.code = 'GHL_PARSE_COLUMNS';
    err.headers = headers;
    throw err;
  }

  const charges = [];
  let from = null;
  let to = null;

  function cellAt(row, idx) {
    if (idx < 0) return '';
    if (Array.isArray(row)) return row[idx];
    const key = headers[idx];
    return row && key != null ? row[key] : '';
  }

  for (const row of rows) {
    const date = parseDate(cellAt(row, dateIdx));
    const amount = parseAmount(cellAt(row, amountIdx));
    if (!date || amount == null) continue;
    const time = timeIdx >= 0 ? parseTime(cellAt(row, timeIdx)) : null;
    const description = descIdx >= 0 ? String(cellAt(row, descIdx) || '').trim() : '';
    const categoryHint = catIdx >= 0 ? String(cellAt(row, catIdx) || '').trim() : '';
    const externalId = idIdx >= 0 ? String(cellAt(row, idIdx) || '').trim() : '';
    const category = categorize(description, categoryHint);
    const amountCents = Math.round(amount * 100);
    const key = chargeKey({
      date,
      time,
      amountCents,
      description,
      category,
      externalId: externalId || null,
      kind: ''
    });
    charges.push({
      chargeKey: key,
      date,
      time: time || null,
      amountUsd: Number((amountCents / 100).toFixed(2)),
      amountCents,
      description,
      category,
      categoryLabel: CATEGORY_LABELS[category] || category,
      categoryHint: categoryHint || null,
      externalId: externalId || null,
      kind: null
    });
    if (!from || date < from) from = date;
    if (!to || date > to) to = date;
  }

  const doc = detectDocumentKind({ filename, headers, charges });
  for (const c of charges) {
    c.kind = doc.kind;
    c.chargeKey = chargeKey({
      date: c.date,
      time: c.time,
      amountCents: c.amountCents,
      description: c.description,
      category: c.category,
      externalId: c.externalId,
      kind: c.kind
    });
  }

  return {
    charges,
    document: doc,
    detectedColumns: {
      date: headers[dateIdx],
      time: timeIdx >= 0 ? headers[timeIdx] : null,
      amount: headers[amountIdx],
      description: descIdx >= 0 ? headers[descIdx] : null,
      category: catIdx >= 0 ? headers[catIdx] : null,
      id: idIdx >= 0 ? headers[idIdx] : null
    },
    headers,
    rowCount: rows.length,
    dateRange: { from, to }
  };
}

function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return Buffer.from(buffer.slice(0, 5)).toString('utf8') === '%PDF-';
}

function looksLikeDelimitedText(buffer) {
  if (!buffer || !buffer.length) return false;
  const head = Buffer.from(buffer.slice(0, 4096)).toString('utf8');
  if (head.includes('\0')) return false;
  const first = (head.split(/\r?\n/).find((l) => l.trim()) || '').trim();
  if (!first) return false;
  const commas = (first.match(/,/g) || []).length;
  const tabs = (first.match(/\t/g) || []).length;
  return commas >= 1 || tabs >= 1;
}

/**
 * Parse GHL (or similar) billing export buffer into normalized charges.
 * Supports CSV / TSV / Excel / PDF (and extensionless or .txt delimited exports).
 */
async function parseGhlExport(buffer, filename) {
  const name = filename || 'export.csv';
  let headers;
  let rows;
  let parser = 'spreadsheet';
  let parseAs = name;

  if (isPdfFile(name) || looksLikePdf(buffer)) {
    const pdfName = isPdfFile(name) ? name : `${name}.pdf`;
    const pdf = await parseBillingPdf(buffer, pdfName);
    headers = pdf.headers;
    rows = pdf.rows;
    parser = pdf.parser || 'pdf';
  } else {
    const isSheet = /\.(xlsx|xls|xlsm|csv|tsv)$/i.test(name);
    if (!isSheet) {
      if (looksLikeDelimitedText(buffer)) {
        parseAs = /\.tsv$/i.test(name) ? name : String(name).replace(/(\.[^.]+)?$/, '') + '.csv';
      } else {
        const err = new Error(
          'Unsupported file. Drop a CSV, Excel (.xlsx), or PDF billing export.'
        );
        err.code = 'GHL_PARSE_UNSUPPORTED';
        throw err;
      }
    }
    const parsed = parseSpreadsheet(buffer, parseAs);
    headers = parsed.headers || [];
    rows = parsed.rows || [];
    parser = parsed.parser || 'spreadsheet';
  }

  const result = chargesFromTable(headers, rows, name);
  result.parser = parser;
  return result;
}

module.exports = {
  parseGhlExport,
  chargesFromTable,
  detectDocumentKind,
  categorize,
  chargeKey,
  parseAmount,
  parseDate,
  parseTime,
  CATEGORY_LABELS
};
