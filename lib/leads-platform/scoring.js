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

function explainPriorityScore(lead = {}) {
  const parts = [];
  const typeWeight = LEAD_TYPE_WEIGHT[lead.leadType] || 0;
  if (typeWeight) {
    const typeLabel = lead.leadType === 'well_maintained'
      ? 'Code / well-maintained type'
      : `${String(lead.leadType || 'lead').replace(/_/g, ' ')} type`;
    parts.push({ label: typeLabel, points: typeWeight });
  }

  if (lead.leadType === 'distressed' && lead.distressTier != null) {
    const tierPts = Math.min(80, Math.max(0, Number(lead.distressTier) || 0) * 8);
    if (tierPts) {
      parts.push({ label: `Distress tier ${lead.distressTier}`, points: tierPts });
    }
  }

  const tags = Array.isArray(lead.signalTags) ? lead.signalTags : [];
  const tagPts = Math.min(20, tags.length * 4);
  if (tagPts) {
    parts.push({
      label: `${tags.length} motivation signal${tags.length === 1 ? '' : 's'}`,
      points: tagPts
    });
  }
  if (tags.some((t) => HOT_SIGNALS.has(String(t).trim().toLowerCase()))) {
    parts.push({ label: 'Hot signal boost', points: 5 });
  }

  if (lead.confidence === 'high') {
    parts.push({ label: 'High confidence review', points: 5 });
  }
  if (Array.isArray(lead.phones) && lead.phones.length > 0) {
    parts.push({ label: 'Phone on file', points: 10 });
  }

  const recent = recencyBoost(lead.publishedAt);
  if (recent) {
    parts.push({ label: 'Recently published', points: recent });
  }

  const raw = parts.reduce((sum, p) => sum + p.points, 0);
  const total = Math.max(0, Math.min(100, Math.round(raw)));
  return { total, parts, capped: raw > 100 };
}

function computePriorityScore(lead = {}) {
  return explainPriorityScore(lead).total;
}

module.exports = {
  computePriorityScore,
  explainPriorityScore,
  LEAD_TYPE_WEIGHT,
  HOT_SIGNALS
};
