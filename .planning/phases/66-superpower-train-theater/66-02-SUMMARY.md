---
phase: 66-superpower-train-theater
plan: 02
subsystem: ui
tags: [bridge, train-theater, THTR-01, live-kept-hud, is-theater, mission-header]

# Dependency graph
requires:
  - phase: 66-superpower-train-theater
    provides: "countOpenTrainGroups, forceTrainTheater, mission header shell, updateTrainMissionHeader"
provides:
  - "Live mission open/kept re-sync on decision + undo light path"
  - "updateTrainTheaterChrome (is-theater + bridge-results-mode--theater)"
  - "Mission HUD CSS + Train climax / Kept demotion when theater active"
affects:
  - 66-03-brain-demotion-chrome
  - train-theater-visual-hierarchy

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "refreshTrainUiAfterDecision always re-syncs mission open/kept (decision, undo, conflict rollback)"
    - "Theater chrome via class toggle only — no tab id/role changes (Option A kept escape)"
    - "updateTrainTheaterChrome: admin + wrap visible + (train mode OR open > 0)"

key-files:
  created: []
  modified:
    - public/js/bridge.js
    - public/css/bridge.css
    - public/bridge.html
    - tests/bridge-train-theater.test.js

key-decisions:
  - "Mission re-sync lives in refreshTrainUiAfterDecision so undo/conflict paths inherit without API rewrite"
  - "Theater on when resultsMode === train OR openCount > 0 (admin wrap visible)"
  - "Kept tab demoted via CSS only — #bridge-mode-kept id + role=tab preserved"

patterns-established:
  - "updateTrainTheaterChrome is single chrome toggle; called from mission header + setResultsMode"
  - "Live kept feedback is triple surface: mission HUD + Decision saved status + renderKpis"

requirements-completed: [THTR-01]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 66 Plan 02: Live Kept HUD + Theater Chrome Summary

**Live mission open/kept on decision/undo light path + is-theater CSS hierarchy demoting Kept while Train is climax (THTR-01)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-11T00:25:45Z
- **Completed:** 2026-07-11T00:37:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `refreshTrainUiAfterDecision` re-syncs mission open/kept after every local mutation (Approve/Deny, undo, conflict rollback)
- Status line keeps `Decision saved · {kept}` / remaining copy; `renderKpis` still on light path
- `updateTrainTheaterChrome` toggles `#bridge-train-wrap.is-theater` + `.bridge-results-mode--theater`
- Mission HUD strip CSS + Train tab ember weight / Kept ghost demotion when theater active
- Cache-bust `bridge.css?v=23`, `bridge.js?v=43`; theater tests 10 + train-ux 30 = 40 green

## Task Commits

Each task was committed atomically:

1. **Task 1: Live mission HUD on decision path** - `4aa314e` (feat)
2. **Task 2: Theater CSS + is-theater class hierarchy** - `0615aa0` (feat)

**Plan metadata:** `50b00c8` (docs: complete plan)

_Note: TDD Task 1 — static contracts for decision/undo mission path; GREEN via refresh light-path mission re-sync._

## Files Created/Modified

- `public/js/bridge.js` — `updateTrainTheaterChrome`; mission re-sync in `refreshTrainUiAfterDecision`; `is-open` on open count; setResultsMode chrome refresh
- `public/css/bridge.css` — `.bridge-train-mission*` HUD + `.bridge-results-mode--theater` Train/Kept hierarchy
- `public/bridge.html` — cache-bust CSS v23 / JS v43
- `tests/bridge-train-theater.test.js` — live HUD + theater chrome static contracts

## Decisions Made

- **Mission on light path:** Put `updateTrainMissionHeader` inside `refreshTrainUiAfterDecision` so undo and conflict rollback inherit without touching decision POST shape
- **Theater predicate:** Admin + wrap visible + (`resultsMode === 'train'` OR `openCount > 0`) — matches plan Option A
- **CSS-only demotion:** Kept remains `#bridge-mode-kept` with full tab a11y; no brain demotion (66-03)
- **No decision API change:** `clientApplied` body keys unchanged; no `keptCount`/`openCount` invents

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- THTR-01 live kept feedback + theater chrome locked green
- Ready for **66-03** brain tab demotion (Rules armory) + admin gate + suite/live
- Save list / attach still visible in train mode; non-admin still never sees train wrap
- Local server verified live: http://127.0.0.1:3000/

## Self-Check: PASSED

- Key files present: bridge.js, bridge.css, bridge.html, bridge-train-theater.test.js
- Commits verified: 4aa314e, 0615aa0
- Tests: `node --test tests/bridge-train-theater.test.js tests/bridge-train-ux.test.js` → 40 pass
- verify-live: health=200 home=200

---
*Phase: 66-superpower-train-theater*
*Completed: 2026-07-10*
