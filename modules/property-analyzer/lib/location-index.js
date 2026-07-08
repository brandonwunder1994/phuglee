(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.locationIndex = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function locationIndexFactory() {
  const UNKNOWN_STATE = '__unknown__';

  function normCity(city) {
    return String(city || '').trim();
  }

  function buildLocationIndex(results, normalizeStateAbbr) {
    const stateMap = new Map();
    let unknownTotal = 0;

    for (const r of results || []) {
      const city = normCity(r.city);
      const abbr = normalizeStateAbbr(r.state);
      if (!city && !abbr) {
        unknownTotal += 1;
        continue;
      }
      const stateKey = abbr || UNKNOWN_STATE;
      let stateEntry = stateMap.get(stateKey);
      if (!stateEntry) {
        stateEntry = { abbr: stateKey, name: abbr || 'Unknown location', total: 0, cities: new Map() };
        stateMap.set(stateKey, stateEntry);
      }
      stateEntry.total += 1;
      if (city) {
        const prev = stateEntry.cities.get(city) || 0;
        stateEntry.cities.set(city, prev + 1);
      }
    }

    const states = [...stateMap.values()]
      .map((s) => ({
        abbr: s.abbr,
        name: s.name,
        total: s.total,
        cities: [...s.cities.entries()]
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    return { states, unknownTotal };
  }

  function matchesLocationFilter(record, filter, normalizeStateAbbr) {
    if (!filter) return true;
    const city = normCity(record.city);
    const abbr = normalizeStateAbbr(record.state);
    if (filter.state === UNKNOWN_STATE) return !city && !abbr;
    if (abbr !== filter.state) return false;
    if (!filter.city) return true;
    return city.toLowerCase() === String(filter.city).trim().toLowerCase();
  }

  function filterLocationIndex(index, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return index;
    const states = [];
    for (const s of index.states || []) {
      const stateHay = `${s.name} ${s.abbr}`.toLowerCase();
      const stateMatch = stateHay.includes(q);
      const cities = (s.cities || []).filter((c) => stateMatch || c.name.toLowerCase().includes(q));
      if (stateMatch || cities.length) {
        states.push({ ...s, cities: stateMatch ? s.cities : cities });
      }
    }
    const unknownTotal = (index.unknownTotal && 'unknown'.includes(q)) ? index.unknownTotal : 0;
    return { states, unknownTotal: q.includes('unknown') ? index.unknownTotal : unknownTotal };
  }

  function locationFilterKey(filter) {
    if (!filter) return '';
    const city = filter.city ? String(filter.city).trim().toLowerCase() : '';
    return `${filter.state}|${city}`;
  }

  return {
    UNKNOWN_STATE,
    buildLocationIndex,
    matchesLocationFilter,
    filterLocationIndex,
    locationFilterKey
  };
});