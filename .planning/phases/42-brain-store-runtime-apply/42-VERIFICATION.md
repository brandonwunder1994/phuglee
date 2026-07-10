---
phase: 42-brain-store-runtime-apply
verified: 2026-07-09T18:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
gaps: []
---

# Phase 42: Brain store + runtime apply — Verification Report

**Phase Goal:** A durable global Filter brain exists and active type rules change tagging outcomes on every upload for all users — without suppressing water shut-off.

**Verified:** 2026-07-09T18:00:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Missing brain file loads as empty document without throwing | ✓ VERIFIED | `loadBrain()` soft-fallback in `lib/bridge-brain-store.js`; store test green |
| 2 | saveBrain + loadBrain round-trip preserves typeRules and phraseRules | ✓ VERIFIED | Atomic tmp+rename; store unit test round-trip passes |
| 3 | Brain path is volume-safe via BRIDGE_BRAIN_ROOT (env / PDA_DATA_ROOT / local) | ✓ VERIFIED | `lib/config.js` BRIDGE_BRAIN_ROOT; `brainPath()` joins root + `global-brain.json` |
| 4 | Atomic write uses tmp + rename (never in-place write of global-brain.json) | ✓ VERIFIED | `writeJsonAtomic` uses `.tmp` + `renameSync` |
| 5 | Active suppress_type demotes matching code-violation rows to Standard (drops at filterDistressOnly) | ✓ VERIFIED | Unit + engine Test A: kept count drops; weeds address removed |
| 6 | Active promote_type forces Strong Distressed Signal so matching rows can be kept | ✓ VERIFIED | Unit + engine Test B: fence permit kept as Strong after promote |
| 7 | When both promote_type and suppress_type match same key, suppress wins (applied last) | ✓ VERIFIED | Locked order in apply; conflict unit test ends Standard |
| 8 | Empty brain is a no-op — row tags unchanged | ✓ VERIFIED | Unit empty/null brain tests; engine empty-brain keeps baseline kept=2 |
| 9 | Only status === 'active' type and phrase rules apply; proposed phrases never affect process | ✓ VERIFIED | Filters `status === 'active'`; disabled/proposed unit tests no-op |
| 10 | water_shut_off rows are never type-suppressed (skip all brain apply) | ✓ VERIFIED | Early-return in apply; engine Test C: kept count + water tags preserved |
| 11 | processUpload loads brain and applies rules after import-filter and before filterDistressOnly | ✓ VERIFIED | Engine wiring: importFiltered → loadBrain → applyBrainToRows → filterDistressOnly |

**Score:** 11/11 truths verified

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | System persists a global Filter brain file on a volume-safe path | ✓ VERIFIED | BRIDGE_BRAIN_ROOT + atomic load/save + gitignore `data/bridge-brain/` |
| 2 | Active suppress_type changes process drop/keep for any user | ✓ VERIFIED | Engine integration seeds suppress; fewer kept rows |
| 3 | Active promote_type can keep matching not-strong rows as distressed | ✓ VERIFIED | Engine promote of Fence permit → kept Strong |
| 4 | Water shut-off never type-suppressed (pass-through preserved) | ✓ VERIFIED | Unit early-return + processUpload water fixture with seeded suppress |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/config.js` | BRIDGE_BRAIN_ROOT volume-safe path | ✓ VERIFIED | env → PDA_DATA_ROOT nest → `data/bridge-brain` |
| `lib/bridge-brain-store.js` | emptyBrain, loadBrain, saveBrain, brainPath, violationTypeKey | ✓ VERIFIED | 108 lines; all 5 exports; soft-read; atomic write |
| `tests/bridge-brain-store.test.js` | BRAIN-01 unit coverage with temp root | ✓ VERIFIED | 7 tests, temp BRIDGE_BRAIN_ROOT isolation |
| `.gitignore` | Ignore `data/bridge-brain/` | ✓ VERIFIED | Line present |
| `lib/bridge-brain-apply.js` | Pure applyBrainToRow / applyBrainToRows | ✓ VERIFIED | 124 lines; locked rule order; water early-return |
| `tests/bridge-brain-apply.test.js` | promote/suppress/conflict/water/empty/phrase | ✓ VERIFIED | 12 unit tests all green |
| `lib/bridge-engine/index.js` | processUpload wires loadBrain + applyBrainToRows | ✓ VERIFIED | Requires store+apply; pipeline order correct |
| `tests/bridge-engine.test.js` | Integration: seeded brain changes kept outcomes | ✓ VERIFIED | empty / suppress / promote / water tests |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `lib/bridge-brain-store.js` | `lib/config.js` | reads `config.BRIDGE_BRAIN_ROOT` at call time | ✓ WIRED | `brainPath()` uses config at call time (test-overridable) |
| `lib/bridge-brain-store.js` | `global-brain.json` | brainPath joins root + filename | ✓ WIRED | `path.join(config.BRIDGE_BRAIN_ROOT, 'global-brain.json')` |
| `tests/bridge-brain-store.test.js` | store | temp BRIDGE_BRAIN_ROOT before/after | ✓ WIRED | Isolation hooks present |
| `lib/bridge-engine/index.js` | `lib/bridge-brain-store.js` | `loadBrain()` once per processUpload | ✓ WIRED | Line 133 |
| `lib/bridge-engine/index.js` | `lib/bridge-brain-apply.js` | `applyBrainToRows` after import, before distress | ✓ WIRED | Lines 131–136 |
| `lib/bridge-brain-apply.js` | `lib/bridge-distress-tagger.js` | STRONG_DISTRESSED_TAG + buildSearchText | ✓ WIRED | Imports + promote uses STRONG |
| `lib/bridge-brain-apply.js` | `lib/bridge-brain-store.js` | violationTypeKey for type matching | ✓ WIRED | typeRuleMatches / ruleTypeKey |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| BRAIN-01 | 42-01 | Global durable brain file on volume-safe path | ✓ SATISFIED | store + config + gitignore + 7 store tests |
| BRAIN-02 | 42-02 | Apply active brain rules on every Filter process | ✓ SATISFIED | pure apply + processUpload wire + engine suppress/promote tests |
| BRAIN-03 | 42-02 | Water shut-off never type-suppressed by brain | ✓ SATISFIED | apply early-return + engine water+seeded suppress test |

No orphaned Phase 42 requirements — REQUIREMENTS.md maps only BRAIN-01/02/03 to this phase; all claimed in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found | — | No TODO/FIXME/placeholder stubs in brain store or apply |

### Human Verification Required

None blocking. Phase is backend-only (no admin UI/decisions API). Optional smoke:

1. **Live process empty-brain baseline**  
   **Test:** Upload a known code-violations file on `/bridge` with empty/missing brain.  
   **Expected:** Same keep/drop behavior as pre-phase 42.  
   **Why human:** End-to-end UI path; automated suite already covers processUpload empty brain.

2. **Seeded suppress (ops-only)**  
   **Test:** Manually write an active `suppress_type` into brain and re-process.  
   **Expected:** Matching types drop.  
   **Why human:** Production path; engine integration already proves this programmatically.

### Gaps Summary

No gaps. All must-haves, roadmap success criteria, and BRAIN-01/02/03 requirements are implemented, wired, and covered by automated tests (35/35 pass for store + apply + engine suites).

### Test Evidence

```
node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js tests/bridge-engine.test.js
→ 35 pass, 0 fail
```

Includes:
- 7 store tests (BRAIN-01)
- 12 apply tests (BRAIN-02/03 unit)
- Engine empty / suppress / promote / water integration tests

---

_Verified: 2026-07-09T18:00:00Z_  
_Verifier: Claude (gsd-verifier)_
