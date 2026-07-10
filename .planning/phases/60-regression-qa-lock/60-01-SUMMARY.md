---
phase: 60-regression-qa-lock
plan: 01
subsystem: testing
tags: [regression, independence, gold, TEST-01, TEST-02, TEST-03, v2.0]

# Dependency graph
requires:
  - phase: 55-independence-lock
    provides: IND-01/02/03 no-push static + process/save negatives
  - phase: 57-accuracy-structure
    provides: ACC gold fixtures + processUpload e2e
provides:
  - TEST-01 (v2.0) permanent bar titles in independence suite (no-push + already_imported default-off)
  - TEST-02 (v2.0) gold packaging dual-tags + fixture existence lock
  - docs/bridge/TEST-PLAN.md section N mapping TEST-01/02/03 (v2.0) → files/commands
affects: [60-02 full suite + verify-live, CI greppability of permanent bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permanent bar titles use TEST-0N (v2.0) dual-tags; leave v1.7 bare and v1.8 titles untouched"
    - "Option A: already_imported default-off locked inside independence suite (mirrors engine IND-04)"

key-files:
  created: []
  modified:
    - tests/bridge-independence.test.js
    - tests/bridge-accuracy-gold.test.js
    - docs/bridge/TEST-PLAN.md

key-decisions:
  - "Dual-tag IND titles with TEST-01 (v2.0) rather than header-only packaging for greppable CI"
  - "Independence suite owns both TEST-01 halves (no-push + already_imported); engine IND-04 left untouched"
  - "TEST-03 documented in TEST-PLAN only; execution deferred to Plan 02"

patterns-established:
  - "v2.0 permanent bar IDs always written as TEST-0N (v2.0) to avoid collision with v1.7/v1.8 engine titles"
  - "Gold packaging: dual-tag ACC + thin fixture existence meta-test"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 60 Plan 01: Permanent Regression Bar Packaging Summary

**Named and grepped the v2.0 permanent bar: independence TEST-01 (v2.0) no-push + already_imported default-off, gold TEST-02 (v2.0) ACC packaging, TEST-PLAN section N mapping TEST-01..03 — zero product reimplementation.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T17:00:28Z
- **Completed:** 2026-07-10T17:12:00Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Independence suite dual-tagged IND-01/02/03 with `TEST-01 (v2.0)` and added processUpload locks for `already_imported` hard-drop off by default + opt-in gate proof (12/12 green)
- Gold suite dual-tagged ACC keep + silent-drop with `TEST-02 (v2.0)` and fixture-existence meta-test (9/9 green; combined bar 21/21)
- `docs/bridge/TEST-PLAN.md` section **N. v2.0 permanent regression bar** maps TEST-01/02/03 to independence, gold, engine Type/format/water, and verify-live

## Task Commits

Each task was committed atomically:

1. **Task 1: TEST-01 (v2.0) independence permanent bar** - `c89dba3` (test)
2. **Task 2: TEST-02 (v2.0) gold packaging + TEST-PLAN map** - `3f0375f` (test)

**Plan metadata:** (docs commit after SUMMARY/STATE/ROADMAP)

_Note: TDD RED/GREEN combined into packaging commits — product already green; no RED product implementation needed._

## Files Created/Modified

- `tests/bridge-independence.test.js` — TEST-01 (v2.0) dual-tags + already_imported default-off/opt-in processUpload locks
- `tests/bridge-accuracy-gold.test.js` — TEST-02 (v2.0) dual-tags + gold fixture existence lock
- `docs/bridge/TEST-PLAN.md` — section N permanent bar table + command block

## Decisions Made

- Prefer dual-tag over header-only for greppable CI (`TEST-01 (v2.0)`, `TEST-02 (v2.0)`)
- Option A: already_imported default-off lives in independence suite (mirrors engine IND-04; does not touch engine titles)
- TEST-03 is documentation-only in Plan 01; full suite + verify-live run in Plan 02
- Leave all v1.7 bare TEST-0N and TEST-0N (v1.8) engine titles untouched

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

| Suite | Result |
|-------|--------|
| `node --test tests/bridge-independence.test.js` | 12 pass / 0 fail |
| `node --test tests/bridge-accuracy-gold.test.js` (+ independence combined) | 21 pass / 0 fail |
| Full `npm test` + verify-live | Deferred to 60-02 |

## Self-Check: PASSED

- FOUND: `tests/bridge-independence.test.js` with `TEST-01 (v2.0)`
- FOUND: `tests/bridge-accuracy-gold.test.js` with `TEST-02 (v2.0)`
- FOUND: `docs/bridge/TEST-PLAN.md` with TEST-01/02/03 (v2.0)
- FOUND: commits `c89dba3`, `3f0375f`
- FOUND: gold fixtures under `tests/fixtures/bridge/gold/`
