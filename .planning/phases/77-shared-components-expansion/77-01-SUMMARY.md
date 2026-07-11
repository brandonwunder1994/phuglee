---
phase: 77-shared-components-expansion
plan: 01
subsystem: ui
tags: [buttons, css, phuglee-components, shimmer, a11y, focus-visible]

requires:
  - phase: 76-tokens-layer-audit
    provides: "Layer 0 tokens (shadow-cta, glass-border-hover, phuglee-danger, card motion)"
provides:
  - "System button variants .phuglee-btn-primary|secondary|ghost|danger with full state matrix"
  - "Desk-capped hover-only primary CTA shimmer (BUTTONS-03)"
  - "Dense .phuglee-btn-sm size for later desk wire"
affects:
  - 77-02-chips-panels-states
  - 78-cascade-hooks-state-css
  - 79-desk-core-restyle

tech-stack:
  added: []
  patterns:
    - "Shared button API expands only in phuglee-components.css"
    - "Hover-only shimmer via ::after translateX; never infinite animation on primary"
    - "prefers-reduced-motion kills sheen + all button hover/active transforms"

key-files:
  created: []
  modified:
    - public/css/phuglee-components.css

key-decisions:
  - "Primary hover capped at translateY(-2px) scale(1.01) for all-day desk (auth-like, not hero thrash)"
  - "Danger tints via --phuglee-danger / --status-danger-bg; no bare #ffc9c9 face color"
  - "Added .phuglee-btn-sm for desk density without changing default home/auth sizes"
  - "Explicit .phuglee-btn:focus-visible uses --phuglee-focus-ring so system buttons survive a11y load-order shifts"

patterns-established:
  - "Button state matrix: :hover:not(:disabled), :focus-visible, :active:not(:disabled), :disabled|[disabled] on every variant"
  - "BUTTONS-03 comment above primary::after documents hover-only sheen contract"

requirements-completed: [BUTTONS-01, BUTTONS-02, BUTTONS-03]

duration: 8min
completed: 2026-07-11
---

# Phase 77 Plan 01: Shared Buttons + CTA Shimmer Summary

**Home-grade `.phuglee-btn*` system with full interactive state matrix and desk-capped hover-only primary gem shimmer**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T13:09:04Z
- **Completed:** 2026-07-11T13:17:00Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Polished four system button variants (primary gem, secondary glass, ghost, danger) to home/auth energy
- Defined consistent hover / focus-visible / active / disabled coverage for all variants
- Capped primary lift and sheen for desk use; reduced-motion kills shimmer pseudo and transforms
- Added optional `.phuglee-btn-sm` dense size for later Filter desk wire (Phases 78–79)

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete button variant + state matrix** + **Task 2: Cap primary CTA shimmer** - `f050f55` (feat)

_Note: Both tasks edit the same contiguous button block in one CSS file; shipped as a single atomic feat commit._

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `public/css/phuglee-components.css` — Expanded `.phuglee-btn*` family: variants, state matrix, `.phuglee-btn-sm`, BUTTONS-03 hover-only sheen, reduced-motion kills

## Decisions Made

- Primary hover: `translateY(-2px) scale(1.01)` (was `-3px` / `1.02`) to match auth desk-safe energy
- Sheen opacity ~0.24 white band; hover-only `translateX` — no perpetual `animation` on `::after`
- Danger text/border/glow map through `var(--phuglee-danger)` and `color-mix` / status danger bg
- Secondary hover border uses `var(--glass-border-hover)`
- Explicit focus-visible on base + each variant with `--phuglee-focus-ring` fallback

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — pure CSS expansion; no env, auth, or deploy steps.

## Next Phase Readiness

- Shared button API ready for desk class wire (Phase 78–79)
- Plan 77-02 can expand chips / panels / empty-error-success without touching button contracts
- No bridge ID renames, no JS, no parallel theme sheet introduced

## Self-Check: PASSED

- FOUND: `public/css/phuglee-components.css`
- FOUND: commit `f050f55`
- FOUND: BUTTONS-01/02 matrix verify OK
- FOUND: BUTTONS-03 shimmer caps verify OK
- FOUND: reduced-motion kills `.phuglee-btn-primary::after`
