const LEAD_TYPE_WEIGHT = {
  distressed: 20,
  well_maintained: 10,
  land: 8
};

const HOT_SIGNALS = new Set([
  'pre-foreclosure',
  'tax delinquent',
  'vacant',
  'water shut-off',
  'code violation'
]);

function recencyBoost(publishedAt) {
  const ts = Date.parse(publishedAt || '');
  if (Number.isNaN(ts)) return 0;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 10;
  if (ageDays <= 30) return 7;
  if (ageDays <= 90) return 4;
  return 0;
}

function computePriorityScore(lead = {}) {
  let score = LEAD_TYPE_WEIGHT[lead.leadType] || 0;

  if (lead.leadType === 'distressed' && lead.distressTier != null) {
    score += Math.min(80, Math.max(0, Number(lead.distressTier) || 0) * 8);
  }

  const tags = Array.isArray(lead.signalTags) ? lead.signalTags : [];
  score += Math.min(20, tags.length * 4);
  if (tags.some((t) => HOT_SIGNALS.has(String(t).trim().toLowerCase()))) {
    score += 5;
  }

  if (lead.confidence === 'high') score += 5;
  if (Array.isArray(lead.phones) && lead.phones.length > 0) score += 10;

  score += recencyBoost(lead.publishedAt);

  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = {
  computePriorityScore,
  LEAD_TYPE_WEIGHT,
  HOT_SIGNALS
};
