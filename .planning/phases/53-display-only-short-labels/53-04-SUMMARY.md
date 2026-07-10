---
phase: 53-display-only-short-labels
plan: 04
subsystem: bridge
tags: [tdd, short-label, train-ui, lbl-01, lbl-03, display-only, bridge, fail-closed]

# Dependency graph
requires:
  - phase: 53-display-only-short-labels
    provides: "Parallel shortLabel on review groups + pure shortLabelForDisplay"
  - phase: 49-stable-group-keys
    provides: "groupId + violationTypeKey on full text for decision lookup"
provides:
  - "Train card titles prefer shortLabel with full title= tooltip"
  - "resolveTrainGroupFromCard fail-closed (no DOM title scrape)"
  - "Decision POST body stays full group.violationTypeLabel / violationTypeKey"
  - "Green LBL-01/03 train-ux contracts; Phase 53 presentation seam complete"
affects:
  - 54-lock-and-ship (processUpload e2e / suite gate)
  - Train decision UX / brain rule labels

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Display title: shortLabel || full; tooltip title= full only"
    - "Fail-closed group resolve: found or null — never invent from DOM"
    - "Chrome displayLabel vs POST full metadata locals"

key-files:
  created: []
  modified:
    - public/js/bridge-train.js
    - public/js/bridge.js
    - public/bridge.html

key-decisions:
  - "Title text uses shortLabel || violationTypeLabel; full only in title= tooltip"
  - "resolveTrainGroupFromCard returns null on miss (kill DOM scrape invent path)"
  - "Status/confirm chrome may show displayLabel (short); POST always full group fields"
  - "Both BridgeTrain primary and bridge.js fallback renderers stay in sync"
  - "Cache-bust bridge-train.js?v=4 and bridge.js?v=18"

patterns-established:
  - "Train title pattern: fullLabel + label = short || full; title attr = esc(fullLabel)"
  - "LBL-03: no querySelector(.bridge-train-group-title) for decision labels"
  - "Sort/filter remain on full violationTypeLabel"

requirements-completed: [LBL-01, LBL-03]

# Metrics
duration: 3min
completed: 2026-07-10
---

# Phase 53 Plan 04: Train UI Short Labels + DOM Scrape Kill Summary

**Train titles prefer display-only `shortLabel` with full `title=` tooltip; `resolveTrainGroupFromCard` fail-closed (no DOM scrape); decision POST stays full group metadata (LBL-01/03)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-10T13:49:17Z
- **Completed:** 2026-07-10T13:52:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Train card titles scannable via `shortLabel || violationTypeLabel`; full wall on hover tooltip
- Killed `resolveTrainGroupFromCard` invent path that scraped `.bridge-train-group-title` (would poison brain with truncated titles)
- Decision POST body unchanged: `group.violationTypeLabel` + `group.violationTypeKey` full only
- Fallback renderer in `bridge.js` synced with BridgeTrain short-title pattern
- Cache-bust `bridge-train.js?v=4`, `bridge.js?v=18`
- Full suite 456/456 green; verify-live health=200 home=200

## Task Commits

Each task was committed atomically:

1. **Task 1: Train titles prefer shortLabel + kill DOM scrape** - `40ba6c9` (feat)
2. **Task 2: Full suite + verify-live** - verification only (no code delta; suite + live gate green)

**Plan metadata:** (docs commit after state update)

## Files Created/Modified

- `public/js/bridge-train.js` — `fullLabel` / `label` split; `title="full"` on `.bridge-train-group-title`
- `public/js/bridge.js` — fallback short title; `resolveTrainGroupFromCard` → null on miss; displayLabel for status/confirm chrome
- `public/bridge.html` — cache-bust train v4 / bridge v18

## Decisions Made

- Prefer short in visible title + aria-label chrome; full always in tooltip and POST body
- Fail closed on missing groupId (caller already shows “Could not resolve this group”)
- Distinct `displayLabel` local for toast/confirm so POST cannot reuse short by accident
- Dual-path sync: primary BridgeTrain + bridge.js fallback both prefer shortLabel

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — Wave 0 RED LBL contracts failed pre-wire; GREEN on first implementation. Full suite and verify-live clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 53 presentation seam complete (LBL-01/02/03)
- Ready for Phase 54 lock-and-ship / processUpload e2e if planned
- Hard-refresh note for Train UI: `Ctrl+Shift+R` after deploy (cache-bust bumped)

## Self-Check: PASSED

- FOUND: `public/js/bridge-train.js` shortLabel + title= fullLabel
- FOUND: `public/js/bridge.js` resolveTrainGroupFromCard returns null (no .bridge-train-group-title scrape)
- FOUND: submitTrainDecision still `violationTypeLabel: group.violationTypeLabel`
- FOUND: commit `40ba6c9`
- CONFIRMED: `node --test tests/bridge-train-ux.test.js tests/bridge-short-label.test.js tests/bridge-review-groups.test.js` 64/64
- CONFIRMED: `npm test` 456/456
- CONFIRMED: `scripts/verify-live.ps1` exit 0 (health=200 home=200)
- CONFIRMED: no edits to data/filter-lists, data/bridge-brain, scorer, or format store

---
*Phase: 53-display-only-short-labels*
*Completed: 2026-07-10*
