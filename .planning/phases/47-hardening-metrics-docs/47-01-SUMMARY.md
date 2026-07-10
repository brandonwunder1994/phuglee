---
phase: 47-hardening-metrics-docs
plan: 01
subsystem: bridge-brain
tags: [brain, undo, caps, version-conflict, metrics, tagging-rules, train-ux]

# Dependency graph
requires:
  - phase: 46-phrase-mining-brain-panel
    provides: brain GET/status API + Filter brain panel shell
  - phase: 45-train-decisions
    provides: applyDecision + POST /brain/decisions + requireAdmin
  - phase: 42-brain-store-apply
    provides: loadBrain/saveBrain + apply path
provides:
  - "Split undo: client trainUndoStack + server undoLastDecision"
  - "BRAIN_CAPS (events 2000, rules 500) + VERSION_CONFLICT 409 RMW"
  - "recomputeMetrics + GET /brain/metrics"
  - "TAGGING-RULES Superpower Brain layer docs"
  - "Train search/pagination/deny-confirm polish"
affects: [m7-close, filter-brain-ops, bridge-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "saveBrain owns version bump from disk + enforceBrainCaps + recomputeMetrics"
    - "Split undo: server reverts rules only; client restores list snapshot"
    - "Optimistic concurrency via optional brainVersion → 409 VERSION_CONFLICT"

key-files:
  created:
    - tests/bridge-brain-hardening.test.js
  modified:
    - lib/bridge-brain-store.js
    - lib/bridge-brain-decisions.js
    - lib/bridge-api.js
    - public/js/bridge.js
    - public/bridge.html
    - public/css/bridge.css
    - docs/bridge/TAGGING-RULES.md
    - tests/bridge-brain-api.test.js
    - tests/bridge-brain-store.test.js
    - tests/bridge-train-ux.test.js

key-decisions:
  - "saveBrain always bumps version from disk current; ignores in-memory version field"
  - "Rule caps prefer keeping active/proposed over disabled/rejected before slice"
  - "Simple events slice(-2000) keeps newest; documented in tests"
  - "Client undo depth 10; train page size 40; deny confirm at count ≥ 10"

patterns-established:
  - "Pattern: VERSION_CONFLICT errors carry statusCode 409 + currentVersion"
  - "Pattern: fetchJson attaches err.code/status/currentVersion for 409 UX"
  - "Pattern: metrics include suppressCount/promoteCount recomputed on every write"

requirements-completed: [HARD-01, HARD-02, HARD-03, HARD-04]

# Metrics
duration: 35min
completed: 2026-07-10
---

# Phase 47 Plan 01: Hardening + Metrics + Docs Summary

**Production-hardened Filter Superpower Brain: split undo, caps + 409 RMW, admin metrics, train polish, and TAGGING-RULES brain layers — npm test 345/345 + verify-live green**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-10T02:19:59Z
- **Completed:** 2026-07-10T02:55:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Server `undoLastDecision` disables rules from last event; `POST /api/bridge/brain/undo` admin-gated; client `trainUndoStack` restores list/review snapshot
- `saveBrain` enforces caps (events 2000, type/phrase 500), bumps version from disk, recomputes metrics; stale `brainVersion` → 409 `VERSION_CONFLICT`
- Admin metrics via `GET /brain/metrics` + panel display (totalDecisions, active/proposed, suppress/promote)
- Train UX: search by type, page size 40, deny confirm ≥10, Undo control
- `docs/bridge/TAGGING-RULES.md` documents base regex → promote type → phrase → suppress type order; water exempt

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Hardening tests** - `a162e10` (test)
2. **Task 1 (GREEN): Caps, version 409, metrics, server undo** - `5ee2b27` (feat)
3. **Task 2: Client trainUndoStack + polish + metrics display** - `3248b89` (feat)
4. **Task 3: TAGGING-RULES + phase gate** - `9276a9d` (docs)

**Plan metadata:** (docs commit after SUMMARY)

_Note: TDD Task 1 used RED → GREEN commits_

## Files Created/Modified

- `lib/bridge-brain-store.js` — BRAIN_CAPS, capArray, enforceBrainCaps, recomputeMetrics, version RMW saveBrain
- `lib/bridge-brain-decisions.js` — undoLastDecision
- `lib/bridge-api.js` — POST undo, GET metrics, 409 mapping on decisions/status/undo
- `public/js/bridge.js` — trainUndoStack, undo UI, search/pagination/confirm, brainVersion, metrics display
- `public/bridge.html` — train toolbar (search + Undo) + pagers
- `public/css/bridge.css` — train toolbar/pager styles
- `docs/bridge/TAGGING-RULES.md` — Filter Superpower Brain section
- `tests/bridge-brain-hardening.test.js` — caps, 409, metrics, undo, docs assert
- `tests/bridge-brain-api.test.js` — API undo/metrics/403/409
- `tests/bridge-brain-store.test.js` — empty metrics include suppress/promote
- `tests/bridge-train-ux.test.js` — source contract for real decisions + undo

## Decisions Made

- **saveBrain owns version:** Always `(current.version||0)+1` from disk so RMW is authoritative; applyDecision in-memory bump is superseded on write
- **Prefer active rules when capping:** Status-priority sort before `slice(-cap)` so disabled/rejected drop first
- **Split undo locked:** Server never restores client rows; only disables `resultingRuleIds` and appends undo audit event
- **Metrics fields extended:** `suppressCount` / `promoteCount` added to emptyBrain metrics schema

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] emptyBrain metrics schema broke store deep-equal test**
- **Found during:** Task 1 (GREEN)
- **Issue:** Added suppressCount/promoteCount; existing store test expected old 4-field metrics
- **Fix:** Updated store test expected object
- **Files modified:** tests/bridge-brain-store.test.js
- **Verification:** store tests green
- **Committed in:** `5ee2b27`

**2. [Rule 1 - Bug] API seed asserted fixed version 3 after saveBrain always bumps from disk**
- **Found during:** Task 1 (GREEN)
- **Issue:** seedBrainWithRules set version=3 but saveBrain derives version from current+1
- **Fix:** Assert GET version matches returned saveBrain version; loosened status activate version assert
- **Files modified:** tests/bridge-brain-api.test.js
- **Verification:** API tests green
- **Committed in:** `5ee2b27`

**3. [Rule 1 - Bug] train-ux source contract still required phase 45 stub string**
- **Found during:** Task 3 (npm test gate)
- **Issue:** Phase 45 test looked for `phase 45` / PHASE45 stub copy removed by real decisions + undo
- **Fix:** Updated contract to require `/brain/decisions`, `trainUndoStack`, `/brain/undo`
- **Files modified:** tests/bridge-train-ux.test.js
- **Verification:** npm test 345 pass
- **Committed in:** `9276a9d`

---

**Total deviations:** 3 auto-fixed (3 Rule 1 test/schema alignment)
**Impact on plan:** No scope creep; fixes required for correctness of version RMW and phase-gate green.

## Issues Encountered

None beyond test updates for intentional version/metrics schema changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HARD-01–04 implemented and gated
- M7 Filter Superpower Brain ready for user acceptance (do not auto-mark milestone implemented)
- Full suite green; live server verified at http://127.0.0.1:3000/

## Self-Check: PASSED

- All key files present (store, decisions, api, bridge.js/html, TAGGING-RULES, hardening tests, SUMMARY)
- Commits found: a162e10, 5ee2b27, 3248b89, 9276a9d
- Content checks: VERSION_CONFLICT, enforceBrainCaps, recomputeMetrics, trainUndoStack, brain/undo, Superpower Brain
- npm test 345/345 pass; verify-live exit 0

---
*Phase: 47-hardening-metrics-docs*
*Completed: 2026-07-10*
