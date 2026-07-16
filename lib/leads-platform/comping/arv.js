/**
 * ARV math from scored comps — Jamil-style adjustments, trimmed median, haircuts.
 * Never uses vendor AVM; only adjusted sold comp prices.
 */

/** Dollar adjustments per unit difference (configurable Jamil-style bands). */
const ADJUSTMENT_TABLE = {
  bed: 12000,
  bath: 8000,
  garage: 7500,
};

const DOM_SOFT_HAIRCUT_PCT = 5;
const DEFAULT_CONSERVATIVE_HAIRCUT_PCT = 5;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function trimmedMedian(values) {
  if (values.length < 5) return median(values);
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  return median(trimmed);
}

function applyJamilAdjustments(subject, candidate) {
  const price = Number(candidate.price) || 0;
  if (price <= 0) return 0;

  let adjusted = price;
  const subBeds = Number(subject.beds) || 0;
  const candBeds = Number(candidate.beds) || 0;
  const subBaths = Number(subject.baths) || 0;
  const candBaths = Number(candidate.baths) || 0;
  const subGarage = Number(subject.garage) || 0;
  const candGarage = Number(candidate.garage) || 0;

  adjusted += (subBeds - candBeds) * ADJUSTMENT_TABLE.bed;
  adjusted += (subBaths - candBaths) * ADJUSTMENT_TABLE.bath;
  adjusted += (subGarage - candGarage) * ADJUSTMENT_TABLE.garage;

  return Math.round(adjusted);
}

function resolveAdjustedPrice(subject, scored) {
  if (Number.isFinite(scored.adjustedPrice) && scored.adjustedPrice > 0) {
    return scored.adjustedPrice;
  }
  if (scored.candidate) {
    return applyJamilAdjustments(subject, scored.candidate);
  }
  return 0;
}

function computeArvFromComps(subject, scoredComps, opts = {}) {
  const included = [];
  const excluded = [];

  for (const scored of scoredComps || []) {
    const adjustedPrice = resolveAdjustedPrice(subject, scored);
    const entry = { ...scored, adjustedPrice };
    if (scored.includedEligible && adjustedPrice > 0) {
      included.push(entry);
    } else {
      excluded.push(entry);
    }
  }

  const prices = included.map((c) => c.adjustedPrice);
  const method = prices.length >= 5 ? 'trimmed_median' : 'median';
  let arv = method === 'trimmed_median' ? trimmedMedian(prices) : median(prices);

  const haircuts = [];

  const domPct = opts.domSoftHaircutPct != null
    ? opts.domSoftHaircutPct
    : (opts.marketTag === 'soft' ? DOM_SOFT_HAIRCUT_PCT : 0);

  if (arv != null && domPct > 0) {
    const before = arv;
    arv = Math.round(arv * (1 - domPct / 100));
    haircuts.push({ id: 'dom_soft', pct: domPct, before, after: arv });
  }

  if (arv != null && opts.conservativeHaircutPct > 0) {
    const before = arv;
    const pct = opts.conservativeHaircutPct;
    arv = Math.round(arv * (1 - pct / 100));
    haircuts.push({ id: 'conservative', pct, before, after: arv });
  }

  return {
    arv: arv ?? null,
    method: prices.length ? method : 'none',
    haircuts,
    included,
    excluded,
  };
}

module.exports = {
  ADJUSTMENT_TABLE,
  applyJamilAdjustments,
  computeArvFromComps,
};
