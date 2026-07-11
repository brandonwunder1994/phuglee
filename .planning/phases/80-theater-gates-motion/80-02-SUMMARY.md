---
phase: 80-theater-gates-motion
plan: 02
subsystem: ui
tags: [bridge, theater, train, armory, reduced-motion, a11y, css, desk, fail-closed]

requires:
  - phase: 80-theater-gates-motion
    provides: Kill/mission/save climax paint; victory/feed/lists/dialog surface paint (80-01)
provides:
  - Admin Train theater + Rules armory distinct visual modes (DESK-04)
  - Non-admin fail-closed structure preserved (no CSS display gate)
  - prefers-reduced-motion twins for dialog rise + train exit + theater cluster (STATES-04)
affects: [81-visual-qa-lock-catalog, desk-qa]

tech-stack:
  added: []
  patterns:
    - "Theater rail hierarchy: Train primary gold/orange, Kept demoted escape, armory quietest stone"
    - "Train cards use glass-fill-elevated; deny uses --phuglee-danger color-mix (no hex islands)"
    - "Consolidated theater reduce block + local twins; !important only as motion kill-switch"

key-files:
  created: []
  modified:
    - public/css/bridge.css
    - public/bridge.html

key-decisions:
  - "Mission HUD heat under is-theater uses glass-fill-elevated + orange glow tokens, not raw rgba islands"
  - "Dialog rise covered via .bridge-history-dialog-card (phuglee-modal-rise dual-class) — no new bridge-dialog-rise keyframes"
  - "Train is-exiting under reduce: transition none + instant opacity/max-height 0 so JS timers still remove cards"
  - "bridge.css cache bump 50 → 51"

patterns-established:
  - "Admin fail-closed: CSS may paint is-theater chrome only when wrap is already unhidden by JS"
  - "STATES-04: every theater transition >150ms and keyframe path gets prefers-reduced-motion twin"

requirements-completed: [DESK-04, STATES-04]

duration: 14min
completed: 2026-07-11
---

# Phase 80 Plan 02: Theater Gates Motion — Train Modes + Reduce Twins Summary

**Admin Train theater elevates mission HUD + Train tab while demoting Kept/armory; comprehensive prefers-reduced-motion twins cover dialog rise and train card exit without fail-opening non-admin Train.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-11T20:34:40Z
- **Completed:** 2026-07-11T20:48:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- DESK-04: Theater chrome paints Train as climax mode (mission heat, gold/orange active tab), Kept as lower-opacity escape hatch, Rules armory as quietest stone secondary
- Glass card language on `.bridge-train-group` + `.bridge-brain-rule`; deny buttons use `--phuglee-danger` color-mix (no `#e8a0a0` / pink hex islands)
- STATES-04: Filled gaps for dialog rise (`.bridge-history-dialog-card`) and train exit/pending (`.bridge-train-group.is-exiting`); consolidated theater reduce block; existing feed/kill/lists/toast/date-chip twins retained
- Fail-closed: `#bridge-train-wrap` still default-`hidden`; no `display:!important` on wrap; mission stays inside wrap; zero JS/lib edits

## Task Commits

Each task was committed atomically:

1. **Task 1: Train theater + Rules armory distinct modes (DESK-04)** - `be7fb79` (feat)
2. **Task 2: Reduced-motion twins for all theater motion (STATES-04)** - `e25b7b6` (feat)

**Plan metadata:** (docs commit after state updates)

## Files Created/Modified

- `public/css/bridge.css` — Theater mode paint (mission/rail/tabs/cards/deny) + reduce twins for dialog rise + train exit
- `public/bridge.html` — `bridge.css?v=50` → `?v=51` only

## Decisions Made

- Dialog rise uses dual-class `phuglee-modal-rise` path; bridge reduce twin targets `.bridge-history-dialog-card` rather than inventing `bridge-dialog-rise` keyframes
- Train exit under reduce keeps instant opacity/max-height collapse so JS removal timers never leave mid-exit stuck cards
- No markup dual-class needed — existing `is-theater`, `bridge-results-mode--theater`, `bridge-mode-tab--armory` hooks sufficient
- CSS/markup only — IDs, `data-mode`, cinema copy, Rules armory label frozen

## Deviations from Plan

None - plan executed exactly as written.

## Verification

```
node --test tests/bridge-train-theater.test.js
→ 14 pass, 0 fail

node --test tests/bridge-scrub-feed.test.js tests/bridge-train-theater.test.js tests/bridge-desk-cinema.test.js tests/bridge-kill-rate-scrub.test.js
→ 83 pass, 0 fail (56 + 27)
```

- `prefers-reduced-motion` covers: feed enter, kill report, lists chevron, scanned toast, date chips, dialog card rise, train-group exit
- HTML: `#bridge-train-wrap` opening tag still has `hidden`; mission nested inside wrap; label `Rules armory`
- Diff excludes `public/js/**` and `lib/**`
- No `display: flex|block|grid !important` on `#bridge-train-wrap`

## Self-Check: PASSED

- FOUND: `.planning/phases/80-theater-gates-motion/80-02-SUMMARY.md`
- FOUND: `public/css/bridge.css`, `public/bridge.html` cache `?v=51`
- FOUND commits: `be7fb79`, `e25b7b6`
