/**
 * Comping confidence levels for Vault ARV.
 *
 * Thresholds:
 * - blocked: fewer than 3 included comps
 * - low: thin-comps ladder level >= 2 (expanded radius/recency)
 * - high: >= 3 included, ladder 0, >= 2 likely-renovated comps
 * - medium: >= 3 included with weaker renovation evidence
 */
function assessConfidence({
  included,
  ladderLevel = 0,
  marketTag,
  renovationLikelyCount = 0,
}) {
  if (included < 3) return 'blocked';
  if (ladderLevel >= 2) return 'low';
  if (included >= 3 && renovationLikelyCount >= 2 && ladderLevel === 0) return 'high';
  if (included >= 3) return 'medium';
  return 'low';
}

module.exports = { assessConfidence };
