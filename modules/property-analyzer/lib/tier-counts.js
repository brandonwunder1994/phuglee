const {
  resultCategory,
  isBlurredImagery,
  isClassifiedResult,
  computeNeedsReview,
  resultLeadTier
} = require('./result-classify');

const US_STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

const US_STATE_NAME_TO_ABBR = Object.create(null);
for (const [abbr, name] of Object.entries(US_STATE_NAMES)) {
  US_STATE_NAME_TO_ABBR[name.toLowerCase()] = abbr;
  US_STATE_NAME_TO_ABBR[abbr.toLowerCase()] = abbr;
}

function normalizeStateAbbr(state) {
  if (!state) return '';
  const raw = String(state).trim();
  if (!raw) return '';
  if (raw.length === 2) return raw.toUpperCase();
  return US_STATE_NAME_TO_ABBR[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

function emptyTierBucket() {
  return {
    all: 0,
    distressed: 0,
    well_maintained: 0,
    vacant: 0,
    blurred: 0,
    review: 0
  };
}

/** Accumulate one result into a tier bucket (mutates bucket). */
function accumulateResultIntoBucket(bucket, r) {
  bucket.all += 1;
  if (computeNeedsReview(r)) bucket.review += 1;
  if (isBlurredImagery(r)) bucket.blurred += 1;
  if (!isClassifiedResult(r)) return;
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') {
    bucket.vacant += 1;
    return;
  }
  if (isBlurredImagery(r)) return;
  if (cat !== 'property') return;
  const tier = resultLeadTier(r);
  if (tier === 'distressed') bucket.distressed += 1;
  else if (tier === 'well_maintained') bucket.well_maintained += 1;
}

function computeTierCounts(results) {
  const list = results || [];
  const bucket = emptyTierBucket();
  for (const r of list) accumulateResultIntoBucket(bucket, r);
  return normalizeTierCounts(bucket, list.length);
}

/**
 * Per-state (and per-city) tier totals for accurate historical KPIs without
 * shipping the full result array to the browser first.
 */
function computeGeoTierCounts(results) {
  const byState = Object.create(null);
  const unknown = emptyTierBucket();

  for (const r of results || []) {
    const city = String(r?.city || '').trim();
    const abbr = normalizeStateAbbr(r?.state);
    if (!city && !abbr) {
      accumulateResultIntoBucket(unknown, r);
      continue;
    }
    const stateKey = abbr || '__unknown__';
    let stateBucket = byState[stateKey];
    if (!stateBucket) {
      stateBucket = emptyTierBucket();
      stateBucket.cities = Object.create(null);
      byState[stateKey] = stateBucket;
    }
    accumulateResultIntoBucket(stateBucket, r);
    if (city) {
      let cityBucket = stateBucket.cities[city];
      if (!cityBucket) {
        cityBucket = emptyTierBucket();
        stateBucket.cities[city] = cityBucket;
      }
      accumulateResultIntoBucket(cityBucket, r);
    }
  }

  const states = Object.keys(byState)
    .map((key) => {
      const b = byState[key];
      const cities = Object.keys(b.cities || {})
        .map((name) => {
          const c = b.cities[name];
          return {
            name,
            total: c.all,
            tierCounts: {
              all: c.all,
              distressed: c.distressed,
              well_maintained: c.well_maintained,
              vacant: c.vacant,
              blurred: c.blurred,
              review: c.review
            }
          };
        })
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      return {
        abbr: key,
        name: US_STATE_NAMES[key] || (key === '__unknown__' ? 'Unknown location' : key),
        total: b.all,
        tierCounts: {
          all: b.all,
          distressed: b.distressed,
          well_maintained: b.well_maintained,
          vacant: b.vacant,
          blurred: b.blurred,
          review: b.review
        },
        cities
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    states,
    unknownTotal: unknown.all,
    unknownTier: {
      all: unknown.all,
      distressed: unknown.distressed,
      well_maintained: unknown.well_maintained,
      vacant: unknown.vacant,
      blurred: unknown.blurred,
      review: unknown.review
    }
  };
}

/** Ensure tierCounts.all reflects every scanned row, not classified-only. */
function normalizeTierCounts(counts, totalScanned) {
  const base = counts && typeof counts === 'object' ? { ...counts } : {};
  const total = Math.max(Number(totalScanned) || 0, Number(base.all) || 0);
  if (total > 0) base.all = total;
  return base;
}

module.exports = {
  computeTierCounts,
  computeGeoTierCounts,
  normalizeTierCounts,
  normalizeStateAbbr,
  emptyTierBucket,
  accumulateResultIntoBucket
};
