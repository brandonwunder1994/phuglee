---
phase: 65-kill-rate-scrub-report
plan: 03
subsystem: ui
tags: [kill-rate, scrub-report, stage, save-list, cta-hierarchy, bridge]

# Dependency graph
requires:
  - phase: 65-kill-rate-scrub-report
    provides: Kill-rate HUD (RAW→KILLED→KEPT) + Wave 0 contracts
  - phase: 56-list-factory-ux
    provides: Save list / Preview CSV / workflow teaching locks
provides:
  - Elevated #bridge-save-panel immediately after kill report (before train wrap)
  - Stage voice on save heading/lead without renaming Save list button
  - Fire-primary save panel CSS adjacent to kill report
  - KILL-03 Stage + elevation static locks
  - Full KILL/LIST/EFF/IND suite green + verify-live 200
affects: [66-superpower-train-theater, kill-report-ui, bridge-results, stage-cta]

# Tech tracking
tech-stack:
  added: []
  patterns: [Option A DOM elevation save-before-train, Stage copy on panel not button, LIST-03 phrase preservation]

key-files:
  created: []
  modified:
    - public/bridge.html
    - public/css/bridge.css
    - tests/bridge-kill-rate-scrub.test.js

key-decisions:
  - "Option A: move save panel + workflow strip before train wrap (no ID duplication)"
  - "Heading Stage this scrub; lead opens with Stage multi-city shift; button stays Save list"
  - "Preserve exact LIST-03 phrase download from Saved lists for external enrichment"
  - "Preview CSV remains secondary in toolbar; no Analyze push CTAs"

patterns-established:
  - "Pattern: post-scrub CTA elevation via DOM order (kpi → workflow → save → train → table)"
  - "Pattern: Stage language on heading/lead only; Save list label locked for LIST/EFF"
  - "Pattern: KILL-03 elevation assert = save index < train-wrap index in HTML source"

requirements-completed: [KILL-03, KILL-01, KILL-02]

# Metrics
duration: 2min
completed: 2026-07-11
---

# Phase 65 Plan 03: Kill-Rate Stage CTA Summary

**Elevated Save/Stage panel immediately after the kill-rate report with Stage voice, fire-primary CSS, and KILL-03 elevation locks — Preview CSV secondary, Analyze boundary intact**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-11T00:18:52Z
- **Completed:** 2026-07-11T00:19:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Reordered results panel: kill report → workflow strip → save/stage panel → train wrap → toolbar/table
- Stage copy: H3 `Stage this scrub` + multi-city Stage lead; button remains exact **Save list**
- Save panel fire-primary heat border/background; CTA min-height 44px
- KILL-03 tests lock Stage-in-save-panel + elevation (save before train, kpi before save)
- Full suite green (KILL + LIST + EFF + IND); verify-live health=200 home=200

## Task Commits

Each task was committed atomically:

1. **Task 1: Elevate Save/Stage adjacent to kill report + Stage copy** - `38222b4` (feat)
2. **Task 2: Green remaining KILL tests + regression suite + verify-live** - `b24461d` (test)

**Plan metadata:** docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `public/bridge.html` — Option A elevation; Stage heading/lead; cache-bust `bridge.css?v=22` `bridge.js?v=41`
- `public/css/bridge.css` — elevated `.bridge-save-panel` fire weight; workflow strip spacing near report
- `tests/bridge-kill-rate-scrub.test.js` — KILL-03 Stage-in-panel + elevation source-order locks

## Decisions Made

- Prefer Option A (move DOM nodes) over dual-button stage strip to avoid duplicate IDs
- Keep LIST-03 teaching corpus phrase exact (`download from Saved lists for external enrichment`) while adding Stage multi-city lead
- Attach panel stays after table (optional secondary); save owns the post-scrub primary path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LIST-03 teaching phrase regression on Stage lead rewrite**
- **Found during:** Task 1 (verify)
- **Issue:** Lead used `Download later from Saved lists…` which broke LIST-03 regex `/download from Saved lists for external enrichment/`
- **Fix:** Restored exact phrase with Stage open: `Stage this kept list for your multi-city shift. When ready, download from Saved lists for external enrichment. Nothing is sent to Analyze.`
- **Files modified:** `public/bridge.html`
- **Verification:** LIST-03 teaching pack test green
- **Committed in:** `38222b4` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for LIST-03 lock; Stage intent preserved. No scope creep.

## Issues Encountered

None beyond LIST-03 phrase alignment above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 65 KILL-01–03 complete; ready for Phase 66 Superpower Train Theater
- Train refresh still uses `renderKpis`; save elevated above train so Stage wins scroll
- Live: http://127.0.0.1:3000/ (verify-live 200)

## Self-Check: PASSED

- FOUND: `public/bridge.html`
- FOUND: `public/css/bridge.css`
- FOUND: `tests/bridge-kill-rate-scrub.test.js`
- FOUND: `.planning/phases/65-kill-rate-scrub-report/65-03-SUMMARY.md`
- FOUND: commit `38222b4`
- FOUND: commit `b24461d`

---
*Phase: 65-kill-rate-scrub-report*
*Completed: 2026-07-11*
