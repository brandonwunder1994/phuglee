'use strict';

/**
 * Hard-reset New Analyzer Leads: remove from results + records (+ optional JSONL scrub keys).
 * Then optionally inject fresh unscanned queue rows.
 */

const IMPORT_SOURCE = 'new_analyzer_leads_2026-07-11';
const SOURCE_FILE_NEEDLE = 'new analyzer leads';

function recordKey(r) {
  if (!r) return '';
  const street = r.street || String(r.address || '').split(',')[0] || '';
  return `${r.email || ''}|${r.phone || ''}|${street}`;
}

function streetCityStateKey(r) {
  if (!r) return '';
  const street = String(r.street || String(r.address || '').split(',')[0] || '')
    .toLowerCase()
    .replace(/[#.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const city = String(r.city || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const state = String(r.state || '')
    .toLowerCase()
    .trim()
    .slice(0, 2);
  return `${street}|${city}|${state}`;
}

function normalizeGeoKey(street, city, state) {
  return streetCityStateKey({ street, city, state });
}

function isTaggedNewAnalyzer(r) {
  if (!r) return false;
  if (r.importSource === IMPORT_SOURCE) return true;
  const src = String(r.sourceFile || '').toLowerCase();
  if (src.includes(SOURCE_FILE_NEEDLE)) return true;
  const batch = String(r.importBatchId || r.id || '').toLowerCase();
  return batch.includes('new_analyzer_leads');
}

function isTargetLead(r, geoKeys) {
  if (isTaggedNewAnalyzer(r)) return true;
  if (!geoKeys || !geoKeys.size) return false;
  const gk = streetCityStateKey(r);
  return !!(gk && geoKeys.has(gk));
}

/**
 * @param {object} session
 * @param {{
 *   geoKeys?: Set<string>|string[],
 *   freshRecords?: object[],
 *   importBatches?: object[],
 *   fileName?: string
 * }} opts
 */
function resetNewAnalyzerLeadsSession(session, opts = {}) {
  const geoKeys = opts.geoKeys instanceof Set
    ? opts.geoKeys
    : new Set(Array.isArray(opts.geoKeys) ? opts.geoKeys.filter(Boolean) : []);
  const results = Array.isArray(session.results) ? session.results : [];
  const records = Array.isArray(session.records) ? session.records : [];
  const batches = Array.isArray(session.importBatches) ? session.importBatches : [];

  const removedResultKeys = new Set();
  const removedGeoKeys = new Set();
  let removedResults = 0;
  let removedRecords = 0;

  const keptResults = [];
  for (const r of results) {
    if (isTargetLead(r, geoKeys)) {
      removedResults += 1;
      const rk = recordKey(r);
      const gk = streetCityStateKey(r);
      if (rk) removedResultKeys.add(rk);
      if (gk) removedGeoKeys.add(gk);
      continue;
    }
    keptResults.push(r);
  }

  const keptRecords = [];
  for (const r of records) {
    if (isTargetLead(r, geoKeys) || (recordKey(r) && removedResultKeys.has(recordKey(r))) || (streetCityStateKey(r) && removedGeoKeys.has(streetCityStateKey(r)))) {
      removedRecords += 1;
      const gk = streetCityStateKey(r);
      if (gk) removedGeoKeys.add(gk);
      continue;
    }
    keptRecords.push(r);
  }

  const keptBatches = batches.filter((b) => {
    const src = String(b?.sourceFile || '').toLowerCase();
    const id = String(b?.id || '').toLowerCase();
    if (src.includes(SOURCE_FILE_NEEDLE)) return false;
    if (id.includes('new_analyzer_leads')) return false;
    return true;
  });

  // Wipe soft review progress keys that pointed at removed leads
  const reviewedKeysByFilter = { ...(session.reviewedKeysByFilter || {}) };
  for (const filter of Object.keys(reviewedKeysByFilter)) {
    const bucket = Array.isArray(reviewedKeysByFilter[filter]) ? reviewedKeysByFilter[filter] : [];
    reviewedKeysByFilter[filter] = bucket.filter((key) => !removedResultKeys.has(key));
  }

  let nextRecords = keptRecords;
  let nextBatches = keptBatches;
  let addedFresh = 0;
  if (Array.isArray(opts.freshRecords) && opts.freshRecords.length) {
    const existingKeys = new Set(keptResults.map(recordKey).filter(Boolean));
    const existingGeo = new Set(keptResults.map(streetCityStateKey).filter(Boolean));
    const seen = new Set();
    const fresh = [];
    for (const r of opts.freshRecords) {
      const rk = recordKey(r);
      const gk = streetCityStateKey(r);
      if (rk && existingKeys.has(rk)) continue;
      if (gk && existingGeo.has(gk)) continue;
      const dedupe = rk || gk;
      if (dedupe && seen.has(dedupe)) continue;
      if (dedupe) seen.add(dedupe);
      fresh.push(r);
    }
    addedFresh = fresh.length;
    nextRecords = [...keptRecords, ...fresh];
    if (Array.isArray(opts.importBatches) && opts.importBatches.length) {
      nextBatches = [...keptBatches, ...opts.importBatches];
    } else {
      const importedAt = Date.now();
      nextBatches = [
        ...keptBatches,
        {
          id: `batch_new_analyzer_leads_${importedAt}`,
          sourceFile: opts.fileName || 'New Analyzer Leads.csv',
          importedAt,
          leadCount: fresh.length,
          city: '',
          state: ''
        }
      ];
    }
  }

  const next = {
    ...session,
    results: keptResults,
    records: nextRecords,
    importBatches: nextBatches,
    processed: keptResults.length,
    reviewedKeysByFilter,
    reviewQueue: [],
    reviewIndex: 0,
    fileName: opts.fileName || (addedFresh ? 'New Analyzer Leads.csv' : ''),
    importLeadType: addedFresh ? 'code_violation' : (session.importLeadType || null),
    savedAt: Date.now()
  };

  return {
    session: next,
    stats: {
      removedResults,
      removedRecords,
      removedBatches: batches.length - keptBatches.length,
      resultsAfter: keptResults.length,
      recordsAfter: nextRecords.length,
      addedFresh,
      pendingUnscanned: addedFresh,
      scrubGeoKeys: [...removedGeoKeys],
      scrubRecordKeys: [...removedResultKeys]
    }
  };
}

module.exports = {
  IMPORT_SOURCE,
  SOURCE_FILE_NEEDLE,
  recordKey,
  streetCityStateKey,
  normalizeGeoKey,
  isTaggedNewAnalyzer,
  isTargetLead,
  resetNewAnalyzerLeadsSession
};
