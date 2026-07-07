# Phase 4 — Portal Tracker UI + Map Pins

> **Milestone:** M1 · **Depends on:** Phase 1 + Phase 3  
> **Goal:** Browse 454 portal cities in Form Forge, log submissions with clicks, see portal pins on the map.

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | Portal Tracker page | `portal.html`, `portal.js`, `portal.css` |
| 2 | Combined map layer | `coverage_data.py`, `map.html`, `map.js`, `map.css` |
| 3 | Geocode portal cities | `scripts/geocode_portal_cities.py` + state-centroid fallback |
| 4 | Nav links | `index.html`, `map.html`, `portal.html` |
| 5 | Route | `app.py` → `/portal` |

## Portal Tracker UI

- Filter: state, CV response status, search
- List: 454 cities with status chips
- Detail panel: portal link, water/CV status, submission history
- Actions: Open Portal · Mark Submitted · Mark Emailed · Record Response

## Map

- Gold pins = completed PDF forms (existing)
- Cyan pins = portal registry cities
- Legend updated for both layers
- Sidebar shows portal-specific actions when portal pin clicked

## Success criteria

- [x] `/portal` loads with all 454 cities
- [x] Filters and search work
- [x] One-click log submission from UI
- [x] Map shows portal + completed pins (565 total)
- [x] Nav consistent across all 3 tabs