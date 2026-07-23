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

function countVaultLeads() {
  const indexFile = path.join(LEADS_CATALOG_ROOT, 'index.json');
  try {
    if (!fs.existsSync(indexFile)) return 0;
    const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    if (Array.isArray(idx.leads)) return idx.leads.length;
    if (Number.isFinite(Number(idx.total))) return Number(idx.total);
    if (Number.isFinite(Number(idx.count))) return Number(idx.count);
    return 0;
  } catch (_) {
    return 0;
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
  const vaultTotal = countVaultLeads();
  const cp = readJson(checkpointPath(), null);
  const slim = readJson(progressPath(), null);
  const fromCp = cp ? tallyCheckpoint(cp) : null;

  let processed = fromCp ? fromCp.processed : (slim && Number(slim.processed)) || 0;
  let tagged = fromCp ? fromCp.tagged : (slim && Number(slim.tagged)) || 0;
  let skipped = fromCp ? fromCp.skipped : (slim && Number(slim.skipped)) || 0;
  let lastAt = (fromCp && fromCp.lastAt) || (slim && slim.updatedAt) || null;

  // Prefer explicit total from last backfill run if vault catalog missing
  const total =
    vaultTotal > 0
      ? vaultTotal
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
  if (processed === 0 && ghlPhugleeTotal != null && total > 0) {
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
