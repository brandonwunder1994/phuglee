---
phase: 43-review-payload-grouping
plan: 01
subsystem: api
tags: [review-groups, rowId, violationTypeKey, crypto, node-test, pure-module]

# Dependency graph
requires:
  - phase: 42-brain-store-runtime-apply
    provides: violationTypeKey export from lib/bridge-brain-store.js
provides:
  - Pure assignRowIds for stable process-scoped rowIds
  - buildReviewGroups with type stacking + empty-type description split
  - groupIdFor deterministic g_ digests
  - MAX_FN_REVIEW_ROWS = 5000 constant for plan 02 cap
affects: [43-02 processUpload wire, 44 admin UX, 45 decision writes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure CommonJS grouping module (no fs/engine) unit-tested with node:test
    - Single violationTypeKey import from brain-store (no reimplementation)
    - sha1 short digests for groupId (12 hex) and rowId (8 hex)

key-files:
  created:
    - lib/bridge-review-groups.js
    - tests/bridge-review-groups.test.js
  modified: []

key-decisions:
  - "Reuse violationTypeKey from bridge-brain-store only — one normalization path for brain type rules and review groups"
  - "Typed groups omit descriptionKey from groupId hash; empty-type groups always include exact trimmed description"
  - "Private accumulator Sets stripped before return so ReviewGroup shape stays DEC/TRAIN-safe"

patterns-established:
  - "Pattern: review groups stack by section|typeKey; empty type uses section|__unknown__|descriptionKey"
  - "Pattern: assignRowIds is immutable map with idempotent row.rowId short-circuit"
  - "Pattern: sort groups by count desc then violationTypeLabel localeCompare"

requirements-completed: [REV-02, REV-03, REV-04]

# Metrics
duration: 10min
completed: 2026-07-10
---

# Phase 43 Plan 01: Review Groups Module Summary

**Pure `bridge-review-groups` with stable rowIds, type-stacked ReviewGroups (signals + samples), and MAX_FN_REVIEW_ROWS=5000**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-10T01:36:33Z
- **Completed:** 2026-07-10T01:46:00Z
- **Tasks:** 2
- **Files modified:** 2 (created)

## Accomplishments

- Failing unit suite (18 cases) defining REV-02/03/04 pure behaviors
- `assignRowIds` stamps unique `r_{index}_{hash8}` ids; second call is idempotent
- `buildReviewGroups` stacks identical types (case/spacing via shared `violationTypeKey`), splits empty-type by exact description, unions matchedIndicators, caps samples/addresses at 5
- `groupIdFor` produces stable `g_` + 12-hex digests ready for processUpload wire

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing review-groups tests (RED)** - `e5053c6` (test)
2. **Task 2: Implement bridge-review-groups (GREEN)** - `da14c13` (feat)

**Plan metadata:** (pending docs commit)

_Note: TDD tasks use test → feat commits; no refactor needed._

## Files Created/Modified

- `lib/bridge-review-groups.js` - Pure grouping: assignRowIds, buildReviewGroups, groupIdFor, MAX_FN_REVIEW_ROWS
- `tests/bridge-review-groups.test.js` - 18 node:test cases covering stacking, empty-type split, samples, sort, ids

## Decisions Made

- Import `violationTypeKey` from `./bridge-brain-store` rather than local normalize — Phase 45 decisions hit identical keys
- groupId includes descriptionKey only when `typeKey === '__unknown__'` or descriptionKey is non-null (plan-locked)
- Private `_indicatorSeen` / `_descSeen` / `_confSeen` / `_labelSet` used during accumulation and stripped from returned objects

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Module ready for `43-02` processUpload wiring: assign ids on kept + FN, cap FN at MAX_FN_REVIEW_ROWS, attach `reviewGroups.{distressed,notDistressed}`
- No engine/UI/API changes in this plan (by design)

## Self-Check: PASSED

- FOUND: `lib/bridge-review-groups.js`
- FOUND: `tests/bridge-review-groups.test.js`
- FOUND: `43-01-SUMMARY.md`
- FOUND commits: `e5053c6` (test RED), `da14c13` (feat GREEN)
- `node --test tests/bridge-review-groups.test.js` — 18/18 pass
- `violationTypeKey` imported from `./bridge-brain-store` (not reimplemented)

---
*Phase: 43-review-payload-grouping*
*Completed: 2026-07-10*
