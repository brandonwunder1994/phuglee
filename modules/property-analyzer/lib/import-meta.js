(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.importMeta = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function importMetaFactory() {
  function normalizePart(value) {
    return String(value || '').trim();
  }

  function deriveImportLocation(records) {
    if (!Array.isArray(records) || !records.length) return null;

    const counts = new Map();
    for (const record of records) {
      const city = normalizePart(record.city);
      const state = normalizePart(record.state);
      if (!city && !state) continue;
      const key = `${city.toLowerCase()}|${state.toLowerCase()}`;
      const prev = counts.get(key) || { city, state, count: 0 };
      prev.count += 1;
      counts.set(key, prev);
    }

    let best = null;
    for (const entry of counts.values()) {
      if (!best || entry.count > best.count) best = entry;
    }

    if (!best) return null;
    return { city: best.city, state: best.state, count: best.count };
  }

  function countUnscannedLeads(records, results, keyFn) {
    if (!Array.isArray(records) || !records.length) return 0;
    const existing = new Set((results || []).map((r) => keyFn(r)));
    return records.filter((r) => !existing.has(keyFn(r))).length;
  }

  function formatImportLocation(loc) {
    if (!loc) return '';
    const city = normalizePart(loc.city);
    const state = normalizePart(loc.state);
    if (city && state) return `${city}, ${state}`;
    return city || state || '';
  }

  return {
    deriveImportLocation,
    countUnscannedLeads,
    formatImportLocation
  };
});