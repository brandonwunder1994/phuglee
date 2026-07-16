(function (root) {
  'use strict';

  function getPresets(catalog) {
    if (catalog && Array.isArray(catalog.presets) && catalog.presets.length) {
      return catalog.presets;
    }
    return [];
  }

  const api = { getPresets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuyersPresets = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
