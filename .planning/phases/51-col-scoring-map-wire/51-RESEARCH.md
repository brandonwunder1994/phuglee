# Phase 51: COL Scoring + Map Wire - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Data Bridge — Violation Type column scoring + force into `columnMap`  
**Confidence:** HIGH (integration seams + alias traps verified in code); MEDIUM (exact score weights/thresholds)

## Summary

Phase 51 closes the root gap for v1.8 Type Column Intelligence: today `detectIntakeColumnMap` is **alias-first / first-match** and can claim narrative/status/description columns as `violationIssueType`, which poisons Train groups and durable brain type rules. v1.7 `promoteCategoryFromRaw` only helps when Type is **empty** — a wrong mapped column blocks promote forever. This phase ships a pure value-aware scorer and wires it so process always forces **exactly one** scorer-chosen Type header (or null) into `columnMap.violationIssueType`.

**Out of phase:** confirm gate, city format fingerprint store, short labels, META source enum full set (`auto_reuse` / `admin_confirm`) — those are Phases 52–53. Phase 51 must still change real process behavior (not “hint only” pure tests).

**Primary recommendation:** Add `lib/bridge-type-column-score.js` (zero new packages). In `normalizeRawRows`, after `enhanceColumnMap(headers)`, **always overwrite** `columnMap.violationIssueType` with scorer `pick` or `null`. Keep `detectIntakeColumnMap` for address/date/notes and as **header feature input** to the scorer only — never as a parallel Type winner that can undercut the scorer. Leave promote empty-cell-only after `mapRawRow`.

---

## User Constraints

### Locked Decisions (from PROJECT.md / REQUIREMENTS / phase brief)

- **Single best Type column** — headers + value shapes; **never** multi-column blend/concatenate into Type
- **Scorer forces map** — `columnMap.violationIssueType` is the scorer/confirm choice; aliases are scoring features, not a parallel first-match path that can undercut the scorer (COL-04)
- **No silent drop when no Type** — if no column meets candidacy, Type stays empty; distressed/FN rows remain for review (COL-02)
- **Promote empty-only** — v1.7 `promoteCategoryFromRaw` runs only when mapped Type cell is still empty; never overrides a scorer-chosen Type column (COL-03)
- **Zero new npm packages preferred** — pure CommonJS under `lib/`, existing `node --test`
- **Do not wipe user data** — never touch `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores (AGENTS.md)

### Claude's Discretion (plan may choose within bounds)

- Exact feature weights, `minScore`, `minMargin`, sample size N (must fixture-lock outcomes below)
- Whether resolver lives as named export on scorer module vs thin function in normalizer
- Whether `processingMeta` gains early Type resolution fields in 51 (full META-01 enum is Phase 52)
- Tie-break rules when scores equal (prefer stronger header alias; then shorter median length; then header order)

### Deferred Ideas (OUT OF SCOPE — Phase 51)

- Format fingerprint + city format store + confirm modal (Phase 52)
- Display-only short labels (Phase 53)
- Full processUpload e2e regression suite lock for reuse/labels (Phase 54) — **do** include unit + wire tests for COL in 51
- ML/embeddings classifier, multi-column blend, learned global synonyms
- Storing format memory in `global-brain.json`
- Growing `detectIntakeColumnMap` into the scorer

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COL-01 | Score every source column (header aliases + value shapes); map **exactly one** winner into `columnMap.violationIssueType` (never blend) | Pure `scoreTypeColumns` + `pickTypeColumn`; normalizer forces single header |
| COL-02 | No candidacy → Type empty; rows still kept for review when distressed/FN (no silent drop solely for no type) | `pick` returns null; no new discard reason; promote/description grouping remain |
| COL-03 | `promoteCategoryFromRaw` only after map and only when Type cell empty; never override scorer-chosen column | Keep promote after `mapRawRow`; scorer header is in `columnMap` → `used` set |
| COL-04 | Scorer/confirm choice **forces** map; aliases are scorer features only, not parallel first-match undercut | Always overwrite Type from scorer result (including null); do not leave alias-first Type when scorer rejects |

---

## Standard Stack

### Core

| Library / module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js | 20+ (local 24.x) | Runtime | Existing shell |
| CommonJS pure module | — | `lib/bridge-type-column-score.js` | v1.7 pattern (`bridge-category-promote.js`) |
| `lib/bridge-intake-schema.js` | existing | `normalizeHeader`, `INTAKE_FIELD_ALIASES.violationIssueType`, `detectIntakeColumnMap` for non-Type fields | Aliases = score features |
| `lib/bridge-category-promote.js` | existing | `isCategoryLikeHeader`, `promoteCategoryFromRaw`, `NARRATIVE_HEADER_RE`, `TIMESTAMP_ONLY_RE` | Reuse heuristics; empty-only fallback |
| `lib/bridge-engine/normalizer.js` | existing | Wire scorer into `normalizeRawRows` | Only process seam for columnMap |
| `node --test` | built-in | Unit + wire fixtures | Existing suite |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/bridge-engine/index.js` | `processUpload` already calls `normalizeRawRows(parsed.rows, parsed.headers, …)` | No API change required for 51; behavior improves via normalizer |
| `lib/bridge-stable-text.js` | Optional reuse for length cleanup later | Not required for 51 scorer |
| `xlsx` | Already parses sheets | Headers/rows available before score — do not re-parse |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure JS scorer | LLM / embeddings classifier | Non-deterministic, network, hard to lock — deferred |
| New scorer module | Grow `detectIntakeColumnMap` | Breaks alias-first contract of callers/tests; no ranked candidates for Phase 52 UI |
| Always overwrite Type from scorer | Alias fallback when scorer null | Alias fallback reintroduces Status/Description traps (COL-04/COL-02) |
| Score full sheet | Sample first N rows | Full scan unnecessary; 50–100 rows enough |

**Installation:**

```bash
# No new packages
npm test
```

---

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-type-column-score.js   # NEW pure: score + pick
├── bridge-intake-schema.js       # UNCHANGED contract (alias-first kept for non-Type)
├── bridge-category-promote.js    # UNCHANGED role (empty-only fallback)
└── bridge-engine/
    └── normalizer.js             # MODIFY: force Type from scorer using rawRows sample
tests/
├── bridge-type-column-score.test.js   # NEW unit matrix (COL-01/02/04)
└── bridge-engine.test.js              # ADD wire/process fixtures (COL-01–03)
```

### Pattern 1: Pure scorer + forced map overwrite (required)

**What:** Rank all headers with alias + value-shape features; pick one or null; **always set** `columnMap.violationIssueType` from pick (never leave alias-first Type when scorer disagrees or abstains).

**When to use:** Every `normalizeRawRows` call (tabular + document-derived rows that have headers).

**Example:**

```javascript
// lib/bridge-type-column-score.js (API shape)
const {
  normalizeHeader,
  INTAKE_FIELD_ALIASES
} = require('./bridge-intake-schema');
const {
  isCategoryLikeHeader,
  NARRATIVE_HEADER_RE,
  TIMESTAMP_ONLY_RE
} = require('./bridge-category-promote');

function scoreTypeColumns(headers, sampleRows, opts = {}) {
  // per header → { header, score, reasons[], samples[] }
  // sorted desc by score
}

function pickTypeColumn(ranked, { minScore = 45, minMargin = 8 } = {}) {
  // single winner or null — never blend
}

function resolveTypeColumnHeader(headers, sampleRows, opts) {
  const ranked = scoreTypeColumns(headers, sampleRows, opts);
  const picked = pickTypeColumn(ranked, opts);
  return {
    header: picked ? picked.header : null,
    score: picked ? picked.score : null,
    ranked,
    source: picked ? 'scorer' : 'unresolved'
  };
}

module.exports = {
  scoreTypeColumns,
  pickTypeColumn,
  resolveTypeColumnHeader,
  // export pure helpers used in tests: headerFeatureScore, valueShapeScore, DEFAULTS
};
```

```javascript
// lib/bridge-engine/normalizer.js (wire — conceptual)
function normalizeRawRows(rawRows, headers, context) {
  const columnMap = enhanceColumnMap(headers); // address/date/notes (+ alias Type, discarded next)
  const sampleRows = (rawRows || []).slice(0, 80);
  const typeRes = resolveTypeColumnHeader(headers, sampleRows);
  // COL-04: force — including null when unresolved
  columnMap.violationIssueType = typeRes.header;

  // … mapRawRow → promote only if cell empty (existing) …
  return { columnMap, kept, discarded /*, typeResolution optional */ };
}
```

### Pattern 2: Alias as feature, not winner path

**What:** Reuse `INTAKE_FIELD_ALIASES.violationIssueType` and `isCategoryLikeHeader` inside the scorer for **points**. Do not call “if scorer fails, use `detectIntakeColumnMap().violationIssueType`”.

**Why:** Verified traps (HIGH confidence — live probe 2026-07-09):

| Headers | Alias-first Type today | Desired scorer winner |
|---------|------------------------|------------------------|
| `Status Description`, `Vio Cat`, `Description`, `Date` | **Status Description** | **Vio Cat** |
| `Violation Description`, `Issue Type`, `Notes` | **Violation Description** | **Issue Type** |
| `Code Description`, `Category`, `Comments` | **Code Description** | **Category** |
| `Ordinance Description`, `Vio Cat` | **Ordinance Description** | **Vio Cat** |
| `Category`, `Violation Description` | **Violation Description** | **Category** |
| Johns Creek: `Code Case Description`, `Violation Code Number` | **Code Case Description** | often **unresolved** (narrative + code#) or better categorical if present |
| `Violation Type`, `Description` | Violation Type | Violation Type (keep winning) |
| Address/Notes only | null | null → promote/description path |

### Pattern 3: Promote coexistence (COL-03)

**What:** After `mapRawRow`, existing:

```javascript
if (!String(mapped.violationIssueType || '').trim()) {
  const promoted = promoteCategoryFromRaw(rawRow, headers, columnMap, mapped);
  if (promoted) mapped.violationIssueType = promoted;
}
```

**Rules:**
1. Scorer-mapped column with non-empty cell → promote no-ops (early return) ✓  
2. Scorer-mapped column with **empty** cell on a row → promote may fill from **other** unmapped category headers (MAP safety) — acceptable; still not “override column choice”  
3. Scorer unresolved (`null`) → promote still fills from `Vio Cat` etc. (MAP-01/02 regression must stay green)  
4. Never concatenate scorer column + promote column into one type string  

**Optional hardening (discretion):** When scorer claims a Type header, pass it in `columnMap` so promote’s `used` set excludes it from being re-selected as “unmapped” (already true if map holds the header). Do **not** disable promote entirely when scorer unresolved.

### Anti-Patterns to Avoid

- **Hint-only scorer:** Unit tests green while process still alias-first — ship fail mode #1  
- **Alias fallback after scorer null:** Re-admits Status/Description winners  
- **Blend / multi-column Type:** Forbidden  
- **New discard `no_type_column`:** Forbidden (COL-02)  
- **Scoring inside `detectIntakeColumnMap`:** Breaks pure header contract; blocks ranked candidates for Phase 52  
- **Confirm gate / format store in 51:** Scope creep → Phase 52  
- **Mutating promote to invent type from free text:** Breaks MAP-03  

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Header normalize | New lower/trim | `normalizeHeader` from intake-schema | One normalization contract |
| Category-like header check | New regex soup | `isCategoryLikeHeader` / `CATEGORY_HEADER_RE` / `NARRATIVE_HEADER_RE` | v1.7 already tuned |
| Timestamp-only cells | New date parser lib | `TIMESTAMP_ONLY_RE` from promote | Shared reject signal |
| Address-ish cells | NLP | Existing `STREET_HINT_RE` / digit+street heuristics from intake-schema (import carefully) | Enough for demotion |
| Spreadsheet parse | Re-parse in scorer | `parsed.rows` / `parsed.headers` already in process | Scorer is pure |
| ML classifier | TensorFlow/LLM | Weighted features + fixtures | Deterministic, offline |
| Atomic store / fingerprint | — | Phase 52 | Not needed to force map |

**Key insight:** The hard part is **integration order** (force map before `mapRawRow`, promote empty-only), not inventing a novel algorithm.

---

## Recommended Scoring Spec (starting point — tune with fixtures)

Confidence: **MEDIUM** on numeric weights; **HIGH** on feature *kinds* and forced outcomes.

### Sample

- Use first **N = 80** rows (or all if fewer)
- Per column, collect up to **40** non-empty trimmed cell strings
- If zero non-empty samples: rely on header features only (classic `Violation Type` still scores high)

### Header features (suggested points)

| Signal | Points | Notes |
|--------|--------|-------|
| Exact alias match (`normalizeHeader(h)` ∈ alias set) | +40 | Strong classic headers |
| Boundary/partial alias (same rules as `findColumn` substring, length ≥ 4) | +22 | Weaker than exact |
| `isCategoryLikeHeader(h)` true | +18 | Catches `Vio Cat`, short forms |
| Narrative header (`NARRATIVE_HEADER_RE`) | −45 | Description/Notes/Comments |
| Header looks like date field (alias overlap with `violationDate` list or /\bdate\b/i) | −35 | Demote date columns |
| Header already claimed by address/city/state/zip/date in `columnMap` | −100 / skip | Never Type = address |
| Status-ish header (/\bstatus\b/i without strong type tokens) | −25 | Soft demote; value shape may finish kill |
| “description” aliases that are on Type list (`violation description`, `status description`, `code description`, `ordinance description`) | **no automatic win** | Cap alias credit at partial unless value shape is categorical |

### Value-shape features (fraction of non-empty samples)

| Signal | Points | Notes |
|--------|--------|-------|
| Median length ≤ 40 | +18 | Category-like |
| Median length 41–80 | +6 | Weak categorical / short phrase |
| Median length > 80 | −25 | Narrative wall |
| p90 length > 120 | −20 | Same as promote max cell guard spirit |
| Date-like fraction ≥ 0.5 | −40 | `TIMESTAMP_ONLY_RE` or ISO/US date patterns |
| Date-like fraction ≤ 0.15 | +10 | Clean |
| Address-like fraction ≥ 0.4 | −40 | `STREET_HINT_RE` / house-number patterns |
| Distinct ratio (unique/count) in [0.05, 0.55] | +16 | Repeating categories |
| Distinct ratio > 0.85 | −22 | Near-unique free text |
| Distinct ratio ≤ 0.05 with tiny vocabulary of Open/Closed/Yes/No | −15 | Status enum, not violation type |
| Timestamp-only fraction ≥ 0.5 | −30 | |
| Long-prose fraction (len > 100) ≥ 0.4 | −25 | |

### Pick rules

```
minScore = 45   // tune: true Type columns clear; Status Description fails
minMargin = 8   // if #1 - #2 < margin and both ≥ minScore → still pick #1 if #1 has better header alias tier; else null if ambiguous (discretion: prefer pick #1 for process stability)

if (!ranked.length || ranked[0].score < minScore) return null;
return ranked[0]; // single winner only
```

**Lock outcomes (must pass unit matrix regardless of exact weights):**

1. Trap sheets in table above → expected winners  
2. `Violation Type` + good cats → maps Violation Type  
3. Headers with only Address + Notes + Open Date → Type null (no drop of rows at normalize)  
4. Never return two headers or concatenated string  

### Exclusions

- Do not score the `_meta` pseudo-column  
- Skip empty header strings  
- Prefer not to pick a column already mapped to `streetAddress` / `violationDate` / geo fields even if scores leak  

---

## Common Pitfalls

### Pitfall 1: Scorer ships as pure tests only (alias-first still wins on process)

**What goes wrong:** `bridge-type-column-score.test.js` green; Train still groups on Status Description.  
**Why:** `normalizeRawRows` still uses `enhanceColumnMap` alone.  
**How to avoid:** Wire task in same phase; assert `processUpload(…).processingMeta.columnMap.violationIssueType` on a trap CSV.  
**Warning signs:** Only pure unit file in the PR; no normalizer diff.

### Pitfall 2: Alias fallback after scorer null

**What goes wrong:** Scorer correctly rejects Status Description; fallback re-selects it via `detectIntakeColumnMap`.  
**Why:** Architecture draft listed alias as step 3; COL-04/COL-02 forbid undercutting candidacy.  
**How to avoid:** Always assign `columnMap.violationIssueType = typeRes.header` (nullable).  
**Warning signs:** Trap fixture fails only when samples empty but header is Status Description.

### Pitfall 3: Promote vs scorer mixed winners

**What goes wrong:** Some rows Type from column A, others from promote column B.  
**Why:** Scorer maps weak column with sparse cells; promote fills empties from another category header.  
**How to avoid:** Fixtures where scorer picks `Issue Type`; unmapped `Cat` must not appear when Issue Type cells are filled. When Type cells empty, promote still OK. Document as acceptable empty-cell fill, not column override.  
**Warning signs:** Group labels mix two source vocabularies mid-file.

### Pitfall 4: Silent drop / NO_USABLE_ROWS when Type unresolved

**What goes wrong:** New guard rejects uploads without Type.  
**Why:** Mental model “must have category.”  
**How to avoid:** No new discard reason; existing address/distress rules only. Test: distressed weeds in Notes only still keep/FN as today.  
**Warning signs:** New `no_type_column` string anywhere.

### Pitfall 5: Scoring full 100k-row sheets

**What goes wrong:** Process latency spike.  
**Why:** Full column scans.  
**How to avoid:** Sample first N rows only (80).  
**Warning signs:** Scorer loops `rawRows.length` without cap.

### Pitfall 6: Breaking MAP-01 Vio Cat promote

**What goes wrong:** Scorer claims Notes as Type or disables promote.  
**Why:** Over-eager header features or “disable promote when scorer ran.”  
**How to avoid:** Keep promote path; fixture `Property Address,Vio Cat,Notes` still promotes High Grass when Type unresolved or empty. Existing engine test `processUpload promotes unmapped Vio Cat…` must stay green.  
**Warning signs:** MAP tests fail after wire.

### Pitfall 7: Mutating `detectIntakeColumnMap` semantics

**What goes wrong:** Unrelated intake tests fail; address/date order bugs return.  
**Why:** Stuffing value scoring into alias-first function.  
**How to avoid:** New module only; intake-schema stays header-only.  
**Warning signs:** Diff in `findColumn` loop for Type special cases without samples.

---

## Code Examples

### Verified process seam (today)

```126:131:lib/bridge-engine/index.js
  const normalized = normalizeRawRows(parsed.rows, parsed.headers, {
    city,
    uploadType,
    sourceFile,
    processedAt
  });
```

```32:57:lib/bridge-engine/normalizer.js
function normalizeRawRows(rawRows, headers, context) {
  const columnMap = enhanceColumnMap(headers);
  const kept = [];
  const discarded = [];
  const defaultConfidence = assessConfidence(columnMap);

  for (const rawRow of rawRows) {
    // …
    const mapped = injectCityState(
      mapRawRow(rawRow, columnMap),
      context.city.city,
      context.city.state
    );
    // MAP: promote real category when type still empty (all rows, not distress-gated)
    if (!String(mapped.violationIssueType || '').trim()) {
      const promoted = promoteCategoryFromRaw(rawRow, headers, columnMap, mapped);
      if (promoted) mapped.violationIssueType = promoted;
    }
```

### Alias-first Type (do not grow — feature source only)

```147:166:lib/bridge-intake-schema.js
function detectIntakeColumnMap(headers) {
  const map = {};
  const used = new Set();
  // Date before issue type so "Violation Date" is not claimed as issue type
  const fieldOrder = [
    'streetAddress',
    'city',
    'state',
    'zip',
    'violationDate',
    'violationIssueType',
    'descriptionNotes'
  ];
  for (const key of fieldOrder) {
    const col = findColumn(headers, INTAKE_FIELD_ALIASES[key], used);
    if (col) used.add(col);
    map[key] = col;
  }
  return map;
}
```

### Promote empty-only contract (preserve)

```34:47:lib/bridge-category-promote.js
function promoteCategoryFromRaw(rawRow, headers, columnMap, mapped) {
  if (String(mapped?.violationIssueType || '').trim()) {
    return String(mapped.violationIssueType).trim();
  }
  const used = new Set(Object.values(columnMap || {}).filter(Boolean));
  for (const header of headers || []) {
    if (!header || used.has(header)) continue;
    if (!isCategoryLikeHeader(header)) continue;
    const cell = String(rawRow?.[header] ?? '').trim();
    if (!cell || cell.length > 120) continue;
    if (TIMESTAMP_ONLY_RE.test(cell)) continue;
    return cell; // first wins — do not concatenate
  }
  return '';
}
```

### Minimal trap fixture for tests

```javascript
// Alias-first would map Status Description; scorer must map Vio Cat
const headers = ['Property Address', 'Status Description', 'Vio Cat', 'Description', 'Open Date'];
const rows = [
  {
    'Property Address': '100 Main St',
    'Status Description': 'Open',
    'Vio Cat': 'High Grass',
    Description: 'Weeds exceeding 12 inches as of 01/15/2024 10:30',
    'Open Date': '01/15/2024'
  },
  {
    'Property Address': '200 Oak Ave',
    'Status Description': 'Closed',
    'Vio Cat': 'Trash',
    Description: 'Junk in yard observed 02/01/2024 09:00',
    'Open Date': '02/01/2024'
  }
];
// expect pickTypeColumn(...).header === 'Vio Cat'
// expect processUpload columnMap.violationIssueType === 'Vio Cat'
// expect rows[0].violationIssueType === 'High Grass'
```

---

## State of the Art

| Old Approach | Current Approach (Phase 51) | When | Impact |
|--------------|----------------------------|------|--------|
| Alias-first first-match Type | Value-aware single-winner scorer forces map | v1.8 / Phase 51 | Stops narrative Type poison |
| Promote when Type empty (v1.7) | Still empty-only after scorer map | v1.7 kept | Safety net for unmapped cats |
| Confirm / format memory | Deferred | Phase 52 | Admin gate after scorer exists |
| Short labels | Deferred | Phase 53 | Display only |

**Deprecated/outdated for Type resolution:**
- Treating `detectIntakeColumnMap().violationIssueType` as authoritative on process path  
- “Add more aliases only” as the fix (aliases already include toxic description labels)

---

## Open Questions

1. **Exact `minScore` / `minMargin` / weights**  
   - What we know: Feature kinds and trap outcomes are locked; numbers above are starting points  
   - What's unclear: Edge sheets (code-number-only Type columns, bilingual headers)  
   - Recommendation: Implement with exported `DEFAULTS`; adjust only if fixture matrix fails; do not bikeshed before green traps

2. **Ambiguous near-ties (#1 ≈ #2)**  
   - What we know: Phase 52 confirm UI will show ranked candidates  
   - What's unclear: Whether 51 should return null on tight ties or always take #1  
   - Recommendation: Take #1 if `score ≥ minScore` and header-alias tier is strictly better; else take #1 if margin ≥ `minMargin`; else null (unresolved). Document in scorer.

3. **Optional `processingMeta.typeResolution` in 51**  
   - What we know: META-01 full enum is Phase 52  
   - What's unclear: Whether early `{ header, score, source: 'scorer'|'unresolved' }` helps debug  
   - Recommendation: Cheap win — attach if normalizer returns it and index.js already spreads `columnMap`; not required for COL-01–04

4. **Document/OCR sparse headers**  
   - What we know: Same normalizer path; samples may be weak  
   - What's unclear: Whether OCR invents header names  
   - Recommendation: Scorer still runs; unresolved + promote is fine; no special OCR branch in 51

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node --test` (no Jest/Vitest) |
| Config file | none — `package.json` script `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-type-column-score.test.js tests/bridge-category-promote.test.js` |
| Full suite command | `npm test` |
| Live health (if UI touched) | `powershell -File scripts/verify-live.ps1` — **not required** if only `lib/` + tests |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| COL-01 | Trap sheet: Status Description + Vio Cat → map Vio Cat | unit | `node --test tests/bridge-type-column-score.test.js` | ❌ Wave 0 |
| COL-01 | Trap: Violation Description vs Issue Type → Issue Type | unit | same | ❌ Wave 0 |
| COL-01 | Trap: Code/Ordinance Description vs Category/Vio Cat | unit | same | ❌ Wave 0 |
| COL-01 | Classic Violation Type still wins | unit | same | ❌ Wave 0 |
| COL-01 | Single winner only (never blend) | unit | same | ❌ Wave 0 |
| COL-01 | processUpload columnMap forced to scorer winner | integration | `node --test tests/bridge-engine.test.js` (new cases) | ❌ Wave 0 |
| COL-02 | No candidacy → header null; no new discard; weeds-in-notes still process | unit + integration | score test + engine | ❌ Wave 0 |
| COL-03 | Scorer maps Type; promote does not overwrite non-empty cells | unit | promote existing + new score/wire | ✅ promote / ❌ wire |
| COL-03 | MAP-01 Vio Cat promote still green when Type unmapped | integration | existing engine MAP test | ✅ |
| COL-04 | After score, alias-first toxic header is not left in columnMap | unit + integration | score + normalizer/engine | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-type-column-score.test.js tests/bridge-category-promote.test.js`  
- **Per wave merge:** `npm test`  
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-type-column-score.test.js` — COL-01/02/04 pure matrix (traps + classic + null)
- [ ] Engine/normalizer wire tests in `tests/bridge-engine.test.js` (or small `tests/bridge-normalizer-type-score.test.js`) — process `columnMap` + row Type values on trap CSV
- [ ] Framework install: none — already `node --test`
- [ ] Keep green: `tests/bridge-category-promote.test.js`, existing MAP processUpload test, intake-schema alias tests (do not change alias-first unit expectations unless intentionally documenting Type is no longer process-authoritative)

**Note:** `detectIntakeColumnMap` unit tests may still assert alias-first behavior on the pure function — that is OK. Process path must not treat that Type as final.

---

## Implementation Plan Hints (for planner)

Suggested task waves (not a PLAN.md):

1. **Wave 0 — tests first (red):** trap matrix for pure scorer + process columnMap expectations  
2. **Wave 1 — pure module:** `lib/bridge-type-column-score.js` until unit green  
3. **Wave 2 — wire:** `normalizeRawRows` force Type; keep promote; engine traps green; MAP-01 still green  
4. **Wave 3 — suite:** `npm test` full green  

Do **not** add: format store, confirm API, UI modal, shortLabel, new npm deps.

**Files expected to change:**

| File | Action |
|------|--------|
| `lib/bridge-type-column-score.js` | NEW |
| `lib/bridge-engine/normalizer.js` | MODIFY (force Type) |
| `tests/bridge-type-column-score.test.js` | NEW |
| `tests/bridge-engine.test.js` (or dedicated normalizer test) | MODIFY/ADD |
| `lib/bridge-intake-schema.js` | ideally **unchanged** |
| `lib/bridge-category-promote.js` | ideally **unchanged** |
| `lib/bridge-engine/index.js` | optional meta only |

---

## Sources

### Primary (HIGH confidence)

- `lib/bridge-intake-schema.js` — `detectIntakeColumnMap`, aliases, `mapRawRow`  
- `lib/bridge-engine/normalizer.js` — `enhanceColumnMap`, promote wire  
- `lib/bridge-engine/index.js` — `processUpload` parse → normalize  
- `lib/bridge-category-promote.js` — empty-only promote + category/narrative regex  
- Live Node probe of alias-first traps (2026-07-09) on representative header sets  
- `.planning/REQUIREMENTS.md` COL-01–04  
- `.planning/research/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`, `SUMMARY.md`  
- `.planning/debug/filter-singleton-no-category.md` — wrong/empty type → Train failure  
- Existing tests: `tests/bridge-category-promote.test.js`, MAP processUpload in `tests/bridge-engine.test.js`

### Secondary (MEDIUM confidence)

- Suggested numeric score weights / thresholds (product-tunable; lock via fixtures)  
- Industry import UX (Flatfile/OneSchema) — confirm is Phase 52; scoring is local heuristics  

### Tertiary (LOW confidence)

- Soft-match on renamed Type columns across uploads — Phase 52 fingerprint  
- OCR-specific header quality — no special branch required for 51  

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero-deps pure module matches v1.7 and package.json  
- Architecture / wire seam: **HIGH** — single normalizer entry verified  
- Alias trap catalog: **HIGH** — probed against real `detectIntakeColumnMap`  
- Score weights / thresholds: **MEDIUM** — need fixture tuning during implement  
- Pitfalls: **HIGH** — from v1.7 post-mortems + COL product locks  

**Research date:** 2026-07-09  
**Valid until:** ~2026-08-08 (stable domain; re-check if intake aliases change substantially)

---

## RESEARCH COMPLETE

**Phase:** 51 - COL Scoring + Map Wire  
**Confidence:** HIGH (wire + traps); MEDIUM (weights)

### Key Findings

- Alias-first currently maps **Status/Violation/Code/Ordinance Description** over real category columns (`Vio Cat`, `Issue Type`, `Category`) — verified in-process.
- Phase 51 = pure `bridge-type-column-score.js` + **force** `columnMap.violationIssueType` in `normalizeRawRows`; no confirm/format/UI.
- **Always overwrite** Type with scorer pick or `null` — no alias-only fallback path (COL-04 + COL-02).
- Promote stays empty-cell-only after map; MAP-01 Vio Cat must remain green.
- Zero new npm packages; Wave 0 needs `tests/bridge-type-column-score.test.js` + process wire fixtures.

### File Created

`.planning/phases/51-col-scoring-map-wire/51-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Existing CommonJS + node:test; no deps |
| Architecture | HIGH | Normalizer seam verified; process already has rows+headers |
| Pitfalls | HIGH | Alias traps + promote conflict documented from code |
| Score weights | MEDIUM | Outcomes locked; numbers tunable |

### Open Questions

- Final minScore/minMargin after fixture matrix  
- Tie policy (pick #1 vs unresolved)  
- Optional early typeResolution on processingMeta  

### Ready for Planning

Research complete. Planner can create PLAN.md files for Phase 51.
