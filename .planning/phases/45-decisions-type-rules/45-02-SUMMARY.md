---
phase: 45-decisions-type-rules
plan: 02
subsystem: api
tags: [bridge-brain, decisions, requireAdmin, DEC-06, tdd, node-test]

# Dependency graph
requires:
  - phase: 45-decisions-type-rules
    provides: pure applyDecision four-way matrix (45-01)
  - phase: 42-brain-store-apply
    provides: loadBrain, saveBrain
provides:
  - POST /api/bridge/brain/decisions with requireAdmin (DEC-06)
  - Body size cap, water reject, ROW_IDS_NOT_FOUND pre-check
  - Durable brain type-rule writes + mutated list response envelope
affects: [45-03 client wire, 46 phrase rules]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Strict requireAdmin via readPhugleeUser === admin even if AUTH_DISABLED
    - Stateless decision body carries rows + notDistressedRows; server owns brain only

key-files:
  created:
    - tests/bridge-brain-api.test.js
  modified:
    - lib/bridge-api.js

key-decisions:
  - "requireAdmin always strict — AUTH_DISABLED must not open brain writes"
  - "Pre-check ROW_IDS_NOT_FOUND for mutating paths before applyDecision"
  - "MAX_BRAIN_DECISION_BYTES = 15_000_000 → 413 PAYLOAD_TOO_LARGE"

patterns-established:
  - "Pattern: Brain write routes gate with requireAdmin before readBody parse"
  - "Pattern: API tests isolate BRIDGE_BRAIN_ROOT via config mutation + mkdtemp"
  - "Pattern: Success envelope includes statsPatch { kept, notDistressed }"

requirements-completed: [DEC-06, DEC-01, DEC-02, DEC-03, DEC-04, DEC-05]

# Metrics
duration: 5min
completed: 2026-07-10
---

# Phase 45 Plan 02: Decisions API Summary

**Admin-gated POST /api/bridge/brain/decisions with requireAdmin, body cap, water reject, and durable suppress/promote type-rule persistence**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-10T02:01:53Z
- **Completed:** 2026-07-10T02:06:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- RED suite for DEC-06 403, admin deny/approve happy paths, INVALID_JSON, 413, water reject
- GREEN `requireAdmin` + `handleBrainDecision` wired in `lib/bridge-api.js`
- 20/20 green: 8 API + 12 pure decision unit tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing brain API tests (RED)** - `0e8f45f` (test)
2. **Task 2: Implement requireAdmin + POST /brain/decisions (GREEN)** - `ee67ac4` (feat)

**Plan metadata:** `da638f5` (docs: complete plan)

_Note: TDD tasks use separate test → feat commits_

## Files Created/Modified

- `tests/bridge-brain-api.test.js` — mock req/res API coverage with temp BRIDGE_BRAIN_ROOT
- `lib/bridge-api.js` — `requireAdmin`, `handleBrainDecision`, route registration, exports

## Decisions Made

- `requireAdmin` always throws 403 when `readPhugleeUser(req) !== 'admin'` — no AUTH_DISABLED bypass
- Mutating paths (distressed+deny, not_distressed+approve) pre-check rowId presence → 400 `ROW_IDS_NOT_FOUND`
- Water shut-off rejected before loadBrain so no accidental write
- Exported `requireAdmin` for optional unit reuse (API tests cover via HTTP)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server decision write path complete; plan 45-03 wires client Approve/Deny stubs to this endpoint
- Phrase mining still deferred to phase 46
- Client remains unwired by design

## Self-Check: PASSED

- FOUND: tests/bridge-brain-api.test.js
- FOUND: lib/bridge-api.js (brain/decisions + ADMIN_REQUIRED + MAX_BRAIN_DECISION_BYTES)
- FOUND commits: 0e8f45f, ee67ac4
- node --test: 20/20 pass

---
*Phase: 45-decisions-type-rules*
*Completed: 2026-07-10*
