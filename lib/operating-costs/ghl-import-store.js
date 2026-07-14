'use strict';

const fs = require('fs');
const path = require('path');
const { ensureRoot, rootDir } = require('./rate-card');
const { parseGhlExport } = require('./ghl-export-parse');

function storePath() {
  return path.join(rootDir(), 'ghl-charges.json');
}

function emptyState() {
  return {
    version: 1,
    charges: [],
    chargeKeys: {},
    watermark: {
      lastChargeAt: null,
      lastChargeKey: null,
      coveredFrom: null,
      coveredTo: null,
      importCount: 0,
      lastImportAt: null,
      lastFilename: null
    },
    imports: [],
    updatedAt: null
  };
}

function load() {
  try {
    const file = storePath();
    if (!fs.existsSync(file)) return emptyState();
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const state = { ...emptyState(), ...raw };
    state.chargeKeys = state.chargeKeys || {};
    for (const c of state.charges || []) {
      if (c.chargeKey) state.chargeKeys[c.chargeKey] = true;
    }
    return state;
  } catch (_) {
    return emptyState();
  }
}

function save(state) {
  ensureRoot();
  state.updatedAt = new Date().toISOString();
  const file = storePath();
  const tmp = `${file}.${process.pid}.tmp`;
  // Don't persist huge chargeKeys map separately — rebuild from charges on load;
  // still write a compact key set for faster duplicate checks on next load.
  const keys = {};
  for (const c of state.charges || []) {
    if (c.chargeKey) keys[c.chargeKey] = true;
  }
  const out = {
    version: 1,
    charges: state.charges,
    chargeKeys: keys,
    watermark: state.watermark,
    imports: (state.imports || []).slice(-40),
    updatedAt: state.updatedAt
  };
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
  fs.renameSync(tmp, file);
  return out;
}

function advanceWatermark(state, charges) {
  let from = state.watermark.coveredFrom;
  let to = state.watermark.coveredTo;
  let lastAt = state.watermark.lastChargeAt;
  let lastKey = state.watermark.lastChargeKey;
  for (const c of charges) {
    if (!from || c.date < from) from = c.date;
    if (!to || c.date > to) to = c.date;
    if (!lastAt || c.date > lastAt || (c.date === lastAt && c.chargeKey > lastKey)) {
      lastAt = c.date;
      lastKey = c.chargeKey;
    }
  }
  state.watermark.coveredFrom = from;
  state.watermark.coveredTo = to;
  state.watermark.lastChargeAt = lastAt;
  state.watermark.lastChargeKey = lastKey;
}

/**
 * Import a GHL export buffer; dedupe by chargeKey.
 */
function importGhlExport(buffer, filename) {
  const parsed = parseGhlExport(buffer, filename);
  const state = load();
  let newCount = 0;
  let duplicateCount = 0;
  const added = [];

  for (const c of parsed.charges) {
    if (state.chargeKeys[c.chargeKey]) {
      duplicateCount += 1;
      continue;
    }
    state.chargeKeys[c.chargeKey] = true;
    const record = {
      ...c,
      importedAt: new Date().toISOString(),
      sourceFile: filename || null
    };
    state.charges.push(record);
    added.push(record);
    newCount += 1;
  }

  advanceWatermark(state, added.length ? added : []);
  state.watermark.importCount = (state.watermark.importCount || 0) + 1;
  state.watermark.lastImportAt = new Date().toISOString();
  state.watermark.lastFilename = filename || null;

  state.imports.push({
    at: state.watermark.lastImportAt,
    filename: filename || null,
    rowCount: parsed.rowCount,
    parsedCharges: parsed.charges.length,
    newCount,
    duplicateCount,
    dateRange: parsed.dateRange,
    detectedColumns: parsed.detectedColumns
  });

  // Keep charges sorted by date then key
  state.charges.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.chargeKey).localeCompare(String(b.chargeKey));
  });

  save(state);

  return {
    ok: true,
    newCount,
    duplicateCount,
    parsedCharges: parsed.charges.length,
    rowCount: parsed.rowCount,
    dateRange: parsed.dateRange,
    detectedColumns: parsed.detectedColumns,
    watermark: state.watermark
  };
}

function listCharges({ from, to, category } = {}) {
  const state = load();
  let list = state.charges || [];
  if (from) list = list.filter((c) => c.date >= from);
  if (to) list = list.filter((c) => c.date <= to);
  if (category && category !== 'all') {
    list = list.filter((c) => c.category === category);
  }
  return {
    charges: list,
    watermark: state.watermark,
    totalUsd: Number(
      (list.reduce((sum, c) => sum + (Number(c.amountUsd) || 0), 0)).toFixed(2)
    ),
    byCategory: summarizeByCategory(list)
  };
}

function summarizeByCategory(charges) {
  const out = {};
  for (const c of charges) {
    const cat = c.category || 'other';
    if (!out[cat]) out[cat] = { category: cat, count: 0, totalUsd: 0 };
    out[cat].count += 1;
    out[cat].totalUsd += Number(c.amountUsd) || 0;
  }
  return Object.values(out)
    .map((x) => ({ ...x, totalUsd: Number(x.totalUsd.toFixed(2)) }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

function periodBounds(period) {
  // period: YYYY-MM or 'current'
  const now = new Date();
  let y;
  let m;
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    y = Number(period.slice(0, 4));
    m = Number(period.slice(5, 7));
  } else {
    y = now.getUTCFullYear();
    m = now.getUTCMonth() + 1;
  }
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { period: `${y}-${String(m).padStart(2, '0')}`, from, to };
}

module.exports = {
  load,
  save,
  importGhlExport,
  listCharges,
  summarizeByCategory,
  periodBounds,
  storePath
};
