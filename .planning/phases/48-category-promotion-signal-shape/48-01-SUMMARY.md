---
phase: 48-category-promotion-signal-shape
plan: 01
subsystem: bridge-filter
tags: [matchedIndicators, export, normalize, shape, tdd, node-test]

# Dependency graph
requires:
  - phase: 43-filter-review-groups
    provides: buildReviewGroups Array.isArray union for matchedIndicators
  - phase: 42-filter-brain-store-apply
    provides: dual-shape clearMatchedIndicators on brain apply
provides:
  - matchedIndicators string arrays on process/review rows
  - formatMatchedIndicatorsForExport join with '; ' at export boundary
  - client rowsToCsv array join parity
affects:
  - 48-02 category promotion MAP
  - 49 stable group keys (Train chips now receive real unions)
  - Train UI matchedIndicators chips

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Process rows keep array shape; join only at toExportRow / client CSV boundary"
    - "Empty indicators normalize to [] not empty string"

key-files:
  created: []
  modified:
    - lib/bridge-intake-schema.js
    - public/js/bridge.js
    - tests/bridge-intake-schema.test.js
    - tests/bridge-export.test.js
    - tests/bridge-engine.test.js

key-decisions:
  - "Keep matchedIndicators as string arrays on process/review rows; join with '; ' only at export"
  - "Coerce legacy string indicators to single-element arrays; never leave bare non-array on process rows"
  - "Do not touch bridge-review-groups.js (already correct for arrays)"

patterns-established:
  - "SHAPE: array on process path, '; ' join at export boundary only"
  - "formatMatchedIndicatorsForExport dual-shape (array or string) for Analyzer-compatible cells"

requirements-completed: [SHAPE-01, SHAPE-02]

# Metrics
duration: 2 min
completed: 2026-07-10
---

# Phase 48 Plan 01: Signal Shape Summary

**Process/review rows keep matchedIndicators as string arrays; export joins with `'; '` so Train chips can render and Analyzer cells stay compatible**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-10T03:14:55Z
- **Completed:** 2026-07-10T03:16:53Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Stopped join-at-normalize that emptied Train signal chips (`buildNormalizedRow` now slices arrays)
- Export boundary joins arrays with `'; '` via `formatMatchedIndicatorsForExport` (server CSV/XLSX through `toExportRow`)
- Client `rowsToCsv` joins array indicators the same way (avoids `Array.toString` commas)
- processUpload contract proves distressed groups and kept rows carry non-empty indicator arrays when tagged
- Full suite green: 352 pass / 0 fail

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing SHAPE tests (RED)** - `3f09a93` (test)
2. **Task 2: Keep arrays on process rows; join only at export (GREEN)** - `7870bae` (feat)
3. **Task 3: Full suite gate for SHAPE** - (verification only; no code changes)

**Plan metadata:** `d81a3f2` (docs: complete plan)

_Note: TDD tasks use test → feat commits_

## Files Created/Modified

- `lib/bridge-intake-schema.js` — array preserve in `buildNormalizedRow`; join helper + `toExportRow` export path
- `public/js/bridge.js` — `rowsToCsv` array → `'; '` for matchedIndicators
- `tests/bridge-intake-schema.test.js` — SHAPE unit coverage (array keep, empty `[]`, legacy coerce, export join)
- `tests/bridge-export.test.js` — array sample → CSV contains `'; '` joined phrases
- `tests/bridge-engine.test.js` — processUpload non-empty group/row indicators assertion

## Decisions Made

- Separator remains `'; '` (not comma) for Analyzer parity with historical join
- Prefer `[]` over `''` for empty indicators so tagger/brain-apply array path stays consistent
- `bridge-review-groups.js` left untouched — already unions arrays only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SHAPE-01 and SHAPE-02 locked; Train chips can receive real unions from process path
- Ready for **48-02 MAP** (category promotion into `violationIssueType`)
- Phase 49 still owns group-key / timestamp-singleton fixes

## Self-Check: PASSED

- `lib/bridge-intake-schema.js` FOUND
- `public/js/bridge.js` FOUND
- `tests/bridge-intake-schema.test.js` FOUND
- `tests/bridge-export.test.js` FOUND
- `tests/bridge-engine.test.js` FOUND
- Commit `3f09a93` FOUND
- Commit `7870bae` FOUND
- `bridge-review-groups.js` untouched (no diff)
- `npm test` 352 pass / 0 fail

---
*Phase: 48-category-promotion-signal-shape*
*Completed: 2026-07-10*
