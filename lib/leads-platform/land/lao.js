'use strict';

const POCKETS = {
  sticks: { buy: 0.10, sell: 0.15 },
  suburbia: { buy: 0.15, sell: 0.20 },
  prime: { buy: 0.20, sell: 0.25 }
};

const DEFAULT_INVESTOR_GAP = 5000;

function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function nonNegMoney(v, fallback = null) {
  const n = money(v);
  if (n == null) return fallback;
  return Math.max(0, n);
}

function sumSiteCostParts(parts = {}) {
  const clearing = nonNegMoney(parts.clearing, 0) || 0;
  const demo = nonNegMoney(parts.demo, 0) || 0;
  const grade = nonNegMoney(parts.grade, 0) || 0;
  const other = nonNegMoney(parts.other, 0) || 0;
  return clearing + demo + grade + other;
}

function normalizeSiteCostParts(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    clearing: nonNegMoney(src.clearing, 0) || 0,
    demo: nonNegMoney(src.demo, 0) || 0,
    grade: nonNegMoney(src.grade, 0) || 0,
    other: nonNegMoney(src.other, 0) || 0
  };
}

function computeSanityBands({ pocket, newBuildArv } = {}) {
  const key = String(pocket || '').toLowerCase();
  const factors = POCKETS[key] || null;
  const arv = money(newBuildArv);
  if (!factors || arv == null || arv <= 0) {
    return {
      pocket: factors ? key : null,
      newBuildArv: arv,
      buyBand: null,
      sellBand: null
    };
  }
  return {
    pocket: key,
    newBuildArv: arv,
    buyBand: Math.round(arv * factors.buy),
    sellBand: Math.round(arv * factors.sell)
  };
}

function sanityWarning(landFmv, sanity) {
  if (landFmv == null || !sanity || sanity.buyBand == null || sanity.sellBand == null) {
    return null;
  }
  if (landFmv > sanity.sellBand * 1.15) {
    return `FMV ($${landFmv.toLocaleString()}) is well above the ~${sanity.pocket} sell band ($${sanity.sellBand.toLocaleString()}). Walk if comps disagree.`;
  }
  if (landFmv < sanity.buyBand * 0.7) {
    return `FMV ($${landFmv.toLocaleString()}) is far below the ~${sanity.pocket} buy band ($${sanity.buyBand.toLocaleString()}). Double-check comps.`;
  }
  return null;
}

/**
 * Core LAO stack (Land Brain). Never uses house 90% or 70% rules.
 */
function computeLaoStack(input = {}) {
  const landFmv = money(input.landFmv);
  const parts = input.siteCostParts && typeof input.siteCostParts === 'object'
    ? normalizeSiteCostParts(input.siteCostParts)
    : null;
  let siteCosts = money(input.siteCosts);
  if (parts) {
    const fromParts = sumSiteCostParts(parts);
    // Prefer parts sum when any part present or siteCosts missing
    if (fromParts > 0 || siteCosts == null) siteCosts = fromParts;
  }
  if (siteCosts == null) siteCosts = 0;

  const investorGap = nonNegMoney(input.investorGap, DEFAULT_INVESTOR_GAP);
  const assignmentFee = nonNegMoney(input.assignmentFee, 0) || 0;

  let buyerCeiling = null;
  let contractTarget = null;
  let lao = money(input.lao);

  if (landFmv != null) {
    buyerCeiling = landFmv - siteCosts - investorGap;
    contractTarget = buyerCeiling - assignmentFee;
    if (lao == null) lao = contractTarget;
  }

  return {
    landFmv,
    siteCosts,
    siteCostParts: parts || normalizeSiteCostParts({}),
    investorGap,
    assignmentFee,
    buyerCeiling,
    contractTarget,
    lao
  };
}

function normalizeManualComp(raw = {}) {
  return {
    address: String(raw.address || '').trim(),
    soldPrice: money(raw.soldPrice),
    soldDate: String(raw.soldDate || '').trim(),
    acres: raw.acres == null || raw.acres === '' ? null : Number(raw.acres),
    notes: String(raw.notes || '').trim()
  };
}

function normalizeLandUnderwriting(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const parts = normalizeSiteCostParts(src.siteCostParts || {});
  const hasParts = Object.values(parts).some((n) => n > 0);
  const stack = computeLaoStack({
    landFmv: src.landFmv,
    siteCosts: src.siteCosts,
    siteCostParts: hasParts || src.siteCostParts ? parts : undefined,
    investorGap: src.investorGap == null ? DEFAULT_INVESTOR_GAP : src.investorGap,
    assignmentFee: src.assignmentFee,
    lao: src.lao
  });

  const sanityIn = src.sanity && typeof src.sanity === 'object' ? src.sanity : {};
  const sanity = computeSanityBands({
    pocket: sanityIn.pocket || src.pocket,
    newBuildArv: sanityIn.newBuildArv != null ? sanityIn.newBuildArv : src.newBuildArv
  });

  const compsManual = Array.isArray(src.compsManual)
    ? src.compsManual.map(normalizeManualComp).filter((c) => c.address || c.soldPrice != null)
    : [];

  return {
    landFmv: stack.landFmv,
    siteCosts: stack.siteCosts,
    siteCostParts: stack.siteCostParts,
    investorGap: stack.investorGap,
    assignmentFee: stack.assignmentFee,
    buyerCeiling: stack.buyerCeiling,
    contractTarget: stack.contractTarget,
    lao: stack.lao,
    sanity,
    sanityWarning: sanityWarning(stack.landFmv, sanity),
    compsManual,
    method: src.method === 'engine' ? 'engine' : 'manual',
    updatedAt: src.updatedAt ? String(src.updatedAt) : null
  };
}

module.exports = {
  DEFAULT_INVESTOR_GAP,
  POCKETS,
  money,
  computeLaoStack,
  computeSanityBands,
  sanityWarning,
  normalizeSiteCostParts,
  normalizeLandUnderwriting,
  sumSiteCostParts
};
