'use strict';

/**
 * Prepare New Analyzer Leads for the operator workflow:
 *  1) Clear soft/false review stamps so Distressed / WM / Vacant queues open.
 *  2) Re-queue unavailable / failed imagery into the scan records list for a real rescan.
 */

const SOFT_VIAS = new Set(['review_session', 'review_skip', 'review_missing']);
const REAL_VIAS = new Set([
  'review_keep',
  'review_change',
  'review_blurred',
  'keep',
  'change',
  'blur',
  'defer',
  'review_defer'
]);

const IMPORT_SOURCE = 'new_analyzer_leads_2026-07-11';

function recordKey(r) {
  if (!r) return '';
  return `${r.email || ''}|${r.phone || ''}|${r.address || r.street || ''}`;
}

function isNewAnalyzerLead(r) {
  if (!r) return false;
  if (r.importSource === IMPORT_SOURCE) return true;
  const src = String(r.sourceFile || '').toLowerCase();
  if (src.includes('new analyzer leads')) return true;
  const batch = String(r.importBatchId || '').toLowerCase();
  return batch.includes('new_analyzer_leads');
}

function hasRealManualReview(r) {
  if (!r) return false;
  const via = String(r.manuallyReviewedVia || '');
  if (SOFT_VIAS.has(via)) return false;
  if (REAL_VIAS.has(via)) return true;
  if (r.tierLocked || r.manualOverride || r.manualScore) return true;
  // Bare manuallyReviewed without via is treated as soft/legacy and cleared for this sheet
  return false;
}

function needsRescan(r) {
  const tier = String(r.leadTier || '').toLowerCase().replace(/-/g, '_');
  const cat = String(r.category || '').toLowerCase();
  if (tier === 'unavailable' || cat === 'unavailable') return true;
  if (cat === 'fetch_failed' || tier === 'blurred' || cat === 'blurred') return true;
  if (Array.isArray(r.qualityFlags) && r.qualityFlags.includes('analysis_incomplete')) return true;
  return false;
}

function leanRecordFromResult(r) {
  return {
    firstName: r.firstName || '',
    lastName: r.lastName || '',
    phone: r.phone || '',
    email: r.email || '',
    street: r.street || String(r.address || '').split(',')[0] || '',
    city: r.city || '',
    state: r.state || '',
    postal: r.postal || r.zip || '',
    address: r.address || [r.street, r.city, r.state, r.postal || r.zip].filter(Boolean).join(', '),
    importSource: r.importSource || IMPORT_SOURCE,
    sourceFile: r.sourceFile || 'New Analyzer Leads.csv',
    importBatchId: r.importBatchId || '',
    importedAt: r.importedAt || Date.now(),
    leadType: r.leadType || r.importLeadType || 'code_violation',
    violationType: r.violationType || '',
    violationDescription: r.violationDescription || '',
    violationDate: r.violationDate || '',
    codeType: r.codeType || '',
    codeCategory: r.codeCategory || ''
  };
}

function clearSoftReview(r) {
  const next = { ...r };
  delete next.manuallyReviewed;
  delete next.manuallyReviewedAt;
  delete next.manuallyReviewedVia;
  delete next.reviewResolved;
  delete next.needsReviewLater;
  if (next.autoWellMaintained) delete next.autoWellMaintained;
  return next;
}

/**
 * @param {object} session
 * @param {{ requeueUnavailable?: boolean }} [opts]
 */
function prepareNewAnalyzerLeadsSession(session, opts = {}) {
  const requeueUnavailable = opts.requeueUnavailable !== false;
  const results = Array.isArray(session.results) ? session.results : [];
  const records = Array.isArray(session.records) ? session.records : [];

  let clearedSoft = 0;
  let openedForReview = 0;
  let requeued = 0;
  const keptResults = [];
  const requeueRecords = [];
  const existingRecordKeys = new Set(records.map(recordKey).filter(Boolean));

  for (const r of results) {
    if (!isNewAnalyzerLead(r)) {
      keptResults.push(r);
      continue;
    }

    let row = r;
    if (!hasRealManualReview(r)) {
      const beforeVia = r.manuallyReviewedVia || (r.manuallyReviewed ? 'bare' : '');
      row = clearSoftReview(r);
      if (beforeVia || r.manuallyReviewed || r.reviewResolved) clearedSoft += 1;
      openedForReview += 1;
    }

    if (requeueUnavailable && needsRescan(row)) {
      const lean = leanRecordFromResult(row);
      const k = recordKey(lean);
      if (k && !existingRecordKeys.has(k)) {
        existingRecordKeys.add(k);
        requeueRecords.push(lean);
        requeued += 1;
      }
      // Drop failed/unavailable row from results so Start Scan will run it again
      continue;
    }

    keptResults.push(row);
  }

  // Strip New Analyzer queue rows that are already solid (kept in results) to avoid
  // false "left to scan" when the client has full records + partial results.
  const keptResultKeys = new Set(keptResults.map(recordKey).filter(Boolean));
  const keptRecords = records.filter((rec) => {
    if (!isNewAnalyzerLead(rec)) return true;
    const k = recordKey(rec);
    // Keep only if still needed for rescan (not already a kept result)
    return k && !keptResultKeys.has(k);
  });

  const nextRecords = [...keptRecords, ...requeueRecords];

  // Clear soft keys from reviewedKeysByFilter
  const reviewedKeysByFilter = { ...(session.reviewedKeysByFilter || {}) };
  for (const filter of Object.keys(reviewedKeysByFilter)) {
    const bucket = Array.isArray(reviewedKeysByFilter[filter])
      ? reviewedKeysByFilter[filter]
      : [];
    reviewedKeysByFilter[filter] = bucket.filter((key) => {
      // Keep keys for leads that still have real review on kept results
      const hit = keptResults.find((r) => recordKey(r) === key);
      return hit ? hasRealManualReview(hit) : false;
    });
  }

  const next = {
    ...session,
    results: keptResults,
    records: nextRecords,
    processed: keptResults.length,
    reviewedKeysByFilter,
    savedAt: Date.now(),
    fileName: requeued ? 'New Analyzer Leads.csv' : (session.fileName || 'New Analyzer Leads.csv')
  };

  return {
    session: next,
    stats: {
      clearedSoft,
      openedForReview,
      requeuedUnavailable: requeued,
      resultsBefore: results.length,
      resultsAfter: keptResults.length,
      recordsBefore: records.length,
      recordsAfter: nextRecords.length,
      pendingUnscanned: requeued
    }
  };
}

module.exports = {
  IMPORT_SOURCE,
  prepareNewAnalyzerLeadsSession,
  isNewAnalyzerLead,
  hasRealManualReview,
  needsRescan,
  recordKey
};
