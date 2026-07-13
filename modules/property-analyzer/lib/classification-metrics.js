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
  const landMixups = changes.filter(
    (c) => (c.aiTier === 'property' || c.aiTier === 'well_maintained' || c.aiTier === 'distressed')
      && c.userTier === 'vacant'
  );
  const landToHome = changes.filter(
    (c) => c.aiTier === 'vacant' && (c.userTier === 'distressed' || c.userTier === 'well_maintained')
  );
  const blockedMixups = changes.filter(
    (c) => (c.aiTier === 'blurred' && c.userTier !== 'blurred')
      || (c.aiTier !== 'blurred' && c.userTier === 'blurred')
  );

  const propertyCorrections = changes.filter(
    (c) => c.aiTier === 'well_maintained' || c.aiTier === 'distressed'
  );

  const denom = propertyCorrections.length || changes.length;
  const judged = affirmations.length + changes.length;
  const autoCorrect = judged ? affirmations.length / judged : 0;
  const manualFix = judged ? changes.length / judged : 0;

  return {
    total: corrections.length,
    affirmations: affirmations.length,
    corrections: changes.length,
    falseNegatives: falseNegatives.length,
    falsePositives: falsePositives.length,
    landMixups: landMixups.length,
    landToHome: landToHome.length,
    blockedMixups: blockedMixups.length,
    falseNegativeRate: denom ? falseNegatives.length / denom : 0,
    falsePositiveRate: denom ? falsePositives.length / denom : 0,
    autoCorrectRate: autoCorrect,
    manualFixRate: manualFix,
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
    `  Auto-correct (no change needed): ${pct(metrics.autoCorrectRate)}`,
    `  Manual fix rate: ${pct(metrics.manualFixRate)}`,
    `  False negatives (WM→D): ${metrics.falseNegatives} (${pct(metrics.falseNegativeRate)})`,
    `  False positives (D→WM): ${metrics.falsePositives} (${pct(metrics.falsePositiveRate)})`,
    `  Land mix-ups (home→vacant): ${metrics.landMixups}`,
    `  Land mix-ups (vacant→home): ${metrics.landToHome}`,
    `  Blocked bucket mix-ups: ${metrics.blockedMixups}`
  ].join('\n');
}

module.exports = {
  normalizeCorrection,
  computeCorrectionMetrics,
  formatMetricsReport
};
