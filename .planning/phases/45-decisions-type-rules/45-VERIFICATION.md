---
phase: 45-decisions-type-rules
verified: 2026-07-09T19:08:53Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 45: Decisions + Type Rules + List Mutation — Verification Report

**Phase Goal:** Admin Approve/Deny mutates the current kept list immediately and writes live global type rules with audit trail; non-admin writes are rejected.

**Verified:** 2026-07-09T19:08:53Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Derived from ROADMAP success criteria + plan must_haves (01–03).

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Admin Deny on distressed removes matching rowIds from the current kept list (session/UI) | ✓ VERIFIED | `applyDecision` `removeByRowIds` (lib/bridge-brain-decisions.js:180–182); API returns mutated `rows`; client assigns `lastResult.rows` + `renderResults` (bridge.js:299–316). Test: DEC-01 unit + admin deny API. |
| 2 | Admin Approve on not-distressed promotes matching rows into kept as distressed (Strong tag) | ✓ VERIFIED | `promoteByRowIds` sets `STRONG_DISTRESSED_TAG` (decisions.js:72–93, 196–209); client patches rows/notDistressedRows. Tests: DEC-02 unit + admin promote API. |
| 3 | Deny writes active global `suppress_type`; Approve writes active `promote_type`; next process respects them | ✓ VERIFIED | upsert + disable opposite kind (decisions.js:180–209); `saveBrain(result.brain)` (bridge-api.js:541); process path `loadBrain` + `applyBrainToRows` (bridge-engine/index.js:138–139). Learning proof test demotes strong fence-permit after suppress. |
| 4 | Every decision appends an audit event (who, when, type, counts, samples) | ✓ VERIFIED | `buildDecisionEvent` always runs; pushed to `brain.events` (decisions.js:213–221). DEC-05 covers all four matrix cells including affirmations. |
| 5 | Non-admin brain write APIs return 403 `ADMIN_REQUIRED` | ✓ VERIFIED | `requireAdmin` strict `readPhugleeUser === admin` (bridge-api.js:431–439); no AUTH_DISABLED bypass. Tests: non-admin + missing header → 403. |
| 6 | Client Approve/Deny POSTs to `/api/bridge/brain/decisions` with rows + notDistressedRows + group rowIds | ✓ VERIFIED | `submitTrainDecision` body includes all fields (bridge.js:276–297); click handler wires approve/deny (1416–1424). |
| 7 | On success, lastResult rows/notDistressedRows/reviewGroups update and re-render | ✓ VERIFIED | bridge.js:299–316 assigns fields, updates stats.kept, calls `renderResults`, preserves train mode. |
| 8 | Request uses bridgeHeaders so X-Phuglee-User is sent | ✓ VERIFIED | `fetchJson` merges `bridgeHeaders` (bridge.js:395–397); session header from PhugleeSessionHeaders / fallback. |
| 9 | ADMIN_REQUIRED / decision errors surface via toast — no silent failure | ✓ VERIFIED | `onTrainDecision` catch → `setTrainStatus(msg, 'error')` + `showError(msg)` (bridge.js:342–347); fetchJson throws `data.error` on !ok. |
| 10 | Save-list remains a separate user action (decision does not auto-save list store) | ✓ VERIFIED | `submitTrainDecision` only POSTs brain/decisions; `/api/bridge/lists` only in save/load/delete helpers (bridge.js:750+). Comment at 257 documents intent. |
| 11 | Oversized / invalid / water decision bodies are rejected server-side | ✓ VERIFIED | 413 PAYLOAD_TOO_LARGE, 400 INVALID_JSON / INVALID_DECISION / WATER_TRAINING_UNSUPPORTED / ROW_IDS_NOT_FOUND in handleBrainDecision; covered by API tests (8/8 API pass). |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `lib/bridge-brain-decisions.js` | Pure applyDecision + upsert/disable type rules | ✓ VERIFIED | ~230 lines; exports `applyDecision`, `upsertTypeRule`, `disableTypeRules`; HTTP-free; locked four-way matrix |
| `tests/bridge-brain-decisions.test.js` | Four-way matrix + events + learning proof | ✓ VERIFIED | ~358 lines; 12 tests DEC-01–05, affirmations, metrics, learning proof |
| `lib/bridge-api.js` | requireAdmin + POST /brain/decisions | ✓ VERIFIED | `requireAdmin`, `handleBrainDecision`, route at pathname `/api/bridge/brain/decisions`, exports requireAdmin |
| `tests/bridge-brain-api.test.js` | 403/400/413 + admin happy paths | ✓ VERIFIED | ~272 lines; 8 API tests with temp BRIDGE_BRAIN_ROOT isolation |
| `public/js/bridge.js` | submitTrainDecision + wire Approve/Deny | ✓ VERIFIED | Live POST path; busy card; lastResult patch; no list auto-save |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | ---- | ------ | ------- |
| `bridge-brain-decisions.js` | `bridge-brain-store.js` | `violationTypeKey` | ✓ WIRED | require + normalize type keys |
| `bridge-brain-decisions.js` | `bridge-distress-tagger.js` | `STRONG_DISTRESSED_TAG` | ✓ WIRED | promote sets constant, not magic string |
| `bridge-brain-decisions.js` | `bridge-review-groups.js` | `buildReviewGroups` | ✓ WIRED | rebuilds distressed + notDistressed groups after mutation |
| `bridge-brain-decisions.test.js` | `bridge-brain-apply.js` | `applyBrainToRows` learning proof | ✓ WIRED | suppress → demote strong tag |
| `bridge-api.js` | `phuglee-user.js` | `readPhugleeUser` in requireAdmin | ✓ WIRED | strict admin gate |
| `bridge-api.js` | `bridge-brain-decisions.js` | `applyDecision` after loadBrain | ✓ WIRED | handleBrainDecision:523–529 |
| `bridge-api.js` | `bridge-brain-store.js` | loadBrain + saveBrain | ✓ WIRED | load before apply; save after |
| `bridge-brain-api.test.js` | `/api/bridge/brain/decisions` | callBridge POST + x-phuglee-user | ✓ WIRED | 8 tests hit route |
| `bridge.js` | `/api/bridge/brain/decisions` | fetchJson POST in submitTrainDecision | ✓ WIRED | bridge.js:293 |
| `bridge.js` | `lastResult` | assign rows/notDistressedRows/reviewGroups + renderResults | ✓ WIRED | bridge.js:299–316 |
| `bridge.js` | bridgeHeaders / fetchJson | session header attachment | ✓ WIRED | fetchJson always merges bridgeHeaders |
| process path | type rules | bridge-engine loadBrain + applyBrainToRows | ✓ WIRED | next process for any user applies active rules |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DEC-01 | 45-01, 45-02, 45-03 | Deny distressed removes from kept list | ✓ SATISFIED | Pure mutator + API + client re-render; unit+API tests |
| DEC-02 | 45-01, 45-02, 45-03 | Approve FN promotes into kept as distressed | ✓ SATISFIED | promoteByRowIds + STRONG tag; unit+API tests |
| DEC-03 | 45-01, 45-02, 45-03 | Deny writes active suppress_type | ✓ SATISFIED | upsertTypeRule suppress; saveBrain; DEC-03 test |
| DEC-04 | 45-01, 45-02, 45-03 | Approve FN writes active promote_type | ✓ SATISFIED | upsert promote; disable suppress; DEC-04 test |
| DEC-05 | 45-01, 45-02, 45-03 | Every decision appends audit event | ✓ SATISFIED | buildDecisionEvent on all paths including affirmations |
| DEC-06 | 45-02, 45-03 | Non-admin brain writes → 403 ADMIN_REQUIRED | ✓ SATISFIED | requireAdmin; API tests for bob + missing header |

**Orphaned requirements:** None. REQUIREMENTS.md maps DEC-01–DEC-06 exclusively to Phase 45; all appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/HACK/PLACEHOLDER in phase decision code | — | — |
| — | — | No “not implemented” stub toasts on Approve/Deny | — | — |
| — | — | No auto-save lists from decision path | — | — |
| public/js/bridge.js | 1124+ | `data.stub` / stubNote | ℹ️ Info | Pre-existing process empty-result UI; unrelated to train decisions |

No blocker or warning anti-patterns.

### Test Results

```
node --test tests/bridge-brain-decisions.test.js tests/bridge-brain-api.test.js
→ 20/20 pass (12 unit + 8 API), exit 0
```

### Human Verification Required

Automated coverage is complete for matrix, persistence, admin gate, and client wiring. Optional live QA (not blocking status):

### 1. Live admin Train click

**Test:** As admin, process a code-violation file, open Train brain, Deny one distressed group and Approve one not-distressed group.  
**Expected:** Kept table/KPI counts update immediately; group cards refresh; hard-refresh + re-process respects new type rules.  
**Why human:** End-to-end session UX and visual feedback not fully covered by node:test.

### 2. Non-admin chrome still blocked

**Test:** As non-admin, confirm Train chrome hidden (phase 44) and direct POST without admin header still 403.  
**Expected:** No write UI; API returns ADMIN_REQUIRED.  
**Why human:** UI chrome is phase-44; server 403 already unit-tested.

### Gaps Summary

None. Phase goal achieved end-to-end:

1. Pure decision matrix (DEC-01–05) with type rules + audit events  
2. Server route with requireAdmin, validation, durable saveBrain  
3. Client wire: Approve/Deny → API → lastResult mutation + re-render  
4. Next process applies brain via existing phase-42 path  

Deferred by design (not gaps): phrase mining (46), undo/metrics panel (47), processToken cache, auto-save list.

---

_Verified: 2026-07-09T19:08:53Z_  
_Verifier: Claude (gsd-verifier)_
