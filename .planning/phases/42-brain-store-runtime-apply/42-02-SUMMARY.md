---
phase: 42-brain-store-runtime-apply
plan: 02
subsystem: api
tags: [bridge-brain, apply-rules, processUpload, promote-suppress, tdd, node-test]

# Dependency graph
requires:
  - phase: 42-brain-store-runtime-apply
    provides: lib/bridge-brain-store.js (loadBrain, emptyBrain, violationTypeKey, saveBrain)
provides:
  - lib/bridge-brain-apply.js pure applyBrainToRow / applyBrainToRows
  - processUpload runtime brain apply (after import-filter, before filterDistressOnly)
  - processingMeta.brainVersion + brainAppliedRuleIds
  - Unit + engine integration coverage for BRAIN-02/03
affects: [43-review-groups, 45-brain-decisions, 46-phrase-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Locked apply order: promote_type → promote_phrase → suppress_phrase → suppress_type"
    - "water_shut_off early-return skips ALL brain apply (type and phrase)"
    - "Only status===active rules; pure apply (no fs inside apply module)"

key-files:
  created:
    - lib/bridge-brain-apply.js
    - tests/bridge-brain-apply.test.js
  modified:
    - lib/bridge-engine/index.js
    - tests/bridge-engine.test.js

key-decisions:
  - "Suppress always applied last so conflicts demote to Standard"
  - "Apply module is pure; engine owns loadBrain once per processUpload"
  - "Engine suite isolates BRIDGE_BRAIN_ROOT so existing tests stay empty-brain no-ops"

patterns-established:
  - "Pattern: brainAppliedRuleIds on each row + unique aggregate in applyBrainToRows"
  - "Pattern: seed brain via saveBrain in engine tests with temp BRIDGE_BRAIN_ROOT"

requirements-completed: [BRAIN-02, BRAIN-03]

# Metrics
duration: 15min
completed: 2026-07-10
---

# Phase 42 Plan 02: Brain Runtime Apply Summary

**Pure promote/suppress type+phrase apply wired into every processUpload after import-filter, with water shut-off safety and suppress-wins conflict resolution (BRAIN-02, BRAIN-03)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-10T01:30:19Z
- **Completed:** 2026-07-10T01:45:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Implemented pure `applyBrainToRow` / `applyBrainToRows` with locked rule order
- Active promote/suppress type and phrase rules change tags; disabled/proposed ignored
- Suppress wins when promote and suppress match the same type key
- `water_shut_off` skips all brain apply (BRAIN-03)
- `processUpload` loads brain once and applies before `filterDistressOnly`
- `processingMeta` exposes `brainVersion` and `brainAppliedRuleIds`
- Full suite green: 241 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing apply unit tests (RED)** - `aeead1e` (test)
2. **Task 2: Implement pure bridge-brain-apply (GREEN)** - `9b070ba` (feat)
3. **Task 3: Wire processUpload + engine integration test** - `b29836c` (feat)

**Plan metadata:** (pending final docs commit)

_Note: TDD tasks used RED → GREEN (no refactor commit needed)._

## Files Created/Modified

- `lib/bridge-brain-apply.js` - Pure apply for active type/phrase rules
- `tests/bridge-brain-apply.test.js` - 12 unit tests (promote/suppress/conflict/water/empty/phrase)
- `lib/bridge-engine/index.js` - loadBrain + applyBrainToRows in processUpload pipeline
- `tests/bridge-engine.test.js` - Temp brain root + suppress/promote/water integration tests

## Decisions Made

- Suppress last so admin suppress always demotes conflicting promotes
- Pure apply (no disk) so unit tests need no isolation; engine tests isolate root
- Engine suite-level temp `BRIDGE_BRAIN_ROOT` keeps baseline processUpload tests as empty-brain no-ops

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runtime apply complete for BRAIN-02/03
- Ready for phase 43 review groups (consumes brain rules + process outcomes)
- Decisions API (phase 45) can seed type/phrase rules that this apply layer already honors

## Self-Check: PASSED

- `lib/bridge-brain-apply.js` exports applyBrainToRow / applyBrainToRows
- `tests/bridge-brain-apply.test.js` present (12 tests)
- Engine wires loadBrain + applyBrainToRows before filterDistressOnly
- Commits aeead1e, 9b070ba, b29836c on main
- `npm test` 241/241 pass

---
*Phase: 42-brain-store-runtime-apply*
*Completed: 2026-07-10*
