---
phase: 75-contract-freeze-surface-inventory
plan: 02
subsystem: docs
tags: [DESK-05, surface-inventory, state-matrix, v3.0, design-system]

requires:
  - phase: 75-contract-freeze-surface-inventory
    provides: CONTRACT-FREEZE.md + greppable freeze suite (75-01)
  - phase: research
    provides: ARCHITECTURE cascade layers + PITFALLS hidden/disabled rules
provides:
  - Region → layer paint map for phases 76–80
  - JS state matrix (CSS may style / must not invent)
  - CONTRACT-FREEZE cross-links to inventory companions
affects:
  - 76-tokens-layer-audit
  - 77-shared-components-expansion
  - 78-cascade-hooks-state-css
  - 79-desk-core-restyle
  - 80-theater-gates-motion

tech-stack:
  added: []
  patterns:
    - "Surface inventory: region → target layer → paint phase hint"
    - "State matrix: JS-owned tokens only; CSS styles, never invents workflow state"

key-files:
  created:
    - docs/bridge/SURFACE-INVENTORY.md
    - docs/bridge/STATE-MATRIX.md
  modified:
    - docs/bridge/CONTRACT-FREEZE.md

key-decisions:
  - "Docs only for 75-02 — no HTML/JS/CSS product changes"
  - "Domain chips/dropzone/kill report stay bridge layout/theater; promote shared selects/inputs/buttons via phuglee-components"
  - "State matrix extracted from live bridge.js toggles — no future-use class names"

patterns-established:
  - "Paint order: freeze → inventory layer → state token → restyle"
  - "Elevation sketch documents climax vs scrap without new CSS"

requirements-completed: [DESK-05]

duration: 18min
completed: 2026-07-11
---

# Phase 75 Plan 02: Surface Inventory + State Matrix Summary

**DESK-05 foundation complete: every major `/bridge` region maps to a design-system layer, and JS-owned visibility/enablement/theater states are documented so v3.0 restyles cannot invent CSS-only workflow gates.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-11T20:00:37Z
- **Completed:** 2026-07-11
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Wrote `docs/bridge/SURFACE-INVENTORY.md` — full region table (hero → dialogs + dynamic toast/shift), cascade layers, elevation sketch, orphan risks, anti-targets
- Wrote `docs/bridge/STATE-MATRIX.md` — visibility, disabled, theater/mode, dropzone, status tones, train motion, dialogs + implementer restyle checklist
- Cross-linked both companions from `docs/bridge/CONTRACT-FREEZE.md` Related docs section
- Zero product HTML/JS/CSS edits; zero ID renames; zero data wipes

## Task Commits

Each task was committed atomically:

1. **Task 1: Write surface inventory mapped to design-system layers** - `ee397a3` (docs)
2. **Task 2: Write JS state matrix + cross-link freeze doc** - `07ba0df` (docs)

**Plan metadata:** `4916070` (docs: complete plan + STATE/ROADMAP)

## Files Created/Modified

- `docs/bridge/SURFACE-INVENTORY.md` — region → layer → paint phase map for 76–80
- `docs/bridge/STATE-MATRIX.md` — JS state tokens CSS may style / must not invent
- `docs/bridge/CONTRACT-FREEZE.md` — Related docs links to inventory companions

## Decisions Made

- **Docs-only plan:** inventory and matrix are maintainer maps; no dual-class hooks applied yet (Phase 78+)
- **Layer assignment:** Filter-only theater (victory, kill report, Train, dossier) stays in `bridge.css`; shared controls target `phuglee-components` / tokens
- **States from live JS only:** extracted `classList` / `setHidden` / `disabled` / `aria-*` from `bridge.js` — no invented `.is-disabled` or parallel show/hide

## Deviations from Plan

None - plan executed exactly as written.

## Known Follow-ups

- Phase 76: token audit against orphan/one-off hex callouts in SURFACE-INVENTORY
- Phase 78: cascade load-order flip (components before bridge) noted in STATE/ARCHITECTURE
- DESK-05 requirement complete when 75-01 + 75-02 both done (this plan closes inventory half)

## Self-Check: PASSED

- FOUND: docs/bridge/SURFACE-INVENTORY.md
- FOUND: docs/bridge/STATE-MATRIX.md
- FOUND: docs/bridge/CONTRACT-FREEZE.md (cross-links)
- FOUND: commits ee397a3, 07ba0df
