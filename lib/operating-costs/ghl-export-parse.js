'use strict';

const crypto = require('crypto');
const { parseSpreadsheet } = require('../bridge-engine/parsers/spreadsheet');

const CATEGORY_RULES = [
  { id: 'subscription', re: /\b(subscription|plan|agency|starter|unlimited|saas\s*pro|membership|monthly fee)\b/i },
  { id: 'sms', re: /\b(sms|text\s*message|lc\s*sms|twilio\s*sms|message\s*segment)\b/i },
  { id: 'phone', re: /\b(phone|voice|call|minutes|lc\s*phone|twilio\s*voice|inbound|outbound)\b/i },
  { id: 'email', re: /\b(email|mailgun|lc\s*email|smtp)\b/i },
  { id: 'ai', re: /\b(ai\b|conversation\s*ai|voice\s*ai|agent\s*studio|openai|gpt)\b/i },
  { id: 'numbers', re: /\b(phone\s*number|local\s*number|toll[\s-]?free|did|10dlc|a2p)\b/i }
];

const DATE_HEADERS = [/date/i, /trans(?:action)?\s*date/i, /created/i, /charged/i, /when/i];
const AMOUNT_HEADERS = [/amount/i, /charge/i, /cost/i, /total/i, /price/i, /usd/i];
const DESC_HEADERS = [/description/i, /desc/i, /details?/i, /memo/i, /item/i, /product/i, /name/i];
const CAT_HEADERS = [/categor/i, /type/i, /service/i, /product\s*type/i];
const ID_HEADERS = [/transaction\s*id/i, /\bid\b/i, /charge\s*id/i, /reference/i, /txn/i];

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
  // Excel serial
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
    // US preference: M/D/Y when first > 12 swap assumption; else assume M/D/Y
    const iso = new Date(Date.UTC(y, month - 1, day));
    if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }
  return null;
}

function categorize(description, categoryHint) {
  const blob = `${categoryHint || ''} ${description || ''}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(blob)) return rule.id;
  }
  return 'other';
}

function chargeKey({ date, amountCents, description, category, externalId }) {
  const basis = externalId
    ? `id:${externalId}`
    : `${date}|${amountCents}|${String(description || '').trim().toLowerCase()}|${category}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 24);
}

/**
 * Parse GHL (or similar) billing export buffer into normalized charges.
 * @returns {{ charges: object[], detectedColumns: object, rowCount: number, dateRange: { from: string|null, to: string|null } }}
 */
function parseGhlExport(buffer, filename) {
  const parsed = parseSpreadsheet(buffer, filename || 'export.csv');
  const headers = parsed.headers || [];
  const rows = parsed.rows || [];

  const dateIdx = findCol(headers, DATE_HEADERS);
  const amountIdx = findCol(headers, AMOUNT_HEADERS);
  const descIdx = findCol(headers, DESC_HEADERS);
  const catIdx = findCol(headers, CAT_HEADERS);
  const idIdx = findCol(headers, ID_HEADERS);

  if (dateIdx < 0 || amountIdx < 0) {
    const err = new Error(
      'Could not find Date and Amount columns. Export should include date and amount headers.'
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
    const description = descIdx >= 0 ? String(cellAt(row, descIdx) || '').trim() : '';
    const categoryHint = catIdx >= 0 ? String(cellAt(row, catIdx) || '').trim() : '';
    const externalId = idIdx >= 0 ? String(cellAt(row, idIdx) || '').trim() : '';
    const category = categorize(description, categoryHint);
    const amountCents = Math.round(amount * 100);
    const key = chargeKey({ date, amountCents, description, category, externalId: externalId || null });
    charges.push({
      chargeKey: key,
      date,
      amountUsd: Number((amountCents / 100).toFixed(2)),
      amountCents,
      description,
      category,
      categoryHint: categoryHint || null,
      externalId: externalId || null
    });
    if (!from || date < from) from = date;
    if (!to || date > to) to = date;
  }

  return {
    charges,
    detectedColumns: {
      date: headers[dateIdx],
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

module.exports = {
  parseGhlExport,
  categorize,
  chargeKey,
  parseAmount,
  parseDate
};
