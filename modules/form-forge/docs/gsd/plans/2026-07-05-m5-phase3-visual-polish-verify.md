# M5 Phase 3 — Visual Polish & Verify

> **Milestone:** M5 · **Depends on:** M5 Phase 2
> **Goal:** Final stamp-theme polish on basemap, legend, transitions; close milestone with QA checklist.

## Architecture

Optional Maputnik pass on a **forked dark style** derived from OpenFreeMap — only if road/basemap layers need better harmony with `#080c14` background. Otherwise tune existing `buildDarkStyle()` + `addRoadBasemapLayers()` opacity curves.

No Turf.js unless a tiny helper emerges during QA (unlikely for this scope).

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | Road/basemap harmony | `map.js` — `roadLineOpacity`, motorway color soften |
| 2 | Legend + stats clarity | `map.html`, `map.css` — copy pass for showcase audience |
| 3 | Selection/hover polish | `map.js`, `map.css` — state hover `#5eead4`, city highlight ring |
| 4 | Transition consistency | `map.css` — sidebar panel enter, button hover |
| 5 | QA checklist | Manual + existing tests if any |

## Task 1: Basemap harmony

**Modify:** `map.js`

- Soften motorway `line-color` from `#eef2f6` to `rgba(220, 228, 236, 0.75)` at low zoom
- Ensure roads fade in without competing with gold state choropleth
- Background `#080c14` unchanged

Optional: export tuned style JSON to `data/map-style.json` if Maputnik edits exceed inline paint tweaks.

## Task 2: Legend + hero stats copy

**Modify:** `map.html`

Legend summary text — visitor-friendly:
- "Data available" → keep
- Consider subtitle under page title: "Cities where Form Forge can access public records data"

Hero stats labels — verify they make sense to outsiders:
- "Total pins" → consider "Cities covered"
- "Portal cities" / "PDF completed" — keep if clear

Only change copy if it improves showcase clarity; do not rename stats IDs.

## Task 3: Hover / selection

**Modify:** `map.css`, `map.js`

- Selected city point: gold ring consistent with `--gold-bright`
- Sidebar list item `.is-selected` matches map highlight
- State unavailable hatch (red) still readable — no change unless contrast fails

## Task 4: Sidebar transitions

**Modify:** `map.css`

- `sidebar-city` panel: subtle `transform` / `opacity` on `showPanel` (CSS only, no heavy JS animation lib)
- Respect `prefers-reduced-motion` — disable transitions

## Task 5: QA checklist

Automated: `scripts/verify_coverage_map_m5.py` — **26/26 passed** (2026-07-05). See [SUMMARY](./2026-07-05-m5-phase3-visual-polish-verify-SUMMARY.md).

| Check | Pass |
|-------|------|
| `/map` loads, national choropleth renders | ✓ |
| Click state → zoom + cities appear | ✓ |
| Click city → visitor card (Phase 1) | ✓ |
| Search city → flies + opens card | ✓ |
| `?city=<id>` deep link | ✓ |
| Mobile 375px width usable | ✓ |
| Nav: Records Desk, City Tracker, Settings work | ✓ |
| No console errors on load | ✓ |

`python -m pytest tests/test_coverage_data.py` — 10 passed.

## must_haves

1. Page still looks like Form Forge — not a redesign
2. All M5 success criteria in milestone doc checked off
3. QA table complete with no blockers