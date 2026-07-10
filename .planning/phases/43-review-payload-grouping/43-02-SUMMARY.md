---
phase: 43-review-payload-grouping
plan: 02
subsystem: api
tags: [processUpload, notDistressedRows, reviewGroups, rowId, zero-kept, FN-cap]

# Dependency graph
requires:
  - phase: 43-review-payload-grouping
    provides: bridge-review-groups pure module (assignRowIds, buildReviewGroups, MAX_FN_REVIEW_ROWS)
  - phase: 42-brain-store-runtime-apply
    provides: applyBrainToRows before filterDistressOnly stage order
provides:
  - processUpload full FN payload (notDistressedRows with addresses/types/descriptions)
  - reviewGroups.distressed + reviewGroups.notDistressed on every success
  - Stable rowIds on kept and FN rows
  - FN cap at 5000 with brainMeta truncation flags
  - Zero-kept code_violation success path (all-FN reviewable)
affects: [44 admin UX, 45 decision writes, bridge.js KPI consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FN pool from filterDistressOnly.removed[].row (full rows), not thin discarded
    - Zero-kept policy: code_violation + FN succeeds; pure empty still NO_USABLE_ROWS
    - stats.discarded = nonReview + FN total for bridge.js KPI continuity

key-files:
  created: []
  modified:
    - lib/bridge-engine/index.js
    - tests/bridge-engine.test.js

key-decisions:
  - "Success discarded is non-review only; full FN rows live solely in notDistressedRows"
  - "Zero-kept success only for uploadType === code_violation when FN pool non-empty"
  - "brainMeta carries notDistressedTruncated/Total/Returned; processingMeta brain fields preserved from 42"

patterns-established:
  - "Pattern: stage order applyBrain → filterDistressOnly → assignRowIds → buildReviewGroups"
  - "Pattern: override stats.discarded/noDistress after buildStats so KPIs stay correct without stuffing FN into discarded"

requirements-completed: [REV-01, REV-02, REV-03, REV-04]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 43 Plan 02: processUpload Review Payload Summary

**processUpload returns full FN rows + stacked reviewGroups + rowIds; zero-kept code_violation is reviewable with FN pool capped at 5000**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T01:39:14Z
- **Completed:** 2026-07-10T01:51:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended engine contract tests for REV-01..04 (notDistressedRows, rowIds, reviewGroups, zero-kept, water empty FN)
- Wired `assignRowIds` + `buildReviewGroups` + `MAX_FN_REVIEW_ROWS` into processUpload after brain apply + distress filter
- All-FN code_violation returns `ok:true` with `rows:[]` and reviewable FN payload; pure no-address still `NO_USABLE_ROWS`
- Non-review discards stay thin in `discarded`; stats KPIs include FN counts without putting full FN objects in discarded

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend engine tests for review payload contract (RED)** - `e1f9354` (test)
2. **Task 2: Wire processUpload FN payload + groups + zero-kept policy (GREEN)** - `90d86b7` (feat)

**Plan metadata:** `f005273` (docs: complete plan)

_Note: TDD tasks use test → feat commits; no refactor needed._

## Files Created/Modified

- `lib/bridge-engine/index.js` - processUpload FN extract, rowIds, reviewGroups, cap, zero-kept success
- `tests/bridge-engine.test.js` - REV-01..04 process contract + water + all-FN success + promote baseline update

## Decisions Made

- Omit thin `mapDistressDiscards` from success `discarded`; FN full rows only in `notDistressedRows`
- Zero-kept success gated on `uploadType === 'code_violation'` (water still throws if nothing kept)
- `stats.discarded = nonReview.length + notDistressedTotal` and `discardReasons.no_distress_signal` for bridge.js KPI math
- `brainMeta` created with three truncation fields; phase 42 `processingMeta.brainVersion` / `brainAppliedRuleIds` unchanged

## Deviations from Plan

None - plan executed exactly as written.

(Minor: updated existing `promote_type` baseline from "throws NO_USABLE_ROWS" to "all-FN success" — required by zero-kept policy and called out in plan behavior.)

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 43 complete: pure groups module + processUpload wire green
- Ready for Phase 44 admin UX to consume `notDistressedRows` / `reviewGroups` / `rowId`
- Decision API (45) can key off `groupId` + `rowId` without engine changes
- Additive JSON safe for current bridge.js until UI updated

## Self-Check: PASSED

- FOUND: `lib/bridge-engine/index.js` contains notDistressedRows, buildReviewGroups, assignRowIds
- FOUND: `tests/bridge-engine.test.js` asserts notDistressedRows / reviewGroups / zero-kept
- FOUND commits: `e1f9354` (test RED), `90d86b7` (feat GREEN)
- Stage order: applyBrainToRows → filterDistressOnly → assignRowIds → buildReviewGroups
- `node --test tests/bridge-review-groups.test.js tests/bridge-engine.test.js` — 37/37 pass
- `npm test` — 262/262 pass

---
*Phase: 43-review-payload-grouping*
*Completed: 2026-07-10*
