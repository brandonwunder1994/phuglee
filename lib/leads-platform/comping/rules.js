/**
 * Comping Rules scorer — one candidate vs subject.
 * Product language: Comping Rules (not Compmandments).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DISTANCE_THRESHOLDS = [
  { ladderLevel: 0, pass: 0.5, soft: 1.0, fail: Infinity },
  { ladderLevel: 1, pass: 1.0, soft: 5.0, fail: Infinity },
  { ladderLevel: 2, pass: 5.0, soft: 5.0, fail: Infinity },
];

const RECENCY_THRESHOLDS = [
  { ladderLevel: 0, pass: 180, soft: 365, fail: Infinity },
  { ladderLevel: 1, pass: 365, soft: 730, fail: Infinity },
  { ladderLevel: 2, pass: 730, soft: 730, fail: Infinity },
];

function worstStatus(a, b) {
  const rank = { pass: 0, soft: 1, fail: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function daysBetween(soldDate, referenceDate) {
  const sold = new Date(soldDate);
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(sold.getTime())) return Infinity;
  return Math.floor((ref - sold) / MS_PER_DAY);
}

function getThresholdRow(table, ladderLevel) {
  let row = table[0];
  for (const candidate of table) {
    if (ladderLevel >= candidate.ladderLevel) row = candidate;
  }
  return row;
}

function classifyRenovation(candidate, opts = {}) {
  let score = 0;

  if (candidate.cashBuyer) score += 1;
  if (candidate.priorSaleDate && candidate.soldDate) {
    const holdDays = daysBetween(candidate.priorSaleDate, candidate.soldDate);
    if (holdDays > 0 && holdDays <= 540) score += 2;
  }

  const sqft = Number(candidate.sqft) || 0;
  const price = Number(candidate.price) || 0;
  const median = Number(opts.neighborhoodPpsfMedian) || 0;
  if (sqft > 0 && price > 0 && median > 0) {
    const ppsf = price / sqft;
    if (ppsf >= median * 1.15) score += 2;
    else if (ppsf >= median * 1.05) score += 1;
    else if (ppsf < median * 0.85) score -= 2;
  }

  if (candidate.mlsHasPhotos || candidate.soldViaMls) score += 1;
  if (candidate.distressed || candidate.asIs) score -= 2;

  if (score >= 3) return 'likely';
  if (score <= -1) return 'as_is';
  return 'uncertain';
}

/** Nominal floor — excludes quitclaims / token / non-market stamps from house Comping. */
const MIN_USABLE_SALE_PRICE = 10000;

function ruleUsablePrice(candidate, opts = {}) {
  const price = Number(candidate.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { id: 'usable_price', status: 'fail', detail: 'Missing or zero sale price' };
  }
  if (price < MIN_USABLE_SALE_PRICE) {
    return {
      id: 'usable_price',
      status: 'fail',
      detail: `Sale price $${price.toLocaleString()} below $${MIN_USABLE_SALE_PRICE.toLocaleString()} floor`
    };
  }
  const sqft = Number(candidate.sqft) || 0;
  const median = Number(opts.neighborhoodPpsfMedian) || 0;
  if (sqft > 0 && median > 0) {
    const ppsf = price / sqft;
    if (ppsf < median * 0.25) {
      return {
        id: 'usable_price',
        status: 'fail',
        detail: `PPSF $${Math.round(ppsf)} far below neighborhood ~$${Math.round(median)}`
      };
    }
  }
  return { id: 'usable_price', status: 'pass', detail: `Sold price $${price.toLocaleString()}` };
}

function ruleSizeBand(subject, candidate) {
  const subSqft = Number(subject.sqft) || 0;
  const candSqft = Number(candidate.sqft) || 0;
  if (subSqft <= 0 || candSqft <= 0) {
    return { id: 'size_band', status: 'soft', detail: 'Missing sqft on subject or comp' };
  }
  const pctDiff = Math.abs(candSqft - subSqft) / subSqft;
  if (pctDiff > 0.10) {
    return { id: 'size_band', status: 'fail', detail: `Sqft ${candSqft} outside ±10% of ${subSqft}` };
  }
  if (pctDiff > 0.067) {
    return { id: 'size_band', status: 'soft', detail: `Sqft ${candSqft} near edge of ±10% band` };
  }
  return { id: 'size_band', status: 'pass', detail: `Sqft ${candSqft} within band` };
}

function ruleBedsBaths(subject, candidate) {
  const subBeds = Number(subject.beds) || 0;
  const candBeds = Number(candidate.beds) || 0;
  const subBaths = Number(subject.baths) || 0;
  const candBaths = Number(candidate.baths) || 0;
  const bedDiff = Math.abs(subBeds - candBeds);
  const bathDiff = Math.abs(subBaths - candBaths);

  if (bedDiff >= 2 || bathDiff >= 2) {
    return {
      id: 'beds_baths',
      status: 'fail',
      detail: `Bed/bath mismatch ${candBeds}/${candBaths} vs subject ${subBeds}/${subBaths}`,
    };
  }
  if (bedDiff === 1 || bathDiff === 1) {
    return {
      id: 'beds_baths',
      status: 'soft',
      detail: `Bed/bath off by one: ${candBeds}/${candBaths} vs ${subBeds}/${subBaths}`,
    };
  }
  return { id: 'beds_baths', status: 'pass', detail: 'Beds/baths match' };
}

function ruleDistance(candidate, opts) {
  const dist = Number(candidate.distanceMi);
  if (!Number.isFinite(dist)) {
    return { id: 'distance', status: 'soft', detail: 'Distance unknown' };
  }
  const ladder = Number(opts.ladderLevel) || 0;
  const t = getThresholdRow(DISTANCE_THRESHOLDS, ladder);
  if (dist > t.soft && t.soft < t.fail) {
    return { id: 'distance', status: 'fail', detail: `${dist} mi exceeds ${t.soft} mi band` };
  }
  if (dist > t.pass) {
    return { id: 'distance', status: 'soft', detail: `${dist} mi between ${t.pass} and ${t.soft} mi` };
  }
  return { id: 'distance', status: 'pass', detail: `${dist} mi within ${t.pass} mi` };
}

function ruleRecency(candidate, opts) {
  const days = daysBetween(candidate.soldDate, opts.referenceDate);
  if (!Number.isFinite(days) || days < 0) {
    return { id: 'recency', status: 'soft', detail: 'Sold date unknown' };
  }
  const ladder = Number(opts.ladderLevel) || 0;
  const t = getThresholdRow(RECENCY_THRESHOLDS, ladder);
  if (days > t.soft && t.soft < t.fail) {
    return { id: 'recency', status: 'fail', detail: `Sold ${days}d ago exceeds ${t.soft}d window` };
  }
  if (days > t.pass) {
    return { id: 'recency', status: 'soft', detail: `Sold ${days}d ago (>${t.pass}d)` };
  }
  return { id: 'recency', status: 'pass', detail: `Sold ${days}d ago` };
}

function ruleAge(subject, candidate) {
  const subYear = Number(subject.yearBuilt) || 0;
  const candYear = Number(candidate.yearBuilt) || 0;
  if (subYear <= 0 || candYear <= 0) {
    return { id: 'age', status: 'soft', detail: 'Year built unknown' };
  }
  const diff = Math.abs(subYear - candYear);
  if (diff > 20) {
    return { id: 'age', status: 'fail', detail: `Year built ${candYear} vs subject ${subYear}` };
  }
  if (diff > 10) {
    return { id: 'age', status: 'soft', detail: `Year built ${candYear} ±${diff}y from subject` };
  }
  return { id: 'age', status: 'pass', detail: `Year built ${candYear} within ±10y` };
}

function rulePropertyType(subject, candidate) {
  const subType = String(subject.propertyType || 'sfr').toLowerCase();
  const candType = String(candidate.propertyType || 'sfr').toLowerCase();
  if (subType !== candType) {
    return { id: 'property_type', status: 'fail', detail: `${candType} vs subject ${subType}` };
  }
  return { id: 'property_type', status: 'pass', detail: `Type ${candType}` };
}

function ruleRenovation(candidate, opts) {
  const renovation = classifyRenovation(candidate, opts);
  if (renovation === 'as_is') {
    return { id: 'renovation', status: 'soft', detail: 'Likely as-is / distressed sale' };
  }
  if (renovation === 'uncertain') {
    return { id: 'renovation', status: 'pass', detail: 'Renovation status uncertain — flagged' };
  }
  return { id: 'renovation', status: 'pass', detail: 'Likely renovated' };
}

function ruleBarrier(opts) {
  if (opts.barrierCrossed === true) {
    return { id: 'barrier', status: 'fail', detail: 'Major road/barrier crossed' };
  }
  if (opts.barrierCrossed === null || opts.barrierUnavailable) {
    return { id: 'barrier', status: 'soft', detail: 'Barrier check unavailable — verify roads' };
  }
  return { id: 'barrier', status: 'pass', detail: 'No barrier detected' };
}

function scoreComp(subject, candidate, opts = {}) {
  const rules = [
    ruleUsablePrice(candidate, opts),
    rulePropertyType(subject, candidate),
    ruleSizeBand(subject, candidate),
    ruleBedsBaths(subject, candidate),
    ruleDistance(candidate, opts),
    ruleRecency(candidate, opts),
    ruleAge(subject, candidate),
    ruleRenovation(candidate, opts),
    ruleBarrier(opts),
  ];

  let status = 'pass';
  for (const rule of rules) {
    status = worstStatus(status, rule.status);
  }

  const renovation = classifyRenovation(candidate, opts);

  return {
    status,
    rules,
    renovation,
    includedEligible: status !== 'fail',
  };
}

module.exports = { scoreComp, classifyRenovation, MIN_USABLE_SALE_PRICE };
