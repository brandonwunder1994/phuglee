---
phase: 46-phrase-mining-brain-panel
plan: 01
subsystem: api
tags: [phrase-mining, filter-brain, proposed-rules, tdd, node-test]

# Dependency graph
requires:
  - phase: 42-filter-brain-store-apply
    provides: emptyBrain, phraseRules shape, applyBrainToRow active-only phrases
  - phase: 45-decisions-type-rules
    provides: applyDecision event append + type rule upsert write path
provides:
  - Pure lib/bridge-phrase-miner.js (extractCandidates, minePhrasesFromEvent, escapeRegExp)
  - Proposed-only phrase mining on decision path (never auto-active)
  - PHRASE-01/02 unit + apply integration coverage
affects:
  - 46-02 brain panel / rule status API (activate proposed phrases)
  - 47 metrics / hardening

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HITL phrase mining: ≥2 same-direction evidence → status proposed only"
    - "Literal patternType only from miner; escapeRegExp for safety"
    - "Direction map: distressed+deny suppress; not_distressed+approve promote; weak paths skip"

key-files:
  created:
    - lib/bridge-phrase-miner.js
    - tests/bridge-phrase-miner.test.js
  modified:
    - lib/bridge-brain-decisions.js

key-decisions:
  - "Evidence units are description samples only (violationTypeLabel used for candidate extraction, not evidence tally)"
  - "Conflict = any opposite-direction sample for same candidate → skip propose"
  - "Existing active/rejected/disabled phrase rules are not overwritten by miner"

patterns-established:
  - "Pattern: mine after event append inside applyDecision; caller still owns saveBrain"
  - "Pattern: shallow-clone brain on mine return; decisions assigns phraseRules back in place"

requirements-completed: [PHRASE-01, PHRASE-02]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 46 Plan 01: Phrase Mining Brain Panel Summary

**Pure phrase miner proposes literal suppress/promote rules from ≥2 same-direction free-text evidence; decisions hook never auto-activates; proposed rules no-op on apply**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T02:10:31Z
- **Completed:** 2026-07-10T02:22:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `extractCandidates` tokenizes free text (len≥4, stopwords, unigrams+bigrams, cap 20)
- `minePhrasesFromEvent` proposes only at ≥2 same-direction evidence with conflict skip and weak-path skip matrix
- `applyDecision` invokes miner after audit event append; water_shut_off uploadType skips mining
- 14 miner tests green including proposed no-op apply and active demote/promote paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing phrase-miner tests (RED)** - `0f27527` (test)
2. **Task 2: Implement miner + hook decisions (GREEN)** - `c8457a1` (feat)

**Plan metadata:** (pending docs commit)

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `lib/bridge-phrase-miner.js` - Pure mining: extractCandidates, minePhrasesFromEvent, escapeRegExp
- `tests/bridge-phrase-miner.test.js` - PHRASE-01/02 unit + apply integration
- `lib/bridge-brain-decisions.js` - Calls minePhrasesFromEvent after event append

## Decisions Made

- Evidence tally uses description samples only so a single-sample event with a short type label cannot cross the ≥2 threshold
- Opposite-direction evidence for the same normalized candidate blocks proposal entirely
- Miner never mutates reviewed statuses (active/rejected/disabled); only merges proposed evidence or creates new proposed rules
- Phase 42 apply already filters `status === 'active'` — no apply module changes required

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Miner + decisions hook ready for plan 46-02 (brain panel GET/status API + UI activate/reject/disable)
- Activating a proposed rule will immediately affect process via existing applyBrainToRow

## Self-Check: PASSED

- FOUND: lib/bridge-phrase-miner.js
- FOUND: tests/bridge-phrase-miner.test.js
- FOUND: lib/bridge-brain-decisions.js
- FOUND: 46-01-SUMMARY.md
- FOUND commits: 0f27527, c8457a1

---
*Phase: 46-phrase-mining-brain-panel*
*Completed: 2026-07-10*
