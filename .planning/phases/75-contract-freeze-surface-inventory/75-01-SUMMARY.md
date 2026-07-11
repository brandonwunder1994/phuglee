---
phase: 75-contract-freeze-surface-inventory
plan: 01
subsystem: testing
tags: [DESK-05, contract-freeze, bridge-dom, static-tests, v3.0]

requires:
  - phase: 73-war-room-victory
    provides: victory strip IDs + slogans already shipped
  - phase: 69-one-scrub-desk
    provides: scrub-stage / process / type-upload cinema spine
provides:
  - DESK-05 written freeze checklist (full ID inventory)
  - Greppable static freeze test locking DOM contracts for v3.0 restyles
  - TEST-PLAN pointer for contract freeze suite
affects:
  - 75-02 surface inventory
  - 76-tokens-layer-audit
  - 77–81 visual makeover phases

tech-stack:
  added: []
  patterns:
    - "Static fs.readFileSync + assert.match freeze tests (no browser)"
    - "Dual-class restyle rule: keep bridge-* IDs, add phuglee-* hooks"

key-files:
  created:
    - docs/bridge/CONTRACT-FREEZE.md
    - tests/bridge-contract-freeze.test.js
  modified:
    - docs/bridge/TEST-PLAN.md

key-decisions:
  - "Freeze test asserts shipped contracts only — no product HTML/JS/CSS edits"
  - "Full ID inventory in markdown; automated suite covers spine (~12 tests) not every presentational id"
  - "Complementary desk-cinema + train-theater suites remain the deep structure locks"

patterns-established:
  - "DESK-05 greppable test titles for requirement traceability"
  - "CONTRACT-FREEZE.md is the human bible; bridge-contract-freeze.test.js is the CI gate"

requirements-completed: [DESK-05]

duration: 12min
completed: 2026-07-11
---

# Phase 75 Plan 01: Contract Freeze Checklist + Greppable Suite Summary

**DESK-05 freeze bible + static HTML/JS suite locks Filter `bridge-*` IDs and data-action/mode/format/step so v3.0 restyles cannot rename contracts.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-11T19:57:32Z
- **Completed:** 2026-07-11
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Wrote `docs/bridge/CONTRACT-FREEZE.md` with complete `bridge-*` ID inventory (region + JS consumer), locked data-* values, structure-order rules, and restyle bans
- Added `tests/bridge-contract-freeze.test.js` — 12 greppable `DESK-05:` tests, all green against current tree
- Extended `docs/bridge/TEST-PLAN.md` section P mapping DESK-05 → freeze suite + complementary cinema/theater locks
- Zero product renames, zero CSS paint, zero JS behavior changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Write DESK-05 contract freeze checklist** - `c146431` (docs)
2. **Task 2: Greppable DESK-05 freeze test + TEST-PLAN pointer** - `d7759a5` (test)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `docs/bridge/CONTRACT-FREEZE.md` — human freeze bible (DESK-05)
- `tests/bridge-contract-freeze.test.js` — static contract freeze suite
- `docs/bridge/TEST-PLAN.md` — section P (v3.0 DESK-05)

## Decisions Made

- Inventory extracted from live `bridge.html` / `bridge.js` / `bridge-train.js` only — tests lock reality, not aspirational IDs
- Spine-only automated suite (~12 tests); full ID table lives in the freeze doc so later phases have a greppable checklist without re-implementing cinema/theater
- JS-only / dynamic IDs (`bridge-scanned-toast`, etc.) documented as freeze string contracts even when not static in HTML

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - pure docs + tests.

## Next Phase Readiness

- DESK-05 spine is locked for Plan 75-02 (surface inventory → design-system layers) and visual phases 76–81
- Later restyles must dual-class / wrap; never rename locked IDs or data-* values
- Run `node --test tests/bridge-contract-freeze.test.js` after any Filter markup change

## Verification

```text
CONTRACT-FREEZE ok 14477
node --test tests/bridge-contract-freeze.test.js → 12 pass, 0 fail
```

## Self-Check: PASSED

- FOUND: docs/bridge/CONTRACT-FREEZE.md
- FOUND: tests/bridge-contract-freeze.test.js
- FOUND: docs/bridge/TEST-PLAN.md
- FOUND: 75-01-SUMMARY.md
- FOUND: c146431
- FOUND: d7759a5
