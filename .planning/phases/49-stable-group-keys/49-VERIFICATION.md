---
phase: 49-stable-group-keys
verified: 2026-07-09T12:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
gaps: []
---

# Phase 49: Stable Group Keys Verification Report

**Phase Goal:** Same real-world category stacks into one group; incidental timestamps no longer flood Train with false singletons  
**Verified:** 2026-07-09T12:00:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Empty type + same free-text phrase differing only by incidental timestamps stacks into one group with count N | ✓ VERIFIED | GROUP-01 test green; live run → 1 group, count 3, `descriptionKey: "high grass and weeds"`, `isSingleton: false` |
| 2 | Typed values with embedded per-row timestamps/dates still stack on the shared category phrase | ✓ VERIFIED | GROUP-02 test green; live run → 1 group, count 2, `violationTypeKey: "high grass and weeds"`, label cleaned to `High Grass and Weeds` |
| 3 | Clean typed High Grass continues to stack on normalized type key (no regression) | ✓ VERIFIED | Existing tests: `20 rows same type → 1 group`, `case/spacing stacks via violationTypeKey` both green; live G03 → 1 group count 3 |
| 4 | Different free-text categories (fence vs pool) still produce separate groups | ✓ VERIFIED | Safety test `empty type + two different descriptions → 2 singleton groups` green; keys remain distinct |
| 5 | `isSingleton` is true only when stabilized group count === 1 (formula unchanged) | ✓ VERIFIED | Source: `g.isSingleton = g.count === 1` only; GROUP-04 + `isSingleton true iff count === 1` green |
| 6 | `descriptionSamples` still store raw (timestamped) description strings; keys are stripped | ✓ VERIFIED | Code stores `descTrimmed` raw; live samples retain `01/15/2024 10:30` etc.; label uses cleaned phrase |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/bridge-stable-text.js` | Pure strip + stableTypeKey + stableDescriptionKey | ✓ VERIFIED | 60 lines; exports all three; uses `violationTypeKey` after strip; empty desc → `''` not `__unknown__` |
| `lib/bridge-review-groups.js` | buildReviewGroups uses stable keys | ✓ VERIFIED | Requires stable helpers; `typeKey = stableTypeKey(...)`; empty-type `descriptionKey = stableDescriptionKey(...)`; cleaned labels; raw samples |
| `tests/bridge-review-groups.test.js` | GROUP-01..04 unit matrix + fence/pool safety | ✓ VERIFIED | GROUP-01/02/04 explicit; GROUP-03 via retained clean-type tests; fence/pool retained |
| `tests/bridge-stable-text.test.js` | Strip unit matrix | ✓ VERIFIED | US/ISO/12h, ordinance-safe, cleanup, stableTypeKey equality, stableDescriptionKey empty |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `bridge-review-groups.js` buildReviewGroups | `stableTypeKey` | type key derivation | ✓ WIRED | Line 50: `const typeKey = stableTypeKey(typeLabelRaw)` |
| `bridge-review-groups.js` buildReviewGroups | `stableDescriptionKey` | empty-type description key | ✓ WIRED | Line 53: `descriptionKey = isUnknown ? stableDescriptionKey(descTrimmed) : null` |
| `stableTypeKey` | `violationTypeKey` (brain-store) | strip then normalize | ✓ WIRED | `return violationTypeKey(stripIncidentalTimestamps(text))`; brain-store `violationTypeKey` body unchanged |
| `bridge-review-groups.js` | `isSingleton` | pure count formula | ✓ WIRED | Line 141: `g.isSingleton = g.count === 1` only — no extra heuristics |
| Engine / decisions | `buildReviewGroups` | production consumers | ✓ WIRED | `lib/bridge-engine/index.js` + `lib/bridge-brain-decisions.js` require and call it |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| GROUP-01 | 49-01 | Empty type free-text keyed after stripping timestamps → same phrase stacks | ✓ SATISFIED | Test + live: 3 timestamp variants → 1 group count 3 |
| GROUP-02 | 49-01 | Type values with embedded timestamps stack on category phrase | ✓ SATISFIED | Test + live: 2 typed timestamp variants → 1 group |
| GROUP-03 | 49-01 | Clean shared type still stacks on normalized type key | ✓ SATISFIED | 20-row + case/spacing tests green; no regression |
| GROUP-04 | 49-01 | Singleton only when stabilized count === 1 | ✓ SATISFIED | Formula unchanged; stacked → false; true singleton → true |

No orphaned requirements: REQUIREMENTS.md maps GROUP-01..04 exclusively to Phase 49; all claimed by 49-01 plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | None | — | No TODO/FIXME/placeholder stubs in phase files |

**Known non-blocking gap (documented in SUMMARY, out of phase scope):** brain-apply type matching still uses raw `violationTypeKey` without timestamp strip — timestamped type cells may miss type rules until a later polish. Does not block GROUP-01..04 grouping goal.

### Human Verification Required

None required for goal achievement. Grouping is pure server-side logic fully covered by unit tests.

Optional UX smoke (not blocking):

1. **Train card stacking**  
   **Test:** Process a sheet with empty-type High Grass free-text that includes per-row dates/times.  
   **Expected:** One stacked card with count N, not N singleton badges.  
   **Why human:** Visual Train chrome / badge rendering.

### Gaps Summary

No gaps. Phase goal achieved: stable keys strip incidental timestamps before map-key formation; same category stacks; fence vs pool stay split; `isSingleton` remains pure `count === 1`; samples keep raw text; production engine/decisions path is wired.

### Test Evidence

```
node --test tests/bridge-stable-text.test.js tests/bridge-review-groups.test.js
→ 33 pass, 0 fail
```

Commits present:
- `320624e` test(49-01): add failing tests for stable group keys
- `d5092d1` feat(49-01): stable group keys via timestamp strip

---

_Verified: 2026-07-09T12:00:00Z_  
_Verifier: Claude (gsd-verifier)_
