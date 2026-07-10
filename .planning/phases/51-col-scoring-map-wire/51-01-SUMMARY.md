---
phase: 51-col-scoring-map-wire
plan: 01
subsystem: testing
tags: [tdd, wave-0, bridge, type-column, col-scoring, node-test]

# Dependency graph
requires:
  - phase: 50-filter-accuracy-grouping
    provides: "promoteCategoryFromRaw, processUpload harness, MAP TEST-02 baseline"
provides:
  - "Wave 0 RED pure trap matrix for resolveTypeColumnHeader / scoreTypeColumns / pickTypeColumn"
  - "Wave 0 RED process wire contracts for forced columnMap.violationIssueType (COL-01/04)"
  - "COL-02 no-silent-drop regression guard on process path"
affects:
  - 51-02 pure scorer implementation
  - 51-03 normalizer force wire

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: trap fixtures fail MODULE_NOT_FOUND or alias-first until Plans 02–03"
    - "COL test names tagged COL-01/02/04 for requirement traceability"

key-files:
  created:
    - tests/bridge-type-column-score.test.js
  modified:
    - tests/bridge-engine.test.js

key-decisions:
  - "No production scorer or normalizer wire in Plan 01 — RED only"
  - "COL-02 wire case already green under alias-first (null Type + weeds kept); COL-01/04 stay RED until force map"

patterns-established:
  - "Trap matrix fixtures use short categorical winners vs long narrative/status/date losers"
  - "processUpload wire asserts processingMeta.columnMap.violationIssueType scorer winner"

requirements-completed: [COL-01, COL-02, COL-04]

# Metrics
duration: 1min
completed: 2026-07-09
---

# Phase 51 Plan 01: Wave 0 RED Tests Summary

**Wave 0 trap matrix + process wire contracts lock COL-01/02/04 outcomes; pure scorer MODULE_NOT_FOUND and alias-first Status Description / Violation Description failures until Plans 02–03**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-07-10T05:41:28Z
- **Completed:** 2026-07-10T05:42:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Pure scorer test file with full alias-first trap matrix (Status/Vio Cat, Violation Desc/Issue Type, Code Desc/Category, Ordinance/Vio Cat, Category vs Violation Desc, classic Violation Type, no candidacy)
- Single-winner + ranking invariants and empty-sample header candidacy case
- processUpload wire tests for forced Type map (COL-01/04) and no silent drop (COL-02)
- MAP TEST-02 Vio Cat promote test left intact

## Task Commits

Each task was committed atomically:

1. **Task 1: RED pure scorer trap matrix** - `2ce929e` (test)
2. **Task 2: RED process wire contracts for forced Type map** - `358b918` (test)

**Plan metadata:** (docs commit after state update)

_Note: TDD Wave 0 — RED only; GREEN is Plans 02–03_

## Files Created/Modified

- `tests/bridge-type-column-score.test.js` — COL-01/02/04 pure scorer trap matrix (requires missing module)
- `tests/bridge-engine.test.js` — COL-01/02/04 processUpload wire contracts appended

## Decisions Made

- Did not create a stub `lib/bridge-type-column-score.js` — pure suite fails on MODULE_NOT_FOUND (acceptable Wave 0 RED)
- COL-02 process case already passes (null/empty Type map + weeds kept, no `no_type` discard) — kept as regression guard; COL-01/04 remain the RED force-map contract

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Expected RED:

| Suite | Result |
|-------|--------|
| `node --test tests/bridge-type-column-score.test.js` | FAIL — `Cannot find module '../lib/bridge-type-column-score'` |
| COL-01/04 engine traps | FAIL — `columnMap.violationIssueType` is `Status Description` / `Violation Description` (alias-first) |
| COL-02 engine no-candidacy | PASS — already correct without scorer |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02: implement `lib/bridge-type-column-score.js` until pure suite green
- Plan 03: force `columnMap.violationIssueType` from scorer in `normalizeRawRows` until engine COL-01/04 green
- Out of scope still deferred: confirm gate, format store, short labels

## Self-Check: PASSED

- FOUND: tests/bridge-type-column-score.test.js
- FOUND: tests/bridge-engine.test.js (COL wire cases + MAP TEST-02)
- FOUND: 51-01-SUMMARY.md
- FOUND commits: 2ce929e, 358b918
- OK: no production scorer module (Wave 0 RED intact)

---
*Phase: 51-col-scoring-map-wire*
*Completed: 2026-07-09*
