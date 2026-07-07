'use strict';

const { normalizeLeadTier } = require('./tier-engine');

function normalizeCorrection(entry) {
  if (!entry) return null;
  if (entry.affirmed) {
    const tier = normalizeLeadTier(entry.userTier || entry.confirmedTier);
    return { type: 'affirmation', aiTier: tier, userTier: tier, entry };
  }
  const aiTier = normalizeLeadTier(entry.aiTier || entry.fromTier);
  const userTier = normalizeLeadTier(entry.userTier || entry.toTier);
  if (!aiTier || !userTier || aiTier === userTier) return null;
  return { type: 'correction', aiTier, userTier, entry };
}

function computeCorrectionMetrics(corrections = []) {
  const normalized = corrections.map(normalizeCorrection).filter(Boolean);
  const affirmations = normalized.filter((c) => c.type === 'affirmation');
  const changes = normalized.filter((c) => c.type === 'correction');

  const falseNegatives = changes.filter(
    (c) => c.aiTier === 'well_maintained' && c.userTier === 'distressed'
  );
  const falsePositives = changes.filter(
    (c) => c.aiTier === 'distressed' && c.userTier === 'well_maintained'
  );

  const propertyCorrections = changes.filter(
    (c) => c.aiTier === 'well_maintained' || c.aiTier === 'distressed'
  );

  const denom = propertyCorrections.length || changes.length;

  return {
    total: corrections.length,
    affirmations: affirmations.length,
    corrections: changes.length,
    falseNegatives: falseNegatives.length,
    falsePositives: falsePositives.length,
    falseNegativeRate: denom ? falseNegatives.length / denom : 0,
    falsePositiveRate: denom ? falsePositives.length / denom : 0,
    falseNegativeIds: falseNegatives.map((c, i) => c.entry.address || `fn-${i}`),
    falsePositiveIds: falsePositives.map((c, i) => c.entry.address || `fp-${i}`)
  };
}

function formatMetricsReport(metrics) {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  return [
    'Classification correction metrics',
    `  Total entries: ${metrics.total}`,
    `  Corrections: ${metrics.corrections} | Affirmations: ${metrics.affirmations}`,
    `  False negatives (WM→D): ${metrics.falseNegatives} (${pct(metrics.falseNegativeRate)})`,
    `  False positives (D→WM): ${metrics.falsePositives} (${pct(metrics.falsePositiveRate)})`
  ].join('\n');
}

module.exports = {
  normalizeCorrection,
  computeCorrectionMetrics,
  formatMetricsReport
};