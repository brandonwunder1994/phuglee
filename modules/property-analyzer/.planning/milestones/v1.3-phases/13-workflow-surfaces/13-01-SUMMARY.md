---
phase: 13-workflow-surfaces
plan: 01
subsystem: ui
tags: [html, empty-state, scan-progress, summary-kpi]

requires:
  - phase: 12-shell-simplification
    provides: calm shell and progressive disclosure patterns
provides:
  - Calm empty workspace DOM (2 visible CTAs)
  - Slim scan progress structure with log toggle
  - Summary hero/breakdown DOM split with scanned hero card
affects: [13-02, 13-03]

tech-stack:
  added: []
  patterns: [progressive-disclosure-toggles, preserved-dom-ids]

key-files:
  created: []
  modified: [public/index.html]

key-decisions:
  - "Demoted 4 empty-state admin buttons via hidden attribute, not removal"
  - "failStats uses CSS display:none (not hidden attr) to preserve existing .visible toggle"

patterns-established:
  - "Workflow DOM: hero KPI row + collapsible breakdown container"

requirements-completed: [FLOW-01, FLOW-02, FLOW-03, FLOW-05, QA-04]

duration: 10min
completed: 2026-06-30
---

# Phase 13 Plan 01: Workflow DOM Restructure Summary

**Restructured index.html workflow surfaces — calm empty state, slim scan bar, 3 hero KPIs with collapsible breakdown.**

## Completed

- Empty workspace: 2 visible buttons (Upload spreadsheet, Restore my last scan), ⌘K hint
- Scan section: slim 3-row layout, hidden log panel, scan log toggle
- Summary: Distressed/Review/Scanned hero row, breakdown toggle wrapping pipeline + secondary KPIs

## Verification

- Grep: `emptyUploadBtn`, `scanLogToggle`, `summaryBreakdownToggle`, `sumScannedHeroCard` all present