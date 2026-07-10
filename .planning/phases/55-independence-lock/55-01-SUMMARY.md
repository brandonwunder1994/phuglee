---
phase: 55-independence-lock
plan: 01
subsystem: filter-engine
tags: [already_imported, processUpload, IND-04, independence]

requires:
  - phase: 54
    provides: processUpload e2e baseline
provides:
  - applyAlreadyImportedFilter strict opt-in gate (default off)
  - IND-04 engine + edge + stress test locks
affects: [55-03, 56-list-factory, filter-process]

tech-stack:
  added: []
  patterns: [strict === true opt-in for Analyze hard-drop]

key-files:
  created: []
  modified:
    - lib/bridge-engine/index.js
    - tests/bridge-engine.test.js
    - tests/bridge-edge-cases.test.js
    - tests/bridge-stress.test.js

key-decisions:
  - "already_imported hard-drop only when applyAlreadyImportedFilter === true"
  - "When off, skip loadImportAddressIndex; importIndexCount stays 0"

patterns-established:
  - "Engine-only flag; no UI toggle in phase 55"

requirements-completed: [IND-04]

duration: 15min
completed: 2026-07-10
---

# Phase 55 Plan 01: IND-04 Default-Off Summary

**processUpload no longer hard-drops Analyze matches by default; strict opt-in restores the old behavior.**

## Performance

- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Gated `loadImportAddressIndex` + `filterAlreadyImported` behind `opts.applyAlreadyImportedFilter === true`
- Inverted engine, edge, and stress processUpload tests for default-keep vs opt-in hard-drop
- Pure `filterAlreadyImported` / `noUsableRowsMessage` units still green

## Task Commits

1. **Task 1: Flip engine default-off** - `5064238`
2. **Task 2: Invert IND-04 test suites** - `419e5f5`

## Files Created/Modified

- `lib/bridge-engine/index.js` — opt-in gate
- `tests/bridge-engine.test.js` — IND-04 default + opt-in
- `tests/bridge-edge-cases.test.js` — IND-04 all-imported paths
- `tests/bridge-stress.test.js` — IND-04 stress paths

## Self-Check: PASSED
