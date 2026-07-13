(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.tierEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function tierEngineFactory() {
  const WELL_MAINTAINED_MAX_SCORE = 5;
  const DISTRESSED_MIN_SCORE = 6;

  const HIGH_INDICATORS = new Set([
    'boarded_windows', 'boarded_doors',
    'structural_damage', 'fire_or_water_damage'
  ]);

  const COSMETIC_INDICATORS = new Set([
    'overgrown_landscaping', 'roof_damage_or_tarp', 'deferred_maintenance',
    'peeling_paint', 'broken_gutters', 'damaged_driveway'
  ]);

  const MODERATE_INDICATORS = new Set([
    'junk_or_hoarding_yard', 'broken_windows', 'abandoned_vehicles'
  ]);

  const NEGLECT_COMBO_INDICATORS = new Set([
    'overgrown_landscaping', 'deferred_maintenance', 'peeling_paint',
    'broken_gutters', 'damaged_driveway', 'code_violation_notice'
  ]);

  const WELL_MAINTAINED_SOFT_INDICATORS = new Set([
    'overgrown_landscaping', 'deferred_maintenance',
    'broken_gutters', 'damaged_driveway', 'code_violation_notice',
    'roof_damage_or_tarp', 'peeling_paint'
  ]);

  const DUMP_HOUSE_REASON_PATTERN = /junk|debris|trash pile|dump house|dump yard|trashed|hoarding|boarded|broken window|weeds everywhere|overgrown everywhere|heavy weeds|heavy neglect|severe neglect|signs of neglect|visible neglect|dilapidat|unmaintained|derelict|eyesore|filthy|heavily peeling|extensively peeling|dirty exterior|messy yard|clutter|yard waste|abandoned car|abandoned vehicle/i;

  const VALID_CONDITIONS = new Set(['good', 'fair', 'poor', 'unknown']);

  function normalizeIndicators(list) {
    if (!Array.isArray(list)) return [];
    return list.map(i => String(i).toLowerCase().trim().replace(/\s+/g, '_')).filter(Boolean);
  }

  function normalizeCategory(value) {
    const c = String(value || '').toLowerCase().trim();
    if (c === 'fetch_failed' || c === 'failed' || c === 'skipped' || c === 'failed to fetch' || c === 'failed/skipped') return 'unavailable';
    if (c === 'vacant_lot' || c === 'vacant lot' || c === 'vacant' || c === 'land' || c === 'empty_lot' || c === 'empty lot') return 'vacant_lot';
    if (c === 'blurred' || c === 'blur' || c === 'blurry') return 'blurred';
    if (c === 'unavailable' || c === 'unknown' || c === 'n/a') return 'unavailable';
    return 'property';
  }

  function normalizeCondition(value) {
    const c = String(value || '').toLowerCase().trim();
    return VALID_CONDITIONS.has(c) ? c : 'unknown';
  }

  function stripTierMigrationReasonSuffix(reason) {
    return String(reason || '')
      .replace(/ Moved to (Low )?Distressed — does not meet manicured\/green-lawn Well Maintained bar\./g, '')
      .replace(/ Re-tiered to [^—]+ — does not meet manicured\/green-lawn Well Maintained bar\./g, '')
      .replace(/ Re-tiered to Well Maintained[^.]*\./g, '')
      .replace(/ You (bulk-)?set distress level to [^.]+\./g, '')
      .trim();
  }

  function reasonWithoutNegatedDistressPhrases(reason) {
    return stripTierMigrationReasonSuffix(reason)
      .replace(/no visible signs of[^.;]+/gi, '')
      .replace(/no signs of[^.;]+/gi, '')
      .replace(/without (visible )?(signs of )?(distress|neglect)[^.;]*/gi, '')
      .replace(/appears well-maintained[^.]*/gi, '')
      .replace(/in good condition[^.]*/gi, '');
  }

  function reasonSuggestsDumpHouse(reason) {
    const stripped = stripTierMigrationReasonSuffix(reason);
    const text = /no visible signs of distress|no visible distress|no signs of distress|no visible signs of neglect|no signs of neglect|without neglect|no neglect visible|free of neglect/i.test(stripped)
      ? reasonWithoutNegatedDistressPhrases(stripped)
      : stripped;
    return DUMP_HOUSE_REASON_PATTERN.test(text);
  }

  function countNeglectIndicators(inds) {
    const list = normalizeIndicators(inds);
    const seen = new Set();
    for (const i of list) {
      if (NEGLECT_COMBO_INDICATORS.has(i) || COSMETIC_INDICATORS.has(i)) seen.add(i);
    }
    return seen.size;
  }

  function hasModerateWithSupportingNeglect(inds, reason = '') {
    const list = normalizeIndicators(inds);
    const hasJunk = list.includes('junk_or_hoarding_yard');
    const hasBroken = list.includes('broken_windows');
    const hasAbandoned = list.includes('abandoned_vehicles');
    const hasOvergrown = list.includes('overgrown_landscaping');
    const hasPeeling = list.includes('peeling_paint');
    const hasDeferred = list.includes('deferred_maintenance');
    const supportCosmetic = hasOvergrown || hasPeeling || hasDeferred
      || list.includes('broken_gutters') || list.includes('roof_damage_or_tarp');
    const neglectCount = countNeglectIndicators(list);

    if (hasJunk && (hasOvergrown || hasPeeling || hasDeferred || hasBroken || hasAbandoned || neglectCount >= 2)) return true;
    if (hasBroken && (hasOvergrown || hasPeeling || hasDeferred || hasJunk || hasAbandoned || supportCosmetic)) return true;
    if (hasAbandoned && (hasJunk || hasOvergrown || hasPeeling || hasDeferred || neglectCount >= 2)) return true;
    if (hasJunk && /debris pile|junk (scattered|everywhere)|hoarding|trashed (lot|yard)|dump (house|yard)|yard full of|scattered debris/i.test(reason)) return true;
    return false;
  }

  function hasDistressBlockingIndicators(inds, reason = '') {
    const list = normalizeIndicators(inds);
    if (list.some(i => HIGH_INDICATORS.has(i))) return true;
    if (hasModerateWithSupportingNeglect(list, reason)) return true;
    if (hasNeglectCombo(list, reason)) return true;
    return false;
  }

  function hasNeglectCombo(inds, reason = '') {
    const list = normalizeIndicators(inds);
    const hasJunk = list.includes('junk_or_hoarding_yard');
    const hasBroken = list.includes('broken_windows');
    const hasAbandoned = list.includes('abandoned_vehicles');
    const hasOvergrown = list.includes('overgrown_landscaping');
    const hasPeeling = list.includes('peeling_paint');
    const hasDeferred = list.includes('deferred_maintenance');
    const neglectCount = countNeglectIndicators(list);

    if (hasModerateWithSupportingNeglect(list, reason)) return true;
    if (hasOvergrown && (hasPeeling || hasDeferred)) return true;
    if (hasPeeling && hasDeferred) return true;
    if (neglectCount >= 3) return true;
    if (reasonSuggestsDumpHouse(reason) && (hasJunk || hasBroken || hasAbandoned || neglectCount >= 2)) return true;
    return false;
  }

  function qualifiesManicuredExemption(inds, roofCond, yardCond, reason = '') {
    const list = normalizeIndicators(inds);
    const roof = normalizeCondition(roofCond);
    const yard = normalizeCondition(yardCond);
    if (hasDistressBlockingIndicators(list, reason)) return false;
    if (list.some(i => HIGH_INDICATORS.has(i))) return false;
    if (hasNeglectCombo(list, reason)) return false;
    if (reasonSuggestsDumpHouse(reason)) return false;
    const softOrSingleModerate = !list.length || list.every(i =>
      WELL_MAINTAINED_SOFT_INDICATORS.has(i) || MODERATE_INDICATORS.has(i)
    );
    if (!softOrSingleModerate) return false;
    if (list.some(i => MODERATE_INDICATORS.has(i)) && hasModerateWithSupportingNeglect(list, reason)) return false;
    return roof === 'good' && yard === 'good';
  }

  function satelliteYardRoofPair(sat) {
    if (!sat) return { roof: 'unknown', yard: 'unknown', aerial: null };
    return {
      roof: normalizeCondition(sat.roofCondition),
      yard: normalizeCondition(sat.yardCondition),
      aerial: sat.aerialDistressScore
    };
  }

  function reasonHasHighDistressLanguage(reason) {
    const stripped = stripTierMigrationReasonSuffix(reason);
    return /junk|debris|boarded|broken window|tarp on roof|tarped|roof damage|abandoned|structural|fire|water damage|hoarding|violation posted|dilapidat|\bneglect\b/i.test(stripped);
  }

  function reasonSuggestsVisibleDistress(reason) {
    const stripped = stripTierMigrationReasonSuffix(reason);
    if (reasonSuggestsDumpHouse(stripped)) return true;
    if (/no visible signs of distress|no visible distress|no signs of distress|without distress|no distress visible|no visible signs of distress or neglect|no visible signs of neglect|no signs of neglect|without neglect|free of distress|absence of distress|no severe issues|no severe distress/i.test(stripped)) {
      return /junk|debris|boarded|broken window|tarp on roof|roof damage|abandoned|fire|water damage|hoarding|violation posted|dilapidat|\bneglect\b|trashed|dump|weeds everywhere|peeling/i.test(reasonWithoutNegatedDistressPhrases(stripped));
    }
    return reasonHasHighDistressLanguage(stripped)
      || /signs of severe neglect|notice posted|vacant feel|heavy neglect|dump house|yard debris|filthy|derelict/i.test(stripped);
  }

  function looksVisuallyDistressed(score, indicators, satelliteResult = null, reason = '') {
    const s = Math.round(Number(score)) || 0;
    const inds = normalizeIndicators(indicators);
    const { roof, yard, aerial } = satelliteYardRoofPair(satelliteResult);
    const reasonText = typeof reason === 'string' ? reason : '';

    const hasHigh = inds.some(i => HIGH_INDICATORS.has(i));
    const hasJunk = inds.includes('junk_or_hoarding_yard');
    const hasAbandoned = inds.includes('abandoned_vehicles');
    const hasBoarded = inds.includes('boarded_windows') || inds.includes('boarded_doors');
    const hasBroken = inds.includes('broken_windows');
    const hasOvergrown = inds.includes('overgrown_landscaping');
    const hasPeeling = inds.includes('peeling_paint');
    const hasDeferred = inds.includes('deferred_maintenance');
    const hasRoof = inds.includes('roof_damage_or_tarp');
    const moderateWithSupport = hasModerateWithSupportingNeglect(inds, reasonText);
    const neglectCombo = hasNeglectCombo(inds, reasonText);

    if (hasBoarded || hasHigh) return true;
    if (hasRoof && (roof === 'poor' || /tarp|missing shingles|collapsed|sagging/i.test(reasonText))) return true;
    if (moderateWithSupport) return true;
    if (hasJunk && hasAbandoned) return true;
    if (hasJunk && hasBroken) return true;
    if (hasJunk && hasOvergrown) return true;

    if (hasOvergrown && (hasPeeling || hasDeferred)) return true;
    if (hasPeeling && hasDeferred) return true;
    if (countNeglectIndicators(inds) >= 3) return true;
    if ((yard === 'poor' || roof === 'poor') && countNeglectIndicators(inds) >= 2) return true;
    if (yard === 'poor' && (hasOvergrown || hasPeeling || hasDeferred) && countNeglectIndicators(inds) >= 2) return true;

    if (reasonSuggestsDumpHouse(reasonText) && (hasJunk || hasBroken || hasAbandoned || countNeglectIndicators(inds) >= 2)) return true;
    if (reasonSuggestsVisibleDistress(reasonText) && (hasHigh || hasBoarded || moderateWithSupport || neglectCombo)) return true;

    if (aerial != null && aerial >= 8 && (hasHigh || hasBoarded || moderateWithSupport || neglectCombo)) return true;
    if (aerial != null && aerial >= DISTRESSED_MIN_SCORE && moderateWithSupport) return true;
    if (aerial != null && aerial >= DISTRESSED_MIN_SCORE && yard === 'poor' && countNeglectIndicators(inds) >= 2) return true;

    if (s >= DISTRESSED_MIN_SCORE && neglectCombo) return true;

    if ((hasJunk || hasBroken || hasAbandoned) && !moderateWithSupport && !neglectCombo) return false;

    return false;
  }

  function computeLeadTier(score, category, ctx = null) {
    const cat = normalizeCategory(category);
    if (cat === 'vacant_lot') return 'vacant';
    if (cat === 'blurred') return 'blurred';
    if (cat === 'unavailable') return 'unavailable';
    const s = Math.round(Number(score)) || 0;
    const indicators = ctx?.indicators;
    const satellite = ctx?.satelliteClassification;
    const reason = ctx?.reason || '';
    const conf = Math.round(Number(ctx?.confidence));
    const inds = normalizeIndicators(indicators);

    if (looksVisuallyDistressed(s, indicators, satellite, reason)) return 'distressed';
    if (hasNeglectCombo(inds, reason)) return 'distressed';
    if (inds.some(i => HIGH_INDICATORS.has(i))) return 'distressed';
    if (hasModerateWithSupportingNeglect(inds, reason)) return 'distressed';
    if (qualifiesManicuredExemption(inds, normalizeCondition(satellite?.roofCondition), normalizeCondition(satellite?.yardCondition), reason)) return 'well_maintained';
    if (s >= DISTRESSED_MIN_SCORE && reasonSuggestsDumpHouse(reason) && (hasModerateWithSupportingNeglect(inds, reason) || countNeglectIndicators(inds) >= 2)) return 'distressed';
    if (s >= DISTRESSED_MIN_SCORE && !isNaN(conf) && conf >= 70
      && inds.some(i => MODERATE_INDICATORS.has(i)) && !qualifiesManicuredExemption(inds, normalizeCondition(satellite?.roofCondition), normalizeCondition(satellite?.yardCondition), reason)) {
      return 'distressed';
    }
    if (s >= DISTRESSED_MIN_SCORE && !looksVisuallyDistressed(s, indicators, satellite, reason)) {
      if (qualifiesManicuredExemption(inds, normalizeCondition(satellite?.roofCondition), normalizeCondition(satellite?.yardCondition), reason)) return 'well_maintained';
      if (s >= 7) return 'distressed';
      if (inds.some(i => MODERATE_INDICATORS.has(i))) return 'distressed';
      if (!inds.length || inds.every(i => WELL_MAINTAINED_SOFT_INDICATORS.has(i))) return 'well_maintained';
      return 'distressed';
    }
    return 'well_maintained';
  }

  function normalizeLeadTier(value) {
    const t = String(value || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (t === 'light') return 'distressed';
    if (['distressed', 'well_maintained', 'vacant', 'unavailable', 'blurred'].includes(t)) return t;
    if (t === 'wellmaintained' || t === 'well-maintained' || t === 'manicured' || t === 'pristine' || t === 'no_distress') return 'well_maintained';
    if (t === 'failed' || t === 'skipped' || t === 'failed_to_fetch' || t === 'fetch_failed') return 'unavailable';
    if (t === 'hot_lead' || t === 'heavy' || t === 'hot' || t === 'hotlead' || t === 'high' || t === 'critical' || t === 'severe' || t === 'cripsy') return 'distressed';
    if (t === 'medium' || t === 'warm' || t === 'fair' || t === 'worn') return 'distressed';
    if (t === 'very_light' || t === 'low' || t === 'cold' || t === 'verylight' || t === 'flagged') return 'distressed';
    if (!t) return 'unavailable';
    return 'unavailable';
  }

  return {
    WELL_MAINTAINED_MAX_SCORE,
    DISTRESSED_MIN_SCORE,
    HIGH_INDICATORS,
    MODERATE_INDICATORS,
    NEGLECT_COMBO_INDICATORS,
    COSMETIC_INDICATORS,
    WELL_MAINTAINED_SOFT_INDICATORS,
    DUMP_HOUSE_REASON_PATTERN,
    normalizeIndicators,
    normalizeCategory,
    normalizeCondition,
    countNeglectIndicators,
    reasonSuggestsDumpHouse,
    stripTierMigrationReasonSuffix,
    reasonWithoutNegatedDistressPhrases,
    hasModerateWithSupportingNeglect,
    hasNeglectCombo,
    qualifiesManicuredExemption,
    looksVisuallyDistressed,
    computeLeadTier,
    normalizeLeadTier
  };
});