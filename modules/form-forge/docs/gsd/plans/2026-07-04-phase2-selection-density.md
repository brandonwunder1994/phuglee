# Phase 2 — Selection & Density

> **Milestone:** M2 · **Depends on:** Phase 1  
> **Goal:** City search, independent portal/PDF layer toggles, list↔map sync, collision offsets for dense states.

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | Sidebar search (cross-state) | `map.html`, `map.js`, `map.css` |
| 2 | Layer toggles (portal / PDF) | `map.html`, `map.js`, `map.css` |
| 3 | Search results panel | `map.js` — `showSearchResults()`, `selectCity()` |
| 4 | Pin collision offsets at state zoom | `map.js` — `computePinOffsets()`, apply in transforms |
| 5 | Layer + search filter on list and pins | `map.js` — `cityMatchesLayers()`, `stateCities()` |

## Success criteria

- [x] Search filters cities by name + state nationwide
- [x] Portal and PDF layers toggle independently
- [x] Search/list selection zooms state and highlights pin
- [x] Dense states usable (offset pins, list remains primary)
- [x] `?city=` deep link still works