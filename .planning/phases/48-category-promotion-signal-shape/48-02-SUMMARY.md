---
phase: 48-category-promotion-signal-shape
plan: 02
subsystem: bridge-filter
tags: [category-promotion, violationIssueType, normalizer, map, tdd, node-test]

# Dependency graph
requires:
  - phase: 48-category-promotion-signal-shape
    provides: matchedIndicators string arrays on process/review rows (48-01 SHAPE)
  - phase: 43-filter-review-groups
    provides: buildReviewGroups labels from violationIssueType / notes / (no type)
provides:
  - pure promoteCategoryFromRaw for unmapped category-like headers
  - normalizer wire: empty type â†’ promote for all kept rows (FN + distressed)
  - MAP-01/02/03 unit + processUpload contracts
affects:
  - 49 stable group keys (labels now feed real type keys when category column exists)
  - Train FN/distressed group labels
  - Phase 50 regression lock fixtures

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promote from category-like unmapped headers only; never invent from narrative"
    - "Promotion runs for all kept rows independent of matchedIndicators / distress tags"
    - "First non-empty category-like cell wins; no multi-cell concatenate"

key-files:
  created:
    - lib/bridge-category-promote.js
    - tests/bridge-category-promote.test.js
  modified:
    - lib/bridge-engine/normalizer.js
    - tests/bridge-engine.test.js

key-decisions:
  - "Pure bridge-category-promote.js called from normalizer after map/injectCityState"
  - "No intake alias expansion for short forms â€” promotion is primary fix for Vio Cat"
  - "Guards: narrative headers, timestamp-only cells, length >120, no overwrite of mapped type"

patterns-established:
  - "MAP: category-like header heuristic + single-cell copy into violationIssueType"
  - "Notes rawBits fallback stays descriptionNotes-only; never repurposed for type"

requirements-completed: [MAP-01, MAP-02, MAP-03]

# Metrics
duration: 1 min
completed: 2026-07-10
---

# Phase 48 Plan 02: Category Promotion MAP Summary

**Unmapped category columns (e.g. Vio Cat) promote into violationIssueType so FN/distressed Train labels show real city categories without inventing free-text types**

## Performance

- **Duration:** 1 min
- **Started:** 2026-07-10T03:18:20Z
- **Completed:** 2026-07-10T03:19:27Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Pure `lib/bridge-category-promote.js` with `isCategoryLikeHeader` + `promoteCategoryFromRaw`
- Normalizer wires promotion after `mapRawRow`/`injectCityState` for **all** kept rows (not distress-gated) so FN Fence Permit gets type
- MAP-03 guards: narrative headers rejected, timestamp-only cells rejected, length >120 rejected, existing type never overwritten
- processUpload contract: unmapped Vio Cat CSV â†’ High Grass distressed type + Fence Permit FN group label
- Full suite green: 363 pass / 0 fail; `bridge-review-groups.js` key logic untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing category-promotion tests (RED)** - `346fcd6` (test)
2. **Task 2: Implement promote helper + normalizer wire (GREEN)** - `071a010` (feat)
3. **Task 3: Full suite gate for MAP + SHAPE regression** - (verification only; no code changes)

**Plan metadata:** `5f87484` (docs: complete plan)

_Note: TDD tasks use test â†’ feat commits_

## Files Created/Modified

- `lib/bridge-category-promote.js` â€” pure header/cell promotion helpers (no fs, no engine)
- `lib/bridge-engine/normalizer.js` â€” require + call promote when type empty; notes fallback unchanged
- `tests/bridge-category-promote.test.js` â€” MAP-01/03 unit matrix
- `tests/bridge-engine.test.js` â€” processUpload Vio Cat + description-only MAP-03 contract

## Decisions Made

- Prefer pure helper over intake-alias expansion for short forms like `Vio Cat` (alias-only would still miss â€œonly in raw cellsâ€)
- Promotion independent of `matchedIndicators.length` so FN rows without distress keywords still get categories (MAP-02)
- Did not add bare `status` or bare `type` to promotion; narrative headers stay notes-only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MAP-01, MAP-02, MAP-03 locked; city category columns label FN/distressed groups
- SHAPE from 48-01 still green (arrays on process path)
- Phase 48 complete (2/2 plans) â€” ready for Phase 49 stable group keys / timestamp singletons
- Description-only free-text High Grass still empty type until Phase 49 (expected)

## Self-Check: PASSED

- `lib/bridge-category-promote.js` FOUND
- `lib/bridge-engine/normalizer.js` FOUND (contains promoteCategoryFromRaw)
- `tests/bridge-category-promote.test.js` FOUND
- `tests/bridge-engine.test.js` FOUND
- Commit `346fcd6` FOUND
- Commit `071a010` FOUND
- `bridge-review-groups.js` untouched (no diff)
- `npm test` 363 pass / 0 fail

---
*Phase: 48-category-promotion-signal-shape*
*Completed: 2026-07-10*
