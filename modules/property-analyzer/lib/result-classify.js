(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./tier-engine'),
      require('./classification-confidence')
    );
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.resultClassify = factory(
      root.PDA.lib.tierEngine,
      root.PDA.lib.classificationConfidence
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function resultClassifyFactory(tierEngine, classificationConfidence) {
  const te = tierEngine || {};
  const cc = classificationConfidence || {};

  const {
    computeLeadTier,
    normalizeLeadTier,
    normalizeCategory,
    stripTierMigrationReasonSuffix
  } = te;

  const {
    REVIEW_THRESHOLD,
    inferImageryQuality,
    computeClassificationConfidence,
    isLowConfidenceReview,
    isBorderlineDistressReview,
    enrichClassificationFields,
    IMAGERY_QUALITY
  } = cc;

  function inferCategory(score, reason, category, structureOnLot) {
    const normalized = normalizeCategory(category);
    if (normalized === 'vacant_lot' || normalized === 'unavailable' || normalized === 'blurred') return normalized;
    if (normalized === 'property') {
      if (structureOnLot === false) return 'vacant_lot';
      return 'property';
    }
    if (structureOnLot === true) return 'property';
    if (structureOnLot === false) return 'vacant_lot';
    const m = (reason || '').toLowerCase();
    if (/road only|no imagery|cannot assess|fully blocked|imagery blocked|unsure which lot|cannot see (the |any )?(house|home|structure|building)/.test(m)) return 'unavailable';
    return 'property';
  }

  function resultCategory(r) {
    if (r.manualOverride) return r.manualOverride;
    if (r.fetchFailed) return 'unavailable';
    const stored = normalizeCategory(r.category);
    if (stored === 'vacant_lot' || stored === 'unavailable' || stored === 'blurred') return stored;
    if (stored === 'property') {
      if (r.structureOnLot === false) return 'vacant_lot';
      return 'property';
    }
    return inferCategory(r.score, r.reason, r.category, r.structureOnLot);
  }

  function isBlurredImagery(r) {
    if (!r) return false;
    const quality = r.imageryQuality || inferImageryQuality(r);
    return quality === IMAGERY_QUALITY.BLURRED;
  }

  function isLandHomeUncertain(r) {
    if (!r || r.manualOverride || r.reviewResolved) return false;
    if (r.manuallyReviewed && !r.needsReviewLater) return false;
    const cat = resultCategory(r);
    if (cat === 'vacant_lot' || cat === 'property' || cat === 'blurred') return false;
    if (r.landHomeConflict === true) return true;
    if (r.satelliteConflict === true) return true;
    const quality = r.imageryQuality || inferImageryQuality(r);
    if (quality === IMAGERY_QUALITY.UNAVAILABLE && cat === 'unavailable') return true;
    return false;
  }

  function computeNeedsReview(r) {
    if (!r) return false;
    if (r.reviewResolved) return false;
    if (r.manuallyReviewed && !r.needsReviewLater) return false;
    if (isBlurredImagery(r)) return false;
    if (r.needsReviewLater) return true;
    if (isLandHomeUncertain(r)) return true;

    const quality = r.imageryQuality || inferImageryQuality(r);
    if (quality === IMAGERY_QUALITY.RETRY) return true;

    if (isLowConfidenceReview(r, REVIEW_THRESHOLD)) return true;
    if (isBorderlineDistressReview(r)) return true;

    return false;
  }

  function isClassifiedResult(r) {
    return !computeNeedsReview(r);
  }

  function resultScore(r) {
    const cat = resultCategory(r);
    if (cat !== 'property') return 0;
    return typeof r.score === 'number' ? r.score : 0;
  }

  function combinedTierReason(recordOrReason, satelliteResult = null) {
    if (typeof recordOrReason === 'string') return stripTierMigrationReasonSuffix(recordOrReason);
    const parts = [
      recordOrReason?.reason,
      recordOrReason?.satelliteClassification?.reason,
      satelliteResult?.reason
    ].filter(Boolean);
    return stripTierMigrationReasonSuffix(parts.join(' '));
  }

  function leadTierContextFromRecord(record) {
    if (!record) return null;
    return {
      indicators: record.indicators,
      satelliteClassification: record.satelliteClassification
    };
  }

  function resultLeadTier(r) {
    const cat = resultCategory(r);
    if (cat === 'vacant_lot') return 'vacant';
    if (cat === 'blurred') return 'blurred';
    if (cat === 'unavailable') return 'unavailable';
    if (r.leadTier) return normalizeLeadTier(r.leadTier);
    const ctx = leadTierContextFromRecord(r);
    return computeLeadTier(resultScore(r), cat, { ...ctx, reason: combinedTierReason(r) });
  }

  return {
    REVIEW_THRESHOLD,
    inferCategory,
    resultCategory,
    isBlurredImagery,
    isLandHomeUncertain,
    computeNeedsReview,
    isClassifiedResult,
    resultScore,
    combinedTierReason,
    resultLeadTier,
    leadTierContextFromRecord,
    inferImageryQuality,
    computeClassificationConfidence,
    isLowConfidenceReview,
    isBorderlineDistressReview,
    enrichClassificationFields
  };
});