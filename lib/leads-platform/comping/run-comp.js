/**
 * Auto Comp orchestrator — concentric REAPI pull + Comping Rules scoring + ARV.
 * Never sets estARV from vendor AVM / estimatedValue.
 */

const { isNonDisclosureState } = require('./nd-states');
const { scoreComp } = require('./rules');
const { computeArvFromComps } = require('./arv');
const { assessConfidence } = require('./confidence');
const { checkRoadBarrier, clearBarrierCache } = require('./barriers');
const { streetViewUrl } = require('./street-view');
const { mapReapiCompsResponse } = require('./reapi-client');

const REPORT_VERSION = '1.1';
const RADII = [0.25, 0.5, 1.0];
const THIN_RADII = [5.0];
const MIN_INCLUDED = 3;
/** Keep a prior Comp ARV when a re-comp comes back blocked (never wipe operator work). */
function priorCompArvToPreserve(lead) {
  if (!lead?.compedAt) return null;
  const arv = Number(lead.estARV);
  if (!Number.isFinite(arv) || arv <= 0) return null;
  return arv;
}

/** REAPI PropertyComps/PropertyDetail expect a single formatted address string. */
function formatSubjectAddress(lead) {
  const street = String(lead.address || '').trim();
  if (!street) return '';
  // Already looks like "123 Main St, City, ST 12345"
  if (/,\s*[A-Za-z .'-]+,\s*[A-Z]{2}(\s+\d{5})?/.test(street)) return street;
  const city = String(lead.city || '').trim();
  const state = String(lead.state || '').trim();
  const zip = String(lead.zip || lead.zipCode || '').trim();
  const cityState = [city, state].filter(Boolean).join(', ');
  const tail = [cityState, zip].filter(Boolean).join(' ');
  return [street, tail].filter(Boolean).join(', ');
}

function buildSubject(lead, detail = {}) {
  const pd = lead.propertyDetails || {};
  return {
    address: lead.address,
    fullAddress: formatSubjectAddress(lead),
    city: lead.city,
    state: lead.state,
    lat: lead.lat ?? detail.lat ?? null,
    lng: lead.lng ?? detail.lng ?? null,
    sqft: pd.sqft || detail.sqft || 0,
    beds: pd.beds || detail.beds || 0,
    baths: pd.baths || detail.baths || 0,
    yearBuilt: pd.yearBuilt || detail.yearBuilt || 0,
    garage: pd.garage || detail.garage || 0,
    propertyType: pd.propertyType || detail.propertyType || 'sfr',
  };
}

function compKey(candidate) {
  return String(candidate.id || candidate.address || `${candidate.lat},${candidate.lng}`);
}

function medianPpsf(candidates) {
  const ppsf = candidates
    .map((c) => {
      const price = Number(c.price) || 0;
      const sqft = Number(c.sqft) || 0;
      // Ignore token / non-market stamps so junk sales don't collapse the median.
      return sqft > 0 && price >= 10000 ? price / sqft : null;
    })
    .filter((v) => v != null);
  if (!ppsf.length) return 0;
  const sorted = [...ppsf].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function buildRulesSummary(scoredComps) {
  const counts = new Map();
  for (const scored of scoredComps) {
    for (const rule of scored.rules || []) {
      if (!counts.has(rule.id)) {
        counts.set(rule.id, { id: rule.id, pass: 0, soft: 0, fail: 0 });
      }
      const row = counts.get(rule.id);
      row[rule.status] = (row[rule.status] || 0) + 1;
    }
  }
  return [...counts.values()];
}

function buildLeadComps(scoredComps, arvIncluded) {
  const includedSet = new Set(arvIncluded.map((c) => compKey(c.candidate)));
  return scoredComps.map((scored) => {
    const c = scored.candidate;
    const key = compKey(c);
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
      ruleResults: scored.rules,
      renovation: scored.renovation,
      adjustedPrice: scored.adjustedPrice,
      includedInArv: includedSet.has(key),
      source: c.source || 'reapi',
      streetViewUrl: streetViewUrl({ lat: c.lat, lng: c.lng, address: c.address }),
    };
  });
}

function resolveMarketTag(actives) {
  const doms = (actives || [])
    .map((a) => Number(a.daysOnMarket ?? a.dom))
    .filter((d) => Number.isFinite(d) && d >= 0);
  if (!doms.length) return null;
  const sorted = [...doms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDom = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return medianDom >= 90 ? 'soft' : 'balanced';
}

async function fetchActives(reapi, subject) {
  if (!reapi?.propertySearch || !Number.isFinite(subject.lat) || !Number.isFinite(subject.lng)) {
    return [];
  }
  try {
    const res = await reapi.propertySearch({
      latitude: subject.lat,
      longitude: subject.lng,
      radius: 1.0,
      mls_active: true,
      size: 25,
    });
    return res?.data || res?.properties || [];
  } catch {
    return [];
  }
}

async function scoreCandidates(subject, candidates, opts, ladderLevel) {
  const checkBarrier = opts.checkRoadBarrier || checkRoadBarrier;
  const neighborhoodPpsfMedian = medianPpsf(candidates);
  const scored = [];

  for (const candidate of candidates) {
    if (candidate.unusable) {
      const failScore = scoreComp(subject, { ...candidate, price: 0 }, {
        ladderLevel,
        referenceDate: opts.referenceDate,
        neighborhoodPpsfMedian,
        barrierCrossed: false,
      });
      scored.push({ ...failScore, candidate });
      continue;
    }

    const barrier = await checkBarrier(subject, candidate, opts);
    const barrierScoreOpts = barrier.degraded
      ? { barrierUnavailable: true }
      : { barrierCrossed: barrier.crossed };

    const result = scoreComp(subject, candidate, {
      ladderLevel,
      referenceDate: opts.referenceDate,
      neighborhoodPpsfMedian,
      ...barrierScoreOpts,
    });
    scored.push({ ...result, candidate });
  }

  return scored;
}

function countIncludedEligible(scored) {
  return scored.filter((s) => s.includedEligible).length;
}

/**
 * Build PropertyComps body. Pull band is wider than Comping Rules score band so the
 * API can return candidates; year filters are omitted (age is scored in rules).
 * Thin ladder (2) widens size/beds/recency for small / thin markets.
 */
function buildPropertyCompsBody(subject, { radius, ladderLevel = 0 } = {}) {
  const ladder = Number(ladderLevel) || 0;
  const body = {
    address: subject.fullAddress || subject.address,
    max_radius_miles: radius,
    max_days_back: ladder >= 2 ? 730 : 180,
  };

  const beds = Number(subject.beds) || 0;
  const baths = Number(subject.baths) || 0;
  const bedPad = ladder >= 2 ? 2 : 1;
  const bathPad = ladder >= 2 ? 2 : 1;
  if (beds > 0) {
    body.bedrooms_min = Math.max(0, beds - bedPad);
    body.bedrooms_max = beds + bedPad;
  }
  if (baths > 0) {
    body.bathrooms_min = Math.max(0, baths - bathPad);
    body.bathrooms_max = baths + bathPad;
  }

  const sqft = Number(subject.sqft) || 0;
  if (sqft > 0) {
    // Pull wider than score band (±10% / ±250) so tiny subjects still get candidates.
    const pct = ladder >= 2 ? 0.40 : 0.25;
    const absFloor = ladder >= 2 ? 350 : 200;
    const delta = Math.max(Math.round(sqft * pct), absFloor);
    body.living_square_feet_min = Math.max(0, sqft - delta);
    body.living_square_feet_max = sqft + delta;
  }

  return body;
}

async function runConcentricLoop(subject, reapi, opts) {
  const seen = new Set();
  const allCandidates = [];
  const allScored = [];
  let ladderLevel = 0;
  let finalLadderLevel = 0;

  const radiiPlan = [...RADII.map((r) => ({ radius: r, ladder: 0 }))];
  for (const r of THIN_RADII) {
    radiiPlan.push({ radius: r, ladder: 2 });
  }

  for (const step of radiiPlan) {
    const { radius, ladder } = step;
    ladderLevel = ladder;
    finalLadderLevel = ladder;

    // PropertyComps accepts address|id + max_radius_miles — not lat/lng/radius.
    const body = buildPropertyCompsBody(subject, { radius, ladderLevel: ladder });

    const raw = await reapi.propertyComps(body);
    const mapped = mapReapiCompsResponse(raw);
    const fresh = [];
    for (const c of mapped) {
      const key = compKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      allCandidates.push(c);
      fresh.push(c);
    }

    if (fresh.length) {
      const scored = await scoreCandidates(subject, fresh, opts, ladderLevel);
      allScored.push(...scored);
    }

    if (countIncludedEligible(allScored) >= MIN_INCLUDED) break;
  }

  return { scored: allScored, ladderLevel: finalLadderLevel };
}

async function runAutoComp(lead, opts = {}) {
  clearBarrierCache();

  if (isNonDisclosureState(lead.state)) {
    return { needsManual: true, ok: false };
  }

  if (lead.leadType === 'land') {
    return { ok: false, error: 'Land Comp out of scope' };
  }

  const reapi = opts.reapi;
  if (!reapi?.propertyComps) {
    return { ok: false, error: 'REAPI client not configured' };
  }

  let detail = {};
  const subjectAddress = formatSubjectAddress(lead);
  if (reapi.propertyDetail && subjectAddress) {
    try {
      detail = await reapi.propertyDetail({ address: subjectAddress });
    } catch {
      detail = {};
    }
  }

  const subject = buildSubject(lead, detail);
  if (!subject.fullAddress && !subject.address) {
    return { ok: false, error: 'Lead address required for Comp' };
  }
  const { scored, ladderLevel } = await runConcentricLoop(subject, reapi, opts);

  const actives = await fetchActives(reapi, subject);
  const marketTag = resolveMarketTag(actives);

  const arvResult = computeArvFromComps(subject, scored, { marketTag });
  const renovationLikelyCount = arvResult.included.filter((c) => c.renovation === 'likely').length;
  const confidence = assessConfidence({
    included: arvResult.included.length,
    ladderLevel,
    marketTag,
    renovationLikelyCount,
  });

  const rulesSummary = buildRulesSummary(scored);
  const compedAt = new Date().toISOString();

  const newArv = confidence === 'blocked' ? null : arvResult.arv;
  const preservedArv = confidence === 'blocked' ? priorCompArvToPreserve(lead) : null;
  const estARV = preservedArv != null ? preservedArv : newArv;
  const sanityNotes = [];
  if (detail.estimatedValue) {
    sanityNotes.push('Vendor AVM shown for sanity only — not used as ARV');
  }
  if (preservedArv != null) {
    sanityNotes.push(`Prior Comp ARV $${preservedArv.toLocaleString('en-US')} kept — new run blocked`);
  }
  if (ladderLevel >= 2) {
    sanityNotes.push('Thin-comps ladder — wider radius/size/recency pull used');
  }

  const report = {
    version: REPORT_VERSION,
    subject: {
      ...subject,
      streetViewUrl: streetViewUrl(subject),
    },
    arv: newArv,
    arvMethod: arvResult.method,
    confidence,
    source: 'reapi',
    rulesSummary,
    marketTag,
    haircuts: arvResult.haircuts,
    sanity: {
      avm: detail.estimatedValue ?? null,
      newConstructionCeiling: detail.newConstructionCeiling ?? null,
      notes: sanityNotes,
    },
    generatedAt: compedAt,
    ladderLevel,
    includedCount: arvResult.included.length,
    excludedCount: arvResult.excluded.length,
    arvPreserved: preservedArv != null,
    preservedArv: preservedArv,
  };

  const leadPatch = {
    compedAt,
    compSource: 'reapi',
    compConfidence: confidence,
    comps: buildLeadComps(scored, arvResult.included),
    compingReport: report,
    estARV,
  };

  return {
    ok: true,
    leadPatch,
    report,
  };
}

module.exports = {
  runAutoComp,
  buildSubject,
  buildRulesSummary,
  formatSubjectAddress,
  priorCompArvToPreserve,
  buildPropertyCompsBody,
};
