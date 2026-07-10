---
phase: 61-scrub-desk-foundation
plan: 01
subsystem: ui
tags: [bridge, filter, desk-shell, heat-atmosphere, asymmetric-grid, anton-hero]

# Dependency graph
requires:
  - phase: v1.4-gritty-premium
    provides: premium-bg--strong, heat-atmosphere.css, Collect desk recipe
provides:
  - Collect-grade Filter first-paint shell (strong + heat)
  - Asymmetric bridge-desk primary + scrap
  - Solid cream left Anton hero + short ops lead
  - Proof rail removed (HTML + CSS)
affects:
  - 61-02 (DESK-06 button/voice pass)
  - 62-city-dossier
  - 63-idle-proof
  - 67-multi-city-shift

# Tech tracking
tech-stack:
  added: []
  patterns:
    - bridge-desk 1.7fr/0.85fr primary+scrap (mirror Collect fractions, bridge-* namespace)
    - Solid cream Anton H1 with explicit gradient-clip kill
    - Quiet scrap link card (no fake metrics)

key-files:
  created: []
  modified:
    - public/bridge.html
    - public/css/bridge.css

key-decisions:
  - "Dropped .bridge-bg under strong+heat to avoid double-orange mud"
  - "bridge-main max-width 1040px so desk+scrap breathe without equal 1fr columns"
  - "Scrap is quiet link-to-lists only — idle metrics deferred to phase 63"

patterns-established:
  - "Pattern: Filter desk uses bridge-desk / bridge-desk-primary / bridge-desk-side — never import collect-desk* class names"
  - "Pattern: First-paint teaching chrome is pipeline chips only — no proof rail + essay lead stack"

requirements-completed: [DESK-01, DESK-02, DESK-03, DESK-04, DESK-05]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 61 Plan 01: Scrub Desk Foundation Summary

**Collect-grade Filter first paint: strong+heat atmosphere, asymmetric primary+scrap desk, solid cream left Anton “Scrub the Mess”, proof rail gone**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T23:29:48Z
- **Completed:** 2026-07-10T23:42:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- First paint at `/bridge` is a dominant work surface + supporting scrap, not a centered essay-wizard stack
- Equal 3-up proof rail deleted from HTML and all `.bridge-proof-*` CSS removed
- Atmosphere matches Collect: `premium-bg--strong` + linked `heat-atmosphere.css` heat-field markup
- Hero is left-aligned solid cream Anton with short ops lead; pipeline step keys and stable IDs preserved for process/save/train

## Task Commits

Each task was committed atomically:

1. **Task 1: Atmosphere + kill proof rail + desk wrap + short hero** - `78e44f0` (feat)
2. **Task 2: Desk grid + solid cream left hero + dead proof CSS + slim pipeline** - `41f3a66` (feat)

**Plan metadata:** `c31d99f` (docs: complete plan)

## Files Created/Modified

- `public/bridge.html` - heat link, strong bg, heat-field, short hero, desk wrap + scrap, proof rail removed
- `public/css/bridge.css` - asymmetric desk grid, cream left hero, proof CSS purge, slim pipeline, 1040px main

## Decisions Made

- Removed `.bridge-bg` when adopting strong+heat so the page does not double-orange-mud against Collect-grade atmosphere
- Used Collect-style `1.7fr / 0.85fr` fractions under `bridge-*` namespace; scrap is a quiet elevated card, not a second equal hero
- Pipeline visual weight reduced only (padding/font); no sticky rewrite, no `data-step` renames, no JS edits

## Deviations from Plan

None - plan executed exactly as written.

Minor discretionary: dropped `.bridge-bg` (plan allowed soften/drop if heat fights it).

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shell ready for plan **61-02** DESK-06 button class unify + ops H2/CTA slang
- Stable IDs and `setPipelineStep` contract untouched — phases 62–67 can mount on this desk
- Preview: http://127.0.0.1:3000/bridge (hard-refresh `Ctrl+Shift+R` for CSS v=15)

## Self-Check: PASSED

- FOUND: `public/bridge.html`, `public/css/bridge.css`, `61-01-SUMMARY.md`
- FOUND commits: `78e44f0`, `41f3a66`
- Static gates: `61-01-html-static-ok`, `61-01-css-static-ok`
- Live: `verify-live.ps1` health=200 home=200

---
*Phase: 61-scrub-desk-foundation*
*Completed: 2026-07-10*
