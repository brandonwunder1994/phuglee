---
phase: 65-kill-rate-scrub-report
plan: 01
subsystem: testing
tags: [tdd, static-contracts, kill-rate, bridge, node-test, wave-0]

# Dependency graph
requires:
  - phase: 59-efficiency-path
    provides: Format reused string + Save list / Preview CSV CTA locks
  - phase: 56-list-factory-ux
    provides: BANNED_CTAS pattern + independence wording
provides:
  - Wave 0 static suite locking KILL-01/02/03 surface contracts
  - GREEN carry-forwards for LIST/EFF CTAs and independence
  - RED gates for RAW/KILLED/KEPT hierarchy, kill-flow CSS, proof chips, kept samples
affects: [65-02, 65-03, kill-report-ui, bridge-results]

# Tech tracking
tech-stack:
  added: []
  patterns: [node:test static source scans, RED-until-next-plan contracts, BANNED_CTAS carry-forward]

key-files:
  created:
    - tests/bridge-kill-rate-scrub.test.js
  modified: []

key-decisions:
  - "Wave 0 only — no production edits; RED hierarchy/proof prove Plan 02 gate is real"
  - "Stage language already green from existing 'Stage the list' heading — keep asserting"
  - "discardReasons already referenced in renderKpis — keep as green lock so Plan 02 cannot drop it"

patterns-established:
  - "Pattern: KILL suite mirrors LIST/EFF static scans (html+js+css fs reads, no packages)"
  - "Pattern: Group test titles with KILL-01/02/03 and carry-forward for plan-scoped greening"

requirements-completed: []  # Wave 0 contracts only; KILL-01/02/03 production surface lands in 65-02/03

# Metrics
duration: 4min
completed: 2026-07-11
---

# Phase 65 Plan 01: Kill-Rate Scrub Report Wave 0 Summary

**Static KILL-01/02/03 contracts suite with 10 GREEN CTA/independence locks and 4 RED hierarchy/proof gates driving Plan 02/03**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-11T00:13:44Z
- **Completed:** 2026-07-11T00:17:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `tests/bridge-kill-rate-scrub.test.js` (node:test + fs source scans of bridge.html/js/css)
- Locked LIST/EFF carry-forwards: Save list primary, Preview CSV secondary, no banned Analyze push CTAs, independence wording, Format reused, `renderKpis`, `#bridge-kpi-grid`
- Locked RED gates for Plan 02: RAW/KILLED/KEPT hierarchy labels + kill-stat class markers, `.bridge-kill-flow`/`.bridge-kill-stat` CSS, proof-chip duration surface, kept-sample dossiers
- Stage language already present (`Stage the list`) — Stage teaching test is GREEN while button remains Save list

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KILL-01/02/03 static suite with RED hierarchy + GREEN CTA locks** - `ddc1a1e` (test)

**Plan metadata:** (docs commit after SUMMARY)

_Note: TDD Wave 0 is test-only — no feat commit until Plan 02 greens production surface._

## Files Created/Modified

- `tests/bridge-kill-rate-scrub.test.js` — 14 static contracts for KILL-01/02/03 + carry-forwards

## Green vs Red (verification)

**GREEN (10) — must stay green forever:**

| # | Test |
|---|------|
| 1 | KILL-03 carry-forward: Save list primary CTA |
| 2 | KILL-03 carry-forward: Preview CSV secondary |
| 3 | KILL-03: no Analyze push CTAs |
| 4 | carry-forward: independence wording in bridge.js |
| 5 | carry-forward: Format reused string (EFF) |
| 6 | carry-forward: renderKpis still defined |
| 7 | carry-forward: kill report host id |
| 8 | KILL-01: discardReasons drives kill-reason breakdown |
| 9 | KILL-02: format reuse still chip-capable |
| 10 | KILL-03: Stage language near save without renaming button |

**RED (4) — expected until Plan 02/03:**

| # | Test | Greens in |
|---|------|-----------|
| 1 | KILL-01: RAW → KILLED → KEPT labels in bridge.js | 65-02 |
| 2 | KILL-01: CSS kill-flow hierarchy classes | 65-02 |
| 3 | KILL-02: proof chip / duration surface | 65-02 |
| 4 | KILL-01 optional: kept sample dossiers class | 65-02 or 65-03 |

```text
node --test tests/bridge-kill-rate-scrub.test.js
# → 14 tests, 10 pass, 4 fail (intentional RED)
```

## Decisions Made

- Wave 0 only — no production file edits; RED failures prove the gate is real
- Stage teaching already shipped (`Stage the list` heading) so KILL-03 Stage assert is green early; button text remains `Save list`
- `discardReasons` already used inside `renderKpis` for discard breakdown — asserted green so Plan 02 must preserve/extend it into full reason chips
- Optional kept-sample dossier class included as RED (not `test.skip`) per plan default

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can reforge `renderKpis` / kill-report UI + CSS hierarchy to green KILL-01/02 RED tests
- Plan 03 elevates Stage CTA strip / optional samples if not shipped in 02
- No production surface risk from this plan (tests only)

## Self-Check: PASSED

- FOUND: `tests/bridge-kill-rate-scrub.test.js`
- FOUND: `.planning/phases/65-kill-rate-scrub-report/65-01-SUMMARY.md`
- FOUND: commit `ddc1a1e`

---
*Phase: 65-kill-rate-scrub-report*
*Completed: 2026-07-11*
