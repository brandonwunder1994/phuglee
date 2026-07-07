---
phase: 12-shell-simplification
plan: 01
subsystem: ui
tags: [html, shell, sidebar, command-bar]

requires:
  - phase: 11-calm-design-foundation
    provides: calm design tokens and typography foundation
provides:
  - Calm shell DOM topology with overflow menu container
  - Status chip relocated to command bar metadata cluster
  - Distress Analyzer branding in sidebar and command bar
affects: [12-02, 12-03, 13-workflow-surfaces]

tech-stack:
  added: []
  patterns: [progressive-disclosure-overflow-menu, preserved-dom-ids]

key-files:
  created: []
  modified: [public/index.html]

key-decisions:
  - "Moved Settings/Manage Data into sidebarOverflowMenu while preserving all button IDs"
  - "HUD bar removed from visible DOM; hudClock kept as hidden shim for JS safety"

patterns-established:
  - "Shell DOM: 4 top-level nav items + More overflow container"

requirements-completed: [SHELL-01, SHELL-02, SHELL-03, SHELL-05, QA-04]

duration: 15min
completed: 2026-06-30
---

# Phase 12 Plan 01: Shell DOM Restructure Summary

**Restructured index.html shell — HUD hidden, 4-item sidebar with overflow menu, single-row command bar metadata cluster, Distress Analyzer branding.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-30T12:00:00Z
- **Completed:** 2026-06-30T12:15:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 1

## Accomplishments

- HUD bar removed; `#hudStatus` relocated inside `#commandBar` metadata cluster
- Sidebar slimmed to Overview, Lead Rankings, Review, More with overflow menu
- All 33+ preserved DOM IDs verified present; `npm test` 78/78 pass

## Task Commits

1. **Task 1: Hide HUD bar and move #hudStatus** — included in plan commit
2. **Task 2: Restructure sidebar** — included in plan commit
3. **Task 3: Verify critical ID preservation** — included in plan commit

## Files Created/Modified

- `public/index.html` — Shell DOM restructure with overflow menu and command bar metadata

## Self-Check: PASSED