# Phase 3 — Data & Accuracy

> **Milestone:** M2 · **Depends on:** Phase 2  
> **Goal:** Batch geocode portal cities; surface exact vs approximate pin placement in the UI.

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | Incremental geocode script | `scripts/geocode_portal_cities.py` |
| 2 | Run geocode for ~454 portal cities | `data/city-coordinates.json` |
| 3 | Coverage API coord stats | `coverage_data.py` |
| 4 | Approximate pin styling + badges | `map.js`, `map.html`, `map.css` |

## Success criteria

- [x] All cities geocoded (565/565 exact in `city-coordinates.json`)
- [x] UI shows exact vs approximate on city detail + list
- [x] Approximate pins visually distinct on map (dashed `pin-approx` class)
- [x] Stats show exact/approx counts (`stat-exact` + API `coords_exact`/`coords_approx`)