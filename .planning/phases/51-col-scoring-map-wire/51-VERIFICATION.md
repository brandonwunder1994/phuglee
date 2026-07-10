---
phase: 51-col-scoring-map-wire
verified: 2026-07-10T05:50:57Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
---

# Phase 51: COL Scoring + Map Wire Verification Report

**Phase Goal:** Process maps exactly one best Violation Type column using header aliases and value shapes — never alias-first first-match, never multi-column blend  
**Verified:** 2026-07-10T05:50:57Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | On process, a sheet whose narrative/date/status column would win under alias-first instead maps the true category-like Type column into `columnMap.violationIssueType` | ✓ VERIFIED | `forceTypeColumnFromScorer` overwrites Type after `enhanceColumnMap`; process tests assert Status Description trap → `Vio Cat`, Violation Description trap → `Issue Type`; pure trap matrix green for 6 winner fixtures |
| 2   | When no column meets Type candidacy, Type stays empty and distressed rows remain available for review (no silent drop solely for "no type column") | ✓ VERIFIED | Scorer null forces `columnMap.violationIssueType = null`; COL-02 process test keeps weeds row; no `no_type` / `no_type_column` in `DISCARD_REASONS` |
| 3   | v1.7 `promoteCategoryFromRaw` still fills empty Type cells only — it never overrides a scorer-chosen Type column | ✓ VERIFIED | Normalizer guards with `if (!String(mapped.violationIssueType \|\| '').trim())`; promote early-returns when cell non-empty; COL-03 process lock (Issue Type High Grass not replaced by Cat Junk Vehicle); MAP-01/02 promote-when-empty still green |
| 4   | Scorer choice is the forced map winner; alias table is a scoring feature only, not a parallel first-match path that can undercut the scorer | ✓ VERIFIED | Always `columnMap.violationIssueType = typeRes.header` including null — no alias fallback; toxic description aliases capped without categorical unlock; only assignment sites for Type map are scorer force + promote empty-cell |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/bridge-type-column-score.js` | Pure `scoreTypeColumns` + `pickTypeColumn` + `resolveTypeColumnHeader` | ✓ VERIFIED | 546 lines; exports all three + DEFAULTS; single-winner pick with minScore/minMargin; never blends headers |
| `lib/bridge-engine/normalizer.js` | Forced Type from scorer after enhanceColumnMap | ✓ VERIFIED | Requires scorer; `forceTypeColumnFromScorer` always overwrites Type; promote empty-only block intact |
| `tests/bridge-type-column-score.test.js` | Green pure trap matrix COL-01/02/04 | ✓ VERIFIED | 327 lines; 12 tests all pass (traps, classic Violation Type, no-candidacy, no-blend, minScore) |
| `tests/bridge-engine.test.js` | Green process wire COL-01/02/03/04 + MAP regression | ✓ VERIFIED | 4 COL process tests + MAP promote test all pass in suite |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `normalizer.js` `normalizeRawRows` | `bridge-type-column-score.js` `resolveTypeColumnHeader` | sample first 80 rows; force `columnMap.violationIssueType = typeRes.header` | ✓ WIRED | `forceTypeColumnFromScorer` lines 38–54; called unconditionally before row loop |
| `normalizeRawRows` | `promoteCategoryFromRaw` | only if mapped Type cell empty after `mapRawRow` | ✓ WIRED | lines 80–85; promote also self-guards non-empty |
| `processUpload` | `normalizeRawRows` | existing call; `columnMap` on `processingMeta` | ✓ WIRED | `index.js` line 126; `processingMeta.columnMap` from normalized result |
| scorer | `bridge-intake-schema` aliases | features only via `INTAKE_FIELD_ALIASES.violationIssueType` | ✓ WIRED | toxic exact aliases capped at +22 without categorical unlock |
| scorer | `bridge-category-promote` | `isCategoryLikeHeader` / narrative / timestamp helpers | ✓ WIRED | imports used in header + value scoring |
| pure unit tests | scorer module | require API | ✓ WIRED | `tests/bridge-type-column-score.test.js` |
| engine COL tests | `processUpload` columnMap | trap CSV fixtures | ✓ WIRED | asserts scorer winner headers on `processingMeta.columnMap.violationIssueType` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| **COL-01** | 51-01, 51-02, 51-03 | Score every column with header aliases + value shapes; map exactly one winner into `columnMap.violationIssueType` (never blend) | ✓ SATISFIED | Pure trap matrix + process traps Status→Vio Cat / Violation Desc→Issue Type; `pickTypeColumn` returns single object or null |
| **COL-02** | 51-01, 51-02, 51-03 | No Type candidacy → Type empty; keep distressed/FN rows; never silent-drop for "no type column" | ✓ SATISFIED | Pure null/unresolved + process Address+Notes+Open Date keeps weeds; discard reasons lack `no_type*` |
| **COL-03** | 51-03 | Promote runs only when mapped Type cell still empty; never overrides scorer-chosen Type | ✓ SATISFIED | Empty-cell guard in normalizer + promote; COL-03 process test; MAP promote-when-empty still green |
| **COL-04** | 51-01, 51-02, 51-03 | Scorer/confirm choice **forces** map; aliases are features only, not parallel first-match undercut | ✓ SATISFIED | Always overwrite including null; COL-04 asserts Status Description / Violation Description not left as Type |

**Orphaned requirements:** None. REQUIREMENTS.md maps COL-01–04 exclusively to Phase 51; all four appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found | — | No TODO/FIXME/placeholder stubs in scorer or normalizer; no empty handlers; no alias-first Type re-apply after force |

### Human Verification Required

None required for goal achievement. Contracts are fully covered by automated process + pure unit tests.

Optional smoke (non-blocking): upload a real multi-column city CSV with Status Description + Vio Cat on Filter process and confirm Train groups show category labels (e.g. High Grass) rather than Open/Closed.

### Gaps Summary

No gaps. Phase goal achieved:

1. **Single-winner Type map** — pure scorer ranks headers; process forces that pick (or null).
2. **Alias-first poison fixed** — toxic description aliases cannot remain as process Type.
3. **No silent drop** for missing Type column.
4. **Promote coexistence** preserved for empty cells only (MAP still green).

---

### Test Evidence

```
node --test tests/bridge-type-column-score.test.js tests/bridge-engine.test.js
ℹ tests 44
ℹ pass 44
ℹ fail 0
```

Includes: COL-01/02/03/04 process wires, MAP-01/02 promote, pure trap matrix, classic Violation Type, no-blend, minScore.

### Code Anchors

```38:60:lib/bridge-engine/normalizer.js
function forceTypeColumnFromScorer(columnMap, headers, rawRows) {
  // ...
  // COL-04: always force — never keep alias-first Type when scorer abstains
  columnMap.violationIssueType = typeRes.header;
  return typeRes;
}

function normalizeRawRows(rawRows, headers, context) {
  const columnMap = enhanceColumnMap(headers);
  // COL: scorer single-winner Type (or null)
  forceTypeColumnFromScorer(columnMap, headers, rawRows);
```

```80:85:lib/bridge-engine/normalizer.js
    // MAP / COL-03: promote real category only when mapped Type cell is empty
    if (!String(mapped.violationIssueType || '').trim()) {
      const promoted = promoteCategoryFromRaw(rawRow, headers, columnMap, mapped);
      if (promoted) mapped.violationIssueType = promoted;
    }
```

```489:531:lib/bridge-type-column-score.js
function pickTypeColumn(ranked, opts = {}) {
  // single winner or null — never blend
}
function resolveTypeColumnHeader(headers, sampleRows, opts = {}) {
  // { header, score, ranked, source: 'scorer'|'unresolved' }
}
```

---

_Verified: 2026-07-10T05:50:57Z_  
_Verifier: Claude (gsd-verifier)_
