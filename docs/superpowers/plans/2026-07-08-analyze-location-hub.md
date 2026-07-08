# Analyze Location Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Location Hub to the Analyze page so users pick a city/state before the Distress Rankings list appears — without changing scan, review, export, or tier behavior.

**Architecture:** Pure functions in `lib/location-index.js` build a state→city index from existing results. `state.locationFilter` gates `getFilteredResults()`. A new `location-hub.js` renders the picker and toggles visibility between hub and the existing `#dashboard` rankings section. Styles extend `phuglee-analyzer.css` using existing Phuglee tokens (impeccable product register, Restrained palette).

**Tech Stack:** Vanilla JS (PDA.env module pattern), Node test runner (`node --test`), existing CSS token system, no new dependencies.

**Design spec:** `docs/superpowers/specs/2026-07-08-analyze-location-hub-design.md`

## Global Constraints

- Do not modify scan pipeline (`scan.js`), review queue logic (`review.js` review overlay paths), tier engine (`lib/tier-engine.js`), or export schema (`lib/export-schema.js`) beyond the single `getFilteredResults()` location check and cache key update.
- All new logic for indexing/filtering lives in `lib/location-index.js` with unit tests.
- Preserve existing DOM ids and JS hooks used by scan, review, and export.
- Use `normalizeStateAbbr` from `state.js` / `PDA.env` — do not duplicate state normalization.
- Location hub hidden when `state.results.length === 0`; rankings behavior unchanged when `locationFilter` is set.
- Session must persist and restore `locationFilter`.
- Visual implementation follows impeccable product register: Restrained color, 150–250ms transitions, `prefers-reduced-motion` respected.

---

## File Map

| File | Responsibility |
|------|----------------|
| `lib/location-index.js` | Build location index; match records to filter; filter index by search query |
| `tests/location-index.test.js` | Unit tests for all pure functions |
| `public/js/location-hub.js` | Render hub UI, handle selection, sync visibility with rankings |
| `public/js/review.js` | Add location check inside `getFilteredResults()` |
| `public/js/session.js` | Include `locationFilter` in cache key |
| `public/js/state.js` | Save/restore `locationFilter` in session payload |
| `public/js/config.js` | `state.locationFilter` default + DOM element refs |
| `public/js/render.js` | Call `updateLocationHubUi()` after `renderResultsInner` |
| `public/index.html` | `#locationHub` markup + script include |
| `public/css/phuglee-analyzer.css` | Hub, breadcrumb, visibility gate styles |

---

### Task 1: Location index pure functions

**Files:**
- Create: `modules/property-analyzer/lib/location-index.js`
- Create: `modules/property-analyzer/tests/location-index.test.js`

**Interfaces:**
- Produces:
  - `buildLocationIndex(results, normalizeStateAbbr)` → `{ states: Array<{ abbr, name, total, cities: Array<{ name, total }> }>, unknownTotal: number }`
  - `matchesLocationFilter(record, filter, normalizeStateAbbr)` → `boolean`
  - `filterLocationIndex(index, query)` → same shape as index input (filtered)
  - `locationFilterKey(filter)` → `string` for cache keys (`''` when null)

- [ ] **Step 1: Write the failing tests**

Create `modules/property-analyzer/tests/location-index.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd modules/property-analyzer && node --test tests/location-index.test.js`

Expected: FAIL — `Cannot find module '../lib/location-index'`

- [ ] **Step 3: Write minimal implementation**

Create `modules/property-analyzer/lib/location-index.js`:

```js
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
    return `${filter.state}|${filter.city || ''}`;
  }

  return {
    UNKNOWN_STATE,
    buildLocationIndex,
    matchesLocationFilter,
    filterLocationIndex,
    locationFilterKey
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd modules/property-analyzer && node --test tests/location-index.test.js`

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
cd modules/property-analyzer
git add lib/location-index.js tests/location-index.test.js
git commit -m "feat(analyzer): add location index pure functions"
```

---

### Task 2: Wire location filter into results pipeline

**Files:**
- Modify: `modules/property-analyzer/public/index.html` (add script tag for lib)
- Modify: `modules/property-analyzer/public/js/config.js` (default state field)
- Modify: `modules/property-analyzer/public/js/session.js` (cache key)
- Modify: `modules/property-analyzer/public/js/review.js` (`getFilteredResults`)

**Interfaces:**
- Consumes: `PDA.lib.locationIndex.matchesLocationFilter`, `locationFilterKey`
- Produces: `getFilteredResults()` respects `state.locationFilter`; cache invalidates on location change

- [ ] **Step 1: Add script tag in index.html**

In `modules/property-analyzer/public/index.html`, after `import-meta.js` script line, add:

```html
<script src="/lib/location-index.js?v=20260708a"></script>
```

- [ ] **Step 2: Add default state field in config.js**

In `R.state` object in `config.js`, after `searchQuery: ''`, add:

```js
locationFilter: null,
locationHubQuery: '',
```

- [ ] **Step 3: Extend cache key in session.js**

Replace `filteredResultsCacheKeyFromState` return line with:

```js
const loc = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.locationIndex)
  ? PDA.lib.locationIndex.locationFilterKey(state.locationFilter)
  : (state.locationFilter ? `${state.locationFilter.state}|${state.locationFilter.city || ''}` : '');
return `${state.filter}|${state.leadTypeFilter || 'all'}|${(state.searchQuery || '').trim().toLowerCase()}|${loc}|${state.results.length}|${state.processed}|${state.sortMode}|${resultMutationEpoch}`;
```

- [ ] **Step 4: Extend getFilteredResults in review.js**

Near top of `with (R) {` block, add:

```js
const li = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.locationIndex) ? PDA.lib.locationIndex : null;
```

Inside `getFilteredResults` loop, after lead type check and before search check, add:

```js
if (state.locationFilter) {
  const matchFn = li ? li.matchesLocationFilter : null;
  if (matchFn && !matchFn(r, state.locationFilter, normalizeStateAbbr)) continue;
}
```

- [ ] **Step 5: Manual verification**

Run: `cd modules/property-analyzer && node --test tests/location-index.test.js`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add modules/property-analyzer/public/index.html \
  modules/property-analyzer/public/js/config.js \
  modules/property-analyzer/public/js/session.js \
  modules/property-analyzer/public/js/review.js
git commit -m "feat(analyzer): gate getFilteredResults by locationFilter"
```

---

### Task 3: Session persistence for locationFilter

**Files:**
- Modify: `modules/property-analyzer/public/js/state.js` (save + restore payloads)

**Interfaces:**
- Consumes: `state.locationFilter`, `state.locationHubQuery`
- Produces: restored session reopens same market or hub

- [ ] **Step 1: Add to session save payload**

In `state.js`, find the session save object (alongside `searchQuery: state.searchQuery`) and add:

```js
locationFilter: state.locationFilter,
locationHubQuery: state.locationHubQuery || '',
```

- [ ] **Step 2: Restore on session load**

In session restore handler where `state.searchQuery = data.searchQuery || ''`, add:

```js
state.locationFilter = data.locationFilter || null;
state.locationHubQuery = data.locationHubQuery || '';
```

- [ ] **Step 3: Clear location on full reset**

Where session reset clears `state.searchQuery`, also set:

```js
state.locationFilter = null;
state.locationHubQuery = '';
```

- [ ] **Step 4: Commit**

```bash
git add modules/property-analyzer/public/js/state.js
git commit -m "feat(analyzer): persist locationFilter in session"
```

---

### Task 4: Location Hub markup

**Files:**
- Modify: `modules/property-analyzer/public/index.html`

**Interfaces:**
- Produces: DOM nodes `#locationHub`, `#locationHubSearch`, `#locationHubList`, `#locationBreadcrumb`, `#locationBreadcrumbChange`

- [ ] **Step 1: Insert hub section in main workspace**

In `index.html`, inside `#mainWorkspace`, **before** `#dashboard`, insert:

```html
<section class="location-hub panel-chrome" id="locationHub" hidden aria-label="Choose a market">
  <div class="location-hub-head">
    <h2 class="location-hub-title">Choose a market</h2>
    <p class="location-hub-sub">Search or pick a state and city — leads appear after you select a location</p>
  </div>
  <div class="location-hub-search-row">
    <input type="search" class="location-hub-search" id="locationHubSearch"
      placeholder="Search city or state…" autocomplete="off" aria-label="Search city or state">
  </div>
  <div class="location-hub-list" id="locationHubList" role="list"></div>
  <p class="location-hub-empty" id="locationHubEmpty" hidden>No cities or states match your search</p>
</section>

<div class="location-breadcrumb-bar" id="locationBreadcrumb" hidden>
  <nav class="location-breadcrumb" aria-label="Selected market">
    <span id="locationBreadcrumbLabel">—</span>
  </nav>
  <button type="button" class="location-breadcrumb-change" id="locationBreadcrumbChange">Change location</button>
</div>
```

- [ ] **Step 2: Add script include before app.js**

```html
<script src="/js/location-hub.js?v=20260708a"></script>
```

- [ ] **Step 3: Commit**

```bash
git add modules/property-analyzer/public/index.html
git commit -m "feat(analyzer): add location hub HTML shell"
```

---

### Task 5: Location Hub UI module

**Files:**
- Create: `modules/property-analyzer/public/js/location-hub.js`
- Modify: `modules/property-analyzer/public/js/config.js` (DOM refs)
- Modify: `modules/property-analyzer/public/js/render.js` (call update at end of render)

**Interfaces:**
- Consumes: `buildLocationIndex`, `filterLocationIndex`, `UNKNOWN_STATE`, `state.results`, `normalizeStateAbbr`, `setFilter`, `renderResults`, `saveSession`
- Produces:
  - `setLocationFilter(filter)` — sets state, invalidates cache, re-renders
  - `clearLocationFilter()` — returns to hub
  - `updateLocationHubUi()` — toggles hub vs dashboard visibility

- [ ] **Step 1: Add DOM refs in config.js**

```js
R.locationHub = $('locationHub');
R.locationHubSearch = $('locationHubSearch');
R.locationHubList = $('locationHubList');
R.locationHubEmpty = $('locationHubEmpty');
R.locationBreadcrumb = $('locationBreadcrumb');
R.locationBreadcrumbLabel = $('locationBreadcrumbLabel');
R.locationBreadcrumbChange = $('locationBreadcrumbChange');
```

- [ ] **Step 2: Create location-hub.js**

Create `modules/property-analyzer/public/js/location-hub.js` with:

```js
// location-hub.js — market picker gate for Distress Rankings
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const li = PDA.lib?.locationIndex;

    R.setLocationFilter = function setLocationFilter(filter) {
      state.locationFilter = filter;
      state.displayLimit = DISPLAY_LIMIT_INITIAL;
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      updateLocationHubUi();
      renderResults({ force: true });
      saveSession();
    };

    R.clearLocationFilter = function clearLocationFilter() {
      state.locationFilter = null;
      invalidateFilteredResultsCache?.();
      notifyResultMutation?.();
      updateLocationHubUi();
      renderResults({ force: true });
      saveSession();
    };

    R.updateLocationHubUi = function updateLocationHubUi() {
      const hasResults = state.results.length > 0;
      const picked = !!state.locationFilter;
      const gateActive = hasResults && !picked;

      document.body.classList.toggle('location-gate-active', gateActive);

      if (locationHub) locationHub.hidden = !gateActive;
      if (dashboard) dashboard.hidden = gateActive;
      if (locationBreadcrumb) locationBreadcrumb.hidden = !picked;

      if (picked && locationBreadcrumbLabel) {
        const f = state.locationFilter;
        if (f.state === li?.UNKNOWN_STATE) {
          locationBreadcrumbLabel.textContent = 'Unknown location';
        } else if (f.city) {
          locationBreadcrumbLabel.textContent = `${f.city}, ${f.state}`;
        } else {
          locationBreadcrumbLabel.textContent = f.state;
        }
      }

      if (gateActive) renderLocationHubList();
    };

    function renderLocationHubList() {
      if (!locationHubList || !li) return;
      const index = li.buildLocationIndex(state.results, normalizeStateAbbr);
      const q = state.locationHubQuery || '';
      const filtered = li.filterLocationIndex(index, q);
      const items = [];

      for (const s of filtered.states) {
        items.push(`<button type="button" class="location-state-row" data-state="${escapeHtml(s.abbr)}" role="listitem">
          <span class="location-state-name">${stateIconHtml({ state: s.abbr }, true)}<span>${escapeHtml(s.name)}</span></span>
          <span class="location-state-total">${s.total.toLocaleString()} leads</span>
        </button>`);
        if (s.cities.length) {
          items.push(`<div class="location-city-row" role="listitem">${s.cities.map((c) =>
            `<button type="button" class="location-city-chip" data-state="${escapeHtml(s.abbr)}" data-city="${escapeHtml(c.name)}">${escapeHtml(c.name)} <span class="location-city-count">${c.total}</span></button>`
          ).join('')}</div>`);
        }
      }

      if (filtered.unknownTotal) {
        items.push(`<button type="button" class="location-state-row location-unknown-row" data-state="${li.UNKNOWN_STATE}" role="listitem">
          <span class="location-state-name">Unknown location</span>
          <span class="location-state-total">${filtered.unknownTotal.toLocaleString()} leads</span>
        </button>`);
      }

      locationHubList.innerHTML = items.join('');
      if (locationHubEmpty) {
        const empty = !items.length;
        locationHubEmpty.hidden = !empty;
      }
    }

    function wireLocationHubEvents() {
      locationHubList?.addEventListener('click', (e) => {
        const cityBtn = e.target.closest('.location-city-chip');
        if (cityBtn) {
          setLocationFilter({ state: cityBtn.dataset.state, city: cityBtn.dataset.city });
          return;
        }
        const stateBtn = e.target.closest('.location-state-row');
        if (stateBtn) {
          setLocationFilter({ state: stateBtn.dataset.state, city: null });
        }
      });

      locationHubSearch?.addEventListener('input', () => {
        state.locationHubQuery = locationHubSearch.value;
        renderLocationHubList();
      });

      locationBreadcrumbChange?.addEventListener('click', () => clearLocationFilter());

      document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        if (!locationHub || locationHub.hidden) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        locationHubSearch?.focus();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireLocationHubEvents);
    } else {
      wireLocationHubEvents();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 3: Hook render.js**

At end of `renderResultsInner`, before closing brace, add:

```js
updateLocationHubUi?.();
```

Also call `updateLocationHubUi?.()` in `updateCommandBar` path when work visibility toggles (after `mainWorkspace` class toggle in `state.js` `updateCommandBar`).

- [ ] **Step 4: Commit**

```bash
git add modules/property-analyzer/public/js/location-hub.js \
  modules/property-analyzer/public/js/config.js \
  modules/property-analyzer/public/js/render.js \
  modules/property-analyzer/public/js/state.js
git commit -m "feat(analyzer): location hub UI and visibility gate"
```

---

### Task 6: Hub and breadcrumb styles (impeccable distill/layout)

**Files:**
- Modify: `modules/property-analyzer/public/css/phuglee-analyzer.css`

**Interfaces:**
- Consumes: existing Phuglee CSS variables
- Produces: `.location-gate-active` hides `#dashboard`; hub list readable at AA contrast

- [ ] **Step 1: Add styles to phuglee-analyzer.css**

Append:

```css
/* ── Location Hub (market picker gate) ── */
body.location-gate-active #dashboard {
  display: none;
}

.location-hub {
  margin-bottom: 1.25rem;
}

.location-hub-title {
  font-family: var(--font-display, 'Outfit', sans-serif);
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--phuglee-cream);
  margin: 0 0 0.25rem;
}

.location-hub-sub {
  margin: 0 0 1rem;
  color: var(--phuglee-stone);
  font-size: 0.88rem;
  max-width: 52ch;
}

.location-hub-search {
  width: 100%;
  max-width: 28rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(229, 132, 53, 0.25);
  background: rgba(13, 13, 13, 0.6);
  color: var(--phuglee-cream);
  font-size: 0.9rem;
}

.location-hub-search::placeholder {
  color: var(--phuglee-stone);
}

.location-hub-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 1rem;
}

.location-state-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid rgba(229, 132, 53, 0.18);
  border-radius: 8px;
  background: rgba(53, 54, 48, 0.45);
  color: var(--phuglee-cream);
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.location-state-row:hover,
.location-state-row:focus-visible {
  border-color: rgba(229, 132, 53, 0.45);
  background: rgba(53, 54, 48, 0.7);
  outline: none;
}

.location-state-total {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.78rem;
  color: var(--phuglee-taupe);
  font-variant-numeric: tabular-nums;
}

.location-city-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0 0.5rem 0.5rem 1.25rem;
}

.location-city-chip {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(174, 163, 143, 0.25);
  background: rgba(13, 13, 13, 0.5);
  color: var(--phuglee-cream);
  font-size: 0.8rem;
  cursor: pointer;
}

.location-city-chip:hover,
.location-city-chip:focus-visible {
  border-color: var(--phuglee-orange);
  outline: none;
}

.location-city-count {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  opacity: 0.75;
  margin-left: 0.15rem;
}

.location-hub-empty {
  color: var(--phuglee-stone);
  font-size: 0.85rem;
  margin-top: 0.75rem;
}

.location-breadcrumb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.45rem 0;
}

.location-breadcrumb {
  font-size: 0.95rem;
  color: var(--phuglee-cream);
  font-weight: 600;
}

.location-breadcrumb-change {
  font-size: 0.78rem;
  color: var(--phuglee-orange);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .location-state-row,
  .location-city-chip {
    transition: none;
  }
}
```

- [ ] **Step 2: Visual check**

Start server: `cd modules/property-analyzer && npm start`  
Open Analyze with a restored session or test upload. Confirm hub readable, breadcrumb visible after pick.

- [ ] **Step 3: Commit**

```bash
git add modules/property-analyzer/public/css/phuglee-analyzer.css
git commit -m "style(analyzer): location hub and breadcrumb styles"
```

---

### Task 7: Sidebar nav + smoke verification

**Files:**
- Modify: `modules/property-analyzer/public/js/imagery.js` or `premium-shell.js` (sidebar Lead Rankings scroll behavior) — only if `data-scroll="dashboard"` needs hub fallback

**Interfaces:**
- Consumes: `updateLocationHubUi`, `locationHub`

- [ ] **Step 1: Update sidebar scroll target**

Find sidebar nav handler for `data-scroll` buttons. When target is `dashboard` and `state.locationFilter` is null with results present, scroll to `#locationHub` instead and optionally show toast "Pick a city or state to view leads".

- [ ] **Step 2: Run full test suite**

Run: `cd modules/property-analyzer && npm test`

Expected: All existing tests PASS + new location-index tests PASS

- [ ] **Step 3: Manual smoke checklist**

| Step | Expected |
|------|----------|
| Load session with 1000+ results | Hub visible, rankings hidden |
| Search "dayton" in hub | Only Dayton/OH chip shown |
| Click Dayton chip | Breadcrumb shows "Dayton, OH"; ~N cards visible |
| Click Distressed tier filter | List narrows within Dayton only |
| Click Change location | Hub returns; tier filter preserved |
| Enter review mode (Distressed) | Review overlay works |
| Export CSV | Only exports current location + filter scope |
| Refresh page | Same location restored |

- [ ] **Step 4: Commit**

```bash
git add modules/property-analyzer/public/js/
git commit -m "fix(analyzer): sidebar scroll respects location gate"
```

---

## Plan Self-Review

| Spec requirement | Task |
|------------------|------|
| Location hub before rankings | Task 4, 5, 6 |
| Search cities/states | Task 1 `filterLocationIndex`, Task 5 search input |
| Preserve scan/review/export | Global Constraints + no scan.js edits |
| Session restore location | Task 3 |
| Phuglee visual style | Task 6 |
| Unknown location bucket | Task 1 `UNKNOWN_STATE` |
| Breadcrumb change location | Task 4, 5 |
| Unit tests | Task 1 |

**Placeholder scan:** None found.

**Type consistency:** `locationFilter` shape `{ state, city }` consistent across Tasks 2, 3, 5.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-analyze-location-hub.md`.**

**Spec for approval:** `docs/superpowers/specs/2026-07-08-analyze-location-hub-design.md`

**Two execution options after you approve:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement task-by-task in this session with checkpoints

**Please review the spec and plan, then reply:**
- **"Approved — option 1"** or **"Approved — option 2"**
- Or list changes needed before we implement