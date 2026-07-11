---
phase: 65-kill-rate-scrub-report
plan: 02
subsystem: ui
tags: [kill-rate, scrub-report, bridge, proof-chips, hud, client-only]

# Dependency graph
requires:
  - phase: 65-kill-rate-scrub-report
    provides: Wave 0 static KILL-01/02/03 contracts suite
  - phase: 59-efficiency-path
    provides: Format reused string + processingMeta typeResolution
  - phase: 56-list-factory-ux
    provides: independence wording + Save list / Preview CSV locks
provides:
  - renderKpis kill-rate report (RAW → KILLED → KEPT hierarchy)
  - Kill-reason chips from discardReasons + counters
  - Proof chips HUD (duration, Format reused, parser, independence)
  - Optional 3 sample kept dossiers from lastResult.rows
  - Asymmetric kill-flow CSS (not equal KPI tiles)
affects: [65-03, 66-train-theater, kill-report-ui, bridge-results]

# Tech tracking
tech-stack:
  added: []
  patterns: [client-only kill report in renderKpis, proof chips from processingMeta, asymmetric HUD scale]

key-files:
  created: []
  modified:
    - public/js/bridge.js
    - public/css/bridge.css
    - public/bridge.html

key-decisions:
  - "RAW−KEPT invariant for killed count; fallback only when totalParsed missing"
  - "Helper named buildKillReasons so Wave 0 static scan finds discardReasons"
  - "Stub note hidden on normal process — kill report owns discard/review/independence proof"
  - "KEPT gold/orange survivor heat; no SaaS green success island"

patterns-established:
  - "Pattern: renderKpis name preserved for Train refresh path"
  - "Pattern: results meta = short ops context; proof lives in chips"
  - "Pattern: page-local kill-report CSS on #bridge-kpi-grid.bridge-kill-report"

requirements-completed: [KILL-01, KILL-02]

# Metrics
duration: 2min
completed: 2026-07-11
---

# Phase 65 Plan 02: Kill-Rate Scrub Report Summary

**Client-only kill-rate HUD: RAW → KILLED → KEPT hierarchy, discard-reason chips, proof chips from processingMeta, and sample kept dossiers**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-11T00:15:23Z
- **Completed:** 2026-07-11T00:17:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced equal KPI tile `renderKpis` with display-scale RAW → KILLED → KEPT kill-flow hierarchy
- Kill-reason chips from `stats.discardReasons` (plus non-zero counters) with operator short labels
- Proof chips: scrub duration, Format reused (auto_reuse), parser, Analyze index, needs review, independence
- Optional 3 sample kept dossiers (Strong tags first); slim `#bridge-results-meta` to city/type/file context
- Asymmetric CSS HUD (kept largest gold, killed ember, raw quiet stone) + cache-bust

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite renderKpis into kill-rate report + slim meta** - `3636057` (feat)
2. **Task 2: Kill-flow HUD CSS — asymmetric hierarchy, chips, samples** - `e6071df` (feat)

**Plan metadata:** docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `public/js/bridge.js` — kill-report `renderKpis`, `buildKillReasons`, `buildProofChips`, `buildKeptSamples`; slim `renderResults` meta/stub
- `public/css/bridge.css` — `.bridge-kill-flow`, `.bridge-kill-stat--*`, proof chips, kept samples
- `public/bridge.html` — `bridge.js?v=40`, `bridge.css?v=21`

## Decisions Made

- Prefer RAW − KEPT for killed total so hierarchy always sums; fallback from discarded+deduped+alreadyImported only when `totalParsed` missing
- Named helper `buildKillReasons` so Wave 0 contract finds `discardReasons` outside the 4500-char `renderKpis` slice
- Hide `#bridge-stub-note` for normal process (kill report owns the story); keep stub path + independence phrase for `data.stub`
- KEPT uses gold/orange survivor heat, not green SaaS success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Helper name mismatch vs Wave 0 static scan**
- **Found during:** Task 1 (verify)
- **Issue:** Initial helper `buildKillReasonChips` was not in the test's allowed helper name list; `discardReasons` lived outside the 4500-char `renderKpis` slice → RED on greenable contract
- **Fix:** Renamed helper to `buildKillReasons` (in test allow-list)
- **Files modified:** `public/js/bridge.js`
- **Verification:** `node --test tests/bridge-kill-rate-scrub.test.js` — discardReasons assert green
- **Committed in:** `3636057` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for Wave 0 contract; no scope creep.

## Issues Encountered

None beyond the helper-name scan fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- KILL-01/02 production surface green; LIST/EFF static locks still green
- Plan 03 can elevate Stage CTA strip / residual polish if needed
- Train refresh still calls `renderKpis(lastResult.stats)` — ready for phase 66 theater
- Live: http://127.0.0.1:3000/ (verify-live 200)

## Self-Check: PASSED

- FOUND: `public/js/bridge.js`
- FOUND: `public/css/bridge.css`
- FOUND: `public/bridge.html`
- FOUND: `.planning/phases/65-kill-rate-scrub-report/65-02-SUMMARY.md`
- FOUND: commit `3636057`
- FOUND: commit `e6071df`

---
*Phase: 65-kill-rate-scrub-report*
*Completed: 2026-07-11*
