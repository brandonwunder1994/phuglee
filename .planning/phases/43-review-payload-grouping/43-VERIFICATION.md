---
phase: 43-review-payload-grouping
verified: 2026-07-09T18:42:18Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
---

# Phase 43: Review payload + grouping Verification Report

**Phase Goal:** After process, admins (and the API) have a reviewable false-negative pool and stacked violation-type groups with signals — not only thin discard previews.

**Verified:** 2026-07-09T18:42:18Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Combined from plan `must_haves` (43-01 + 43-02) and ROADMAP success criteria.

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Process response includes full not-distressed row payloads (FN pool), not only discarded previews | ✓ VERIFIED | `processUpload` returns `notDistressedRows` from `filterDistressOnly.removed[].row`; engine test asserts fence permit has `streetAddress`, `violationIssueType`, description; API `sendJson(res, 200, payload)` passes through |
| 2 | Non-review discards (no address, dedupe, already_imported) stay thin in `discarded` only — not in `notDistressedRows` | ✓ VERIFIED | `nonReviewDiscarded` omits `mapDistressDiscards`; empty-address City Hall excluded from FN in tests |
| 3 | Review rows grouped by normalized Violation/Issue Type; empty type falls back to description | ✓ VERIFIED | `buildReviewGroups` stacks via `violationTypeKey`; empty type → `__unknown__` + exact description; unit matrix + process groups for fence |
| 4 | Each group exposes `matchedIndicators` + `descriptionSamples` (≤5) | ✓ VERIFIED | Group shape + unit tests for union and sample cap; engine asserts arrays on process groups |
| 5 | Every kept and FN row has unique stable `rowId`; groups reference those ids | ✓ VERIFIED | `assignRowIds` on kept + FN; uniqueness tests; smoke: `group.rowIds` ⊆ row ids |
| 6 | FN pool capped at 5000 with `notDistressedTruncated` + totals on `brainMeta` | ✓ VERIFIED | `MAX_FN_REVIEW_ROWS === 5000`; slice + `brainMeta.{notDistressedTruncated,Total,Returned}` wired |
| 7 | Zero kept + non-empty FN for `code_violation` returns ok with `rows:[]` + FN payload (not `NO_USABLE_ROWS`) | ✓ VERIFIED | Zero-kept policy in engine; `all-FN code_violation` test green |
| 8 | Water shut-off: `notDistressedRows` empty; kept rows still have `rowId` | ✓ VERIFIED | Water fixture test asserts empty FN + rowIds on kept |
| 9 | Identical types stack into one group with count N via shared `violationTypeKey` | ✓ VERIFIED | 20-row stack + case/spacing unit tests |
| 10 | Empty violation type groups by exact trimmed description (separate free-text groups) | ✓ VERIFIED | Empty-type dual-description → 2 singleton groups unit test |
| 11 | `groupId` deterministic for same section+typeKey[+descriptionKey] | ✓ VERIFIED | `groupIdFor` sha1 digest tests + groupId match helper |
| 12 | Stage order: applyBrain → filterDistressOnly → assignRowIds → groups | ✓ VERIFIED | Lines 138–157 in `lib/bridge-engine/index.js` preserve order |

**Score:** 12/12 truths verified

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
| --- | --------- | ------ | -------- |
| 1 | Process response includes full not-distressed row payloads (false-negative pool), not only discarded previews | ✓ | Truths 1–2 |
| 2 | Review rows grouped by normalized city Violation/Issue Type (identical types stack; empty type → description) | ✓ | Truths 3, 9–10 |
| 3 | Each review group exposes matched distress signals and description samples | ✓ | Truth 4 |
| 4 | Every process row carries a stable `rowId` for later decision targeting | ✓ | Truth 5 |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/bridge-review-groups.js` | assignRowIds, buildReviewGroups, groupIdFor, MAX_FN_REVIEW_ROWS | ✓ VERIFIED | 149 lines; exports all four; imports `violationTypeKey` from brain-store; uses crypto sha1; not a stub |
| `tests/bridge-review-groups.test.js` | Grouping matrix + rowId + samples coverage | ✓ VERIFIED | 234 lines; 18 tests all pass |
| `lib/bridge-engine/index.js` | processUpload FN extract, rowIds, reviewGroups, cap, zero-kept | ✓ VERIFIED | Requires review-groups; wires FN pool, groups, brainMeta, zero-kept policy |
| `tests/bridge-engine.test.js` | REV-01..04 process contract + water + all-FN | ✓ VERIFIED | Assertions for notDistressedRows, rowId, reviewGroups, zero-kept, water, NO_USABLE_ROWS |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `lib/bridge-review-groups.js` | `lib/bridge-brain-store.js` | `violationTypeKey` import only | ✓ WIRED | `require('./bridge-brain-store')` — no local reimplementation |
| `lib/bridge-review-groups.js` | `crypto` | sha1 digests for groupId/rowId | ✓ WIRED | `createHash('sha1')` in shortHash + groupIdFor |
| `lib/bridge-engine/index.js` | `lib/bridge-review-groups.js` | assignRowIds + buildReviewGroups + MAX_FN after filter | ✓ WIRED | Required and called after distress filter |
| `lib/bridge-engine/index.js` | `lib/bridge-distress-tagger.js` | `filterDistressOnly.removed[].row` → full FN | ✓ WIRED | tagger pushes `{ row, reason, rawPreview }`; engine maps `item.row` |
| `lib/bridge-engine/index.js` | brain apply (phase 42) | applyBrain before filterDistressOnly | ✓ WIRED | Order preserved; processingMeta still has brainVersion / appliedRuleIds |
| `lib/bridge-api.js` | `processUpload` | `sendJson(res, 200, payload)` | ✓ WIRED | Full payload (including new fields) returned to clients |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REV-01 | 43-02 | Full not-distressed row payloads after process (FN pool) | ✓ SATISFIED | `notDistressedRows` full fields; zero-kept success; API passthrough; empty-address not in FN |
| REV-02 | 43-01, 43-02 | Group by normalized type; empty type uses description | ✓ SATISFIED | Pure module stacking + process `reviewGroups.{distressed,notDistressed}` |
| REV-03 | 43-01, 43-02 | matchedIndicators + description samples per group | ✓ SATISFIED | Union + ≤5 samples unit tests; process asserts arrays present |
| REV-04 | 43-01, 43-02 | Stable rowId on every process row | ✓ SATISFIED | assignRowIds on kept+FN; unique ids; group.rowIds reference them |

**Orphaned requirements:** None. REQUIREMENTS.md maps only REV-01..04 → Phase 43; all appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/placeholder stubs in phase artifacts | — | — |
| `lib/bridge-engine/index.js` | 91–96 | `mapDistressDiscards` still exported | ℹ️ Info | Compat/export only; intentionally **not** fed into success `discarded` |

No blocker or warning anti-patterns. Implementations are substantive (not empty handlers / static returns).

### Human Verification Required

None required for phase goal. Phase 43 is server/API payload only (admin Train UI is Phase 44).

Optional smoke (non-blocking):

1. **Process a code-violation CSV via Filter**  
   **Test:** Upload `code-violations-varied.csv` (or similar) through Filter process.  
   **Expected:** Response JSON includes `notDistressedRows`, `reviewGroups`, `rowId` on rows, `brainMeta.notDistressedTotal`.  
   **Why human:** Confirms end-to-end HTTP path in a browser session; automated suite already covers engine contract.

### Test Results

```
node --test tests/bridge-review-groups.test.js tests/bridge-engine.test.js
→ 37/37 pass (0 fail)
```

### Gaps Summary

No gaps. Phase goal achieved:

- False-negative pool is reviewable as full rows (`notDistressedRows`), not thin `rawPreview` discards.
- Stacked violation-type groups with signals exist for both distressed and not-distressed sections.
- Stable `rowId`s enable Phase 45 decision targeting.
- Cap metadata and zero-kept code_violation policy are live.
- Admin Train UX intentionally deferred to Phase 44 (out of scope).

---

_Verified: 2026-07-09T18:42:18Z_  
_Verifier: Claude (gsd-verifier)_
