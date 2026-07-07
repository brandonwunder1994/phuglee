(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./tier-engine'));
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.imageryRouting = factory(root.PDA.lib.tierEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function imageryRoutingFactory(tierEngine) {
  const { normalizeCategory } = tierEngine;

  const OBSTRUCTED_REASON = /cannot see (the |any )?(house|home|structure|building|facade)|house (not |is )?visible|home (not |is )?visible|blocked by|obscured|obstruction|privacy blur|blurred|too blurry|image blur|trees? block|fully blocked|cannot assess (the )?(house|home|facade)|unable to see (the )?(house|home)|no clear view of (the )?(house|home)/i;

  const UNCLEAR_LOT_REASON = /cannot tell|unsure which lot|unclear if|cannot determine|can't determine/i;

  function streetAnalysisNeedsSatellite(analysis, viewMeta = null) {
    if (!analysis) return false;
    const cat = normalizeCategory(analysis.category);
    if (cat === 'blurred' || cat === 'unavailable') return true;
    const reason = String(analysis.reason || '');
    if (OBSTRUCTED_REASON.test(reason)) return true;
    if (cat === 'vacant_lot' && UNCLEAR_LOT_REASON.test(reason)) return true;
    const conf = Math.round(Number(analysis.confidence));
    if (cat === 'property' && !isNaN(conf) && conf < 50 && OBSTRUCTED_REASON.test(reason)) return true;
    const flags = viewMeta?.qualityFlags || [];
    if (flags.includes('analysis_incomplete')) return true;
    return false;
  }

  function satelliteFallbackFailed(analysis, satelliteResult) {
    if (!analysis) return true;
    const svCat = normalizeCategory(analysis.category);
    if (!satelliteResult) return svCat === 'unavailable' || svCat === 'blurred';
    const satCat = normalizeCategory(satelliteResult.category);
    if (satCat === 'unavailable') return true;
    if (svCat === 'unavailable' && satCat === 'vacant_lot' && satelliteResult.structureOnLot === false) return false;
    if (svCat === 'unavailable' && satCat === 'property' && satelliteResult.structureOnLot) return false;
    return svCat === 'unavailable' && satCat === 'unavailable';
  }

  return {
    OBSTRUCTED_REASON,
    streetAnalysisNeedsSatellite,
    satelliteFallbackFailed
  };
});