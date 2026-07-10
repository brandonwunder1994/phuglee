---
phase: 53-display-only-short-labels
plan: 02
subsystem: bridge
tags: [tdd, pure, short-label, display-only, bridge, lbl-01, stripIncidentalTimestamps]

# Dependency graph
requires:
  - phase: 53-display-only-short-labels
    provides: "Wave 0 RED pure shortLabelForDisplay matrix (tests/bridge-short-label.test.js)"
  - phase: 49-stable-group-keys
    provides: "stripIncidentalTimestamps in lib/bridge-stable-text.js"
provides:
  - "Pure lib/bridge-short-label.js shortLabelForDisplay + DEFAULT_MAX=56"
  - "Green LBL-01 pure unit matrix (13/13)"
affects:
  - 53-03 groups wire shortLabel
  - 53-04 Train UI + resolveTrainGroupFromCard fail-closed

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Natural dash/clause breaks on raw text before stripIncidentalTimestamps (strip removes spaced em/en dashes)"
    - "Display-only pure helper: no I/O, no row/group mutation, zero new packages"

key-files:
  created:
    - lib/bridge-short-label.js
  modified: []

key-decisions:
  - "DEFAULT_MAX locked at 56; hard-slice uses unicode …"
  - "Dash/clause detection runs on whitespace-normalized raw text; strip timestamps after natural break or for passthrough/hard-max"
  - "No groups/UI/export/scorer wire in Plan 02 — pure module only"

patterns-established:
  - "shortLabelForDisplay(text, { maxLen }) → string; export { shortLabelForDisplay, DEFAULT_MAX }"
  - "Break priority: em/en/spaced-hyphen → first clause (. ; |) → word-boundary max + …"
  - "Natural dash-break returns left clause without ellipsis when length in [12, maxLen]"

requirements-completed: [LBL-01]

# Metrics
duration: 1min
completed: 2026-07-10
---

# Phase 53 Plan 02: Pure shortLabelForDisplay Summary

**Pure `lib/bridge-short-label.js` with DEFAULT_MAX 56 — dash/clause/hard-max heuristic green against Wave 0 LBL-01 matrix; no groups or Train UI wire**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-07-10T13:45:26Z
- **Completed:** 2026-07-10T13:46:15Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Implemented pure CommonJS `shortLabelForDisplay` + `DEFAULT_MAX = 56`
- All 13 pure unit tests green (`node --test tests/bridge-short-label.test.js`)
- Reuses `stripIncidentalTimestamps` without re-hand-rolling date regex
- Zero production groups/Train/export/scorer edits (Plans 03–04 remain RED)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement pure shortLabelForDisplay (GREEN)** - `f4898b6` (feat)
2. **Task 2: Confirm pure isolation + suite hygiene** - verification only (no file changes; re-ran suite 13/13 green)

**Plan metadata:** (docs commit after state update)

## Files Created/Modified

- `lib/bridge-short-label.js` — pure display shortener (dash → clause → word max + …)

## Decisions Made

- Natural dash/clause detection **before** `stripIncidentalTimestamps`: strip's dangling-separator cleanup removes spaced `—`/`–`/` - `, which would otherwise destroy break points
- After a natural left-clause pick, still strip timestamps on the candidate for clean display
- Passthrough and hard-max paths strip first, then apply length rules
- Fixture outcomes are the contract; plan sketch order was tuned (not tests)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dash breaks failed when strip ran first**
- **Found during:** Task 1 (GREEN implementation)
- **Issue:** Plan sketch called `stripIncidentalTimestamps` before dash-split; strip removes `\s+[—–-]+\s+` dangling separators, so em/en/spaced-hyphen fixtures fell through to clause/hard-max (`High Grass and Weeds Sec` instead of `High Grass and Weeds`)
- **Fix:** Detect dash/clause on whitespace-normalized raw text when `raw.length > maxLen`; apply strip to the selected left part (or for passthrough/hard-max paths)
- **Files modified:** `lib/bridge-short-label.js`
- **Verification:** `node --test tests/bridge-short-label.test.js` → 13/13 pass
- **Committed in:** `f4898b6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Required for LBL-01 dash fixtures; no scope creep; tests unchanged

## Issues Encountered

None beyond the strip-order interaction documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03: attach parallel `shortLabel` in `buildReviewGroups` (keys/full/export unchanged)
- Plan 04: Train title prefers shortLabel + kill DOM scrape + verify-live
- Pure helper ready for require from groups module

## Self-Check: PASSED

- FOUND: `lib/bridge-short-label.js`
- FOUND: exports `shortLabelForDisplay`, `DEFAULT_MAX` (56)
- FOUND: commit `f4898b6`
- CONFIRMED: `node --test tests/bridge-short-label.test.js` exits 0 (13/13)
- CONFIRMED: only require is `./bridge-stable-text` (no fs/network/groups/UI)
- CONFIRMED: no edits to review-groups, bridge-train, bridge.js, scorer, or format store

---
*Phase: 53-display-only-short-labels*
*Completed: 2026-07-10*
