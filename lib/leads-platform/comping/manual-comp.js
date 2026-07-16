/**
 * Manual Comp builder — ND / Propelio path.
 * Operator supplies ARV + pasted comps; prices trusted from Propelio.
 */

const { scoreComp } = require('./rules');
const { streetViewUrl } = require('./street-view');
const { buildRulesSummary } = require('./run-comp');

const REPORT_VERSION = '1';
const MIN_COMPS = 3;

function buildSubject(lead) {
  const pd = lead.propertyDetails || {};
  return {
    address: lead.address,
    city: lead.city,
    state: lead.state,
    lat: lead.lat ?? null,
    lng: lead.lng ?? null,
    sqft: pd.sqft || 0,
    beds: pd.beds || 0,
    baths: pd.baths || 0,
    yearBuilt: pd.yearBuilt || 0,
    garage: pd.garage || 0,
    propertyType: pd.propertyType || 'sfr',
  };
}

function medianPpsf(comps) {
  const ppsf = comps
    .map((c) => {
      const price = Number(c.price) || 0;
      const sqft = Number(c.sqft) || 0;
      return sqft > 0 && price > 0 ? price / sqft : null;
    })
    .filter((v) => v != null);
  if (!ppsf.length) return 0;
  const sorted = [...ppsf].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function validateManualInput({ arv, comps }) {
  const arvNum = Number(arv);
  if (!Number.isFinite(arvNum) || arvNum <= 0) {
    const err = new Error('ARV is required');
    err.code = 'ARV_REQUIRED';
    throw err;
  }
  if (!Array.isArray(comps) || comps.length < MIN_COMPS) {
    const err = new Error(`At least ${MIN_COMPS} comps required`);
    err.code = 'COMPS_REQUIRED';
    throw err;
  }
  for (const c of comps) {
    const price = Number(c.price);
    if (!Number.isFinite(price) || price <= 0) {
      const err = new Error('Each comp must have a positive sale price');
      err.code = 'COMP_PRICE_REQUIRED';
      throw err;
    }
  }
  return arvNum;
}

function buildManualCompReport({ lead, arv, comps, note }) {
  const arvNum = validateManualInput({ arv, comps });
  const subject = buildSubject(lead);
  const neighborhoodPpsfMedian = medianPpsf(comps);
  const compedAt = new Date().toISOString();

  const scored = comps.map((candidate) => {
    const result = scoreComp(subject, candidate, {
      ladderLevel: 0,
      neighborhoodPpsfMedian,
      barrierCrossed: false,
    });
    return { ...result, candidate };
  });

  const leadComps = scored.map((s) => {
    const c = s.candidate;
    return {
      address: c.address,
      soldDate: c.soldDate,
      price: c.price,
      sqft: c.sqft,
      beds: c.beds,
      baths: c.baths,
      distanceMi: c.distanceMi,
      yearBuilt: c.yearBuilt,
      lotSqft: c.lotSqft,
      ruleResults: s.rules,
      renovation: s.renovation,
      includedInArv: true,
      source: c.source || 'manual',
    };
  });

  const rulesSummary = buildRulesSummary(scored);

  const report = {
    version: REPORT_VERSION,
    subject: {
      ...subject,
      streetViewUrl: streetViewUrl(subject),
    },
    arv: arvNum,
    arvMethod: 'operator_manual',
    confidence: 'manual',
    source: 'manual_propelio',
    rulesSummary,
    manualNote: note ? String(note).trim() : '',
    generatedAt: compedAt,
    includedCount: comps.length,
    excludedCount: 0,
  };

  const leadPatch = {
    compedAt,
    compSource: 'manual_propelio',
    compConfidence: 'manual',
    comps: leadComps,
    compingReport: report,
    estARV: arvNum,
  };

  return { leadPatch, report };
}

module.exports = {
  buildManualCompReport,
  buildSubject,
};
