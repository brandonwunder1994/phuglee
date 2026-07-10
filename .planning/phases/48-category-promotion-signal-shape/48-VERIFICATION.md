---
phase: 48-category-promotion-signal-shape
verified: 2026-07-09T12:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 48: Category Promotion & Signal Shape Verification Report

**Phase Goal:** Process path yields real city categories on rows and array-shaped signals so Train can label FN/distressed groups and render chips
**Verified:** 2026-07-09T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | When a source category/issue-type column is present but unmapped (or only in raw cells), process promotes a real category into `violationIssueType` for Train labels (MAP-01) | ✓ VERIFIED | `promoteCategoryFromRaw` + normalizer wire; processUpload Vio Cat → `High Grass` / `Fence Permit`; unit matrix |
| 2 | Not-distressed (FN) groups show the real city category when the spreadsheet had one — not only notes or `(no type)` (MAP-02) | ✓ VERIFIED | FN Fence Permit row + `reviewGroups.notDistressed` label `Fence Permit`; promotion not distress-gated |
| 3 | Promotion does not invent fake types from pure free-text noise; prefers category-like headers over timestamp-only notes (MAP-03) | ✓ VERIFIED | Narrative headers rejected; timestamp-only rejected; length>120 rejected; desc-only processUpload type stays `""` |
| 4 | Process/review rows keep `matchedIndicators` as string arrays so Train chips can render matches (SHAPE-01) | ✓ VERIFIED | `buildNormalizedRow` slices arrays; processUpload tagged group/row non-empty arrays; review-groups `Array.isArray` union; Train render uses array chips |
| 5 | Spreadsheet/export path still joins indicators to a single cell string (SHAPE-02) | ✓ VERIFIED | `formatMatchedIndicatorsForExport` + `toExportRow` join `'; '`; client `rowsToCsv` same; `bridge-export` / list-store use `toExportRow` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/bridge-category-promote.js` | Pure `isCategoryLikeHeader` + `promoteCategoryFromRaw` | ✓ VERIFIED | ~57 lines; exports helpers + regexes; no fs/engine deps |
| `lib/bridge-engine/normalizer.js` | Calls promote when type empty after map/inject | ✓ VERIFIED | Lines 52–56: promote for all kept rows before tagRow |
| `lib/bridge-intake-schema.js` | Array-shaped indicators; join only in `toExportRow` | ✓ VERIFIED | slice/coerce to `[]`; `formatMatchedIndicatorsForExport` |
| `public/js/bridge.js` | `rowsToCsv` joins array indicators with `'; '` | ✓ VERIFIED | `cellValue` guard at lines 1478–1481 |
| `tests/bridge-category-promote.test.js` | MAP-01/03 unit matrix | ✓ VERIFIED | 9 tests covering accept/reject/first-wins/no-overwrite |
| `tests/bridge-intake-schema.test.js` | SHAPE unit coverage | ✓ VERIFIED | array keep, empty `[]`, legacy coerce, export join |
| `tests/bridge-export.test.js` | Export path array → joined cell | ✓ VERIFIED | `rowsToCsv joins array matchedIndicators…` |
| `tests/bridge-engine.test.js` | processUpload MAP + SHAPE contracts | ✓ VERIFIED | tagged non-empty arrays; Vio Cat MAP-01/02; desc-only MAP-03 |
| `lib/bridge-review-groups.js` | Array union only (no key changes) | ✓ VERIFIED | `Array.isArray(row.matchedIndicators)` union; label prefers type |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `normalizer.js` | `bridge-category-promote.js` | `promoteCategoryFromRaw` when type empty | ✓ WIRED | require + call after `injectCityState`, all kept rows |
| `promoteCategoryFromRaw` | `mapped.violationIssueType` | single category-like unmapped cell copy | ✓ WIRED | first non-empty wins; never concatenates |
| normalized rows | `buildReviewGroups` | populated type → `violationTypeLabel` | ✓ WIRED | FN group label from promoted type, not notes |
| `buildNormalizedRow` | `matchedIndicators` array | slice / coerce; no `.join` | ✓ WIRED | process path never stringifies |
| `toExportRow` | export cell string | `join('; ')` when array | ✓ WIRED | used by `bridge-export.js` + list-store |
| `normalizer` | `buildNormalizedRow` | `matchedIndicators: tags.matchedIndicators` | ✓ WIRED | tagger arrays pass through unchanged |
| `bridge-review-groups.js` | `row.matchedIndicators` | `Array.isArray` union only | ✓ WIRED | string form would yield `[]` chips — fixed upstream |
| `public/js/bridge.js` Train | group chips | `Array.isArray` → signal spans | ✓ WIRED | fallback card + train path |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MAP-01 | 48-02 | Unmapped category → `violationIssueType` | ✓ SATISFIED | `processUpload promotes unmapped Vio Cat…`; runtime smoke High Grass |
| MAP-02 | 48-02 | FN groups show real city category | ✓ SATISFIED | Fence Permit in `notDistressedRows` + group label |
| MAP-03 | 48-02 | No fake types from free-text / timestamps | ✓ SATISFIED | unit matrix + desc-only type `""` |
| SHAPE-01 | 48-01 | Process/review arrays for Train chips | ✓ SATISFIED | buildNormalizedRow + processUpload + review-groups |
| SHAPE-02 | 48-01 | Export joins to single cell | ✓ SATISFIED | toExportRow + rowsToCsv + export tests |

No orphaned Phase 48 requirements. GROUP-* and TEST-* correctly deferred to Phases 49–50.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None blocking | — | No TODO/FIXME/stub in phase artifacts; notes rawBits fallback still writes **descriptionNotes only** (not type) |

### Human Verification Required

Optional (not blocking — contracts locked by automated process path):

### 1. Train chips with real upload

**Test:** Upload a code-violation CSV with distress keywords + unmapped `Vio Cat` column; open Train as admin.
**Expected:** Distressed groups show non-empty matched-signal chips; FN group labeled with city category (e.g. Fence Permit), not `(no type)`.
**Why human:** Visual chip layout / live Train UX not fully asserted in browser.

### Gaps Summary

None. Phase goal achieved:

- **MAP:** Unmapped category-like columns promote into `violationIssueType` for all kept rows (FN + distressed) without inventing types from narrative/timestamp noise.
- **SHAPE:** Process/review path keeps `matchedIndicators` as arrays; export joins with `'; '` for Analyzer compatibility.
- **Regression:** Full suite 363 pass / 0 fail; `bridge-review-groups.js` group-key logic unchanged (Phase 49 scope).

### Automated Verification Commands

```text
node --test tests/bridge-category-promote.test.js tests/bridge-intake-schema.test.js tests/bridge-export.test.js tests/bridge-engine.test.js
→ 50 pass / 0 fail

npm test
→ 363 pass / 0 fail
```

Runtime smoke (processUpload):

```text
SHAPE array: true ["a","b"]
SHAPE export: "a; b"
MAP grass type: High Grass (+ array indicators)
MAP fence type: Fence Permit
MAP FN label: Fence Permit
MAP-03 type empty?: "" (description-only free text)
```

---

_Verified: 2026-07-09T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
