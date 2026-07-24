'use strict';

/**
 * Vault → GHL phuglee-tag backfill progress.
 * Durable high-water mark survives redeploys when dataRoot is on PDA_DATA_ROOT.
 */

const fs = require('fs');
const path = require('path');
const { dataRoot, ensureDirs } = require('./sms-store');
const { writeJsonAtomic } = require('../write-json-atomic');
const { LEADS_CATALOG_ROOT } = require('../config');
const { PHUGLEE_TAG } = require('./sms-policy');

function progressPath() {
  return path.join(dataRoot(), 'backfill-progress.json');
}

function checkpointPath() {
  return path.join(dataRoot(), 'backfill-checkpoint.json');
}

/** Never-decrease watermark — last known best processed/tagged counts. */
function highWaterPath() {
  return path.join(dataRoot(), 'backfill-highwater.json');
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function nOr0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Same universe as Vault UI: every lead in the published catalog index.
 */
function countVaultLeads() {
  try {
    const store = require('../leads-platform/store');
    if (typeof store.getMeta === 'function') {
      const meta = store.getMeta({ surface: 'all' });
      const byType = meta?.byType || {};
      const homes =
        (Number(byType.distressed) || 0) + (Number(byType.well_maintained) || 0);
      const land = Number(byType.land) || 0;
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
 * Raise durable high-water + slim progress file. Never decreases processed/tagged.
 */
function persistProgressHighWater(partial = {}) {
  try {
    ensureDirs();
    const prevHw = readJson(highWaterPath(), {}) || {};
    const prevSlim = readJson(progressPath(), {}) || {};
    const nextProcessed = Math.max(
      nOr0(partial.processed),
      nOr0(prevHw.processed),
      nOr0(prevSlim.processed)
    );
    const nextTagged = Math.max(
      nOr0(partial.tagged),
      nOr0(prevHw.tagged),
      nOr0(prevSlim.tagged)
    );
    const nextSkipped = Math.max(
      nOr0(partial.skipped),
      nOr0(prevHw.skipped),
      nOr0(prevSlim.skipped)
    );
    const nextTotal = Math.max(
      nOr0(partial.total),
      nOr0(partial.vaultTotal),
      nOr0(prevHw.total),
      nOr0(prevSlim.total)
    );
    const ghl = partial.ghlPhugleeTagged != null
      ? Number(partial.ghlPhugleeTagged)
      : (prevHw.ghlPhugleeTagged != null ? Number(prevHw.ghlPhugleeTagged) : null);
    const row = {
      processed: nextProcessed,
      tagged: nextTagged,
      skipped: nextSkipped,
      total: nextTotal || undefined,
      ghlPhugleeTagged: Number.isFinite(ghl) ? ghl : undefined,
      source: partial.source || prevHw.source || prevSlim.source || 'highwater',
      updatedAt: new Date().toISOString()
    };
    writeJsonAtomic(highWaterPath(), row);
    writeJsonAtomic(progressPath(), {
      ...prevSlim,
      ...row
    });
    return row;
  } catch (err) {
    console.warn('[campaigns-sms] persist progress high-water failed:', err && err.message);
    return null;
  }
}

/**
 * Snapshot progress for the SMS admin UI.
 * Prefer the MAX of checkpoint / slim / high-water / live GHL so redeploys
 * and wiped local files cannot zero the bar after 10k+ work.
 */
function getBackfillProgress({ ghlPhugleeTotal = null, ghlError = null } = {}) {
  const vault = countVaultLeads();
  const cp = readJson(checkpointPath(), null);
  const slim = readJson(progressPath(), null);
  const hw = readJson(highWaterPath(), null);
  const fromCp = cp ? tallyCheckpoint(cp) : null;

  const ghlN = ghlPhugleeTotal != null && Number.isFinite(Number(ghlPhugleeTotal))
    ? Number(ghlPhugleeTotal)
    : null;

  const total =
    (vault && vault.total > 0)
      ? vault.total
      : nOr0(slim && slim.total) || nOr0(hw && hw.total) || nOr0(cp && cp.stats && cp.stats.total);

  // Never lose progress: take the best known processed count across all sources.
  let processed = Math.max(
    fromCp ? fromCp.processed : 0,
    nOr0(slim && slim.processed),
    nOr0(hw && hw.processed),
    ghlN != null ? ghlN : 0
  );
  let tagged = Math.max(
    fromCp ? fromCp.tagged : 0,
    nOr0(slim && slim.tagged),
    nOr0(hw && hw.tagged),
    ghlN != null ? ghlN : 0
  );
  let skipped = Math.max(
    fromCp ? fromCp.skipped : 0,
    nOr0(slim && slim.skipped),
    nOr0(hw && hw.skipped)
  );

  let source = 'none';
  if (fromCp && fromCp.processed > 0 && fromCp.processed >= processed - 0) {
    // Prefer naming the richest source for the UI
    if (fromCp.processed === processed) source = 'checkpoint';
  }
  if (source === 'none' && ghlN != null && ghlN === processed) source = 'ghl-live';
  if (source === 'none' && hw && nOr0(hw.processed) === processed) source = 'highwater';
  if (source === 'none' && slim && nOr0(slim.processed) === processed) source = 'progress-file';
  if (source === 'none' && processed > 0) source = 'merged';

  // If checkpoint is behind GHL (wiped redeploy), still show GHL-driven progress
  if (ghlN != null && ghlN > 0 && (!fromCp || fromCp.processed < ghlN)) {
    if (processed === ghlN) source = fromCp ? 'ghl-live+checkpoint' : 'ghl-live';
  }

  let ghlCoveragePct = null;
  if (ghlN != null && total > 0) {
    ghlCoveragePct = Math.min(100, Math.round((1000 * ghlN) / total) / 10);
  }

  let percent = total > 0
    ? Math.min(100, Math.round((1000 * processed) / total) / 10)
    : 0;

  // When vault count is missing but GHL has tags, still show coverage bar via GHL alone
  if (total <= 0 && ghlN != null && ghlN > 0) {
    percent = 100;
    processed = ghlN;
    tagged = Math.max(tagged, ghlN);
    source = 'ghl-live';
  }

  const lastAt =
    (fromCp && fromCp.lastAt)
    || (slim && slim.updatedAt)
    || (hw && hw.updatedAt)
    || (ghlN != null ? new Date().toISOString() : null);

  // Persist high-water so the next request (or next deploy on volume) keeps the peak
  if (processed > 0 || tagged > 0 || ghlN != null) {
    persistProgressHighWater({
      processed,
      tagged,
      skipped,
      total,
      vaultTotal: total,
      ghlPhugleeTagged: ghlN,
      source
    });
  }

  const complete = total > 0 && percent >= 100;

  return {
    temporary: true,
    label: 'One-time vault → GHL phuglee tag load (for SMS KPIs)',
    note: 'Progress is durable on the data volume (high-water mark). GHL tag count recovers the bar if checkpoint is missing.',
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
    ghlPhugleeTagged: ghlN,
    ghlCoveragePct,
    ghlError: ghlError || null,
    source,
    updatedAt: lastAt,
    phugleeTag: PHUGLEE_TAG,
    durableRoot: dataRoot()
  };
}

/** Called by the backfill script so the UI can poll a small file. */
function writeBackfillProgress(partial = {}) {
  ensureDirs();
  const prev = readJson(progressPath(), {});
  const next = {
    ...prev,
    ...partial,
    processed: Math.max(nOr0(partial.processed), nOr0(prev.processed)),
    tagged: Math.max(nOr0(partial.tagged), nOr0(prev.tagged)),
    skipped: Math.max(nOr0(partial.skipped), nOr0(prev.skipped)),
    updatedAt: new Date().toISOString()
  };
  writeJsonAtomic(progressPath(), next);
  persistProgressHighWater(next);
  return next;
}

module.exports = {
  getBackfillProgress,
  writeBackfillProgress,
  persistProgressHighWater,
  countVaultLeads,
  progressPath,
  checkpointPath,
  highWaterPath
};
