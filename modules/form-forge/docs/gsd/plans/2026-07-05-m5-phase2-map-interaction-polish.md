# M5 Phase 2 — Map Interaction Polish

> **Milestone:** M5 · **Depends on:** M5 Phase 1
> **Goal:** Make exploring the coverage map feel fast and smooth — national drill-down, clusters, flyTo, mobile sidebar.

## Architecture

No new libraries. Tune existing MapLibre config in `map.js` and layout in `map.css`. Bootstrap payload (`/api/coverage/map`) already ~65KB — verify perceived load and loading overlay dismiss timing.

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | FlyTo / ease tuning | `map.js` — `flyToCity`, `onStateClick`, cluster expand |
| 2 | Loading experience | `map.js`, `map.html` — faster hide `#map-loading`, fade-in canvas |
| 3 | Cluster click UX | `map.js` — cursor, expansion zoom cap, count labels legibility |
| 4 | Mobile sidebar | `map.css`, `map.js` — flyout width, touch targets, back button |
| 5 | List ↔ map sync | `map.js` — ensure county browser + city click stay in sync after Phase 1 HTML changes |

## Task 1: FlyTo tuning

**Modify:** `map.js`

Review and align:
- `flyToCity` — `duration: 900`, `essential: true`, reasonable `maxZoom` (~12 for city)
- State click — `fitBounds` padding matches `US_FIT_PADDING` feel
- Cluster click — `getClusterExpansionZoom` + `easeTo` with `duration: 600`
- Avoid double `flyTo` when selecting from sidebar vs map pin

Add `map.stop()` before programmatic camera moves (already in `flyToCity` — extend to state/cluster).

## Task 2: Loading overlay

**Modify:** `map.js` — `initMap` / `map.on('load')`

- Hide `#map-loading` on `map.load` + bootstrap data ready (whichever is last)
- Add `map-canvas-wrap.is-ready` class for CSS fade-in (opacity 0 → 1, 200ms)
- If bootstrap fetch fails, show actionable error in loading overlay (not infinite spinner)

## Task 3: Cluster polish

**Modify:** `map.js`, `map.css`

- Confirm cluster colors use brand green family (already step expression — verify contrast)
- `cluster-count-label` font size bump on mobile if needed
- `mouseenter` / `mouseleave` cursor pointer on clusters and unclustered points
- `clusterMaxZoom` / `clusterRadius` — test Ohio (94 cities); adjust only if mis-clicks persist

## Task 4: Mobile layout

**Modify:** `map.css`

- `@media (max-width: 768px)` — sidebar flyout full-width or 92vw, safe-area padding
- Map toolbar search input min-height 44px (touch)
- Hero stats wrap without crushing map canvas height
- `#map-canvas` min-height ≥ 50vh on mobile

## Task 5: Regression pass

- National view: choropleth only, small-state callouts work
- State drill-down: county browser + clusters
- Search → flyTo state/city still works
- `?city=` deep link still opens correct city card
- URL `reset` / "← Full map" returns to national view

## must_haves

1. Exploring OH/TX/GA dense states feels usable without mis-clicks
2. Map visible within ~1s on local dev after refresh
3. Mobile sidebar opens, scrolls, and closes cleanly