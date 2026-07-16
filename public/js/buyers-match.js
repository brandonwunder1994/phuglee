/**
 * Buyers desk buy-box matcher
 * Tri-state flags (true|false|null), token geo match, hits/blockers/unknowns.
 * Speed-aware ranking among same-tier fits.
 */
(function (root) {
  'use strict';

  const TIER_STRONG = 'strong';
  const TIER_PARTIAL = 'partial';
  const TIER_MISS = 'miss';
  const TIER_UNKNOWN = 'unknown';

  const STATE_ALIASES = {
    texas: 'tx', tx: 'tx',
    california: 'ca', ca: 'ca',
    florida: 'fl', fl: 'fl',
    ohio: 'oh', oh: 'oh',
    newyork: 'ny', 'new york': 'ny', ny: 'ny',
    michigan: 'mi', mi: 'mi',
    georgia: 'ga', ga: 'ga',
    colorado: 'co', co: 'co',
    northcarolina: 'nc', 'north carolina': 'nc', nc: 'nc'
  };

  function num(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function str(v) {
    return String(v == null ? '' : v).trim().toLowerCase();
  }

  function flagVal(v) {
    if (v === true || v === 1 || v === '1' || v === 'yes' || v === 'true') return true;
    if (v === false || v === 0 || v === '0' || v === 'no' || v === 'false') return false;
    return null;
  }

  function normalizeState(raw) {
    const s = str(raw);
    if (!s) return '';
    const key = s.replace(/\./g, '').replace(/\s+/g, ' ');
    const compact = key.replace(/\s+/g, '');
    return STATE_ALIASES[key] || STATE_ALIASES[compact] || (s.length === 2 ? s : '');
  }

  function tokenizePlace(text) {
    return str(text)
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function hasDealGeo(deal) {
    return !!(str(deal.state) || str(deal.city) || str(deal.market) || str(deal.zip));
  }

  function zipMatches(box, deal) {
    const zip = str(deal.zip).replace(/\D/g, '');
    if (!zip) return null;
    const prefixes = box.zipPrefixes || [];
    if (!prefixes.length) return null;
    return prefixes.some((p) => zip.startsWith(String(p)));
  }

  function stateMatches(box, deal) {
    const dealState = normalizeState(deal.state);
    if (!dealState) return null;
    const states = (box.states || []).map(normalizeState).filter(Boolean);
    if (!states.length) return null;
    return states.includes(dealState);
  }

  /**
   * Exact token / multi-word alias match — never substring ("la" must not hit Plano).
   */
  function marketMatches(box, deal) {
    const city = str(deal.city || deal.market);
    if (!city) return null;
    const cityTokens = tokenizePlace(city);
    const cityNorm = cityTokens.join(' ');

    const needles = []
      .concat(box.markets || [])
      .concat(box.marketAliases || [])
      .map(str)
      .filter(Boolean);

    if (!needles.length) return null;

    for (const needle of needles) {
      const nTokens = tokenizePlace(needle);
      if (!nTokens.length) continue;
      // Single-token markets must equal a full city token (blocks "la" in "plano")
      if (nTokens.length === 1) {
        if (cityTokens.includes(nTokens[0]) || cityNorm === nTokens[0]) return true;
        continue;
      }
      // Multi-word: city must equal or start with alias phrase as whole words
      if (cityNorm === nTokens.join(' ') || cityNorm.startsWith(nTokens.join(' ') + ' ')) {
        return true;
      }
      // Sliding window of city tokens
      for (let i = 0; i <= cityTokens.length - nTokens.length; i++) {
        if (cityTokens.slice(i, i + nTokens.length).join(' ') === nTokens.join(' ')) return true;
      }
    }
    return false;
  }

  function scoreGeography(box, deal) {
    if (!hasDealGeo(deal)) return null;

    const stateHit = stateMatches(box, deal);
    const marketHit = marketMatches(box, deal);
    const zipHit = zipMatches(box, deal);

    if (zipHit === true) return { hit: true, reason: 'geo hit (zip)', label: 'Geography' };
    if (marketHit === true) return { hit: true, reason: 'geo hit (market)', label: 'Geography' };

    if (stateHit === true) {
      const hasSpecific = (box.markets && box.markets.length) || (box.zipPrefixes && box.zipPrefixes.length);
      if (!hasSpecific) return { hit: true, reason: 'geo hit (state)', label: 'Geography' };
      if (!str(deal.city) && !str(deal.market) && !str(deal.zip)) {
        return { hit: true, reason: 'geo hit (state)', label: 'Geography' };
      }
      if (marketHit === false && zipHit !== true) {
        return { hit: false, reason: 'geo miss (market)', label: 'Geography', fix: 'City/market must match this fund’s listed markets' };
      }
      return { hit: true, reason: 'geo hit (state)', label: 'Geography' };
    }

    if (stateHit === false) {
      return { hit: false, reason: 'geo miss (state)', label: 'Geography', fix: 'Wrong state for this fund' };
    }
    if (marketHit === false || zipHit === false) {
      return { hit: false, reason: 'geo miss', label: 'Geography', fix: 'Market/zip outside this fund’s box' };
    }
    return { hit: false, reason: 'geo miss', label: 'Geography', fix: 'Could not confirm geography' };
  }

  function assetMatches(box, deal) {
    const asset = str(deal.assetType);
    const allowed = (box.assetTypes || []).map(str);
    if (!asset) return { ok: true, reason: null, unknown: true };
    if (!allowed.length) return { ok: true, reason: null };
    if (allowed.includes(asset)) return { ok: true, reason: 'asset ok' };
    if (asset === 'teardown' && allowed.includes('land')) return { ok: true, reason: 'asset ok (teardown)' };
    if (asset === 'land' && allowed.includes('teardown')) return { ok: true, reason: 'asset ok (land)' };
    if (box.landOnly && (asset === 'sfh' || asset === 'duplex')) {
      return { ok: false, reason: 'land buyer — house miss', fix: 'This fund buys land/teardown, not houses' };
    }
    if (!box.landOnly && (asset === 'land' || asset === 'teardown')) {
      return { ok: false, reason: 'house buyer — land miss', fix: 'This fund buys houses, not land' };
    }
    return { ok: false, reason: 'asset miss', fix: 'Asset type outside box' };
  }

  function bandCheck(value, min, max, label) {
    if (value == null) return { weight: 0, hit: null, reason: null, unknown: true, label };
    if (min != null && value < min) {
      return { weight: 1, hit: false, reason: `${label} low`, label, fix: `Need ${label} ≥ ${min}` };
    }
    if (max != null && value > max) {
      return { weight: 1, hit: false, reason: `${label} high`, label, fix: `Need ${label} ≤ ${max}` };
    }
    return { weight: 1, hit: true, reason: `${label} ok`, label };
  }

  function scoreFlag(preferred, required, value, yesLabel, noLabel, fix) {
    if (!preferred && !required) return null;
    const f = flagVal(value);
    if (f === null) {
      return { weight: required || preferred ? 1 : 0, hit: null, unknown: true, reason: noLabel + '?', label: noLabel, fix: `Answer ${noLabel}` };
    }
    if (f === true) {
      return { weight: 1, hit: true, reason: yesLabel, label: noLabel };
    }
    if (required) {
      return { weight: 1, hit: false, reason: noLabel + ' required', label: noLabel, fix };
    }
    // preferred but false — soft miss
    return { weight: 1, hit: false, reason: noLabel + ' preferred', label: noLabel, fix };
  }

  function emptyLists() {
    return { hits: [], blockers: [], unknowns: [] };
  }

  function pushList(lists, kind, item) {
    if (!item || !item.reason) return;
    const row = {
      reason: item.reason,
      label: item.label || item.reason,
      fix: item.fix || null
    };
    if (kind === 'hit') lists.hits.push(row);
    else if (kind === 'block') lists.blockers.push(row);
    else lists.unknowns.push(row);
  }

  function scoreBuyBox(box, deal) {
    const lists = emptyLists();
    let points = 0;
    let possible = 0;

    const geo = scoreGeography(box, deal);
    if (geo) {
      if (!geo.hit) {
        pushList(lists, 'block', geo);
        return {
          tier: TIER_MISS,
          score: 0,
          reasons: [geo.reason],
          hits: lists.hits,
          blockers: lists.blockers,
          unknowns: lists.unknowns,
          boxId: box.id,
          boxLabel: box.label
        };
      }
      pushList(lists, 'hit', geo);
      points += 3;
      possible += 3;
    }

    const asset = assetMatches(box, deal);
    if (asset.unknown) {
      pushList(lists, 'unknown', { reason: 'asset?', label: 'Asset type', fix: 'Pick SFH / duplex / land / teardown' });
    } else {
      possible += 2;
      if (asset.ok) {
        points += 2;
        if (asset.reason) pushList(lists, 'hit', { reason: asset.reason, label: 'Asset' });
      } else {
        pushList(lists, 'block', { reason: asset.reason, label: 'Asset', fix: asset.fix });
        return {
          tier: TIER_MISS,
          score: 0,
          reasons: [asset.reason],
          hits: lists.hits,
          blockers: lists.blockers,
          unknowns: lists.unknowns,
          boxId: box.id,
          boxLabel: box.label
        };
      }
    }

    const sqft = num(deal.sqft);
    const beds = num(deal.beds);
    const baths = num(deal.baths);
    const year = num(deal.yearBuilt);
    const asking = num(deal.asking);
    const arv = num(deal.arv);
    const rehab = num(deal.rehab);
    const acres = num(deal.acres);

    let minBeds = box.minBeds;
    let minBaths = box.minBaths;
    if (flagVal(deal.leaseback) === true && box.minBedsLeaseback != null) {
      minBeds = box.minBedsLeaseback;
      minBaths = box.minBathsLeaseback != null ? box.minBathsLeaseback : minBaths;
    }

    // Flags — only weight when answered
    const flagSpecs = [
      scoreFlag(box.brickPreferred, false, deal.brick, 'brick ok', 'Brick', 'Prefer brick construction'),
      scoreFlag(false, box.garageRequired, deal.garage, 'garage ok', 'Garage', 'Needs 2-car garage'),
      scoreFlag(box.offMarketPreferred && !box.offMarketRequired, box.offMarketRequired, deal.offMarket, 'off-market ok', 'Off-market', 'Off-market required'),
      scoreFlag(box.leasebackPreferred, false, deal.leaseback, 'leaseback angle', 'Leaseback', 'Leaseback preferred'),
      scoreFlag(box.waterfrontPreferred, false, deal.waterfront, 'waterfront bonus', 'Waterfront', 'Waterfront is a bonus'),
      scoreFlag(box.landOnly || box.infillPreferred, false, deal.buildable, 'buildable', 'Buildable', 'Confirm buildable'),
      scoreFlag(false, box.roadAccessRequired, deal.roadAccess, 'road access ok', 'Road access', 'Road access required'),
      scoreFlag(box.infillPreferred, false, deal.utilitiesNearby, 'utils nearby', 'Utilities', 'Utils nearby preferred')
    ];

    for (const f of flagSpecs) {
      if (!f || f.weight === 0) continue;
      if (f.unknown) {
        pushList(lists, 'unknown', f);
        continue;
      }
      possible += f.weight;
      if (f.hit) {
        points += f.weight;
        pushList(lists, 'hit', f);
      } else {
        pushList(lists, 'block', f);
      }
    }

    // Bonus-only off-market preferred when true and not required (already in scoreFlag)
    // Band checks
    const checks = [
      bandCheck(sqft, box.minSqft, box.maxSqft, 'sqft'),
      bandCheck(beds, minBeds, null, 'beds'),
      bandCheck(baths, minBaths, null, 'baths'),
      bandCheck(year, box.minYear, box.maxYear, 'year'),
      bandCheck(asking, null, box.maxPurchase, 'price'),
      bandCheck(arv, box.minArv, box.maxArv, 'ARV'),
      bandCheck(rehab, box.minRehab, box.maxRehab, 'rehab'),
      bandCheck(acres, box.minAcres, box.maxAcres, 'acres')
    ];

    if (box.sqftFlexible && sqft != null && checks[0].hit === false) {
      checks[0] = { weight: 0.5, hit: true, reason: 'sqft flexible', label: 'sqft' };
    }

    for (const c of checks) {
      if (c.unknown) {
        if (c.label && (box['min' + c.label.charAt(0).toUpperCase() + c.label.slice(1)] != null
          || box['max' + c.label.charAt(0).toUpperCase() + c.label.slice(1)] != null
          || (c.label === 'price' && box.maxPurchase != null)
          || (c.label === 'ARV' && (box.minArv != null || box.maxArv != null))
          || (c.label === 'rehab' && (box.minRehab != null || box.maxRehab != null))
          || (c.label === 'acres' && (box.minAcres != null || box.maxAcres != null))
          || (c.label === 'sqft' && (box.minSqft != null || box.maxSqft != null))
          || (c.label === 'beds' && minBeds != null)
          || (c.label === 'baths' && minBaths != null)
          || (c.label === 'year' && (box.minYear != null || box.maxYear != null)))) {
          pushList(lists, 'unknown', { reason: c.label + '?', label: c.label, fix: 'Fill ' + c.label });
        }
        continue;
      }
      if (c.weight === 0 || c.hit == null) continue;
      possible += c.weight;
      if (c.hit) {
        points += c.weight;
        pushList(lists, 'hit', c);
      } else {
        pushList(lists, 'block', c);
      }
    }

    const cond = str(deal.condition);
    if (cond && box.conditionBand && box.conditionBand !== 'any' && !box.anyCondition) {
      possible += 1;
      const heavy = cond === 'heavy' || cond === 'gut' || cond === 'full-gut';
      if (heavy && (box.conditionBand === 'light' || box.conditionBand === 'light-medium')) {
        pushList(lists, 'block', { reason: 'rehab too heavy', label: 'Condition', fix: 'Light–medium only' });
      } else {
        points += 1;
        pushList(lists, 'hit', { reason: 'condition ok', label: 'Condition' });
      }
    } else if (!cond && box.conditionBand && box.conditionBand !== 'any' && !box.anyCondition) {
      pushList(lists, 'unknown', { reason: 'condition?', label: 'Condition', fix: 'Set condition band' });
    }

    const score = possible > 0 ? Math.round((points / possible) * 100) : (geo ? 60 : 0);
    let tier = TIER_MISS;
    if (score >= 70) tier = TIER_STRONG;
    else if (score >= 40) tier = TIER_PARTIAL;

    const reasons = []
      .concat(lists.hits.map((h) => h.reason))
      .concat(lists.blockers.map((b) => b.reason))
      .slice(0, 10);

    return {
      tier,
      score,
      reasons,
      hits: lists.hits,
      blockers: lists.blockers,
      unknowns: lists.unknowns,
      boxId: box.id,
      boxLabel: box.label
    };
  }

  function tierRank(tier) {
    if (tier === TIER_STRONG) return 3;
    if (tier === TIER_PARTIAL) return 2;
    if (tier === TIER_UNKNOWN) return 1;
    return 0;
  }

  function scoreFund(fund, deal) {
    const boxes = fund.buyBoxes || [];
    if (!boxes.length) {
      return {
        fundId: fund.id,
        fund,
        tier: TIER_MISS,
        score: 0,
        reasons: ['no buy boxes'],
        hits: [],
        blockers: [{ reason: 'no buy boxes', label: 'Box', fix: null }],
        unknowns: [],
        bestBox: null,
        boxScores: []
      };
    }

    const boxScores = boxes.map((box) => scoreBuyBox(box, deal));
    let best = boxScores[0];
    for (let i = 1; i < boxScores.length; i++) {
      const r = boxScores[i];
      if (r.score > best.score || (r.score === best.score && tierRank(r.tier) > tierRank(best.tier))) {
        best = r;
      }
    }

    return {
      fundId: fund.id,
      fund,
      tier: best.tier,
      score: best.score,
      reasons: best.reasons,
      hits: best.hits,
      blockers: best.blockers,
      unknowns: best.unknowns,
      bestBox: best,
      boxScores
    };
  }

  function dealHasInputs(deal) {
    if (!deal) return false;
    return !!(
      str(deal.state) || str(deal.city) || str(deal.market) || str(deal.zip)
      || num(deal.sqft) != null || num(deal.asking) != null || num(deal.arv) != null
      || num(deal.rehab) != null || num(deal.acres) != null
      || num(deal.beds) != null || num(deal.baths) != null || num(deal.yearBuilt) != null
      || str(deal.condition) || str(deal.assetType)
      || flagVal(deal.brick) != null || flagVal(deal.garage) != null
      || flagVal(deal.offMarket) != null || flagVal(deal.leaseback) != null
      || flagVal(deal.waterfront) != null || flagVal(deal.buildable) != null
      || flagVal(deal.roadAccess) != null || flagVal(deal.utilitiesNearby) != null
    );
  }

  function isLandAsset(deal) {
    const a = str(deal && deal.assetType);
    return a === 'land' || a === 'teardown';
  }

  function rankFunds(funds, deal, opts) {
    const list = Array.isArray(funds) ? funds : [];
    const options = opts || {};
    const cluster = str(options.cluster);
    const stateFilter = normalizeState(options.stateFilter || '');
    const tierFilter = str(options.tierFilter || '');

    let rows;
    if (!dealHasInputs(deal)) {
      rows = list.map((fund) => ({
        fundId: fund.id,
        fund,
        tier: TIER_UNKNOWN,
        score: 0,
        reasons: [],
        hits: [],
        blockers: [],
        unknowns: [],
        bestBox: null,
        boxScores: []
      }));
    } else {
      rows = list.map((fund) => scoreFund(fund, deal));
    }

    if (cluster) {
      rows = rows.filter((r) => (r.fund.strategyClusters || []).map(str).includes(cluster));
    }

    if (stateFilter) {
      rows = rows.filter((r) => {
        const boxes = r.fund.buyBoxes || [];
        return boxes.some((b) => (b.states || []).map(normalizeState).includes(stateFilter));
      });
    }

    if (tierFilter && dealHasInputs(deal)) {
      rows = rows.filter((r) => r.tier === tierFilter);
    }

    const landFirst = isLandAsset(deal);
    const speedOf = (fund) => {
      const s = str((fund.personality && fund.personality.speed) || 'normal');
      const rank = { hours: 5, fast: 4, weekly: 3, normal: 2, process: 1 };
      return rank[s] || 2;
    };
    rows.sort((a, b) => {
      const tr = tierRank(b.tier) - tierRank(a.tier);
      if (tr !== 0) return tr;
      if (landFirst) {
        const aLand = (a.fund.strategyClusters || []).includes('land') ? 1 : 0;
        const bLand = (b.fund.strategyClusters || []).includes('land') ? 1 : 0;
        if (bLand !== aLand) return bLand - aLand;
      }
      // Among same tier: faster closers first, then score
      const sp = speedOf(b.fund) - speedOf(a.fund);
      if (sp !== 0) return sp;
      if (b.score !== a.score) return b.score - a.score;
      return str(a.fund.name).localeCompare(str(b.fund.name));
    });

    return rows;
  }

  function countTiers(rows) {
    const c = { strong: 0, partial: 0, miss: 0, unknown: 0 };
    for (const r of rows || []) {
      if (c[r.tier] != null) c[r.tier] += 1;
    }
    return c;
  }

  const api = {
    TIER_STRONG,
    TIER_PARTIAL,
    TIER_MISS,
    TIER_UNKNOWN,
    num,
    str,
    flagVal,
    normalizeState,
    hasDealGeo,
    scoreGeography,
    marketMatches,
    scoreBuyBox,
    scoreFund,
    rankFunds,
    dealHasInputs,
    tierRank,
    countTiers,
    isLandAsset
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BuyersMatch = api;
  root.TrustFundsMatch = api; // legacy alias
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
