'use strict';

const {
  computeLeadTier,
  normalizeLeadTier,
  normalizeIndicators,
  normalizeCondition,
  looksVisuallyDistressed,
  stripTierMigrationReasonSuffix
} = require('./tier-engine');

const HARD_NEVER_LEARN_INDICATORS = new Set([
  'boarded_windows', 'boarded_doors', 'structural_damage', 'fire_or_water_damage'
]);

const WELL_MAINTAINED_MAX_SCORE = 5;
const DISTRESSED_MIN_SCORE = 6;

function resultScore(record) {
  const cat = String(record?.category || 'property').toLowerCase();
  if (cat !== 'property') return 0;
  return typeof record?.score === 'number' ? record.score : 0;
}

function combinedTierReason(record) {
  const parts = [
    record?.reason,
    record?.satelliteClassification?.reason
  ].filter(Boolean);
  return stripTierMigrationReasonSuffix(parts.join(' '));
}

function recordMatchesLearnedWhen(record, when) {
  if (!when || typeof when !== 'object') return true;
  const sat = record.satelliteClassification || {};
  const inds = normalizeIndicators(record.indicators);
  const reason = String(record.reason || '').toLowerCase();
  const score = resultScore(record);

  if (when.aerialDistressScore_lte != null && (sat.aerialDistressScore ?? 99) > when.aerialDistressScore_lte) return false;
  if (when.aerialDistressScore_gte != null && (sat.aerialDistressScore ?? -1) < when.aerialDistressScore_gte) return false;
  if (when.satelliteYard_in?.length && !when.satelliteYard_in.includes(normalizeCondition(sat.yardCondition))) return false;
  if (when.satelliteRoof_in?.length && !when.satelliteRoof_in.includes(normalizeCondition(sat.roofCondition))) return false;
  if (when.indicators_exclude?.some((i) => inds.includes(i))) return false;
  if (when.indicators_require?.length && !when.indicators_require.every((i) => inds.includes(i))) return false;
  if (when.reason_contains_any?.length && !when.reason_contains_any.some((p) => reason.includes(String(p).toLowerCase()))) return false;
  if (when.never_when_indicators?.some((i) => inds.includes(i))) return false;
  if (when.score_lte != null && score > when.score_lte) return false;
  if (when.score_gte != null && score < when.score_gte) return false;
  return true;
}

function scoreForTier(tier) {
  const t = normalizeLeadTier(tier);
  if (t === 'distressed') return DISTRESSED_MIN_SCORE;
  if (t === 'well_maintained') return WELL_MAINTAINED_MAX_SCORE;
  return 0;
}

function shouldBlockDistressPromotion(record, rule, currentTier) {
  const toTier = normalizeLeadTier(rule.toTier);
  if (toTier !== 'distressed') return false;

  const fromTiers = (rule.fromTiers || []).map(normalizeLeadTier);
  const promotingFromWellMaintained =
    fromTiers.includes('well_maintained') && currentTier === 'well_maintained';

  if (promotingFromWellMaintained) return false;

  return !looksVisuallyDistressed(
    resultScore(record),
    record.indicators,
    record.satelliteClassification,
    combinedTierReason(record)
  );
}

function applyLearnedRuleToRecord(record, rule) {
  const toTier = normalizeLeadTier(rule.toTier);
  const baseReason = stripTierMigrationReasonSuffix(record.reason || '')
    .replace(/ Applied learned rule [^.]+\./g, '')
    .replace(/ You (set|bulk-set) distress level to [^.]+\./g, '')
    .trim();

  const updated = {
    ...record,
    score: toTier === 'well_maintained' ? WELL_MAINTAINED_MAX_SCORE : DISTRESSED_MIN_SCORE,
    leadTier: toTier,
    autoLearnedTier: true,
    appliedLearnedRuleId: rule.id
  };

  if (toTier === 'well_maintained') updated.autoWellMaintained = true;
  else delete updated.autoWellMaintained;

  updated.reason = baseReason
    ? `${baseReason} Applied learned rule ${rule.id}.`
    : `Applied learned rule ${rule.id}.`;

  return updated;
}

function applyLearnedTierRules(record, rules = [], options = {}) {
  if (!record || options.isTierLocked?.(record)) return record;
  if (String(record.category || 'property').toLowerCase() !== 'property') return record;
  if (options.computeNeedsReview?.(record)) return record;

  const inds = normalizeIndicators(record.indicators);
  if (inds.some((i) => HARD_NEVER_LEARN_INDICATORS.has(i))) return record;

  const approved = rules.filter((r) => r.status === 'approved');
  const currentTier = normalizeLeadTier(record.leadTier || computeLeadTier(
    resultScore(record),
    record.category || 'property',
    {
      indicators: record.indicators,
      satelliteClassification: record.satelliteClassification,
      reason: combinedTierReason(record)
    }
  ));

  for (const rule of approved) {
    const fromTiers = (rule.fromTiers || []).map(normalizeLeadTier);
    if (!fromTiers.includes(currentTier)) continue;
    if (!recordMatchesLearnedWhen(record, rule.when)) continue;

    const toTier = normalizeLeadTier(rule.toTier);
    if (toTier === currentTier) continue;
    if (shouldBlockDistressPromotion(record, rule, currentTier)) continue;

    return applyLearnedRuleToRecord(record, { ...rule, toTier });
  }

  return record;
}

module.exports = {
  HARD_NEVER_LEARN_INDICATORS,
  recordMatchesLearnedWhen,
  shouldBlockDistressPromotion,
  applyLearnedRuleToRecord,
  applyLearnedTierRules
};