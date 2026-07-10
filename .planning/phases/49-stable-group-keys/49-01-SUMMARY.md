---
phase: 49-stable-group-keys
plan: 01
subsystem: filter-bridge
tags: [grouping, stable-keys, timestamps, TDD, isSingleton, free-text]

# Dependency graph
requires:
  - phase: 48-category-promotion
    provides: "MAP/SHAPE process rows; typed category path for clean High Grass"
  - phase: 43-review-payload-grouping
    provides: "buildReviewGroups, groupIdFor, assignRowIds, isSingleton = count === 1"
provides:
  - "stripIncidentalTimestamps pure helper (US/ISO dates + times)"
  - "stableTypeKey / stableDescriptionKey for review group map keys"
  - "buildReviewGroups stacks same category when free-text differs only by timestamps"
  - "GROUP-01..04 unit matrix green"
affects: [50-regression-lock, train-review-grouping, filter-accuracy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strip incidental timestamps before key formation; never mutate process rows"
    - "stableTypeKey = strip → violationTypeKey; stableDescriptionKey = strip → lower+collapse (empty → '')"
    - "isSingleton remains pure count === 1 after keys stabilize"

key-files:
  created:
    - lib/bridge-stable-text.js
    - tests/bridge-stable-text.test.js
  modified:
    - lib/bridge-review-groups.js
    - tests/bridge-review-groups.test.js

key-decisions:
  - "Pure helpers in bridge-stable-text.js; reuse violationTypeKey after strip (do not edit brain-store)"
  - "descriptionKey lowercases free-text after strip (align with type keys); fence/pool fixtures already lower"
  - "Labels prefer cleaned phrase; descriptionSamples keep raw timestamped strings"
  - "isSingleton formula unchanged — stacking alone fixes false singleton badges"

patterns-established:
  - "Pattern: stable key pipeline = stripIncidentalTimestamps → normalize → mapKey/groupId"
  - "Pattern: type path uses stableTypeKey; empty-type path uses stableDescriptionKey (never '__unknown__' as description sub-key)"
  - "Pattern: ordinance-safe strip (date regex requires 2–4 digit year segment)"

requirements-completed: [GROUP-01, GROUP-02, GROUP-03, GROUP-04]

# Metrics
duration: 4min
completed: 2026-07-10
---

# Phase 49 Plan 01: Stable Group Keys Summary

**Timestamp-stable review keys: strip US/ISO dates/times, stack same free-text category, singleton only when count === 1**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-10T03:26:12Z
- **Completed:** 2026-07-10T03:30:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Pure `lib/bridge-stable-text.js` with `stripIncidentalTimestamps`, `stableTypeKey`, `stableDescriptionKey`
- `buildReviewGroups` keys type + empty-type description paths after strip; cleaned labels; raw samples preserved
- GROUP-01..04 unit matrix + strip unit matrix green; full `npm test` 378/378 pass
- `isSingleton` remains `g.count === 1`; `violationTypeKey` in brain-store untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing stable-key tests (RED)** - `320624e` (test)
2. **Task 2: Implement strip/stable helpers and wire buildReviewGroups (GREEN)** - `d5092d1` (feat)
3. **Task 3: Full suite gate for stable keys** - verified only (no code changes; `npm test` 378 pass)

**Plan metadata:** (docs commit after this summary)

_Note: TDD tasks use test → feat commits_

## Files Created/Modified

- `lib/bridge-stable-text.js` - Pure strip + stable type/description keys
- `lib/bridge-review-groups.js` - Wire stable keys; cleaned labels; samples raw
- `tests/bridge-stable-text.test.js` - Strip matrix (US/ISO/12h, ordinance-safe, cleanup)
- `tests/bridge-review-groups.test.js` - GROUP-01/02/04 timestamp stack + singleton asserts

## Decisions Made

- Helpers live in dedicated pure module (not colocated) for isolated unit tests
- Separator cleanup after strip so `"High Grass - 01/15/2024"` → `"High Grass"` not `"High Grass -"`
- brain-apply still matches raw `violationTypeKey` (known gap — timestamped type cells may miss type rules until later polish)
- Month-name dates (`Jan 15, 2024`) not stripped in v1 — numeric US + ISO + times only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. RED confirmed (GROUP-01/02 fail + missing module); GREEN on first implement pass; full suite clean with no regression fixes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 49 complete (single plan 49-01)
- Ready for Phase 50 regression e2e lock suite (TEST-01..03)
- Known non-blocking gap: brain-apply type matching does not strip timestamps

## Verification

- Empty type + timestamp variants → 1 group, count N, isSingleton false ✅
- Typed timestamp variants → 1 group ✅
- Clean High Grass / case-spacing still stack ✅
- Fence vs pool free-text still 2 groups ✅
- isSingleton === (count === 1) only ✅
- descriptionSamples retain raw strings ✅
- `npm test` green (378 pass, 0 fail) ✅
- No Train CSS / phrase miner / brain-apply / violationTypeKey global edits ✅

## Self-Check: PASSED

- FOUND: `lib/bridge-stable-text.js`
- FOUND: `lib/bridge-review-groups.js` (stableTypeKey + isSingleton = count === 1)
- FOUND: `tests/bridge-stable-text.test.js`
- FOUND: GROUP-01/02 tests in `tests/bridge-review-groups.test.js`
- FOUND: commit `320624e`
- FOUND: commit `d5092d1`

---
*Phase: 49-stable-group-keys*
*Completed: 2026-07-10*
