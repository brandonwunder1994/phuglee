---
phase: 15-modals-review-polish
plan: 01
subsystem: ui
tags: [html, modals, inspector, review-overlay, calm-dialog]

requires:
  - phase: 14-results-data-views
    provides: calm results chrome and emoji-free filter labels
provides:
  - Calm tool modal dialogs (settings, upload, brain)
  - Imagery-first property inspector DOM with gauge in details column
  - Emoji-free review action buttons and tier pick overlay
  - Calm score edit dialog chrome
affects: [15-02, 15-03]

tech-stack:
  added: []
  patterns: [calm-dialog, inspector-calm, preserved-modal-ids]

key-files:
  created: []
  modified: [public/index.html]

key-decisions:
  - "Replaced glass hud-panel with calm-dialog on all modal dialogs"
  - "Gauge relocated from preview-layout side-by-side to inspector-gauge-calm in details column"
  - "liveDot preserved as hidden element for JS compatibility"
  - "bulkTierWellMaintainedBtn emoji removed (deferred from Phase 14)"

patterns-established:
  - "Modal DOM: calm-dialog chrome + preserved IDs; styling deferred to 15-02"

requirements-completed: [MODAL-01, MODAL-02, MODAL-03, MODAL-04, QA-04]

duration: 10min
completed: 2026-06-30
---

# Phase 15 Plan 01: Modal DOM Restructure Summary

**Restructured modal section in index.html — calm dialog chrome on tool/score/review modals, imagery-first inspector grid, emoji-free review button labels.**

## Completed

- **Task 1 (MODAL-01):** Tool modals (`#settingsModal`, `#uploadModal`, `#brainModal`) use `calm-dialog`; removed inline copper styles from `<code>` and `concurrentLimitVal`
- **Task 2 (MODAL-02):** Property modal uses `calm-dialog`; grid has `inspector-calm`; gauge moved to `inspector-gauge-calm` in details column; `liveDot` hidden for JS compat
- **Task 3 (MODAL-03/04):** Score edit and tier pick use `calm-dialog`; review buttons emoji-free; bulk bar `Well Maintained` label cleaned

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | `da5fc67` | 15-01 Task 1: calm tool modal dialogs (MODAL-01) |
| 2 | `eba71e9` | 15-01 Task 2: imagery-first property inspector DOM (MODAL-02) |
| 3 | `5f5c766` | 15-01 Task 3: calm review overlay and score edit DOM (MODAL-03/04) |

## Verification

- 3 elements match `tool-modal-dialog calm-dialog`
- 0 elements match `tool-modal-dialog glass`
- `inspector-calm` and `inspector-gauge-calm` present
- `score-edit-dialog calm-dialog` and `review-tier-pick-dialog calm-dialog` present
- `#reviewKeepBtn` text is `Keep` (no ✓); `#reviewLandBtn` is `Land`; `#reviewDeferBtn` is `Later`; `#reviewBlurredBtn` is `Blurred`
- All modal IDs preserved: settingsModal, uploadModal, brainModal, propertyModal, scoreEditModal, reviewModeOverlay, reviewTierPickOverlay, exportLearnedBtn, importLearnedBtn, importLearnedFile, fileInput, fileDrop, previewImg, previewSatImg, inspectorBody, gaugeNum, gaugeFill, scoreEditTierPicker, scoreEditSave, scoreEditCancel, reviewKeepBtn, reviewChangeBtn, reviewLandBtn, reviewDeferBtn, reviewBlurredBtn, reviewUndoBtn

## Deviations

None — plan executed as specified.

## Self-Check: PASSED

- `15-01-SUMMARY.md` exists at `.planning/phases/15-modals-review-polish/15-01-SUMMARY.md`
- `public/index.html` modified with all required classes and IDs
- Git commits verified: `da5fc67`, `eba71e9`, `5f5c766` (all contain "15-01")
- `STATE.md` updated: Plan 15-01 complete
- `ROADMAP.md` updated: Phase 15 progress 1/3