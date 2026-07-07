#!/usr/bin/env node
/**
 * Restore Well Maintained leads that were bulk-marked reviewed (review_session migration)
 * but never manually reviewed by the user.
 */
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../lib/fs-atomic');

const ROOT = path.join(__dirname, '..');
const SESSION_FILE = path.join(ROOT, 'distressAnalyzerSession_LATEST.json');
const BUCKETS = ['distressed', 'well_maintained', 'vacant', 'review', 'low_confidence'];

function recordKey(r) {
  return `${r.email}|${r.phone}|${r.address}`;
}

function isWellMaintainedProperty(r) {
  if (!r || r.category !== 'property') return false;
  const tier = String(r.leadTier || '').replace('well-maintained', 'well_maintained');
  if (tier === 'well_maintained') return true;
  return typeof r.score === 'number' && r.score < 6;
}

function isExcludedFromReview(r) {
  if (!r) return true;
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed) return true;
  return false;
}

function buildPendingWellMaintainedQueue(results) {
  const keys = [];
  for (const r of results) {
    if (!isWellMaintainedProperty(r)) continue;
    if (isExcludedFromReview(r)) continue;
    keys.push(recordKey(r));
  }
  return keys;
}

function removeKeyFromBuckets(buckets, key) {
  for (const bucket of BUCKETS) {
    if (!Array.isArray(buckets[bucket])) continue;
    buckets[bucket] = buckets[bucket].filter((k) => k !== key);
  }
}

function clearManuallyReviewed(r) {
  const next = { ...r };
  delete next.manuallyReviewed;
  delete next.manuallyReviewedAt;
  delete next.manuallyReviewedVia;
  return next;
}

function main() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('Session file not found:', SESSION_FILE);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFile = path.join(ROOT, `distressAnalyzerSession_BEFORE_WM_RESTORE_${stamp}.json`);
  const raw = fs.readFileSync(SESSION_FILE, 'utf8');
  fs.writeFileSync(backupFile, raw, 'utf8');
  console.log('Backup written:', backupFile);

  const data = JSON.parse(raw);
  const results = data.results || [];
  const buckets = data.reviewedKeysByFilter || {};
  const prog = data.reviewProgressByFilter?.well_maintained;
  const savedQueue = prog?.queue || [];
  const savedIndex = prog?.index || 0;
  const unreviewedSlice = new Set(savedQueue.slice(savedIndex));

  const keysToClear = new Set();
  const keysToUnbucket = new Set();
  let alreadyPending = 0;

  for (const r of results) {
    if (!isWellMaintainedProperty(r)) continue;
    const key = recordKey(r);

    if (!r.manuallyReviewed && !r.reviewResolved) {
      keysToUnbucket.add(key);
      alreadyPending++;
      continue;
    }

    if (r.manuallyReviewedVia !== 'review_session') continue;
    if (!unreviewedSlice.has(key)) continue;
    keysToClear.add(key);
    keysToUnbucket.add(key);
  }

  const restoredAddresses = [];
  let changed = 0;
  const nextResults = results.map((r) => {
    const key = recordKey(r);
    if (!keysToClear.has(key)) return r;
    changed++;
    if (restoredAddresses.length < 5) restoredAddresses.push(r.address);
    return clearManuallyReviewed(r);
  });

  for (const key of keysToUnbucket) {
    removeKeyFromBuckets(buckets, key);
  }

  const pendingQueue = buildPendingWellMaintainedQueue(nextResults);
  data.results = nextResults;
  data.reviewedKeysByFilter = buckets;
  data.reviewQueue = pendingQueue;
  data.reviewFilter = 'well_maintained';
  data.reviewIndex = 0;
  data.reviewMode = false;

  if (!data.reviewProgressByFilter) data.reviewProgressByFilter = {};
  data.reviewProgressByFilter.well_maintained = {
    queue: pendingQueue,
    index: 0,
    stats: prog?.stats || { kept: 0, changed: 0, deferred: 0, blurred: 0 },
    undo: []
  };

  data.savedAt = Date.now();
  data.restoreNote = `Restored ${changed} bulk-marked well_maintained leads + ${alreadyPending} already-pending at ${new Date().toISOString()}`;

  writeFileAtomic(SESSION_FILE, JSON.stringify(data));

  const reviewedWell = nextResults.filter((r) => isWellMaintainedProperty(r) && r.manuallyReviewed);
  const pendingWell = nextResults.filter((r) => isWellMaintainedProperty(r) && !isExcludedFromReview(r));

  console.log('\n=== Restore complete ===');
  console.log('Cleared bulk review_session flags:', changed);
  console.log('Already-pending leads (bucket keys cleaned):', alreadyPending);
  console.log('Total now pending in Well Maintained queue:', pendingWell.length);
  console.log('Still marked reviewed by you:', reviewedWell.length);
  console.log('Review queue length on disk:', pendingQueue.length);
  if (restoredAddresses.length) {
    console.log('Sample restored:', restoredAddresses.join('; '));
  }
}

main();