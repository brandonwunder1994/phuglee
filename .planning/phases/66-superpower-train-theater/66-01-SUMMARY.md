---
phase: 66-superpower-train-theater
plan: 01
subsystem: ui
tags: [bridge, train-theater, THTR-01, countOpenTrainGroups, forceTrainTheater, mission-header]

# Dependency graph
requires:
  - phase: 65-kill-rate-scrub-report
    provides: "Kill-rate report + Stage CTA; admin train wrap shell from prior Filter brain work"
  - phase: filter-admin-review-ux
    provides: "BridgeTrain helpers, train wrap, setResultsMode, processUpload path"
provides:
  - "countOpenTrainGroups pure helper on BridgeTrain (undecided open count)"
  - "forceTrainTheater process→train pivot when open groups > 0"
  - "Mission header shell #bridge-train-mission with open/kept counts"
  - "THTR-01 static + pure unit contracts in bridge-train-theater.test.js"
affects:
  - 66-02-live-kept-hud
  - 66-03-brain-demotion-chrome
  - train-theater-default-mode

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "forceTrainTheater one-shot flag: process success only; mid-session renderResults preserves resultsMode"
    - "Open count always via countOpenTrainGroups (full review groups, never search-filtered)"
    - "Mission header fail-closed inside #bridge-train-wrap (THTR-03)"

key-files:
  created:
    - tests/bridge-train-theater.test.js
  modified:
    - public/js/bridge-train.js
    - public/js/bridge.js
    - public/bridge.html
    - tests/bridge-train-ux.test.js

key-decisions:
  - "Option A kept: stable bridge-mode-* tab ids; theater only changes default mode after process"
  - "forceTrainTheater cleared after single use so mid-session re-renders do not thrash mode"
  - "Mission default hidden; JS shows for admin when train wrap is visible"
  - "Presentation only — no brain decision API or processUpload keep/kill changes"

patterns-established:
  - "countOpenTrainGroups is single source of truth for undecided open-group length"
  - "updateTrainMissionHeader admin-gates mission visibility (non-admin always hide)"

requirements-completed: [THTR-01]

# Metrics
duration: 8min
completed: 2026-07-10
---

# Phase 66 Plan 01: Superpower Train Theater Summary

**Admin process lands in Train mode when open groups exist — countOpenTrainGroups + forceTrainTheater + mission header shell (THTR-01)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-10T17:22:27Z
- **Completed:** 2026-07-10T17:30:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Pure `BridgeTrain.countOpenTrainGroups(data, decidedKeys)` — undecided distressed + notDistressed length (search never shrinks count)
- Post-process theater pivot: `forceTrainTheater = true` after `clearTrainDecidedKeys`; admin `renderResults` calls `setResultsMode(openCount > 0 ? 'train' : 'kept')` once then clears flag
- Mission header markup inside `#bridge-train-wrap` (`bridge-train-mission`, open-count, kept-count) with live updates after train decisions
- THTR-01 static contracts + pure unit green; train-ux still green (36 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 THTR-01 static contracts (RED)** - `44c7f47` (test)
2. **Task 2: countOpenTrainGroups + mission markup + theater pivot** - `3a8f8f4` (feat)
3. **Task 3: Align train-ux + theater tests; cache-bust confirm** - `3627565` (test)

**Plan metadata:** `8232c20` (docs: complete plan)

_Note: TDD RED → GREEN → align; all THTR-01 asserts green after Task 2._

## Files Created/Modified

- `tests/bridge-train-theater.test.js` — THTR-01 helper/unit/pivot/mission/THTR-03 + Analyze CTA hygiene
- `public/js/bridge-train.js` — `countOpenTrainGroups` + export on BridgeTrain
- `public/js/bridge.js` — `forceTrainTheater`, `countOpenTrainGroups` alias, `updateTrainMissionHeader`, process/renderResults pivot, live mission after decision
- `public/bridge.html` — mission header shell; cache-bust `bridge-train.js?v=7`, `bridge.js?v=42`
- `tests/bridge-train-ux.test.js` — thin export lock for `countOpenTrainGroups`

## Decisions Made

- **One-shot force flag:** Only process success forces train; subsequent full `renderResults` preserves user-selected `resultsMode` (no thrash when open hits 0 mid-session)
- **Open count purity:** Always full review groups via helper — never train-search filtered length
- **Mission inside wrap only:** Admin-gated; non-admin branch hides mission; no chrome demotion (66-02/03)
- **Cache-bust:** train v6→7, bridge v41→42 (CSS untouched at v22)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- THTR-01 pivot + mission open-count locked green
- Ready for **66-02** live kept HUD chrome (polish mission/kept presentation)
- Ready for **66-03** brain tab demotion styling
- No decision API shape change; non-admin still never sees train wrap
- Local server verified live: http://127.0.0.1:3000/

## Self-Check: PASSED

- All key files present (theater test, bridge-train.js, bridge.js, bridge.html, train-ux, SUMMARY)
- Commits verified: 44c7f47, 3a8f8f4, 3627565

---
*Phase: 66-superpower-train-theater*
*Completed: 2026-07-10*
