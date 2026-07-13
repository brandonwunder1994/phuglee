(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.tierLabels = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function tierLabelsFactory() {
  const TIER_UI_LABELS = Object.freeze({
    all: 'All',
    distressed: 'Distressed',
    well_maintained: 'Well Maintained',
    vacant: 'Land',
    blurred: 'Blocked',
    review: 'Needs Review',
    satellite_only: 'Satellite Only',
    land: 'Land',
    blocked: 'Blocked'
  });

  function tierUiLabel(key) {
    const k = String(key || '').trim();
    if (TIER_UI_LABELS[k]) return TIER_UI_LABELS[k];
    return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
  }

  return { TIER_UI_LABELS, tierUiLabel };
});
