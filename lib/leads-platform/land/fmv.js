'use strict';

/**
 * Land FMV from accepted lot comps.
 * Primary: median sold price of included comps.
 * Secondary: median $/acre × subject acres (when both sides have acreage).
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

function compAcres(c) {
  const acres = num(c.acres);
  if (acres != null && acres > 0) return acres;
  const lot = num(c.lotSqft);
  if (lot != null && lot > 0) return lot / 43560;
  return null;
}

function subjectAcres(subject = {}) {
  const acres = num(subject.acres);
  if (acres != null && acres > 0) return acres;
  const lot = num(subject.lotSqft);
  if (lot != null && lot > 0) return lot / 43560;
  return null;
}

function computeLandFmv(subject, scoredComps = []) {
  const included = (scoredComps || []).filter((s) => s.included);
  const prices = included.map((s) => num(s.candidate?.price ?? s.candidate?.soldPrice)).filter((p) => p != null && p > 0);
  const medianPrice = median(prices);

  const subAcres = subjectAcres(subject);
  const ppa = included
    .map((s) => {
      const price = num(s.candidate?.price ?? s.candidate?.soldPrice);
      const acres = compAcres(s.candidate || {});
      if (price == null || price <= 0 || acres == null || acres <= 0) return null;
      return price / acres;
    })
    .filter((v) => v != null);
  const medianPpa = median(ppa);
  const fmvFromAcres = (subAcres != null && medianPpa != null)
    ? Math.round(medianPpa * subAcres)
    : null;

  let landFmv = medianPrice;
  let method = 'median_price';
  if (medianPrice == null && fmvFromAcres != null) {
    landFmv = fmvFromAcres;
    method = 'price_per_acre';
  } else if (medianPrice != null && fmvFromAcres != null) {
    const delta = Math.abs(medianPrice - fmvFromAcres) / medianPrice;
    if (delta > 0.35) {
      method = 'median_price_with_acre_check';
    }
  }

  return {
    landFmv,
    method,
    includedCount: included.length,
    excludedCount: Math.max(0, (scoredComps || []).length - included.length),
    medianPrice,
    medianPricePerAcre: medianPpa,
    fmvFromAcres,
    subjectAcres: subAcres
  };
}

function landCompConfidence({ includedCount, method, sanityDisagree }) {
  if (!includedCount || includedCount < 2) return 'blocked';
  if (sanityDisagree) return 'low';
  if (includedCount >= 3 && method !== 'median_price_with_acre_check') return 'high';
  if (includedCount >= 2) return 'medium';
  return 'low';
}

module.exports = {
  computeLandFmv,
  landCompConfidence,
  median,
  subjectAcres,
  compAcres
};
