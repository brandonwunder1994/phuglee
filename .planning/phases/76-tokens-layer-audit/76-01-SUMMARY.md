---
phase: 76-tokens-layer-audit
plan: 01
subsystem: ui
tags: [css, design-tokens, z-index, phuglee, glass, desk-density]

requires:
  - phase: 75-contract-freeze-surface-inventory
    provides: Contract freeze + surface inventory (paint-safe IDs/layers)
provides:
  - Documented z-index scale tokens (--z-bg through --z-toast + shell aliases)
  - Desk density / chip / row tokens for Filter paint consumers
  - Status surface aliases locked to --phuglee-success|warn|danger
affects:
  - 76-02 (bridge token adoption / hex island purge)
  - 77-components
  - 78-cascade-hooks
  - 79-core-desk
  - 80-theater

tech-stack:
  added: []
  patterns:
    - "Layer 0 tokens only — no bridge-local palette invention"
    - "Z-scale consumers must use var(--z-*) — ban ad-hoc 9999/12000 islands"
    - "Status fg always aliases --phuglee-success|warn|danger"

key-files:
  created: []
  modified:
    - public/css/tokens.css

key-decisions:
  - "Z typeahead stays page-local (40/50) below sticky shell band — matches as-built bridge city search stacking"
  - "Status backgrounds use rgba derived from known success/danger hex (not color-mix) for older Edge"
  - "Light theme overrides only chip/row surfaces; status fg stays brand-bright"

patterns-established:
  - "Pattern: Extend tokens.css for proven gaps; paint phases consume vars only"
  - "Pattern: Desk density via --desk-pad-* / --desk-gap — not a second glass system"

requirements-completed: [TOKENS-01, TOKENS-02, TOKENS-03, TOKENS-04]

duration: 8min
completed: 2026-07-11
---

# Phase 76 Plan 01: Tokens Layer Audit Summary

**Layer 0 extended with z-index scale (bg→toast), desk density/chip/row tokens, and status surfaces aliased to canonical Phuglee success/warn/danger**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T20:03:54Z
- **Completed:** 2026-07-11T20:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Documented z-index custom properties covering bg → main → sticky → typeahead → dialog → toast, plus shell aliases (nav/settings/auth/palette)
- Added desk density, chip, row, and status-surface tokens for plan 02+ Filter paint
- Locked status foregrounds to `--phuglee-success|warn|danger` only; light theme overrides only surface-ish chip/row values
- Confirmed type/glass DNA unchanged (`--font-display`, `--glass-fill`, `--phuglee-orange`); added compact `--text-display-sm`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add documented z-index scale tokens** - `16fd3ba` (feat)
2. **Task 2: Add proven desk density / chip / row / status-surface tokens** - `e83f5de` (feat)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified
- `public/css/tokens.css` — z-index scale, desk/chip/row/status tokens, light surface overrides, `--text-display-sm`

## Decisions Made
- Typeahead z values remain 40/50 (page-local stacking contexts) while sticky shell chrome stays at 1000+ — documents as-built reality without breaking nav/auth/palette
- Prefer rgba status backgrounds over `color-mix` for broader Edge support; fg still `var(--phuglee-*)`
- Light theme remaps only chip-bg, chip-border, row-border, row-hover-bg

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 76-02 can adopt `var(--z-*)`, `--desk-*`, `--chip-*`, `--row-*`, `--status-*-fg` in bridge.css
- Cache-bust `?v=` when bridge consumers ship (plan 02)
- No bridge.html / JS / data changes in this plan

## Self-Check: PASSED

- FOUND: `public/css/tokens.css`
- FOUND: `.planning/phases/76-tokens-layer-audit/76-01-SUMMARY.md`
- FOUND: commit `16fd3ba`
- FOUND: commit `e83f5de`

---
*Phase: 76-tokens-layer-audit*
*Completed: 2026-07-11*
