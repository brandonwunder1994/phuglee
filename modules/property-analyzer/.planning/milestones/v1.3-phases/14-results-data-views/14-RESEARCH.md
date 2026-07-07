# Phase 14: Results & Data Views - Research

**Researched:** 2026-06-30
**Domain:** Vanilla HTML/CSS/JS results toolbar + card/table calm refactor
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists.** Design contract locked in `14-UI-SPEC.md` (approved 2026-06-30) + `11-DESIGN-BRIEF.md` Change 5.

### Locked Decisions (from 14-UI-SPEC.md)
- Segmented filters: All · Distressed · Needs Review · More▾; secondary tiers in overflow
- Search row primary above filter segment (DATA-02)
- Card hierarchy: address → tier badge → thumb; quiet chrome (DATA-03)
- Bulk edit behind **Edit** toggle; bar calm-styled (DATA-04)
- Table view flat calm styling matching cards (DATA-05)
- Preserve all `.filter-btn[data-filter]` elements and IDs
- No virtual scroll algorithm changes (QA-03)
- No tier/save/backup logic changes; `npm test` 78 tests

### Claude's Discretion
- Exact `VIRTUAL_ROW_HEIGHT` if calm card layout changes height (measure after CSS)
- Whether score appears in `card-meta-row` text vs hidden on cards entirely
- Overflow "More" active state when secondary filter selected (label shows filter name vs "More")

### Deferred Ideas (OUT OF SCOPE)
- Modals, property inspector, review overlay (Phase 15)
- React/shadcn component migration
</user_constraints>

<research_summary>
## Summary

Phase 14 is **DOM restructure + CSS reskin + targeted render.js card HTML** on the results/dashboard surface. The filter system is deeply coupled: `setFilter()` in `review.js` toggles `.filter-btn.active` by `data-filter`; `updateFilterLabels()` in `session.js` updates all button text with counts; `session.js` line 1117 binds click on every `.filter-btn`.

**Key finding:** Do NOT remove or rename filter buttons — relocate secondary filters (`well_maintained`, `vacant`, `blurred`) into `#filterOverflowMenu` while keeping class `filter-btn` and `data-filter` attributes. Add `#filterOverflowToggle` mirroring Phase 12 `#sidebarOverflowToggle` pattern.

**Bulk edit** already deferred: `updateBulkEditUi()` only adds `.visible` to `#bulkEditBar` when `state.bulkSelectMode`. Phase 14 is mostly relabel + calm CSS.

**Virtual scroll** (`config.js` `initVirtualScroll`, `render.js` `renderVirtualCards`) must not be refactored. Card HTML changes may require `VIRTUAL_ROW_HEIGHT` adjustment (currently 280px).

**Primary recommendation:** 3 plans — (1) HTML toolbar restructure, (2) CSS calm results, (3) JS overflow + buildPropCard + FILTER_LABELS emoji removal.
</research_summary>

<standard_stack>
## Standard Stack

| Tool | Purpose |
|------|---------|
| Vanilla HTML/CSS/JS | Results UI |
| `tokens.css` | Calm palette |
| `app.css` | Legacy results styles (~4400–4700, 2579–2660) |
| `render.js` | `buildPropCard`, `buildResultRow`, virtual scroll |
| `imagery.js` | `updateBulkEditUi`, `setBulkSelectMode` |
| `review.js` | `setFilter`, `FILTER_LABELS` |
| `npm test` | QA-01 |

**No new installations.**
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Current results chrome (`index.html` L294–376)
```
#resultsWrap
  .results-toolbar — title + 6 filter pills + lead type + bulk btn + view toggle
  #bulkEditBar — visible when bulk mode
  .results-search-row — search + sort (below toolbar)
  #cardsView / #tableView
```

### Target results chrome (14-UI-SPEC)
```
#resultsWrap
  .results-header — search (primary) + sort + view toggle + Edit
  .results-filter-bar — segmented (3 filters + More) + overflow menu
  #bulkEditBar — hidden until bulk mode (unchanged JS)
  #cardsView / #tableView
```

### Pattern 1: Filter relocation, not replacement
Move `#empty` filter buttons into overflow; keep `document.querySelectorAll('.filter-btn')` working.

### Pattern 2: Overflow toggle (from Phase 12)
`#filterOverflowToggle` / `#filterOverflowMenu` with `aria-expanded`, mutual close on segment click.

### Pattern 3: Active state sync for More
When `state.filter` is `well_maintained|vacant|blurred`, add `.active` to `#filterOverflowToggle` and show label in toggle text.

### Pattern 4: Calm card build
Reorder `buildPropCard` innerHTML: body (address, badge) → thumb → meta (name, score text). Remove thumb overlays except bulk checkbox.

### Pattern 5: setFilter extension (minimal)
After `setFilter`, call `applyFilterOverflowUi()` to sync More button active state — add to `review.js` end of `setFilter` or `session.js` listener.
</architecture_patterns>

<codebase_findings>
## Codebase Findings

| File | Scope |
|------|-------|
| `public/index.html` | L294–376 results section |
| `public/css/app.css` | `.results-toolbar` 4403, `.filter-btn` 4419, `.prop-card` 4557, `.bulk-edit-bar` 2579, `.results-search` 1991 |
| `public/js/render.js` | `buildPropCard` 888, `buildResultRow` 925, `renderVirtualCards` ~826 |
| `public/js/review.js` | `setFilter` 894, `FILTER_LABELS` 376 |
| `public/js/imagery.js` | `setBulkSelectMode` 933, `updateBulkEditUi` 942 |
| `public/js/session.js` | `updateFilterLabels` 139, filter click bind 1117 |
| `public/js/config.js` | `VIRTUAL_ROW_HEIGHT` 470, `bulkSelectToggleBtn` 588 |

### Filter glow to remove
- `.filter-btn.active` copper glow box-shadow (4500)
- `.filter-btn.active.distressed-filter` tier glow
- Scope hover/glow to `body.legacy-hud` where needed

### Card theater to remove
- `.prop-card.heat-distressed` gradient background (4616)
- `.card-score-float` large overlay (4671)
- `.card-rank` TARGET badge
- `.prop-card:hover { transform: translateY(-4px) }` — calm: border only
</codebase_findings>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Breaking filter click delegation
Removing `filter-btn` class from overflow buttons breaks `setFilter` binding.
**Fix:** Keep `class="filter-btn ..."` on all 6 buttons.

### Pitfall 2: Virtual scroll spacer drift
Changing card height without updating `VIRTUAL_ROW_HEIGHT` causes scroll jitter at 10k.
**Fix:** Measure new card height; update constant only; do not touch scroll math.

### Pitfall 3: Bulk mode regression
Changing `bulkEditBar` display logic breaks `updateBulkEditUi`.
**Fix:** Keep `.visible` class toggle; only change CSS and toggle button label.

### Pitfall 4: leadTypeFilter population
`review.js` rebuilds `#leadTypeFilter` options — must still find element by ID after DOM move.
</common_pitfalls>

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` |
| Quick/full | `npm test` (~10s) |
| QA-03 | Manual: load 10k session, scroll cards — no blank gaps |

### Automated per requirement
| REQ | Command |
|-----|---------|
| QA-01 | `npm test` |
| DATA-01 | grep `filterOverflowMenu` + 6 `data-filter` |
| DATA-02 | grep `results-search-primary` or search row order |
| DATA-04 | grep `bulkSelectToggleBtn` text `Edit` |
| DATA-03 | grep `card-body-calm` in render.js |

### Wave 0
None — existing test suite sufficient.

## RESEARCH COMPLETE

**Ready for planning:** yes
**Primary recommendation:** 3 plans — HTML (wave 1), CSS + render.js (wave 2 parallel), JS wiring (wave 2)