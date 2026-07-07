# M5 — Coverage Map Experience Upgrade

> **Status:** `complete` (browser-verified 2026-07-05 — 26/26 Playwright checks)
> **Created:** 2026-07-05
> **Depends on:** M2 (MapLibre coverage map), M3 (MapLibre redesign)
> **Base:** Coverage Map live at `/map` — ~565 city pins, state choropleth, MapLibre + OpenFreeMap

---

## Goal

Make the Coverage Map a fast, polished **visual showcase** of where Form Forge has public-records data access — delightful to explore, credible to visitors, same stamp-theme look. Not an operator dashboard.

---

## Locked decisions (2026-07-05)

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Page name** | Keep **Coverage Map** (`/map`) |
| D2 | **Map entities** | Cities with data access — not deals/properties |
| D3 | **Filters / heatmaps** | Out of scope — showcase only |
| D4 | **City card audience** | Visitor-clean (default); no tracker/editor prominence |
| D5 | **Stack** | MapLibre GL JS + OpenFreeMap (+ Turf.js if spatial helpers needed) |
| D6 | **Visual identity** | Preserve stamp-theme — colors, typography, layout chrome |

---

## Context

| Metric | Value |
|--------|-------|
| Total map cities | ~565 |
| Layers | Portal cities + completed PDF forms |
| Tech | MapLibre GL JS, OpenFreeMap vector roads, clustered GeoJSON |
| Purpose | Show people **where** Form Forge has coverage |

**Current city card** exposes internal ops detail (submission logs, tracker/editor links). M5 reframes it as a clean coverage fact card.

---

## Proposed city card (visitor showcase)

**Header**
- City name (display font)
- `State · County` kicker

**Coverage badge**
- `Online Portal` — live government portal for list pulls
- `Records Form` — completed FOIA/public records form on file

**What's available**
- Portal: Code violation lists · Water shutoff lists (show applicable lines only)
- Form: Public records requests (FOIA)

**Status** (plain English)
- Portal: "Active data source"
- Form: "Records access established"

**Actions** (minimal)
- Portal cities: **View government portal** (external, new tab)
- Form cities: **View completed form** (PDF) when on file

**Hidden on map card** (stay in City Tracker)
- Open in editor, Open in tracker, submission counts, CV/water response pending states

---

## Phases

| Phase | Name | Delivers | Status |
|-------|------|----------|--------|
| **1** | Visitor city card | Redesigned sidebar card HTML/CSS/JS; visitor copy | `complete` |
| **2** | Map interaction polish | Smoother flyTo, cluster UX, load perf, mobile sidebar | `complete` |
| **3** | Visual polish & verify | Basemap/legend polish, transitions, desktop+mobile QA | `complete` |

Plans: `docs/gsd/plans/2026-07-05-m5-phase*.md`

---

## Success criteria

### Phase 1 — Visitor city card
- [x] Clicking a city shows county, coverage badge, and plain-English data availability
- [x] Internal ops fields (submission log, tracker link) removed or demoted from map card
- [x] Portal cities show one primary external link; form cities show PDF when available
- [x] Card matches stamp-theme typography and spacing

### Phase 2 — Map interaction polish
- [x] National → state → city navigation feels smooth (flyTo, no jank)
- [x] Dense states remain usable via clusters + sidebar list
- [x] Map bootstrap loads without perceptible stall on typical connection
- [x] Mobile: sidebar flyout usable; map canvas remains interactive

### Phase 3 — Visual polish & verify
- [x] Legend and hero stats readable at all breakpoints
- [x] Hover/selection states feel intentional (state choropleth, city highlight)
- [x] No regressions to Records Desk, City Tracker, or Settings nav
- [x] Coverage Map still reads as same Form Forge brand — not a redesign

---

## Out of scope

- Filters, heatmaps, deal metrics, spatial analytics
- Renaming Coverage Map or new routes
- Replacing Flask/static architecture with SPA
- Self-hosting OpenFreeMap (public instance is fine)
- deck.gl / Martin / PostGIS (not needed at ~565 cities)

---

## Stack reference

- **MapLibre GL JS 5.x** — renderer (already shipped)
- **OpenFreeMap** — vector road basemap, no API key
- **Maputnik** — optional basemap style tuning to match stamp-theme
- **Turf.js** — only if a small spatial helper is needed during polish

---

## References

- Current map: `review_portal/static/map.html`, `map.js`, `map.css`
- Data: `review_portal/coverage_data.py`, `/api/coverage/map`, `/api/coverage/city/<id>`
- Prior milestone: [M2](./M2-coverage-map-revamp.md), [M3](./M3-maplibre-redesign.md)