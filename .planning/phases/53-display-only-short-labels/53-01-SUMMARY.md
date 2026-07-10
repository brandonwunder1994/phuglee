---
phase: 53-display-only-short-labels
plan: 01
subsystem: testing
tags: [tdd, wave-0, bridge, short-label, train, lbl, node-test]

# Dependency graph
requires:
  - phase: 49-stable-group-keys
    provides: "stableTypeKey / stableDescriptionKey + stripIncidentalTimestamps group labels"
  - phase: 44-admin-train-brain-ux
    provides: "renderTrainGroupCard + resolveTrainGroupFromCard + submitTrainDecision"
provides:
  - "Wave 0 RED pure shortLabelForDisplay matrix (MODULE_NOT_FOUND until Plan 02)"
  - "Wave 0 RED buildReviewGroups shortLabel + key-stability + no row mutation (until Plan 03)"
  - "Wave 0 RED Train title/tooltip + LBL-03 no DOM scrape contracts (until Plan 04)"
affects:
  - 53-02 pure short-label implementation
  - 53-03 groups wire shortLabel
  - 53-04 Train UI + resolveTrainGroupFromCard fail-closed

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: pure matrix fails MODULE_NOT_FOUND; group/train contracts assert parallel shortLabel + kill DOM scrape"
    - "LBL test names tagged LBL-01/02/03 for requirement traceability"
    - "Display-only: shortLabel never replaces violationTypeLabel / violationIssueType / group keys"

key-files:
  created:
    - tests/bridge-short-label.test.js
  modified:
    - tests/bridge-review-groups.test.js
    - tests/bridge-train-ux.test.js

key-decisions:
  - "No production short-label, groups wire, or DOM scrape fix in Plan 01 — RED only"
  - "DEFAULT_MAX locked at 56 (48–64 band); hard-slice uses unicode …"
  - "LBL-03 source contracts forbid .bridge-train-group-title scrape; prefer return null on miss"

patterns-established:
  - "Pure matrix covers passthrough, em/en/hyphen dash, clause, hard max, timestamps, maxLen, empty"
  - "Groups: parallel shortLabel field; two long prefix-sharing types stay 2 groups"
  - "Train: short title text + full title= tooltip; decision body stays group.violationTypeLabel"

requirements-completed: [LBL-01, LBL-02, LBL-03]

# Metrics
duration: 4min
completed: 2026-07-10
---

# Phase 53 Plan 01: Wave 0 RED Short-Label Contracts Summary

**Wave 0 RED locks display-only short labels: pure `shortLabelForDisplay` matrix (MODULE_NOT_FOUND), parallel `shortLabel` on groups without key merge, Train short title + full tooltip, and LBL-03 no DOM scrape of `.bridge-train-group-title`**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-10T13:42:30Z
- **Completed:** 2026-07-10T13:48:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Pure LBL-01 matrix in `tests/bridge-short-label.test.js` requires not-yet-built `lib/bridge-short-label.js` (intentional MODULE_NOT_FOUND RED)
- Group contracts assert parallel `shortLabel`, full `violationTypeLabel`, key stability for prefix-sharing long types, and no mutation of `row.violationIssueType`
- Train UX contracts assert short title + full `title=` tooltip and forbid DOM scrape of `.bridge-train-group-title` in `resolveTrainGroupFromCard`
- Zero production short-label / groups / UI implementation (Plans 02–04)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED pure short-label matrix** - `84e7f7f` (test)
2. **Task 2: RED group + train + LBL-03 contracts** - `a448092` (test)

**Plan metadata:** (docs commit after state update)

_Note: TDD Wave 0 is RED-only — GREEN is Plans 02–04_

## Files Created/Modified

- `tests/bridge-short-label.test.js` — pure heuristic matrix (DEFAULT_MAX, dash/clause/hard, timestamps, maxLen)
- `tests/bridge-review-groups.test.js` — LBL-01/02 shortLabel + key stability + immutability extensions
- `tests/bridge-train-ux.test.js` — LBL-01 title/tooltip render + LBL-03 source scrape/fail-closed/decision body

## Decisions Made

- No production scorer/format/short-label code in this plan — tests only
- `DEFAULT_MAX === 56` fixture-locked; ellipsis is unicode `…`
- LBL-03 fail-closed preferred: miss path `return null`, never invent label from card title DOM
- Decision POST contract keeps `violationTypeLabel: group.violationTypeLabel` (full), not `shortLabel`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02: implement `lib/bridge-short-label.js` until pure matrix green
- Plan 03: attach `shortLabel` in `buildReviewGroups` (keys/full/export unchanged)
- Plan 04: Train title prefers shortLabel + kill DOM scrape + verify-live
- Pre-existing unrelated group/train tests remain green; only new LBL contracts fail

## Self-Check: PASSED

- FOUND: `tests/bridge-short-label.test.js`
- FOUND: `tests/bridge-review-groups.test.js` (LBL extensions)
- FOUND: `tests/bridge-train-ux.test.js` (LBL extensions)
- FOUND: commit `84e7f7f`
- FOUND: commit `a448092`
- CONFIRMED: `lib/bridge-short-label.js` absent (no production short-label in this plan)
- CONFIRMED: `node --test tests/bridge-short-label.test.js` exits non-zero (MODULE_NOT_FOUND)
- CONFIRMED: group + train LBL cases fail (shortLabel missing / scrape still present)

---
*Phase: 53-display-only-short-labels*
*Completed: 2026-07-10*
