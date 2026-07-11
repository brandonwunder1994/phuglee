---
phase: 67-multi-city-shift-staging
plan: 02
subsystem: ui
tags: [bridge, inventory-hud, staging, saved-lists, shift-staging]

# Dependency graph
requires:
  - phase: 67-multi-city-shift-staging
    provides: SHIFT-03 heat flash + bridge-shift-staging.test.js lock file
  - phase: 56-list-factory-ux
    provides: Saved lists table + download-all / clear-all / row actions
provides:
  - "Staging inventory heading + #bridge-inventory-hud mount"
  - "renderInventoryHud from client savedLists (counts, Ready/Downloaded, type heat, cities)"
  - "Heat-forward HUD CSS tiles/chips (no green SaaS)"
  - "SHIFT-02 static locks in tests/bridge-shift-staging.test.js"
affects: [67-03 shift queue, 68 regression QA]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-only inventory metrics from lists API summaries (no second store)"
    - "HUD strip above table: counts first, spreadsheet second"

key-files:
  created: []
  modified:
    - public/bridge.html
    - public/js/bridge.js
    - public/css/bridge.css
    - tests/bridge-shift-staging.test.js

key-decisions:
  - "HUD metrics only from savedLists length/recordCount/status/uploadType/cityId — no decorative numbers"
  - "Empty inventory hides HUD; empty teaching box unchanged"
  - "Ready tile uses ember/orange heat; Downloaded muted taupe (align 67-01 status chips)"
  - "Kept #bridge-lists-total live total for a11y continuity under the table"

patterns-established:
  - "SHIFT-02: renderInventoryHud called on both empty and non-empty renderSavedLists paths"
  - "Type heat reuses listUploadTypeBadge + .bridge-list-type--violation/--water language"

requirements-completed: [SHIFT-02]

# Metrics
duration: 8min
completed: 2026-07-11
---

# Phase 67 Plan 02: Staging Inventory HUD Summary

**Staging inventory HUD above Saved lists: live counts, Ready/Downloaded, type heat, cities — table + all list actions preserved**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T00:35:52Z
- **Completed:** 2026-07-11T00:43:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Elevated Saved lists panel to **Staging inventory** ops voice with `#bridge-inventory-hud` mount
- `renderInventoryHud(lists)` derives lists/records/Ready/Downloaded/CV/Water/Cities only from client `savedLists`
- Compact heat-forward CSS tiles + type chips; Ready ember, Downloaded muted (no green SaaS)
- SHIFT-02 static locks; rename/download/delete + download-all/clear-all IDs preserved; no `/api/bridge/shift`

## Task Commits

Each task was committed atomically:

1. **Task 1: SHIFT-02 HUD + action-preservation tests** - `fa80193` (test)
2. **Task 2: Inventory HUD mount + render + CSS** - `84dbadb` (feat)

**Plan metadata:** (pending final docs commit)

_Note: TDD — RED test commit then GREEN implementation._

## Files Created/Modified
- `tests/bridge-shift-staging.test.js` — SHIFT-02 HUD/action/API-ban locks (SHIFT-03 intact)
- `public/bridge.html` — Staging inventory heading, HUD mount, cache-bust css?v=26 / js?v=46
- `public/js/bridge.js` — `renderInventoryHud` + call sites in `renderSavedLists`
- `public/css/bridge.css` — `.bridge-inventory-hud` strip, tiles, heat chips

## Decisions Made
- Metrics are pure reductions of list summaries — never invent decorative counts
- Hide HUD when empty so factory empty-state teaching remains primary
- Ready heat-forward; Downloaded muted to match 67-01 status chip hierarchy
- Keep totals strip under table for `role=status` continuity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SHIFT-02 complete; ready for 67-03 sticky shift queue (SHIFT-01)
- LIST/EFF/SHIFT suites green (42/42); live verify passed after public/ edits
- No list store/API changes; no data wipe

## Self-Check: PASSED

- `public/bridge.html` inventory mount — FOUND
- `renderInventoryHud` in bridge.js — FOUND
- `.bridge-inventory-hud` in bridge.css — FOUND
- Commit `fa80193` — FOUND
- Commit `84dbadb` — FOUND
- Suite green: 42/42 (shift-staging + list-factory-ux + efficiency-path)
- `scripts/verify-live.ps1` — exit 0

---
*Phase: 67-multi-city-shift-staging*
*Completed: 2026-07-11*
