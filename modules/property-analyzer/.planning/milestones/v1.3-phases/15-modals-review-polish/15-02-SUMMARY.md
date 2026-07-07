---
phase: 15-modals-review-polish
plan: 02
subsystem: ui
tags: [css, modals, inspector, review-overlay, calm-dialog]

requires:
  - phase: 15-modals-review-polish
    plan: 01
    provides: calm-dialog DOM structure and inspector-calm grid from 15-01
provides:
  - Shared calm-dialog chrome with var(--card) and var(--border)
  - Tool modal calm scrim and flat close button hover
  - Imagery-first inspector CSS with de-emphasized gauge
  - Score edit calm dialog styles
  - Review overlay calm scrim and flat tier action buttons
affects: [15-03]

tech-stack:
  added: []
  patterns: [calm-dialog-chrome, inspector-calm-css, flat-review-actions, legacy-hud-escape-hatch]

key-files:
  created: []
  modified: [public/css/app.css]

key-decisions:
  - "Phase 15 CSS block appended before reduced-motion media queries"
  - "Legacy glass/hud-panel overrides scoped via .calm-dialog.glass selector"
  - "Review action glow retained only under body.legacy-hud escape hatch"

patterns-established:
  - "Modal calm styling uses var(--card), var(--border), var(--muted) from tokens.css"

requirements-completed: [MODAL-01, MODAL-02, MODAL-03, MODAL-04, QA-04]

duration: 15min
completed: 2026-06-30
---

# Phase 15 Plan 02: Modal CSS Restyle Summary

**Restyled all modal surfaces in app.css — shared calm-dialog chrome, imagery-first inspector, calm review scrim and flat action bar.**

## Completed

- **Task 1 (MODAL-01):** Added `.calm-dialog` shared chrome, tool modal backdrop scrim `rgba(0,0,0,0.6)`, flat close hover (no copper), legacy glass override
- **Task 2 (MODAL-02/04):** Property modal imagery-first grid, HUD theater hidden on `.inspector-calm`, compact `inspector-gauge-calm`, score edit calm dialog
- **Task 3 (MODAL-03):** Review overlay calm scrim `rgba(0,0,0,0.72)`, flat header/action bar, tier-colored buttons without glow; legacy HUD escape hatch for keep hover glow

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | `eb885a4` | 15-02 Task 1: shared calm-dialog and tool modal styles (MODAL-01) |
| 2 | `21579d4` | 15-02 Task 2: inspector imagery-first and score edit calm styles (MODAL-02/04) |
| 3 | `eacae8a` | 15-02 Task 3: review overlay calm scrim and flat action bar (MODAL-03) |

## Verification

```powershell
Select-String -Path public/css/app.css -Pattern 'calm-dialog|inspector-calm|review-action-bar'
```

- `.calm-dialog {` with `background: var(--card)` present
- `.tool-modal-backdrop` uses `rgba(0, 0, 0, 0.6)`
- Phase 15 block comment `Phase 15: Modals & review polish` present
- `.property-modal-grid.inspector-calm` with two-column grid
- `.inspector-gauge-calm` with `.gauge-svg-calm` at 56px
- `.inspector-calm .rec-badge` hidden with `display: none`
- `.score-edit-dialog.calm-dialog` present
- `.review-mode-overlay` uses `rgba(0, 0, 0, 0.72)`
- `.review-action:hover` sets `box-shadow: none`
- `.review-action.keep:hover` glow only in `body.legacy-hud` block
- `.review-tier-pick-dialog.calm-dialog` present
- Phase 15 `.tool-modal-close:hover` does NOT set `color: var(--copper-bright)` (overrides legacy nested rule via cascade)

## Deviations

None — plan executed as specified.

## Self-Check: PASSED

- `15-02-SUMMARY.md` exists at `.planning/phases/15-modals-review-polish/15-02-SUMMARY.md`
- `public/css/app.css` contains Phase 15 block with all required selectors
- Git commits verified: `eb885a4`, `21579d4`, `eacae8a` (all contain "15-02")
- `STATE.md` updated: Plan 15-02 complete
- `ROADMAP.md` updated: Phase 15 progress 2/3