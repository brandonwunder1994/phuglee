# Analyze Page — Location Hub Design Spec

**Date:** 2026-07-08  
**Status:** Implemented (2026-07-08)  
**Surface:** `modules/property-analyzer/public/index.html` (Phuglee Analyze)

---

## 1. Feature Summary

The Analyze page currently dumps every scanned property into one long card/table list as soon as work exists. Users with thousands of leads face immediate visual overload even though each record already has `city` and `state` fields.

This redesign adds a **Location Hub** — the first screen users see after data is loaded. Users search or browse states and cities, pick a market, and only then see the existing Distress Rankings list (cards/table, tier filters, review, export) scoped to that location.

**Who it's for:** Distress OS operators working bridged lead lists market-by-market.  
**Success:** A user opens Analyze with 10k leads and immediately understands "pick where you're working" instead of scrolling an endless grid.

---

## 2. Primary User Action

**Pick a city or state before viewing property cards.**

Secondary: change location quickly via breadcrumb without losing tier filters or session state.

---

## 3. Constraints (Non-Negotiable)

| Rule | Detail |
|------|--------|
| **Preserve all existing behavior** | Scan, stop, review mode, property modal, bulk edit, export, backup, ⌘K palette, virtual scroll, session restore — unchanged in behavior |
| **Additive filter only** | Location selection adds one gate on top of `getFilteredResults()`; no rewrite of scan/review/tier engines |
| **Same data model** | Uses existing `r.city`, `r.state`, `normalizeStateAbbr()`, `propertyLocationTitle()` — no new API or import format |
| **Design-first** | HTML/CSS reorganization + one small pure-function lib + thin UI wiring |

### Anti-Goals

- Do **not** replace tier filters, review queues, or export pipelines
- Do **not** merge/consolidate all 12 CSS files in this pass (visual cleanup is scoped to the new hub + results visibility)
- Do **not** require users to pick a city before scanning (hub appears when results exist; scan UI stays as-is)
- Do **not** break review mode (review overlay remains global across all locations for this release)

---

## 4. Chosen Approach — Option A: Location Hub

Rejected for this release:
- **Option B (persistent sidebar):** Too much permanent chrome; fights existing sidebar nav
- **Option C (search-only):** No browse affordance for users who don't know city names upfront

### Default experience (after upload / session restore)

```
┌─────────────────────────────────────────────────────────────┐
│ Command bar · Scan Summary (unchanged, compact)             │
├─────────────────────────────────────────────────────────────┤
│ LOCATION HUB (visible — results list hidden)                │
│  🔍 Search city or state…                                   │
│  ┌─ Ohio ───────────────────────────── 342 leads ─┐         │
│  │  Dayton (89)  Akron (54)  Toledo (41)  …        │         │
│  └────────────────────────────────────────────────┘         │
│  ┌─ Michigan ───────────────────────── 128 leads ─┐         │
│  │  Detroit (45)  Lansing (22)  …                 │         │
│  └────────────────────────────────────────────────┘         │
│  Unknown location (12)                                        │
└─────────────────────────────────────────────────────────────┘
```

### After selecting "Dayton, OH"

```
┌─────────────────────────────────────────────────────────────┐
│ Ohio › Dayton  [Change location]                            │
├─────────────────────────────────────────────────────────────┤
│ Scan Summary · Progress · Workers (unchanged)                 │
├─────────────────────────────────────────────────────────────┤
│ Distress Rankings (existing section — now visible)            │
│  tier filters · search · cards/table · bulk edit            │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Design Direction (impeccable — product register)

| Decision | Choice |
|----------|--------|
| **Color strategy** | Restrained — Phuglee orange accent ≤10%, charcoal surfaces, cream text |
| **Scene sentence** | Operator at a desk in a dim office, focused, scanning one market at a time before dialing — dark UI, low distraction |
| **Anchor references** | Linear (location breadcrumb + list density), Raycast (search-first picker), existing Phuglee Analyze chrome |
| **Fidelity** | Production-ready |
| **Breadth** | One surface (Analyze main workspace) |
| **impeccable commands for implementation** | `distill` (reduce visual noise), `layout` (hub hierarchy), `polish` (final pass) |

### Visual rules

- Location Hub uses existing Phuglee tokens (`--phuglee-orange`, `--phuglee-cream`, `--phuglee-charcoal`) — no new theme file
- No nested cards inside cards; state rows are full-width list items with indented city chips
- State icons reuse existing `stateface` glyphs where available
- Lead counts use tabular nums; distressed count badge optional (secondary to total count)
- `#dashboard` / `#resultsWrap` hidden via class `location-gate-active` until a location is selected
- `prefers-reduced-motion`: no staggered entrance on hub list

---

## 6. Layout Strategy

| Zone | Before location pick | After location pick |
|------|---------------------|---------------------|
| Sidebar | Unchanged | Unchanged |
| Command bar | Unchanged | Breadcrumb appended in results header area |
| Scan progress / workers | Visible during scan | Visible during scan |
| Scan Summary KPIs | Visible (unchanged) | Visible (unchanged) |
| **Location Hub** | **Primary focus** | Hidden |
| **Distress Rankings** | **Hidden** | **Primary focus** |

Information flow: **Where → What** (location first, leads second).

---

## 7. Key States

| State | User sees | Notes |
|-------|-----------|-------|
| Empty (no file) | Existing empty workspace | Hub not rendered |
| Scanning, no results yet | Progress + workers | Hub not rendered |
| Has results, no location | Location Hub only | Rankings hidden |
| Has results, location picked | Breadcrumb + Rankings | Hub hidden |
| Search with no matches | Hub empty state: "No cities or states match …" | |
| Unknown location bucket | Group leads missing city/state | Always last in list |
| Session restore | Restore last `locationFilter` if valid; else hub | |
| Review mode | Full-screen review overlay | Unaffected by location gate |
| Change location | Returns to hub; tier filter preserved | `locationFilter` cleared |

---

## 8. Interaction Model

1. **Hub search** filters the state/city index live (client-side, debounced 150ms)
2. **Click state row** (when cities exist): expand/collapse city list OR select entire state — **select entire state** on state row click; cities shown as chips below
3. **Click city chip**: set `locationFilter = { state: 'OH', city: 'Dayton' }`, hide hub, show rankings
4. **Breadcrumb "Change location"**: clear `locationFilter`, show hub, keep `state.filter` and `state.searchQuery`
5. **Keyboard**: `/` focuses hub search when hub visible; existing `/` for result search when rankings visible
6. **Sidebar "Lead Rankings"** scrolls to rankings; if no location picked, scrolls to hub with toast "Pick a city or state first"

---

## 9. Data & Filter Behavior

### New state fields

```js
state.locationFilter = null
// or { state: 'OH', city: 'Dayton' }
// or { state: 'OH', city: null }  // entire state
```

### Pure functions (`lib/location-index.js`)

- `buildLocationIndex(results, normalizeStateAbbr)` → `{ states: [{ abbr, name, total, cities: [{ name, total }] }], unknownTotal }`
- `matchesLocationFilter(record, filter, normalizeStateAbbr)` → boolean
- `filterLocationIndex(index, query)` → filtered index for search

### Integration point

`getFilteredResults()` in `review.js` adds:

```js
if (state.locationFilter && !matchesLocationFilter(r, state.locationFilter, normalizeStateAbbr)) continue;
```

Cache key in `filteredResultsCacheKeyFromState()` includes serialized `locationFilter`.

Session save/restore in `state.js` includes `locationFilter`.

---

## 10. Content / Copy

| Element | Copy |
|---------|------|
| Hub title | "Choose a market" |
| Hub subtitle | "Search or pick a state and city — leads appear after you select a location" |
| Search placeholder | "Search city or state…" |
| Unknown bucket | "Unknown location" |
| Breadcrumb change link | "Change location" |
| Empty search | "No cities or states match your search" |
| Sidebar scroll hint toast | "Pick a city or state to view leads" |

---

## 11. Files Touched (Overview)

| File | Change |
|------|--------|
| `lib/location-index.js` | **Create** — pure index + filter logic |
| `tests/location-index.test.js` | **Create** — unit tests |
| `public/index.html` | Add `#locationHub` section; script tag for hub JS |
| `public/js/location-hub.js` | **Create** — render hub, wire events |
| `public/js/review.js` | Extend `getFilteredResults()` |
| `public/js/session.js` | Extend cache key |
| `public/js/state.js` | Session save/restore `locationFilter` |
| `public/js/config.js` | Default state + DOM refs |
| `public/js/render.js` | Toggle hub vs rankings visibility |
| `public/css/phuglee-analyzer.css` | Hub + breadcrumb styles |

---

## 12. Testing Strategy

- Unit: `location-index.test.js` — index build, state-only filter, city filter, unknown bucket, search
- Manual smoke checklist (post-implementation):
  - Upload file → hub shows, rankings hidden
  - Pick city → cards show scoped leads
  - Tier filters still work within location
  - Review mode still opens and advances
  - Export respects location + tier
  - Session restore remembers location
  - Change location returns to hub

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking `getFilteredResults` | TDD on `location-index.js`; single `continue` line in filter loop |
| Review/export regression | Manual smoke checklist; no changes to review queue builder |
| Performance on 10k+ records | Index built once per mutation epoch; search filters index not records |
| Users confused during scan | Hub only when `state.results.length > 0`; scan UI unchanged |

---

## 14. Approval

**User must approve this spec before implementation begins.**

Reply with: **Approved** / **Changes needed: …**