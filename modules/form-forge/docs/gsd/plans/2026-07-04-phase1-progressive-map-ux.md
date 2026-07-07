# Phase 1 — Progressive Map UX

> **Milestone:** M2 · **Depends on:** M1 Phase 4 (map pins shipped)  
> **Goal:** National choropleth-only view; pins appear only after state drill-down; sidebar list is the reliable selection path.

## Architecture

Keep D3 + TopoJSON + SVG. Add a `updatePinVisibility()` gate: pins are hidden at national zoom (`currentState === null`) and shown only for the focused state. Sidebar city list remains the primary interaction; pin clicks still work at state zoom but are no longer required.

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | Pin visibility gate | `map.js` — `updatePinVisibility()`, call from `showState`, `resetView`, `initMap` |
| 2 | National view = no pins | `map.js` — `resetView` hides all pins; init renders pins hidden |
| 3 | State drill-down reveals pins | `map.js` — `showState` shows only that state's pins |
| 4 | Hint + sidebar copy | `map.html`, `map.js` — reflect list-first interaction model |
| 5 | CSS polish | `map.css` — hidden pin state, selected list item highlight |

## Task 1: Pin visibility gate

**Modify:** `review_portal/static/map.js`

Add after `highlightPin`:

```javascript
function updatePinVisibility() {
  d3.selectAll(".city-pin")
    .style("display", (d) => {
      if (!currentState) return "none";
      return d.state === currentState ? null : "none";
    })
    .style("opacity", (d) => {
      if (!currentState) return 0;
      return d.state === currentState ? 1 : 0;
    })
    .style("pointer-events", (d) => {
      if (!currentState) return "none";
      return d.state === currentState ? null : "none";
    });
}

function updateMapHint() {
  const hint = $("#map-hint");
  if (!hint) return;
  if (!currentState) {
    hint.textContent = "Click a highlighted state to browse its cities · Select from the sidebar list";
  } else {
    const n = coverage.cities.filter((c) => c.state === currentState).length;
    hint.textContent = `${currentState} — ${n} cities · Pick a city from the list or click a pin`;
  }
  hint.style.color = "";
}
```

Call `updatePinVisibility()` and `updateMapHint()` at end of `showState`, `resetView`, and after `renderPins` in `initMap`.

Remove the old opacity logic from `showState` (line `d3.selectAll(".city-pin").style("opacity", ...)`) and `resetView` (line `style("opacity", 1)`).

## Task 2: Sidebar list ↔ selection sync

**Modify:** `review_portal/static/map.js` — `showState` city list buttons

Add `classed("is-selected")` on list button when city is active:

```javascript
btn.classList.toggle("is-selected", city.id === selectedCityId);
```

In `showCity`, also mark the matching list button:

```javascript
document.querySelectorAll("#state-city-list button").forEach((btn, i) => {
  const cities = coverage.cities.filter((c) => c.state === city.state).sort((a, b) => a.city.localeCompare(b.city));
  btn.classList.toggle("is-selected", cities[i]?.id === city.id);
});
```

Simpler approach: store `data-city-id` on each button and toggle by id.

## Task 3: Copy updates

**Modify:** `review_portal/static/map.html`

- Toolbar hint default: `Click a highlighted state to browse its cities · Select from the sidebar list`
- Sidebar empty: emphasize list-first — "Click any highlighted state on the map. Cities appear in the sidebar list — that's the easiest way to browse dense states like Ohio or Texas."

**Modify:** `map.js` init hint — remove pin-click language from default.

## Task 4: CSS

**Modify:** `review_portal/static/map.css`

```css
.city-list button.is-selected {
  border-color: var(--gold-bright);
  background: rgba(201, 162, 39, 0.12);
  color: var(--cream);
}

#map-svg .city-pin {
  pointer-events: none; /* overridden per-pin when visible */
}
```

Bump `?v=` on `map.css` and `map.js` in `map.html`.

## Success criteria

- [x] National view: choropleth only, zero visible pins
- [x] State click: zoom + sidebar list + that state's pins visible
- [x] Full map reset: pins hidden, national hint restored
- [x] Sidebar list selects city reliably; selected row highlighted
- [x] `?city=` deep link still zooms to state and shows city
- [x] No regressions to Portal Tracker nav or `/api/coverage`

## Out of scope (Phase 2+)

- Search box on map page
- Layer toggles (portal vs PDF)
- Collision/spiderfy for dense pins
- Batch geocoding