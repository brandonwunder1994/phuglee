# Phase 48: Category Promotion & Signal Shape - Research

**Researched:** 2026-07-10  
**Domain:** Filter/Bridge normalizer + intake schema — category promotion into `violationIssueType`; process-path `matchedIndicators` array shape vs export join  
**Confidence:** HIGH

## Summary

Phase 48 fixes two process-path defects that make Train unusable after real city uploads: (1) **MAP** — city category/issue-type columns often never land in `violationIssueType`, so FN/distressed groups label as free-text notes or `(no type)`; (2) **SHAPE** — `buildNormalizedRow` joins `matchedIndicators` to a single string for spreadsheet export, but `buildReviewGroups` only unions **arrays**, so Train chips always show “No matched signals” on the real process path.

Both defects are confirmed in `.planning/debug/filter-singleton-no-category.md` with e2e reproduction. Phase 48 does **not** change group keys (Phase 49), Train CSS, or phrase mining. Work stays inside existing pure modules (`lib/bridge-intake-schema.js`, `lib/bridge-engine/normalizer.js`, optionally a small pure helper) with TDD via `node:test`.

**Primary recommendation:** Keep `matchedIndicators` as a **string array** on process/review rows; join with `'; '` only in `toExportRow` / export helpers. Add a pure **category promotion** helper that, when mapped type is empty, copies a value from category-like unmapped headers/cells into `violationIssueType` — never invent from pure free-text noise or timestamp-only notes.

## User Constraints

### Locked Decisions

**MAP**
- Promote real category columns into `violationIssueType` when unmapped or only in raw cells
- FN groups must show real city category when spreadsheet had one
- Do not invent fake types from pure free-text noise; prefer category-like headers/cells over timestamp-only notes

**SHAPE**
- Process/review rows: `matchedIndicators` stays a **string array**
- Export/spreadsheet path: still join to single cell string (Analyzer contract)

**Stack**
- Existing Node shell + pure modules in `lib/bridge-engine/*` / normalizer / intake schema
- TDD preferred; unit + processUpload contract tests

### Claude's Discretion

- Exact heuristics for category-like headers (e.g. match "cat", "type", "violation type", "issue type", "vio")
- Whether promotion lives in normalizer vs a small pure helper called from engine

### Deferred Ideas (OUT OF SCOPE)

- Stable group keys / timestamp stripping → Phase 49
- Full regression suite lock → Phase 50
- Train CSS, phrase mining, Analyzer vision — out of milestone

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-01 | Source category/issue-type column present but unmapped (or only in raw cells) → promote real category into `violationIssueType` | Pure `promoteCategoryFromRaw` + wire in normalizer after `mapRawRow`; extend aliases/heuristics for short headers like `Vio Cat` |
| MAP-02 | Not-distressed groups show real city category when spreadsheet had one | Promotion runs for **all** kept normalized rows (before distress split), so FN pool inherits populated type → `buildReviewGroups` labels use type not notes |
| MAP-03 | Do not invent fake types from free-text noise; prefer category-like headers over timestamp-only notes | Guard: only promote from category-like unmapped headers; never promote from description/notes aliases; never dump multi-cell free-text into type |
| SHAPE-01 | Process/review rows keep `matchedIndicators` as string arrays | Stop join in `buildNormalizedRow`; keep `Array.isArray` path through tagger → normalizer → groups |
| SHAPE-02 | Spreadsheet/export still joins indicators to one cell string | Join in `toExportRow` (and client CSV escape if needed); preserve `'; '` separator used today |

---

## Where Category Is Lost (line-level)

### Loss chain (process path)

```
parse headers/rows
  → detectIntakeColumnMap(headers)     # only known aliases map to violationIssueType
  → mapRawRow(raw, columnMap)          # unmapped columns never copied
  → tagRow(mapped, uploadType, rawRow) # raw cells still searched for distress
  → optional descriptionNotes dump     # NEVER fills violationIssueType
  → buildNormalizedRow                 # type stays ''
  → … brain → filterDistressOnly
  → buildReviewGroups                  # empty type → label = notes or '(no type)'
```

### Anchor 1 — Column map only claims known aliases

`lib/bridge-intake-schema.js` `INTAKE_FIELD_ALIASES.violationIssueType` includes `category`, `issue type`, `violation type`, etc., but **not** short forms like `vio cat` / bare `cat` / `vio`.

```54:62:lib/bridge-intake-schema.js
  violationIssueType: [
    'violation issue type', 'violation/issue type', 'violation type',
    'issue type', 'violation code', 'violation description',
    'category', 'offense', 'charge', 'code description',
    'case type', 'case description', 'ordinance', 'ordinance description',
    'infraction', 'complaint type', 'nature of violation', 'nature of call',
    'problem', 'problem type', 'code case type', 'violation subtype',
    'code type', 'enforcement type', 'condition', 'status description'
  ],
```

`findColumn` substring matching requires space boundaries (`startsWith`, `endsWith`, `includes(' alias ')`). Header `"Vio Cat"` normalizes to `"vio cat"`:

- exact match to `"category"` → no  
- includes `" category "` → no  
- ends with `" category"` → no  

**Result:** diagnosis case `Vio Cat` → `columnMap.violationIssueType = null`. **Confidence: HIGH** (code + debug e2e).

### Anchor 2 — mapRawRow only copies mapped fields

```201:208:lib/bridge-intake-schema.js
function mapRawRow(rawRow, columnMap) {
  const mapped = {};
  for (const key of Object.keys(INTAKE_FIELD_ALIASES)) {
    const header = columnMap[key];
    mapped[key] = header ? String(rawRow[header] ?? '').trim() : '';
  }
  return mapped;
}
```

Unmapped category cells exist only on `rawRow`. Tagger still sees them via `buildSearchText(row, rawRow)` — so High Grass can tag Strong while type stays empty. **Confidence: HIGH**.

### Anchor 3 — Fallback fills notes, never type

```58:67:lib/bridge-engine/normalizer.js
    // Prefer filling empty mapped issue/notes from any raw text that matched distress,
    // so saved exports still show why the row was kept.
    if (!mapped.violationIssueType && !mapped.descriptionNotes && tags.matchedIndicators?.length) {
      const rawBits = Object.entries(rawRow || {})
        .filter(([k, v]) => k !== '_meta' && v != null && typeof v !== 'object' && String(v).trim())
        .map(([, v]) => String(v).trim());
      if (rawBits.length) {
        mapped.descriptionNotes = rawBits.slice(0, 4).join(' | ').slice(0, 500);
      }
    }
```

Critical gaps for MAP:

| Gap | Effect |
|-----|--------|
| Only runs when **both** type and notes empty | FN with notes `"admin"` keeps type empty → label = notes |
| Only when `matchedIndicators.length` | FN rows with **no** distress match never get promotion |
| Writes `descriptionNotes`, not `violationIssueType` | Groups still `__unknown__` for type key |
| Dumps **all** raw cells | Noise risk if reused for type (MAP-03 forbids inventing) |

**Confidence: HIGH**.

### Anchor 4 — Group labels fall back to notes / (no type)

```81:92:lib/bridge-review-groups.js
    // Label: first non-empty type label, else description, else '(no type)'
    if (!g._labelSet) {
      if (typeLabel) {
        g.violationTypeLabel = typeLabel;
        g._labelSet = true;
      } else if (descTrimmed) {
        g.violationTypeLabel = descTrimmed;
        g._labelSet = true;
      } else {
        g.violationTypeLabel = '(no type)';
        g._labelSet = true;
      }
    }
```

**Do not change this file in Phase 48** (CONTEXT: consume only; Phase 49 owns keys). Fix is upstream: populate `violationIssueType` before grouping. **Confidence: HIGH**.

### Secondary pitfall already in aliases

Alias `'violation description'` maps free-text (often with timestamps) **into** type. That is a Phase 49 grouping problem when type is non-empty but timestamped; Phase 48 must not make inventing worse. Prefer short category columns over narrative description fields when promoting.

---

## Where matchedIndicators Are Stringified (line-level)

### Root coerce — buildNormalizedRow

```235:238:lib/bridge-intake-schema.js
  row.matchedIndicators = Array.isArray(matchedIndicators)
    ? matchedIndicators.join('; ')
    : String(matchedIndicators || '');
```

Tagger returns arrays (`lib/bridge-distress-tagger.js` `collectMatches` → `matchedIndicators: string[]`). Normalizer passes them through. **This join is the single process-path coercion.** **Confidence: HIGH**.

### Consumer that drops non-arrays — buildReviewGroups

```100:108:lib/bridge-review-groups.js
    const indicators = Array.isArray(row.matchedIndicators) ? row.matchedIndicators : [];
    for (const ind of indicators) {
      if (ind == null || ind === '') continue;
      const s = String(ind);
      if (!g._indicatorSeen.has(s)) {
        g._indicatorSeen.add(s);
        g.matchedIndicators.push(s);
      }
    }
```

String form → `[]` on every group → Train “No matched signals”. Unit tests that hand arrays to `buildReviewGroups` pass; real `processUpload` fails. **Confidence: HIGH**.

### Export path (must stay joined string)

```247:252:lib/bridge-intake-schema.js
function toExportRow(row) {
  const out = {};
  for (const key of COLUMN_KEYS) {
    out[NORMALIZED_COLUMNS[key].exportLabel] = row[key] ?? '';
  }
  return out;
}
```

Today export “works” only because the value is already a string from `buildNormalizedRow`. After SHAPE, **`toExportRow` must join arrays** (recommended: `'; '`) so CSV/XLSX cells stay Analyzer-compatible.

Server export: `lib/bridge-export.js` → `rows.map(toExportRow)`.  
Client download: `public/js/bridge.js` `rowsToCsv` uses `String(row[key])` — `Array.toString()` uses **commas**, not `'; '`. Fix either by:

1. Joining in `toExportRow` only for server (client still wrong), **or**
2. Small shared format helper used server-side, plus client-side join when key is `matchedIndicators` (minimal bridge.js change), **or**
3. Accepting client comma-join as soft debt (not ideal).

**Recommendation:** join in `toExportRow`; for client CSV, format arrays with `'; '` when serializing `matchedIndicators` (one-line guard). **Confidence: HIGH** for server path; **MEDIUM** that client export is exercised by admins after process.

### Already dual-shape aware

`lib/bridge-brain-apply.js` `clearMatchedIndicators` preserves shape (array → `[]`, string → `''`). After SHAPE, process rows are always arrays; suppress path stays correct. **Confidence: HIGH**.

### UI already expects arrays on groups

`public/js/bridge.js` / `bridge-train.js`: `Array.isArray(group.matchedIndicators)`. No Train UI work in Phase 48 once groups receive unions. **Confidence: HIGH**.

---

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| `lib/bridge-intake-schema.js` | existing | `buildNormalizedRow`, `toExportRow`, aliases, `mapRawRow` | SHAPE join/unjoin; optional alias adds |
| `lib/bridge-engine/normalizer.js` | existing | `normalizeRawRows` pipeline | Call promotion after map, before/alongside tag |
| Pure helper (new or colocated) | **create or add** | `isCategoryLikeHeader`, `promoteCategoryFromRaw`, `formatMatchedIndicatorsForExport` | Unit-testable; matches phase 42–43 pure-module pattern |
| `lib/bridge-distress-tagger.js` | existing | `tagRow` returns indicator **arrays** | Do not re-tag for promotion |
| `lib/bridge-export.js` | existing | CSV/XLSX via `toExportRow` | SHAPE-02 contract |
| `lib/bridge-review-groups.js` | existing | Group labels + indicator union | **Read-only** in Phase 48 |
| `node:test` + `node:assert/strict` | Node 20+ | Unit + processUpload contracts | Project standard (`npm test`) |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `tests/bridge-intake-schema.test.js` | Shape + export assertions | SHAPE unit tests |
| `tests/bridge-engine.test.js` | processUpload contract | MAP-02 + SHAPE-01 e2e-ish |
| `tests/bridge-export.test.js` | CSV cell string for indicators | SHAPE-02 |
| `tests/bridge-review-groups.test.js` | Already array-based fixtures | Do not change keys; optional assert union still works |
| Fixture CSV `tests/fixtures/bridge/code-violations-varied.csv` | Mapped `Violation Type` happy path | Regression: typed rows still work |
| In-test CSV strings | Unmapped `Vio Cat` / description-only | MAP cases (no new fixture required) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure helper `promoteCategoryFromRaw` | Inline only in normalizer | Harder unit tests; phase pattern prefers pure helpers |
| Expand only `INTAKE_FIELD_ALIASES` | Alias-only fix | Misses headers that never exact-match (`Vio Cat`); promotion still needed for “only in raw cells” |
| Keep join in `buildNormalizedRow`, split in groups | Parse `'; '` back | Fragile if labels contain `; `; violates SHAPE-01 “stays array” |
| Dual fields `matchedIndicators` + `matchedIndicatorsExport` | Parallel fields | Schema bloat; export already has `toExportRow` boundary |
| Promote in engine after normalize | Engine-only | Duplicates row shape logic; normalizer already owns map/tag |

**Installation:** none — no new npm packages.

```bash
node --test tests/bridge-intake-schema.test.js tests/bridge-export.test.js
node --test tests/bridge-engine.test.js
npm test
```

---

## Architecture Patterns

### Recommended project structure

```
lib/
├── bridge-intake-schema.js          # MODIFY — array indicators; join in toExportRow; optional aliases
├── bridge-category-promote.js      # CREATE (preferred) — pure header/cell promotion helpers
├── bridge-engine/
│   └── normalizer.js               # MODIFY — call promote when type empty
│   └── index.js                    # NO change required if normalize path fixed
├── bridge-export.js                # NO change if toExportRow joins
├── bridge-review-groups.js         # DO NOT TOUCH keys (Phase 49)
└── bridge-brain-apply.js           # Already dual-shape; no change expected

tests/
├── bridge-category-promote.test.js # CREATE — MAP heuristics
├── bridge-intake-schema.test.js    # EXTEND — SHAPE array + export string
├── bridge-export.test.js           # EXTEND — array row → joined CSV cell
└── bridge-engine.test.js           # EXTEND — unmapped category process contract
```

**Discretion resolution (recommended):** Put promotion in **`lib/bridge-category-promote.js` pure helpers**, called from **normalizer** (not engine). Keeps engine thin; matches “pure modules + TDD” locked stack.

### Pattern 1: SHAPE — array on process, string on export

```
tagRow → matchedIndicators: string[]
  → buildNormalizedRow keeps array (or empty [])
  → processUpload rows / notDistressedRows / buildReviewGroups union arrays
  → toExportRow / client CSV: join with '; ' for cell
```

**When:** Always for process path. Export boundary only.

### Pattern 2: MAP — promote before tag (or after map, before buildNormalizedRow)

Recommended order inside `normalizeRawRows` loop:

```
mapRawRow
  → if !mapped.violationIssueType: promoteCategoryFromRaw(rawRow, headers, columnMap, mapped)
  → tagRow(mapped, uploadType, rawRow)   # tag still sees raw for unmapped distress text
  → existing notes fallback (optional: leave as-is; do not promote notes into type)
  → buildNormalizedRow
```

Promotion **must run for FN-destined rows too** (all normalized kept rows), not only strong-tagged rows — MAP-02.

### Pattern 3: Category-like header heuristic (discretion — prescribe defaults)

Promote from unmapped headers when normalized header matches **category-like** signals, priority order:

1. Exact / alias hit if column map was incomplete (re-scan unmapped headers against type aliases + short forms)
2. Short forms / tokens: `\b(cat|category|type|vio|violation|issue|offense|charge|ordinance|complaint|problem|infraction)\b` as whole-token header fragments
3. Prefer headers that look like labels (`Vio Cat`, `Case Type`, `Code Type`) over narrative (`Notes`, `Description`, `Comments`, `Narrative`)

**Reject / never promote from:**

| Source | Why |
|--------|-----|
| Headers already mapped to `descriptionNotes` | Free-text noise (MAP-03) |
| Headers mapped to address/date/city/state/zip | Wrong domain |
| Timestamp-only cell values (`01/15/2024 10:30`, ISO datetimes) | Not a category |
| Multi-cell dumps / joined rawBits | Invents composite “types” |
| Empty / whitespace cells | No signal |
| Values longer than ~120 chars (discretion) | Likely narrative |

**Cell value:** first non-empty category-like column wins (stable header order from spreadsheet). Do not concatenate multiple category columns into one type.

### Pattern 4: Water shut-off safety

- `tagRow` for `water_shut_off` returns `matchedIndicators: []` — SHAPE keeps `[]`, not string.
- Promotion of a real type column on water lists is **OK** (labels improve) but must **not** invent types from notes.
- Water early brain-apply no-op and distress pass-through unchanged — do not special-case water beyond “no invent”.

### Anti-patterns to avoid

- **Changing `buildReviewGroups` keys** — Phase 49 territory; CONTEXT forbids.
- **Inventing type from descriptionNotes** when no category column exists — MAP-03.
- **Leaving join in `buildNormalizedRow` and splitting in UI** — chips still empty on groups.
- **Joining with comma in export** — current contract is `'; '`.
- **Assuming alias expansion alone fixes MAP** — `Vio Cat` and “only in raw cells” need promotion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distress keyword detection | New regex for category promotion | Existing `tagRow` / `matchedIndicators` | Promotion is about **labels**, not re-detecting weeds |
| Group stacking / timestamp strip | Custom keys in Phase 48 | Phase 49 `bridge-review-groups` | Separate requirements |
| Dual storage of indicators | Parallel export field on every row | `toExportRow` boundary join | Single source of truth |
| Fuzzy NLP category extraction | Embeddings / ML | Header heuristics + raw cell copy | Controllability; out of scope |
| New npm deps | lodash, zod, etc. | Pure Node helpers | Project has zero utility-lib deps for bridge |

**Key insight:** Category already exists as a **cell string** in the upload. The bug is mapping/promotion, not inference. Indicators are already arrays from the tagger — stop destroying shape at normalize.

---

## Common Pitfalls

### Pitfall 1: Export break (SHAPE-02)

**What goes wrong:** After keeping arrays, CSV/XLSX cells become `"Tall/overgrown...,Accumulation..."` via `Array.toString()` or JSON-like garbage.  
**Why:** `toExportRow` passthrough + client `String(array)`.  
**How to avoid:** Explicit join in `toExportRow`; assert export tests with array input.  
**Warning signs:** Analyzer import of Bridge export shows brackets or commas instead of `'; '`.

### Pitfall 2: Inventing types (MAP-03)

**What goes wrong:** Free-text notes or multi-cell dumps become `violationIssueType` → Train shows garbage categories; Phase 49 stacks wrong.  
**Why:** Reusing the existing “rawBits into notes” dump for type.  
**How to avoid:** Category-like header gate + single cell + reject long/timestamp values.  
**Warning signs:** Description-only CSV gains non-empty type equal to full notes.

### Pitfall 3: Water / non-code rows

**What goes wrong:** Water rows get fake types or non-array indicators; process contracts fail.  
**Why:** Over-broad promotion or join regression.  
**How to avoid:** Water fixture still green; indicators remain `[]` array.  
**Warning signs:** `water_shut_off` processUpload failures or indicator strings.

### Pitfall 4: FN-only promotion skip

**What goes wrong:** Promote only when `matchedIndicators.length` (copying notes fallback condition) → FN fence-permit category still empty.  
**Why:** Diagnosis notes fallback is distress-gated.  
**How to avoid:** Promote whenever mapped type empty and category-like cell exists, **independent of tag**.  
**Warning signs:** Distressed High Grass labeled correctly but FN Fence Permit still notes/`(no type)`.

### Pitfall 5: Alias collision with description

**What goes wrong:** Expanding aliases with bare `type` steals “Description Type” or maps wrong column.  
**Why:** `findColumn` already skips bare `type` for partial match (`alias === 'type'` continue).  
**How to avoid:** Prefer dedicated promotion scan over reckless alias adds; if adding aliases, prefer multi-word (`vio cat`, `violation category`).  
**Warning signs:** `descriptionNotes` empty and type filled with narrative.

### Pitfall 6: Tests that assert string indicators

**What goes wrong:** Existing tests pass string `matchedIndicators: 'overgrown'` (export fixture) or assume join.  
**Why:** Historical export-shaped rows.  
**How to avoid:** Update unit expectations: process rows = arrays; export samples can still use strings **or** arrays joined at boundary.  
**Warning signs:** Red tests in `bridge-export.test.js` / intake schema after SHAPE.

### Pitfall 7: Scope creep into grouping

**What goes wrong:** Empty-type timestamp singletons still flood Train after Phase 48.  
**Why:** Expected until Phase 49; promotion only helps when a real category column exists.  
**How to avoid:** Document success criteria: unmapped category → labeled groups; description-only High Grass still singleton until 49.  
**Warning signs:** Planner tasks that strip timestamps in Phase 48.

---

## Code Examples / Touch Points

### SHAPE — keep array in buildNormalizedRow

```javascript
// lib/bridge-intake-schema.js — buildNormalizedRow (target behavior)
// Source: phase research; replaces join-at-normalize
row.matchedIndicators = Array.isArray(matchedIndicators)
  ? matchedIndicators.slice()
  : (matchedIndicators ? [String(matchedIndicators)] : []);
```

Prefer empty array over empty string for consistency with tagger/brain-apply array path.

### SHAPE — join only at export

```javascript
// lib/bridge-intake-schema.js — toExportRow (target behavior)
function formatMatchedIndicatorsForExport(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('; ');
  return String(value || '');
}

// inside toExportRow loop:
out[NORMALIZED_COLUMNS[key].exportLabel] =
  key === 'matchedIndicators'
    ? formatMatchedIndicatorsForExport(row[key])
    : (row[key] ?? '');
```

### MAP — pure promotion helper (sketch)

```javascript
// lib/bridge-category-promote.js (recommended new module)
const CATEGORY_HEADER_RE =
  /\b(cat|category|type|vio|violation|issue|offense|charge|ordinance|complaint|problem|infraction|code\s*type|case\s*type)\b/i;
const NARRATIVE_HEADER_RE =
  /\b(description|notes|comments|narrative|remarks|memo|findings|observation|detail)\b/i;
const TIMESTAMP_ONLY_RE =
  /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

function isCategoryLikeHeader(header) {
  const h = String(header || '').trim();
  if (!h || NARRATIVE_HEADER_RE.test(h)) return false;
  return CATEGORY_HEADER_RE.test(h);
}

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
    return cell;
  }
  return '';
}
```

Wire:

```javascript
// lib/bridge-engine/normalizer.js — after mapRawRow / injectCityState
if (!mapped.violationIssueType) {
  const promoted = promoteCategoryFromRaw(rawRow, headers, columnMap, mapped);
  if (promoted) mapped.violationIssueType = promoted;
}
```

### Existing join site (delete from process path)

```235:238:lib/bridge-intake-schema.js
  row.matchedIndicators = Array.isArray(matchedIndicators)
    ? matchedIndicators.join('; ')
    : String(matchedIndicators || '');
```

### Existing consumer (no change — already correct for arrays)

```100:100:lib/bridge-review-groups.js
    const indicators = Array.isArray(row.matchedIndicators) ? row.matchedIndicators : [];
```

### Client CSV guard (if process rows downloadable with arrays)

```javascript
// public/js/bridge.js rowsToCsv — when serializing matchedIndicators
const text = Array.isArray(value) ? value.filter(Boolean).join('; ') : String(value ?? '');
```

---

## Recommended Plan Split (1–2 plans max)

| Plan | Focus | Deliverables | Req |
|------|--------|--------------|-----|
| **48-01 SHAPE** | Signal shape | Keep array in `buildNormalizedRow`; join in `toExportRow` (+ client CSV if needed); unit + export tests; engine assert group indicators non-empty when tagged | SHAPE-01, SHAPE-02 |
| **48-02 MAP** | Category promotion | `bridge-category-promote.js` + normalizer wire; optional alias adds; unit matrix + processUpload unmapped `Vio Cat` / FN label contract | MAP-01, MAP-02, MAP-03 |

**Order:** SHAPE first (small, unblocks chips, export risk isolated), then MAP (depends on stable row field conventions).

**Optional collapse:** Single plan with Wave 0 tests → SHAPE tasks → MAP tasks if planner prefers one PLAN.md (still ≤2 plans).

**Out of both plans:** `bridge-review-groups` key logic, Train CSS, phrase miner, Phase 50 full regression lock (though 48 plans should leave focused tests green).

---

## State of the Art (this codebase)

| Old Approach (v1.6) | Current Target (v1.7 Phase 48) | Impact |
|---------------------|--------------------------------|--------|
| Join indicators at normalize for “export-ready rows” | Array on process rows; join at export boundary | Train chips work; export unchanged |
| Type only if column aliases match | Promote from category-like unmapped cells | FN/distressed labels show city category |
| Empty type → group by exact description (Phase 43) | Unchanged until Phase 49 | Timestamp singletons remain for description-only files |

**Deprecated/outdated assumptions:**
- “Normalized rows are always export-shaped” — false for Train/review; export is a boundary.
- “Tagger failure causes missing category” — false; tagger sees raw; mapping fails.

---

## Open Questions

1. **How aggressive should short-token headers be?**  
   - What we know: `Vio Cat` is a real diagnosis case; bare `type` is dangerous.  
   - What's unclear: city files with `Status` / `Condition` as workflow state not category (aliases already include `condition`).  
   - Recommendation: promote `condition` only if already alias-mapped; do not add bare `status` to promotion.

2. **Should promotion overwrite mapped-but-empty vs only null map?**  
   - Recommendation: if `mapped.violationIssueType` is empty string after map, promote (covers mapped blank cells + unmapped).

3. **Client CSV join**  
   - Recommendation: one-line array format in `bridge.js` rowsToCsv for parity; low risk.

4. **Description-only High Grass after Phase 48**  
   - Expected: still empty type / singletons until Phase 49.  
   - MAP success is **unmapped category column**, not free-text-only.

---

## Validation Architecture

> `workflow.nyquist_validation` is enabled (`.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-intake-schema.test.js tests/bridge-category-promote.test.js tests/bridge-export.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHAPE-01 | `buildNormalizedRow` keeps `matchedIndicators` as array; process groups union non-empty when tagged | unit + engine | `node --test tests/bridge-intake-schema.test.js tests/bridge-engine.test.js` | ⚠️ extend existing |
| SHAPE-02 | `toExportRow` / `rowsToCsv` produce single string cell with `'; '` | unit | `node --test tests/bridge-export.test.js tests/bridge-intake-schema.test.js` | ⚠️ extend existing |
| MAP-01 | Unmapped category header → `violationIssueType` populated | unit + engine | `node --test tests/bridge-category-promote.test.js tests/bridge-engine.test.js` | ❌ Wave 0 helper tests |
| MAP-02 | FN group `violationTypeLabel` uses city category not notes-only | engine contract | `node --test tests/bridge-engine.test.js` | ⚠️ extend |
| MAP-03 | Notes-only / timestamp-only / no category header → type stays empty | unit | `node --test tests/bridge-category-promote.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** quick run for touched modules  
- **Per wave merge:** `npm test`  
- **Phase gate:** `npm test` green (verify-live not required for pure lib work unless public/server touched)

### Wave 0 Gaps

- [ ] `tests/bridge-category-promote.test.js` — MAP-01/03 matrix (`Vio Cat`, `Category`, narrative reject, timestamp reject, already-mapped type wins)
- [ ] Extend `tests/bridge-intake-schema.test.js` — array preserved; export joins
- [ ] Extend `tests/bridge-export.test.js` — sample row with **array** indicators → CSV contains joined string
- [ ] Extend `tests/bridge-engine.test.js` — unmapped category CSV: type set; FN label; group `matchedIndicators.length > 0` for strong vegetation rows
- [ ] Optional: `lib/bridge-category-promote.js` module file created with failing tests first (TDD)

*(No new test framework install.)*

---

## Sources

### Primary (HIGH confidence)

- `.planning/debug/filter-singleton-no-category.md` — root cause diagnosis (unmapped category; indicators stringified)
- `lib/bridge-intake-schema.js` — `buildNormalizedRow` join L235–238; aliases; `toExportRow`; `mapRawRow`
- `lib/bridge-engine/normalizer.js` — notes-only raw dump L58–67; no type promotion
- `lib/bridge-review-groups.js` — Array-only indicator union L100; label fallback L81–92
- `lib/bridge-distress-tagger.js` — array indicators; raw search text
- `lib/bridge-export.js` — export via `toExportRow`
- `lib/bridge-brain-apply.js` — dual-shape `clearMatchedIndicators`
- `.planning/REQUIREMENTS.md` — MAP-01–03, SHAPE-01–02
- `.planning/phases/48-category-promotion-signal-shape/48-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- `public/js/bridge.js` client `rowsToCsv` Array→comma string coercion risk
- Header heuristic token list (discretion) — validated against diagnosis `Vio Cat` case, not full multi-city corpus

### Tertiary (LOW confidence)

- Exact max cell length (120) and timestamp regex edge cases — tune if fixtures fail

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new deps; clear module anchors in-repo
- Architecture: **HIGH** — loss/stringify sites line-verified; pure helper + normalizer pattern matches v1.6
- Pitfalls: **HIGH** — export join, invent-type, FN skip, water, scope creep into grouping all evidenced

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (stable domain; re-check if intake schema refactored)
