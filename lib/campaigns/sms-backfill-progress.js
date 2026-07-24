'use strict';

/**
 * TEMP: one-time vault → GHL phuglee-tag backfill progress.
 * Safe to delete this module + UI once backfill is complete.
 */

const fs = require('fs');
const path = require('path');
const { dataRoot } = require('./sms-store');
const { LEADS_CATALOG_ROOT } = require('../config');
const { PHUGLEE_TAG } = require('./sms-policy');

function progressPath() {
  return path.join(dataRoot(), 'backfill-progress.json');
}

function checkpointPath() {
  return path.join(dataRoot(), 'backfill-checkpoint.json');
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

/**
 * Same universe as Vault UI: every lead in the published catalog index.
 * Breaks out homes (distressed + well_maintained) vs land lots.
 */
function countVaultLeads() {
  // Prefer the live leads store (same index Vault / meta uses)
  try {
    const store = require('../leads-platform/store');
    if (typeof store.getMeta === 'function') {
      const meta = store.getMeta({ surface: 'all' });
      const byType = meta?.byType || {};
      const homes =
        (Number(byType.distressed) || 0) + (Number(byType.well_maintained) || 0);
      const land = Number(byType.land) || 0;
      // catalogTotal = full index rows; total = active only (matches vault chips)
      const catalogTotal = Number(meta?.catalogTotal);
      const activeTotal = Number(meta?.total);
      const total = Number.isFinite(catalogTotal) && catalogTotal > 0
        ? catalogTotal
        : (Number.isFinite(activeTotal) ? activeTotal : homes + land);
      return {
        total,
        active: Number.isFinite(activeTotal) ? activeTotal : total,
        homes,
        land,
        byType: {
          distressed: Number(byType.distressed) || 0,
          well_maintained: Number(byType.well_maintained) || 0,
          land
        }
      };
    }
  } catch (_) {
    /* fall through to raw index */
  }

  const indexFile = path.join(LEADS_CATALOG_ROOT, 'index.json');
  try {
    if (!fs.existsSync(indexFile)) {
      return { total: 0, active: 0, homes: 0, land: 0, byType: {} };
    }
    const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const leads = Array.isArray(idx.leads) ? idx.leads : [];
    let homes = 0;
    let land = 0;
    let active = 0;
    let distressed = 0;
    let well = 0;
    for (const row of leads) {
      const status = String(row.catalogStatus || 'active').toLowerCase();
      if (status === 'active') active += 1;
      const t = String(row.leadType || '');
      if (t === 'land') land += 1;
      else {
        homes += 1;
        if (t === 'distressed') distressed += 1;
        else if (t === 'well_maintained') well += 1;
      }
    }
    const total = leads.length
      || (Number.isFinite(Number(idx.total)) ? Number(idx.total) : 0)
      || (Number.isFinite(Number(idx.count)) ? Number(idx.count) : 0);
    return {
      total,
      active: active || total,
      homes,
      land,
      byType: { distressed, well_maintained: well, land }
    };
  } catch (_) {
    return { total: 0, active: 0, homes: 0, land: 0, byType: {} };
  }
}

function tallyCheckpoint(cp) {
  const done = cp && cp.done && typeof cp.done === 'object' ? cp.done : {};
  const ids = Object.keys(done);
  let tagged = 0;
  let skipped = 0;
  let dryRun = 0;
  let lastAt = null;
  for (const id of ids) {
    const row = done[id] || {};
    if (row.contactId && !row.skipped) {
      tagged += 1;
      if (row.dryRun) dryRun += 1;
    } else if (row.skipped) {
      skipped += 1;
    }
    if (row.at && (!lastAt || row.at > lastAt)) lastAt = row.at;
  }
  return {
    processed: ids.length,
    tagged,
    skipped,
    dryRun,
    lastAt
  };
}

/**
 * Snapshot progress for the SMS admin UI.
 * Prefer checkpoint (local/resume); fall back to slim progress.json.
 * Optional ghlPhugleeTotal from caller for live GHL coverage on Railway.
 */
function getBackfillProgress({ ghlPhugleeTotal = null } = {}) {
  const vault = countVaultLeads();
  const cp = readJson(checkpointPath(), null);
  const slim = readJson(progressPath(), null);
  const fromCp = cp ? tallyCheckpoint(cp) : null;

  let processed = fromCp ? fromCp.processed : (slim && Number(slim.processed)) || 0;
  let tagged = fromCp ? fromCp.tagged : (slim && Number(slim.tagged)) || 0;
  let skipped = fromCp ? fromCp.skipped : (slim && Number(slim.skipped)) || 0;
  let lastAt = (fromCp && fromCp.lastAt) || (slim && slim.updatedAt) || null;

  // Always prefer live vault catalog counts (homes + lots). Never stick to a
  // stale slim/checkpoint total that under-counts after vault grew.
  const total =
    (vault && vault.total > 0)
      ? vault.total
      : (slim && Number(slim.total)) || (cp && cp.stats && Number(cp.stats.total)) || 0;

  let ghlCoveragePct = null;
  if (ghlPhugleeTotal != null && total > 0) {
    ghlCoveragePct = Math.min(100, Math.round((1000 * Number(ghlPhugleeTotal)) / total) / 10);
  }

  let source = fromCp ? 'checkpoint' : (slim ? 'progress-file' : 'none');
  let percent = total > 0
    ? Math.min(100, Math.round((1000 * processed) / total) / 10)
    : 0;

  // On hosts without a local checkpoint (e.g. Railway), use live GHL
  // phuglee contact count vs vault size so the bar still moves as backfill tags land.
  if ((!fromCp || processed === 0) && ghlPhugleeTotal != null && total > 0 && !fromCp) {
    percent = ghlCoveragePct != null ? ghlCoveragePct : 0;
    processed = Number(ghlPhugleeTotal) || 0;
    tagged = processed;
    source = 'ghl-live';
    if (!lastAt) lastAt = new Date().toISOString();
  }

  const complete = total > 0 && percent >= 100;

  return {
    temporary: true,
    label: 'One-time vault → GHL phuglee tag load (for SMS KPIs)',
    note: 'Temp tracker — delete after backfill finishes. Future vault imports keep tags current.',
    vaultTotal: total,
    vaultActive: vault.active || total,
    vaultHomes: vault.homes || 0,
    vaultLand: vault.land || 0,
    vaultByType: vault.byType || {},
    processed,
    tagged,
    skipped,
    percent,
    complete,
    ghlPhugleeTagged: ghlPhugleeTotal != null ? Number(ghlPhugleeTotal) : null,
    ghlCoveragePct,
    source,
    updatedAt: lastAt || (slim && slim.updatedAt) || null,
    phugleeTag: PHUGLEE_TAG
  };
}

/** Called by the backfill script so the UI can poll a small file. */
function writeBackfillProgress(partial = {}) {
  const root = dataRoot();
  fs.mkdirSync(root, { recursive: true });
  const prev = readJson(progressPath(), {});
  const next = {
    ...prev,
    ...partial,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(progressPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  getBackfillProgress,
  writeBackfillProgress,
  countVaultLeads,
  progressPath,
  checkpointPath
};
