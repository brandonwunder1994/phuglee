'use strict';

const { computeLeadTier, normalizeLeadTier } = require('./tier-engine');
const { enrichClassificationFields } = require('./classification-confidence');

function isRetierEligible(record) {
  if (!record) return false;
  if (record.manualOverride || record.manualScore) return false;
  if (record.tierLocked) return false;
  const cat = String(record.category || 'property').toLowerCase();
  return cat === 'property';
}

/**
 * Re-tier a property record from saved scan fields — no Gemini / Maps vision calls.
 * Mirrors recalibratePropertyScores tier path (score + indicators + satellite metadata).
 */
function retierRecordWithoutVision(record) {
  if (!isRetierEligible(record)) return { record, changed: false };

  const beforeTier = record.leadTier
    ? normalizeLeadTier(record.leadTier)
    : normalizeLeadTier(computeLeadTier(record.score, 'property', buildCtx(record)));

  const next = {
    ...record,
    retieredWithoutVision: true,
    retieredAt: Date.now()
  };

  const tier = normalizeLeadTier(computeLeadTier(next.score, 'property', buildCtx(next)));
  next.leadTier = tier;
  enrichClassificationFields(next);

  const afterTier = normalizeLeadTier(tier);
  const changed = beforeTier !== afterTier;
  return { record: next, changed, beforeTier, afterTier };
}

function retierResultsWithoutVision(results) {
  let changed = 0;
  const updated = (results || []).map((r) => {
    const { record, changed: c } = retierRecordWithoutVision(r);
    if (c) changed++;
    return record;
  });
  return { results: updated, changed };
}

function buildCtx(record) {
  return {
    indicators: record.indicators,
    satelliteClassification: record.satelliteClassification,
    reason: record.reason
  };
}

module.exports = {
  isRetierEligible,
  retierRecordWithoutVision,
  retierResultsWithoutVision
};