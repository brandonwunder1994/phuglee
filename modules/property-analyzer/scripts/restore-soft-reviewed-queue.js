#!/usr/bin/env node
/**
 * Restore leads falsely marked reviewed by soft vias:
 *   review_session (bulk commit on filter switch / exit)
 *   review_skip / review_missing (queue advance stamp)
 *
 * Does NOT clear real Keep / Change / Defer / Blur decisions.
 *
 * Usage:
 *   node modules/property-analyzer/scripts/restore-soft-reviewed-queue.js
 *   node modules/property-analyzer/scripts/restore-soft-reviewed-queue.js --session path/to/session.json
 */
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../lib/fs-atomic');

const SOFT_VIAS = new Set(['review_session', 'review_skip', 'review_missing']);
const BUCKETS = [
  'distressed',
  'well_maintained',
  'vacant',
  'review',
  'low_confidence',
  'blurred',
  'satellite_only'
];

function recordKey(r) {
  return `${r.email || ''}|${r.phone || ''}|${r.address || ''}`;
}

function clearSoftReview(r) {
  const next = { ...r };
  delete next.manuallyReviewed;
  delete next.manuallyReviewedAt;
  delete next.manuallyReviewedVia;
  delete next.reviewResolved;
  delete next.reviewResolvedAt;
  return next;
}

function isSoftMarked(r) {
  if (!r) return false;
  return SOFT_VIAS.has(String(r.manuallyReviewedVia || ''));
}

function removeKeyFromBuckets(buckets, key) {
  for (const bucket of BUCKETS) {
    if (!Array.isArray(buckets[bucket])) continue;
    buckets[bucket] = buckets[bucket].filter((k) => k !== key);
  }
}

function resetProgressQueues(data, nextResults) {
  if (!data.reviewProgressByFilter) data.reviewProgressByFilter = {};
  for (const filter of Object.keys(data.reviewProgressByFilter)) {
    const prog = data.reviewProgressByFilter[filter] || {};
    data.reviewProgressByFilter[filter] = {
      ...prog,
      queue: [],
      index: 0
    };
  }
  data.reviewQueue = [];
  data.reviewIndex = 0;
  data.reviewMode = false;
  data.results = nextResults;
}

function restoreSession(sessionFile) {
  if (!fs.existsSync(sessionFile)) {
    console.error('Session not found:', sessionFile);
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFile = sessionFile.replace(/\.json$/i, '') + `_BEFORE_SOFT_RESTORE_${stamp}.json`;
  const raw = fs.readFileSync(sessionFile, 'utf8');
  fs.writeFileSync(backupFile, raw, 'utf8');

  const data = JSON.parse(raw);
  const results = Array.isArray(data.results) ? data.results : [];
  const buckets = data.reviewedKeysByFilter || {};
  const sample = [];
  const byVia = {};
  let cleared = 0;

  const nextResults = results.map((r) => {
    if (!isSoftMarked(r)) return r;
    const via = String(r.manuallyReviewedVia || '');
    byVia[via] = (byVia[via] || 0) + 1;
    cleared += 1;
    const key = recordKey(r);
    removeKeyFromBuckets(buckets, key);
    if (sample.length < 8) sample.push(r.address || key);
    return clearSoftReview(r);
  });

  resetProgressQueues(data, nextResults);
  data.reviewedKeysByFilter = buckets;
  data.savedAt = Date.now();
  data.restoreNote = `Cleared ${cleared} soft-reviewed leads at ${new Date().toISOString()}`;

  writeFileAtomic(sessionFile, JSON.stringify(data));

  let pending = 0;
  for (const r of nextResults) {
    if (!r.manuallyReviewed && !r.reviewResolved) pending += 1;
  }

  return {
    sessionFile,
    backupFile,
    total: results.length,
    cleared,
    pending,
    byVia,
    sample
  };
}

function defaultSessions() {
  const roots = [];
  if (process.env.PDA_DATA_ROOT) {
    roots.push(path.resolve(process.env.PDA_DATA_ROOT));
  }
  roots.push(path.join(__dirname, '..', 'users'));

  const out = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const user of fs.readdirSync(root, { withFileTypes: true })) {
      if (!user.isDirectory()) continue;
      const session = path.join(root, user.name, 'distressAnalyzerSession_LATEST.json');
      if (fs.existsSync(session)) out.push(session);
    }
  }
  return [...new Set(out)];
}

function main() {
  const argIdx = process.argv.indexOf('--session');
  const sessions = argIdx >= 0 && process.argv[argIdx + 1]
    ? [path.resolve(process.argv[argIdx + 1])]
    : defaultSessions();

  if (!sessions.length) {
    console.error('No session files found');
    process.exit(1);
  }

  const reports = [];
  for (const session of sessions) {
    const report = restoreSession(session);
    if (report) reports.push(report);
  }

  console.log(JSON.stringify({ ok: true, reports }, null, 2));
}

main();
