# M2 — Coverage Map Revamp

> **Status:** `complete`
> **Created:** 2026-07-04  
> **Depends on:** M1 (portal registry + map pins shipped)  
> **Base:** Coverage Map live at `/map` — 565 pins, state choropleth, sidebar drill-down

---

## Goal

Revamp the Coverage Map so it feels premium, is easy to navigate, and lets users reliably select any city — without a wall of overlapping pins at the national view.

---

## Context

| Metric | Value | Implication |
|--------|-------|-------------|
| Total map cities | 565 | Too many individual pins at once |
| States with data | 12 | Choropleth works; pin density is the problem |
| Exact geocoded coords | 111 (20%) | 454 cities use state-centroid + hash offset |
| Densest state | Ohio (94 cities) | Pins stack on top of each other; clicks fail |
| Tech stack | D3 7 + TopoJSON + SVG | No clustering, no collision handling today |

**Current UX (shipped in M1 Phase 4):**
- National view renders **all 565 pins** immediately
- State click → zoom + sidebar city list (works)
- Pin click → city detail (broken in dense states — pins overlap)
- Sidebar list buttons work but are buried behind pin interaction
- No search, filters, or layer toggles on the map page
- Portal Tracker (`/portal`) already has search + filters — map does not

**User-reported pain:**
- Map looks like a state “covered in pins”
- Cannot select individual cities from the map canvas
- Does not feel premium or easy to use

---

## Locked decisions (2026-07-04)

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **National view** | Choropleth-only — no pins at national zoom |
| D2 | **When pins appear** | State zoom only — pins render after state click |
| D3 | **Primary selection path** | Hybrid — sidebar list primary, map pin confirms |
| D4 | **Dense pin handling** | List-first + light collision at state zoom (Phase 2) |
| D5 | **Data fix scope** | Batch geocode portal cities in Phase 3; list-first OK meanwhile |
| D6 | **Map controls** | Search + layer toggles in Phase 2 |
| D7 | **Visual upgrade** | Stay on D3/SVG; polish in Phase 4 |

---

## Proposed phases (draft — refine after brainstorm)

| Phase | Name | Delivers | Status |
|-------|------|----------|--------|
| **1** | Progressive map UX | National choropleth-only; pins deferred to state zoom; working sidebar/search | `complete` |
| **2** | Selection & density | City search, layer toggles, list↔map sync, collision-aware pins at state level | `complete` |
| **3** | Data & accuracy | Expand geocoding; badge approximate vs. exact coords; geocode script for portal cities | `complete` |
| **4** | Premium polish | Animations, tooltips, mobile layout, empty states, keyboard nav | `complete` |

Phase plans will be written to `docs/gsd/plans/` once approach is locked.

---

## Success criteria (draft)

### Phase 1 — Progressive map UX
- [x] National view shows state choropleth only (no pin clutter)
- [x] Clicking a state zooms and reveals that state’s cities (pins and/or list)
- [x] Sidebar city list is the reliable default selection path
- [x] “Full map” reset returns to clean national view
- [x] Hint text reflects actual interaction model

### Phase 2 — Selection & density
- [x] Search box filters cities across all states (name + state)
- [x] Toggle portal vs. PDF completed layers independently
- [x] Selecting a city in search/list highlights it on the map
- [x] Dense states (Ohio, Texas, Georgia) remain usable without mis-clicks
- [x] URL `?city=` deep link still works

### Phase 3 — Data & accuracy
- [x] Geocode script run for remaining portal cities (565/565 exact)
- [x] UI indicates approximate vs. exact pin placement
- [x] Fallback centroid jitter only used where real coords missing (`coords_exact` gate)

### Phase 4 — Premium polish
- [x] Transitions feel smooth (zoom, panel, pin highlight)
- [x] Map page matches Form Forge stamp-theme quality on desktop + mobile
- [x] Legend and stats remain readable at all breakpoints
- [x] No regressions to Records Desk / Portal Tracker nav

---

## Research notes (for brainstorm)

| Pattern | Source / tool | Fit for Form Forge |
|---------|---------------|-------------------|
| Progressive disclosure | NN/g — hide advanced detail until requested | Strong — national = overview, state = detail |
| Marker clustering | Mapbox Supercluster (works with D3) | Strong at national/mid zoom if pins stay visible |
| Choropleth + drill-down | GIS dashboards, Walker Data MapGL | Strong — already have state counts + zoom |
| List-first geo UX | Portal Tracker pattern | Strong — proven search/filters already exist |
| Heatmap / hex bins | deck.gl HexagonLayer, H3 | Medium — good density signal, weaker per-city select |
| WebGL migration | MapLibre + deck.gl | Medium — premium perf, higher dependency cost |
| Spiderfy / collision | Leaflet.markercluster pattern | Medium — helps at state zoom only |

---

## Out of scope (unless explicitly added)

- Replacing Flask/static architecture with a SPA
- Real-time map updates / live submission streaming
- Coverage for states with zero data (future data growth is in scope via geocoding)
- Changing portal registry or PDF queue data models

---

## References

- Current implementation: `review_portal/static/map.html`, `map.js`, `map.css`, `coverage_data.py`
- M1 Phase 4 plan: [portal-tracker-ui](../plans/2026-07-05-phase4-portal-tracker-ui.md)
- Geocoding: `scripts/geocode_cities.py`, `data/city-coordinates.json`