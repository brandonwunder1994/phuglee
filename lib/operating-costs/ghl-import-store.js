'use strict';

const fs = require('fs');
const path = require('path');
const { ensureRoot, rootDir } = require('./rate-card');
const { parseGhlExport, CATEGORY_LABELS } = require('./ghl-export-parse');

const MAX_FILES_PER_IMPORT = 5;

function storePath() {
  return path.join(rootDir(), 'ghl-charges.json');
}

function emptyWalletBalance() {
  return {
    balanceAfterUsd: null,
    totalIncludingCreditsUsd: null,
    asOfDate: null,
    asOfTime: null,
    sourceFile: null,
    updatedAt: null
  };
}

function emptyState() {
  return {
    version: 2,
    charges: [],
    chargeKeys: {},
    watermark: {
      lastChargeAt: null,
      lastChargeTime: null,
      lastChargeKey: null,
      lastChargeDescription: null,
      lastChargeAmountUsd: null,
      lastChargeKind: null,
      coveredFrom: null,
      coveredTo: null,
      importCount: 0,
      lastImportAt: null,
      lastFilename: null,
      pickUpDate: null,
      pickUpHint: null
    },
    walletBalance: emptyWalletBalance(),
    imports: [],
    updatedAt: null
  };
}

function walletStamp(wb) {
  if (!wb || !wb.asOfDate) return '';
  return `${wb.asOfDate}T${wb.asOfTime || '00:00:00'}`;
}

function maybeUpdateWalletBalance(state, snap, filename) {
  if (!snap || (snap.balanceAfterUsd == null && snap.totalIncludingCreditsUsd == null)) return;
  const next = {
    balanceAfterUsd: snap.balanceAfterUsd,
    totalIncludingCreditsUsd: snap.totalIncludingCreditsUsd,
    asOfDate: snap.asOfDate || null,
    asOfTime: snap.asOfTime || null,
    sourceFile: filename || null,
    updatedAt: new Date().toISOString()
  };
  const cur = state.walletBalance || emptyWalletBalance();
  if (!cur.asOfDate || walletStamp(next) >= walletStamp(cur)) {
    state.walletBalance = next;
  }
}

/** Rebuild wallet balance from newest usage row that carried a balance snapshot. */
function rebuildWalletBalanceFromCharges(state) {
  const usage = (state.charges || []).filter(
    (c) =>
      (c.kind === 'usage' || c.kind === 'transactions') &&
      (c.walletBalanceAfterUsd != null || c.walletBalanceTotalUsd != null)
  );
  if (!usage.length) return;
  usage.sort(compareChargeOrder);
  const last = usage[usage.length - 1];
  maybeUpdateWalletBalance(
    state,
    {
      balanceAfterUsd: last.walletBalanceAfterUsd,
      totalIncludingCreditsUsd: last.walletBalanceTotalUsd,
      asOfDate: last.date,
      asOfTime: last.time || null
    },
    last.sourceFile || null
  );
}

function load() {
  try {
    const file = storePath();
    if (!fs.existsSync(file)) return emptyState();
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const state = {
      ...emptyState(),
      ...raw,
      watermark: { ...emptyState().watermark, ...(raw.watermark || {}) },
      walletBalance: { ...emptyWalletBalance(), ...(raw.walletBalance || {}) }
    };
    state.chargeKeys = state.chargeKeys || {};
    for (const c of state.charges || []) {
      if (c.chargeKey) state.chargeKeys[c.chargeKey] = true;
    }
    if (!state.watermark.pickUpHint || !state.watermark.pickUpDate) {
      rebuildWatermarkFromCharges(state);
    }
    if (state.walletBalance.balanceAfterUsd == null && state.walletBalance.totalIncludingCreditsUsd == null) {
      rebuildWalletBalanceFromCharges(state);
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
  const keys = {};
  for (const c of state.charges || []) {
    if (c.chargeKey) keys[c.chargeKey] = true;
  }
  const out = {
    version: 2,
    charges: state.charges,
    chargeKeys: keys,
    watermark: state.watermark,
    walletBalance: state.walletBalance || emptyWalletBalance(),
    imports: (state.imports || []).slice(-60),
    updatedAt: state.updatedAt
  };
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
  fs.renameSync(tmp, file);
  return out;
}

function compareChargeOrder(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time || '';
  const tb = b.time || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return String(a.chargeKey).localeCompare(String(b.chargeKey));
}

function rebuildWatermarkFromCharges(state) {
  const charges = state.charges || [];
  if (!charges.length) {
    state.watermark.coveredFrom = null;
    state.watermark.coveredTo = null;
    state.watermark.lastChargeAt = null;
    state.watermark.lastChargeTime = null;
    state.watermark.lastChargeKey = null;
    state.watermark.lastChargeDescription = null;
    state.watermark.lastChargeAmountUsd = null;
    state.watermark.lastChargeKind = null;
    state.watermark.pickUpDate = null;
    state.watermark.pickUpHint =
      'No GHL charges imported yet. Export invoices and transaction ledgers, then drop them here.';
    return;
  }

  const sorted = charges.slice().sort(compareChargeOrder);
  state.watermark.coveredFrom = sorted[0].date;
  const last = sorted[sorted.length - 1];
  state.watermark.coveredTo = last.date;
  state.watermark.lastChargeAt = last.date;
  state.watermark.lastChargeTime = last.time || null;
  state.watermark.lastChargeKey = last.chargeKey;
  state.watermark.lastChargeDescription = last.description || null;
  state.watermark.lastChargeAmountUsd = last.amountUsd;
  state.watermark.lastChargeKind = last.kind || null;
  // Same calendar day can get new charges after a morning import — always re-export from this date.
  state.watermark.pickUpDate = last.date;
  const when = last.time ? `${last.date} ${last.time}` : last.date;
  state.watermark.pickUpHint =
    `Latest charge on file: ${when}` +
    (last.description ? ` — ${String(last.description).slice(0, 80)}` : '') +
    `. Imports are not cut off by date — every row is considered, and only duplicate transaction/charge IDs are skipped.`;
}

/**
 * Import one or more GHL export buffers (max 5). Dedupes by chargeKey so re-exports
 * of the same day only add *new* charges. Supports CSV, Excel, and PDF.
 * @param {{ data: Buffer, filename: string }[]} files
 */
async function importGhlExports(files) {
  const list = Array.isArray(files) ? files.filter((f) => f && f.data) : [];
  if (!list.length) {
    const err = new Error('No file uploaded');
    err.code = 'NO_FILE';
    throw err;
  }
  if (list.length > MAX_FILES_PER_IMPORT) {
    const err = new Error(`Upload up to ${MAX_FILES_PER_IMPORT} files at a time`);
    err.code = 'TOO_MANY_FILES';
    throw err;
  }

  const state = load();
  const fileResults = [];
  let newCount = 0;
  let duplicateCount = 0;
  let parsedCharges = 0;
  let rowCount = 0;
  const added = [];
  let rangeFrom = null;
  let rangeTo = null;

  for (const file of list) {
    const filename = file.filename || 'ghl-export.csv';
    let parsed;
    try {
      parsed = await parseGhlExport(file.data, filename);
    } catch (err) {
      fileResults.push({
        ok: false,
        filename,
        error: err.message || String(err),
        code: err.code || 'GHL_PARSE_FAILED',
        headers: err.headers || undefined
      });
      continue;
    }

    if (!parsed.charges || !parsed.charges.length) {
      fileResults.push({
        ok: false,
        filename,
        error:
          'No charges found in this file. For HighLevel CSV, Date columns look like "Jul 14th 2026, 01:14:33 PM".',
        code: 'GHL_PARSE_EMPTY',
        document: parsed.document || null,
        rowCount: parsed.rowCount || 0,
        detectedColumns: parsed.detectedColumns || null
      });
      continue;
    }

    let fileNew = 0;
    let fileDup = 0;
    for (const c of parsed.charges) {
      if (state.chargeKeys[c.chargeKey]) {
        fileDup += 1;
        duplicateCount += 1;
        continue;
      }
      state.chargeKeys[c.chargeKey] = true;
      const record = {
        ...c,
        importedAt: new Date().toISOString(),
        sourceFile: filename
      };
      state.charges.push(record);
      added.push(record);
      fileNew += 1;
      newCount += 1;
    }

    parsedCharges += parsed.charges.length;
    rowCount += parsed.rowCount;
    if (parsed.dateRange?.from && (!rangeFrom || parsed.dateRange.from < rangeFrom)) {
      rangeFrom = parsed.dateRange.from;
    }
    if (parsed.dateRange?.to && (!rangeTo || parsed.dateRange.to > rangeTo)) {
      rangeTo = parsed.dateRange.to;
    }

    if (parsed.walletBalance) {
      maybeUpdateWalletBalance(state, parsed.walletBalance, filename);
    }

    fileResults.push({
      ok: true,
      filename,
      document: parsed.document,
      parser: parsed.parser || null,
      newCount: fileNew,
      duplicateCount: fileDup,
      parsedCharges: parsed.charges.length,
      rowCount: parsed.rowCount,
      dateRange: parsed.dateRange,
      detectedColumns: parsed.detectedColumns,
      walletBalance: parsed.walletBalance || null
    });
  }

  state.charges.sort(compareChargeOrder);
  rebuildWatermarkFromCharges(state);
  rebuildWalletBalanceFromCharges(state);
  state.watermark.importCount = (state.watermark.importCount || 0) + 1;
  state.watermark.lastImportAt = new Date().toISOString();
  state.watermark.lastFilename = list.map((f) => f.filename || 'file').join(', ');

  state.imports.push({
    at: state.watermark.lastImportAt,
    filenames: list.map((f) => f.filename || 'file'),
    fileResults,
    rowCount,
    parsedCharges,
    newCount,
    duplicateCount,
    dateRange: { from: rangeFrom, to: rangeTo }
  });

  save(state);

  const failed = fileResults.filter((f) => !f.ok);
  if (failed.length === fileResults.length) {
    const err = new Error(failed[0]?.error || 'All files failed to parse');
    err.code = failed[0]?.code || 'GHL_IMPORT_FAILED';
    err.headers = failed[0]?.headers;
    err.fileResults = fileResults;
    throw err;
  }

  return {
    ok: true,
    fileCount: list.length,
    fileResults,
    newCount,
    duplicateCount,
    parsedCharges,
    rowCount,
    dateRange: { from: rangeFrom, to: rangeTo },
    watermark: state.watermark,
    walletBalance: state.walletBalance || emptyWalletBalance()
  };
}

/** @deprecated single-file helper — use importGhlExports */
async function importGhlExport(buffer, filename) {
  return importGhlExports([{ data: buffer, filename }]);
}

function listCharges({ from, to, category, kind } = {}) {
  const state = load();
  let list = state.charges || [];
  if (from) list = list.filter((c) => c.date >= from);
  if (to) list = list.filter((c) => c.date <= to);
  if (category && category !== 'all') {
    list = list.filter((c) => c.category === category);
  }
  if (kind && kind !== 'all') {
    list = list.filter((c) => c.kind === kind);
  }
  const spendList = list.filter(isSpendCharge);
  const topupList = list.filter((c) => c.kind === 'topup');
  function familyBucket(rows, kind, label, extra = {}) {
    return {
      kind,
      label,
      count: rows.length,
      totalUsd: Number(rows.reduce((sum, c) => sum + (Number(c.amountUsd) || 0), 0).toFixed(2)),
      ...extra
    };
  }
  return {
    charges: list,
    watermark: state.watermark,
    walletBalance: state.walletBalance || emptyWalletBalance(),
    totalUsd: Number(
      (spendList.reduce((sum, c) => sum + (Number(c.amountUsd) || 0), 0)).toFixed(2)
    ),
    topupUsd: Number(
      (topupList.reduce((sum, c) => sum + (Number(c.amountUsd) || 0), 0)).toFixed(2)
    ),
    byCategory: summarizeByCategory(spendList),
    byKind: summarizeByKind(list),
    byFamily: {
      usage: familyBucket(
        list.filter((c) => c.kind === 'usage' || c.kind === 'transactions'),
        'usage',
        KIND_SUMMARY_LABELS.usage
      ),
      topup: familyBucket(topupList, 'topup', KIND_SUMMARY_LABELS.topup, { isFunding: true }),
      tax: familyBucket(
        list.filter((c) => c.kind === 'tax' || c.category === 'tax'),
        'tax',
        KIND_SUMMARY_LABELS.tax
      )
    }
  };
}

function summarizeByCategory(charges) {
  const out = {};
  for (const c of charges) {
    const cat = c.category || 'other';
    if (!out[cat]) {
      out[cat] = {
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        count: 0,
        totalUsd: 0
      };
    }
    out[cat].count += 1;
    out[cat].totalUsd += Number(c.amountUsd) || 0;
  }
  return Object.values(out)
    .map((x) => ({ ...x, totalUsd: Number(x.totalUsd.toFixed(2)) }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

const KIND_SUMMARY_LABELS = {
  usage: 'Wallet usage',
  topup: 'Wallet top-ups',
  tax: 'Sales tax',
  invoice: 'Invoices',
  transactions: 'Transactions',
  unknown: 'Other'
};

function summarizeByKind(charges) {
  const out = {};
  for (const c of charges) {
    const kind = c.kind || 'unknown';
    if (!out[kind]) out[kind] = { kind, count: 0, totalUsd: 0 };
    out[kind].count += 1;
    out[kind].totalUsd += Number(c.amountUsd) || 0;
  }
  return Object.values(out)
    .map((x) => ({
      ...x,
      label: KIND_SUMMARY_LABELS[x.kind] || x.kind,
      totalUsd: Number(x.totalUsd.toFixed(2)),
      isFunding: x.kind === 'topup'
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

/** Operating spend (excludes wallet top-ups / funding). */
function isSpendCharge(c) {
  if (!c) return false;
  if (c.kind === 'topup') return false;
  if (c.category === 'subscription') return false;
  return true;
}

function periodBounds(period) {
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
  MAX_FILES_PER_IMPORT,
  load,
  save,
  importGhlExport,
  importGhlExports,
  listCharges,
  summarizeByCategory,
  summarizeByKind,
  isSpendCharge,
  rebuildWatermarkFromCharges,
  periodBounds,
  storePath,
  CATEGORY_LABELS,
  KIND_SUMMARY_LABELS
};
