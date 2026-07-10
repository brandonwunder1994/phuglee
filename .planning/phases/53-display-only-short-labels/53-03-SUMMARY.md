---
phase: 53-display-only-short-labels
plan: 03
subsystem: bridge
tags: [tdd, short-label, review-groups, export, display-only, bridge, lbl-01, lbl-02]

# Dependency graph
requires:
  - phase: 53-display-only-short-labels
    provides: "Pure shortLabelForDisplay (lib/bridge-short-label.js) + Wave 0 RED group contracts"
  - phase: 49-stable-group-keys
    provides: "stableTypeKey / stableDescriptionKey group keys on full text"
provides:
  - "Parallel shortLabel on every public review group from shortLabelForDisplay(violationTypeLabel)"
  - "Green LBL-01/02 group contracts (keys/full/rows unchanged)"
  - "LBL-02 export regression: rowsToCsv keeps full long violationIssueType"
affects:
  - 53-04 Train UI title prefers shortLabel + kill DOM scrape
  - applyDecision rebuild inherits shortLabel via buildReviewGroups

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Display-only parallel field set once before publicGroup strip"
    - "Export regression assert-only — no export path change"

key-files:
  created: []
  modified:
    - lib/bridge-review-groups.js
    - tests/bridge-export.test.js

key-decisions:
  - "shortLabel set after isSingleton, before private-field strip so it is public DTO"
  - "No export implementation change — assert full type survives rowsToCsv"
  - "Train UI / resolveTrainGroupFromCard left for Plan 04"

patterns-established:
  - "g.shortLabel = shortLabelForDisplay(g.violationTypeLabel) inside buildReviewGroups"
  - "Keys/groupId still from stable* on raw row text — short never becomes key"
  - "applyDecision rebuild inherits shortLabel with zero extra wire"

requirements-completed: [LBL-01, LBL-02]

# Metrics
duration: 1min
completed: 2026-07-10
---

# Phase 53 Plan 03: Groups shortLabel Wire Summary

**Parallel `shortLabel` on every public review group from `shortLabelForDisplay(violationTypeLabel)`; full labels, keys, rows, and export unchanged (LBL-02)**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-07-10T13:47:33Z
- **Completed:** 2026-07-10T13:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired `shortLabelForDisplay` into `buildReviewGroups` as public parallel field
- All LBL-01/02 review-groups contracts green (full label + keys + row immutability)
- Export regression asserts long ordinance type survives `rowsToCsv` without ellipsis
- Train UI / DOM scrape still unwired (Plan 04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Attach shortLabel in buildReviewGroups** - `d20318c` (feat)
2. **Task 2: Export full-type regression (LBL-02)** - `a66ed3c` (test)

**Plan metadata:** (docs commit after state update)

## Files Created/Modified

- `lib/bridge-review-groups.js` — require shortLabelForDisplay; set `g.shortLabel` before public strip
- `tests/bridge-export.test.js` — LBL-02 full long type export assert

## Decisions Made

- Set `shortLabel` once per group after `isSingleton`, before private-field destructure (ensures public API, not stripped)
- Export left untouched — assert-only regression (export already reads rows via `toExportRow`)
- No Train / bridge.js changes (Plan 04 owns LBL-03 + title render)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — Wave 0 RED tests failed as expected pre-wire; GREEN on first implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04: Train card title prefers `shortLabel || violationTypeLabel` + full `title=` tooltip
- Plan 04: Kill `resolveTrainGroupFromCard` DOM scrape of `.bridge-train-group-title` (fail closed)
- Decisions path already inherits shortLabel via `buildReviewGroups` rebuild

## Self-Check: PASSED

- FOUND: `lib/bridge-review-groups.js` contains `shortLabelForDisplay` + `g.shortLabel`
- FOUND: commit `d20318c`
- FOUND: commit `a66ed3c`
- CONFIRMED: `node --test tests/bridge-review-groups.test.js tests/bridge-short-label.test.js` 38/38
- CONFIRMED: `node --test tests/bridge-export.test.js tests/bridge-review-groups.test.js` 31/31
- CONFIRMED: no Train UI / bridge.js / scorer / format store edits

---
*Phase: 53-display-only-short-labels*
*Completed: 2026-07-10*
