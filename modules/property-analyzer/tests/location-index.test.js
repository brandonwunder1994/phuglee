const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLocationIndex,
  matchesLocationFilter,
  filterLocationIndex,
  locationFilterKey
} = require('../lib/location-index');

function normalizeStateAbbr(state) {
  const raw = String(state || '').trim();
  if (!raw) return '';
  if (raw.length === 2) return raw.toUpperCase();
  const map = { ohio: 'OH', michigan: 'MI' };
  return map[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

const sample = [
  { city: 'Dayton', state: 'OH' },
  { city: 'Dayton', state: 'OH' },
  { city: 'Akron', state: 'OH' },
  { city: 'Detroit', state: 'MI' },
  { city: '', state: '' }
];

describe('buildLocationIndex', () => {
  it('groups by state and city with totals', () => {
    const idx = buildLocationIndex(sample, normalizeStateAbbr);
    assert.equal(idx.unknownTotal, 1);
    assert.equal(idx.states.length, 2);
    const oh = idx.states.find(s => s.abbr === 'OH');
    assert.ok(oh);
    assert.equal(oh.total, 3);
    const dayton = oh.cities.find(c => c.name === 'Dayton');
    assert.equal(dayton.total, 2);
  });

  it('sorts states by total desc then name', () => {
    const idx = buildLocationIndex(sample, normalizeStateAbbr);
    assert.equal(idx.states[0].abbr, 'OH');
  });
});

describe('matchesLocationFilter', () => {
  it('returns true when filter is null', () => {
    assert.equal(matchesLocationFilter({ city: 'X', state: 'OH' }, null, normalizeStateAbbr), true);
  });

  it('matches state-only filter', () => {
    const f = { state: 'OH', city: null };
    assert.equal(matchesLocationFilter({ city: 'Dayton', state: 'OH' }, f, normalizeStateAbbr), true);
    assert.equal(matchesLocationFilter({ city: 'Detroit', state: 'MI' }, f, normalizeStateAbbr), false);
  });

  it('matches city+state filter case-insensitively', () => {
    const f = { state: 'OH', city: 'dayton' };
    assert.equal(matchesLocationFilter({ city: 'Dayton', state: 'OH' }, f, normalizeStateAbbr), true);
    assert.equal(matchesLocationFilter({ city: 'Akron', state: 'OH' }, f, normalizeStateAbbr), false);
  });

  it('unknown records match only unknown filter sentinel', () => {
    const f = { state: '__unknown__', city: null };
    assert.equal(matchesLocationFilter({ city: '', state: '' }, f, normalizeStateAbbr), true);
    assert.equal(matchesLocationFilter({ city: 'Dayton', state: 'OH' }, f, normalizeStateAbbr), false);
  });
});

describe('filterLocationIndex', () => {
  it('filters states and cities by query', () => {
    const idx = buildLocationIndex(sample, normalizeStateAbbr);
    const out = filterLocationIndex(idx, 'day');
    assert.equal(out.states.length, 1);
    assert.equal(out.states[0].cities.length, 1);
    assert.equal(out.states[0].cities[0].name, 'Dayton');
  });
});

describe('locationFilterKey', () => {
  it('serializes filter for cache keys', () => {
    assert.equal(locationFilterKey(null), '');
    assert.equal(locationFilterKey({ state: 'OH', city: 'Dayton' }), 'OH|dayton');
    assert.equal(locationFilterKey({ state: 'OH', city: null }), 'OH|');
  });
});