(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./imagery-routing'));
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.classificationConfidence = factory(root.PDA.lib.imageryRouting);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function classificationConfidenceFactory(imageryRouting) {
  const OBSTRUCTED_REASON = imageryRouting?.OBSTRUCTED_REASON
    || /cannot see (the |any )?(house|home|structure|building|facade)|house (not |is )?visible|home (not |is )?visible|blocked by|obscured|obstruction|trees? block|fully blocked|cannot assess (the )?(house|home|facade)|unable to see (the )?(house|home)|no clear view of (the )?(house|home)/i;

  const BLUR_REASON = imageryRouting?.BLUR_REASON
    || /privacy blur|google blur|official blur|too blurry|image blur|street view blur/i;
  const TRANSIENT_REASON = /503|rate limit|overloaded|high demand|timeout|temporarily unavailable|try again/i;

  const MODERATE_INDICATORS = new Set([
    'junk_or_hoarding_yard', 'broken_windows', 'abandoned_vehicles'
  ]);

  /** Default threshold — records below route to review lane (CLASS-06/07). */
  const REVIEW_THRESHOLD = 65;

  const IMAGERY_QUALITY = Object.freeze({
    OK: 'ok',
    DEGRADED: 'degraded',
    UNUSABLE: 'unusable',
    BLURRED: 'blurred',
    OBSTRUCTED: 'obstructed',
    UNAVAILABLE: 'unavailable',
    RETRY: 'retry'
  });

  function normalizeCategory(category) {
    const c = String(category || '').toLowerCase().trim();
    if (c === 'vacant' || c === 'land') return 'vacant_lot';
    if (c === 'fetch_failed') return 'unavailable';
    return c || 'property';
  }

  function clampConfidence(value) {
    const n = Math.round(Number(value));
    if (isNaN(n)) return null;
    return Math.max(0, Math.min(100, n));
  }

  function inferImageryQuality(record) {
    if (!record) return IMAGERY_QUALITY.UNAVAILABLE;

    if (record.manualOverride === 'blurred') return IMAGERY_QUALITY.BLURRED;

    const cat = normalizeCategory(record.category);
    const flags = record.qualityFlags || [];
    const reason = String(record.reason || '');

    if (cat === 'blurred') return IMAGERY_QUALITY.BLURRED;

    if (record.landHomeConflict || record.satelliteConflict) return IMAGERY_QUALITY.DEGRADED;

    if (OBSTRUCTED_REASON.test(reason) || flags.includes('obstructed')) return IMAGERY_QUALITY.OBSTRUCTED;

    if (BLUR_REASON.test(reason)) return IMAGERY_QUALITY.BLURRED;

    if (flags.includes('street_ai_failed') || flags.includes('ai_response_incomplete')) {
      if (BLUR_REASON.test(reason)) return IMAGERY_QUALITY.BLURRED;
      // Usable street classification with imagery present — soft degraded, not "retry → Needs Review".
      // Treating every incomplete Gemini JSON as RETRY dumped whole scan batches into Needs Review.
      if ((cat === 'property' || cat === 'vacant_lot') && (record.viewMeta || record.score > 0)) {
        return IMAGERY_QUALITY.DEGRADED;
      }
      return IMAGERY_QUALITY.RETRY;
    }

    if (record.fetchFailed) {
      if (record.errorType === 'transient' || TRANSIENT_REASON.test(reason)) return IMAGERY_QUALITY.RETRY;
      return IMAGERY_QUALITY.UNAVAILABLE;
    }

    if (cat === 'unavailable') return IMAGERY_QUALITY.UNAVAILABLE;

    if (flags.includes('analysis_incomplete')) return IMAGERY_QUALITY.DEGRADED;

    if (cat === 'property' || cat === 'vacant_lot') return IMAGERY_QUALITY.OK;

    return IMAGERY_QUALITY.UNUSABLE;
  }

  function computeClassificationConfidence(record) {
    if (!record) return null;

    const quality = inferImageryQuality(record);
    if (quality === IMAGERY_QUALITY.BLURRED) return 0;
    if (quality === IMAGERY_QUALITY.UNAVAILABLE || quality === IMAGERY_QUALITY.RETRY) return 20;

    let confidence = clampConfidence(record.confidence);
    const sat = record.satelliteClassification;
    const satConf = sat ? clampConfidence(sat.confidence) : null;

    if (confidence == null && satConf != null) confidence = satConf;
    if (confidence == null) confidence = 50;

    if (satConf != null && record.usedSatellite) {
      confidence = Math.round((confidence + satConf) / 2);
      const streetCat = normalizeCategory(record.category);
      const satCat = normalizeCategory(sat.category);
      if (streetCat === satCat && streetCat === 'property') confidence = Math.min(100, confidence + 8);
      else if (streetCat !== satCat) confidence = Math.max(0, confidence - 12);
    }

    const flags = record.qualityFlags || [];
    if (flags.includes('analysis_incomplete')) confidence -= 18;
    if (flags.includes('street_ai_failed')) confidence -= 15;
    if (flags.includes('approximate_geocode')) confidence -= 5;
    if (flags.includes('partial_address_match')) confidence -= 5;
    if (quality === IMAGERY_QUALITY.OBSTRUCTED) confidence -= 10;
    if (quality === IMAGERY_QUALITY.DEGRADED) confidence -= 8;

    const indicators = Array.isArray(record.indicators) ? record.indicators : [];
    const score = typeof record.score === 'number' ? record.score : 0;
    if (score >= 6 && indicators.length === 0) confidence -= 15;
    if (score <= 3 && indicators.length >= 2) confidence -= 10;

    return clampConfidence(confidence);
  }

  function isBorderlineDistressReview(record) {
    if (!record || record.manualOverride || record.reviewResolved) return false;
    if (record.manuallyReviewed && !record.needsReviewLater) return false;
    if (normalizeCategory(record.category) !== 'property') return false;
    const score = typeof record.score === 'number' ? record.score : 0;
    if (score < 5 || score > 7) return false;
    const indicators = Array.isArray(record.indicators) ? record.indicators : [];
    return indicators.some((i) => MODERATE_INDICATORS.has(i));
  }

  function hasExplicitConfidence(record) {
    if (!record) return false;
    if (record.confidence != null && !Number.isNaN(Number(record.confidence))) return true;
    const sat = record.satelliteClassification;
    return sat != null && sat.confidence != null && !Number.isNaN(Number(sat.confidence));
  }

  function isLowConfidenceReview(record, threshold = REVIEW_THRESHOLD) {
    if (!record || record.manualOverride || record.reviewResolved) return false;
    if (record.manuallyReviewed && !record.needsReviewLater) return false;
    if (inferImageryQuality(record) === IMAGERY_QUALITY.BLURRED) return false;
    if (normalizeCategory(record.category) !== 'property') return false;
    if (!hasExplicitConfidence(record)) return false;
    const conf = computeClassificationConfidence(record);
    return conf != null && conf < threshold;
  }

  function enrichClassificationFields(record, threshold = REVIEW_THRESHOLD) {
    if (!record) return record;
    record.imageryQuality = inferImageryQuality(record);
    record.classificationConfidence = computeClassificationConfidence(record);
    record.reviewReason = null;
    if (isLowConfidenceReview(record, threshold)) record.reviewReason = 'low_confidence';
    else if (isBorderlineDistressReview(record)) record.reviewReason = 'borderline_distress';
    else if (record.imageryQuality === IMAGERY_QUALITY.RETRY) record.reviewReason = 'retry';
    return record;
  }

  return {
    REVIEW_THRESHOLD,
    IMAGERY_QUALITY,
    inferImageryQuality,
    computeClassificationConfidence,
    hasExplicitConfidence,
    isLowConfidenceReview,
    isBorderlineDistressReview,
    enrichClassificationFields
  };
});
