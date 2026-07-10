# Architecture Research

**Domain:** Distress OS Filter (Data Bridge) — Type Column Intelligence (v1.8)
**Researched:** 2026-07-09
**Confidence:** HIGH (integration points verified in current `lib/` pipeline; scoring heuristics MEDIUM until unit matrix)

## Standard Architecture

### System Overview

v1.8 extends the existing in-process Filter pipeline. It does **not** introduce multi-tenant auth, ML services, or a new product surface. Three concerns plug into known seams:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UI  public/js/bridge.js + bridge-train.js                               │
│  · process upload · Type-column confirm modal · Train shortLabel display │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ POST /api/bridge/process
                                │ POST /api/bridge/process/confirm  (new)
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  API  lib/bridge-api.js                                                  │
│  handleProcess / handleProcessConfirm                                    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Engine  lib/bridge-engine/index.js  processUpload                       │
│                                                                          │
│  parse → [TYPE RESOLVE + CONFIRM GATE] → normalize → dedupe → import    │
│       → brain apply → distress filter → assignRowIds → review groups     │
└───┬──────────────┬──────────────────────────────┬────────────────────────┘
    │              │                              │
    ▼              ▼                              ▼
┌─────────┐  ┌──────────────┐              ┌────────────────────┐
│ Scorer  │  │ City format  │              │ Short label        │
│ (pure)  │  │ memory store │              │ (display-only)     │
│ NEW     │  │ NEW          │              │ NEW helper         │
└─────────┘  └──────────────┘              └────────────────────┘
     │              │                              │
     │              │                              ▼
     │              │                    buildReviewGroups
     │              │                    + Train UI title
     ▼              ▼
 enhanceColumnMap / resolveTypeColumn
 → columnMap.violationIssueType = single winner
 → mapRawRow / promoteCategoryFromRaw (fallback only)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Type column scorer | Rank columns by header aliases + value-shape samples; pick **one** winner | New pure module `lib/bridge-type-column-score.js` |
| Column map resolver | Merge alias map + scorer + confirmed override into `columnMap` | Extend `enhanceColumnMap` / thin orchestrator in normalizer; **do not** grow `detectIntakeColumnMap` into a scorer |
| City format store | Persist per-city fingerprint + last confirmed Type header | New `lib/bridge-city-format-store.js` (file JSON, volume-safe) |
| Confirm gate | Pause process when city is new or format changed; resume with chosen header | Early return from `processUpload` + API + UI modal |
| Short label | Display truncation for Train/group titles; never mutates stored type | Pure `lib/bridge-short-label.js` + field on review groups |
| Promote (existing) | Fill empty type from unmapped category-like headers | Keep `lib/bridge-category-promote.js` as **fallback only** when no Type column mapped |
| Review groups (existing) | Group by stable type key; expose labels for Train | Add `shortLabel`; keep full `violationTypeLabel` |

## Recommended Project Structure

```
lib/
├── bridge-type-column-score.js     # NEW pure: scoreColumns(headers, sampleRows) → ranked
├── bridge-city-format-store.js     # NEW: load/save per-city format memory
├── bridge-short-label.js           # NEW pure: shortLabel(fullText) display helper
├── bridge-intake-schema.js         # KEEP: aliases, detectIntakeColumnMap, mapRawRow
├── bridge-category-promote.js      # KEEP: empty-type fallback (unchanged role)
├── bridge-engine/
│   ├── normalizer.js               # MODIFY: resolve Type via scorer/memory before mapRawRow
│   └── index.js                    # MODIFY: confirm gate after parse, before full normalize
├── bridge-api.js                   # MODIFY: process response codes + confirm endpoint
├── bridge-review-groups.js         # MODIFY: attach shortLabel (display-only)
├── bridge-brain-store.js           # UNCHANGED (rules brain ≠ city format memory)
├── config.js                       # MODIFY: BRIDGE_CITY_FORMATS_ROOT (or nest under brain root)
public/js/
├── bridge.js                       # MODIFY: confirm modal flow on process response
└── bridge-train.js                 # MODIFY: prefer shortLabel for card titles
tests/
├── bridge-type-column-score.test.js
├── bridge-city-format-store.test.js
├── bridge-short-label.test.js
└── processUpload / confirm gate e2e locks
```

### Structure Rationale

- **New pure scorer module:** Scoring is value-aware and multi-candidate; stuffing it into `detectIntakeColumnMap` (alias-first / first-match) conflates two algorithms and makes TDD harder. Mirror v1.7 pattern: pure helper (`bridge-category-promote.js`) + thin normalizer wire.
- **Separate city format store:** Not the global brain. Brain is **shared quality rules** (type/phrase suppress/promote). Format memory is **per-city sheet layout** (which header is Type). Mixing them creates version-conflict noise on every confirm and couples Train decisions to upload UX.
- **shortLabel as pure display helper:** Same lesson as SHAPE (v1.7): do not reshape stored distress/export fields for UI convenience.
- **Confirm at engine, not only UI:** Server must refuse full process without confirmation when format is new/changed; client modal is the UX, not the security/consistency boundary.

## Architectural Patterns

### Pattern 1: Pure scorer + thin orchestrator (prefer over bloating detectIntakeColumnMap)

**What:** Keep `detectIntakeColumnMap` for address/date/notes and as a **header-alias signal** for Type. New scorer ranks **all** columns; orchestrator picks single winner.

**When to use:** Any column-detection that needs cell samples, confidence scores, or “best of N” — not exact alias match.

**Trade-offs:**
- Pro: Unit-testable without engine; clear single-winner policy; promote stays fallback
- Con: Two Type signals (alias map + scorer) need an explicit precedence table (below)

**Precedence (locked for v1.8):**

```
1. Confirmed override for this city + matching format fingerprint
2. Scorer top candidate (if score ≥ threshold OR clear margin vs #2)
3. detectIntakeColumnMap.violationIssueType (alias-only)
4. leave empty → promoteCategoryFromRaw may still fill per-row (existing MAP)
5. still empty → keep rows for review (no silent discard)
```

**Example:**

```javascript
// lib/bridge-type-column-score.js (shape)
function scoreTypeColumns(headers, sampleRows, { aliases } = {}) {
  // per header: headerScore(aliases) + valueShapeScore(samples)
  // return [{ header, score, reasons, samples }, ...] sorted desc
}

function pickTypeColumn(ranked, { minScore, minMargin } = {}) {
  // single winner or null — never blend columns
}
```

```javascript
// normalizer resolve (conceptual)
function resolveTypeColumn(headers, sampleRows, { confirmedHeader } = {}) {
  if (confirmedHeader && headers.includes(confirmedHeader)) {
    return { header: confirmedHeader, source: 'city_memory' };
  }
  const ranked = scoreTypeColumns(headers, sampleRows, {
    aliases: INTAKE_FIELD_ALIASES.violationIssueType
  });
  const picked = pickTypeColumn(ranked);
  if (picked) return { header: picked.header, source: 'scorer', ranked };
  const aliasMap = detectIntakeColumnMap(headers);
  if (aliasMap.violationIssueType) {
    return { header: aliasMap.violationIssueType, source: 'alias', ranked };
  }
  return { header: null, source: 'none', ranked };
}
```

### Pattern 2: Confirm gate as early processUpload branch

**What:** After parse (headers + rows available), compute fingerprint + score, consult city memory. If confirm required, **return a structured pause payload** without running tag/brain/distress/groups. Client shows picker; second request continues with locked Type header.

**When to use:** First upload for city, or format fingerprint ≠ last confirmed for that city.

**Trade-offs:**
- Pro: Never builds Train groups from the wrong Type column; cheap pause (parse-only cost)
- Con: Two-step upload UX; need durable or re-upload buffer for the second step

**Recommended resume strategy (opinionated):**

| Option | Verdict |
|--------|---------|
| Re-upload file on confirm | Simple, no server buffer; preferred for v1.8 |
| Server-side temp staging of parse result | Faster UX, more state/TTL/cleanup; defer |

**Resume = same multipart process with extra fields:**
- `confirmedTypeHeader` (required when resuming)
- `formatFingerprint` (echo from pause payload; server re-validates against re-parsed headers)

**Example gate placement:**

```
processUpload({ buffer, filename, city, uploadType, confirmedTypeHeader? })
  │
  ├─ parse → { headers, rows }
  ├─ fingerprint = formatFingerprint(headers, parseMeta)
  ├─ memory = loadCityFormat(city.id, uploadType)
  ├─ ranked = scoreTypeColumns(headers, sample(rows))
  ├─ needConfirm =
  │     !memory
  │  || memory.fingerprint !== fingerprint
  │  || (confirmedTypeHeader provided but not in headers)  // hard error
  │
  ├─ if needConfirm && !confirmedTypeHeader:
  │     return {
  │       ok: false,
  │       code: 'TYPE_COLUMN_CONFIRM_REQUIRED',
  │       city, uploadType, sourceFile,
  │       formatFingerprint: fingerprint,
  │       candidates: ranked.slice(0, N),   // header + score + samples
  │       suggestedHeader: ranked[0]?.header || null,
  │       lastConfirmed: memory || null
  │     }
  │     // API maps to HTTP 409 (or 200 with gate flag — prefer 409 so clients
  │     // cannot treat as finished process)
  │
  ├─ typeHeader = confirmedTypeHeader
  │     || (memory.fingerprint === fingerprint && memory.typeHeader)
  │     || pickTypeColumn(ranked)?.header
  │     || detectIntakeColumnMap(headers).violationIssueType
  │
  ├─ if confirmedTypeHeader: saveCityFormat({ cityId, fingerprint, typeHeader, … })
  │
  └─ normalizeRawRows(..., { typeColumnOverride: typeHeader })
       → mapRawRow → promote (only if still empty) → tag → …
```

**Where the gate sits relative to existing stages:**

| Stage | Runs before confirm? | Runs after confirm / reuse? |
|-------|----------------------|-----------------------------|
| Parse | Yes | Yes |
| Type score + fingerprint | Yes | Yes |
| Full `normalizeRawRows` / promote / tag | **No** | Yes |
| Dedupe / import index / brain / distress | **No** | Yes |
| `buildReviewGroups` | **No** | Yes |

This is the critical integration answer: **gate after parse + score, before normalize**. Not after full process.

### Pattern 3: Per-city format memory (file store, not brain)

**What:** Durable JSON keyed by `cityId` (+ `uploadType` if water vs code sheets differ).

**When to use:** Every successful confirm; every same-format reuse check.

**Trade-offs:**
- Pro: Survives restarts; volume-safe like brain/lists; no multi-tenant auth needed
- Con: Another file root to gitignore / volume-mount

**Recommended storage shape:**

```
{BRIDGE_CITY_FORMATS_ROOT}/
  index or per-city files:
  {
    "version": 1,
    "cities": {
      "<cityId>": {
        "code_violation": {
          "fingerprint": "sha1…",
          "typeHeader": "Vio Cat",
          "confirmedAt": "ISO",
          "confirmedBy": "admin",
          "sourceFileLast": "…",
          "headerSnapshot": ["Property Address", "Vio Cat", …]
        },
        "water_shut_off": { … }
      }
    }
  }
```

**Config path pattern (mirror brain):**

```javascript
// lib/config.js
BRIDGE_CITY_FORMATS_ROOT: process.env.BRIDGE_CITY_FORMATS_ROOT
  ? path.resolve(process.env.BRIDGE_CITY_FORMATS_ROOT)
  : (process.env.PDA_DATA_ROOT
    ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-city-formats')
    : path.join(ROOT, 'data', 'bridge-city-formats')),
```

**Fingerprint inputs (opinionated):**
- Sorted normalized header list (primary)
- Optional: sheet name / parser kind for multi-sheet Excel
- **Do not** hash all cell values (too brittle); header set = “sheet format”
- Column order change that renames headers → new fingerprint → re-confirm (correct)
- Column order only, same headers → same fingerprint → reuse (acceptable)

**Who can confirm:** Admin-only write (same `requireAdmin` / `X-Phuglee-User === admin` pattern as brain decisions). Non-admin process on new format: still pause; either block with “admin must map Type column once” or allow process with scorer suggestion but **do not persist** memory — product choice: **prefer admin-only persist + pause for all until confirmed** so wrong maps do not silently stick.

### Pattern 4: Display-only short labels

**What:** `shortLabel` derived from full type/description for Train cards and group list chrome. Full `violationIssueType` / `descriptionNotes` / `violationTypeLabel` remain authoritative for distress match, group keys, export, brain rules.

**When to use:** Any UI that shows long ordinance walls of text.

**Trade-offs:**
- Pro: Zero impact on tagging accuracy or export contracts
- Con: Two fields in group payload; UI must pick the right one

**Example:**

```javascript
// lib/bridge-short-label.js
function shortLabel(text, { maxLen = 48 } = {}) {
  const cleaned = stripIncidentalTimestamps(text).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + '…';
}

// bridge-review-groups.js inside buildReviewGroups
g.violationTypeLabel = fullLabel;           // existing — full cleaned
g.shortLabel = shortLabel(fullLabel);       // NEW display-only
// group keys still from stableTypeKey(raw type) — unchanged
```

**UI:**

```
Train card title  → group.shortLabel || group.violationTypeLabel
Expand / tooltip  → group.violationTypeLabel (full)
Export / CSV      → row.violationIssueType (never shortLabel)
Brain type rules  → violationTypeKey(full type) — never shortLabel
```

## Data Flow

### Request Flow — same-format reuse (happy path)

```
User selects city + file
    ↓
POST /api/bridge/process (multipart)
    ↓
parse → fingerprint matches city memory
    ↓
typeHeader = memory.typeHeader
    ↓
normalize with override → tag → brain → distress → groups
    ↓
200 { rows, reviewGroups (w/ shortLabel), processingMeta.columnMap, … }
    ↓
Train UI shows shortLabel titles; full text in details
```

### Request Flow — confirm required (new city or format change)

```
POST /api/bridge/process
    ↓
parse → score → fingerprint mismatch / no memory
    ↓
409 TYPE_COLUMN_CONFIRM_REQUIRED
    { candidates, suggestedHeader, formatFingerprint, lastConfirmed? }
    ↓
UI modal: pick Type column (show samples)
    ↓
POST /api/bridge/process again with confirmedTypeHeader + same file
    (or dedicated /process/confirm that re-runs processUpload with override)
    ↓
saveCityFormat(cityId, fingerprint, typeHeader)
    ↓
full pipeline → 200 process result
```

### Key Data Flows

1. **Type column resolution:** headers + sample rows → scorer → single header → `columnMap.violationIssueType` → `mapRawRow` copies that cell into `violationIssueType` for every row.
2. **Empty after map:** existing `promoteCategoryFromRaw` may still promote from other category-like unmapped headers (v1.7 MAP). Scorer should usually make this rare.
3. **No Type column at all:** leave empty; groups fall into `__unknown__` + description keys (v1.7 GROUP); rows stay for review — **no** `no_distress` discard solely for missing type.
4. **Short labels:** full label → `shortLabel` on group only; rows and export untouched.
5. **Batch multi-file:** each file may have its own headers; fingerprint **per file**. If any file needs confirm, pause that file (or whole batch) before merge. Prefer: confirm once per distinct fingerprint in the batch; reuse within batch after first confirm.

### State Management

```
BRIDGE_CITY_FORMATS_ROOT  (new, durable, volume-safe)
    ↓ load on process
city format memory ──► type override
    ↑ save on admin confirm

BRIDGE_BRAIN_ROOT / global-brain.json  (unchanged)
    ↓ after normalize
type/phrase rules

FILTER_LISTS_ROOT  (unchanged)
    ↓ explicit save
user lists (full type text, no shortLabel required on rows)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Local single-admin (current) | File JSON city-format store + in-process scorer is correct |
| Multi-city dozens of formats | Single index file fine; optional per-city files if index grows |
| Multi-tenant / many admins | Needs real sessions (already out of scope); do **not** invent now |
| Huge sheets (100k rows) | Score on **sample only** (first N non-empty rows, e.g. 50–200), never full scan |

### Scaling Priorities

1. **First bottleneck:** Wrong Type column destroys Train quality — fix detection + confirm before polish.
2. **Second bottleneck:** Re-upload latency on confirm — only optimize with parse staging if UX complains.

## Anti-Patterns

### Anti-Pattern 1: Grow `detectIntakeColumnMap` into the scorer

**What people do:** Add value sampling and ranking inside `detectIntakeColumnMap`.
**Why it's wrong:** Function is pure header alias first-match; callers and tests assume that contract. Value scoring needs samples and ranked output for the confirm UI.
**Do this instead:** New `bridge-type-column-score.js`; orchestrator composes alias map + scorer + memory.

### Anti-Pattern 2: Confirm after full process

**What people do:** Run tag/brain/groups, then ask admin which column was Type.
**Why it's wrong:** Groups and brain keys already wrong; user trains on garbage; reprocess expensive.
**Do this instead:** Gate after parse + score, before `normalizeRawRows`.

### Anti-Pattern 3: Store city format memory inside `global-brain.json`

**What people do:** Add `cityFormats` to the brain document.
**Why it's wrong:** Brain version bumps on every column confirm; Train decision 409s collide with format saves; different product concepts.
**Do this instead:** Separate store under `BRIDGE_CITY_FORMATS_ROOT`.

### Anti-Pattern 4: Replace stored type with shortLabel

**What people do:** Truncate `violationIssueType` for display convenience.
**Why it's wrong:** Breaks distress keyword match, export fidelity, brain type keys, group stability.
**Do this instead:** Parallel `shortLabel` on review groups (and UI-only).

### Anti-Pattern 5: Multi-column blend

**What people do:** Concatenate several candidate columns into type.
**Why it's wrong:** Explicitly forbidden (v1.8 lock); creates noisy keys and false promotes.
**Do this instead:** Single winner; descriptionNotes remains the narrative field.

### Anti-Pattern 6: Silent drop when no Type column

**What people do:** Treat missing type as non-distress / discard.
**Why it's wrong:** Product lock — keep for review.
**Do this instead:** Empty type → existing FN/distressed paths + description grouping.

### Anti-Pattern 7: ML / external column classifier service

**What people do:** Call an API to classify columns.
**Why it's wrong:** Offline-first Filter stack; latency; not required for header+shape heuristics.
**Do this instead:** Deterministic scorer + admin confirm.

## Integration Points

### New vs Modified (explicit)

| Artifact | Action | Notes |
|----------|--------|-------|
| `lib/bridge-type-column-score.js` | **NEW** | Pure scoring + pick |
| `lib/bridge-city-format-store.js` | **NEW** | Load/save/fingerprint helpers |
| `lib/bridge-short-label.js` | **NEW** | Display truncation |
| `lib/config.js` | **MODIFY** | `BRIDGE_CITY_FORMATS_ROOT` |
| `lib/bridge-engine/normalizer.js` | **MODIFY** | Accept type override; call resolver |
| `lib/bridge-engine/index.js` | **MODIFY** | Gate + pass override into normalize |
| `lib/bridge-api.js` | **MODIFY** | Map `TYPE_COLUMN_CONFIRM_REQUIRED`; optional confirm route |
| `lib/bridge-review-groups.js` | **MODIFY** | Attach `shortLabel` |
| `public/js/bridge.js` | **MODIFY** | Confirm modal + re-POST |
| `public/js/bridge-train.js` | **MODIFY** | Title uses `shortLabel` |
| `lib/bridge-intake-schema.js` | **MINIMAL** | May export shared sample helpers; keep `detectIntakeColumnMap` alias-first |
| `lib/bridge-category-promote.js` | **UNCHANGED role** | Fallback only |
| `lib/bridge-brain-*` | **UNCHANGED** | No format memory here |
| Analyzer / Forge | **UNTOUCHED** | Out of milestone |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API ↔ Engine | Direct require; structured error codes | `TYPE_COLUMN_CONFIRM_REQUIRED` like `NO_USABLE_ROWS` |
| Engine ↔ Scorer | Pure function call | No I/O |
| Engine ↔ City format store | Sync file I/O | Atomic write pattern from brain/list store |
| Engine ↔ Review groups | After full process only | shortLabel computed here |
| UI ↔ API | Multipart process + JSON confirm fields | Admin for persist |
| Scorer ↔ Promote | No direct link | Sequential: map first, promote if empty |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Form Forge city list | Existing `loadCitySummaries` | City id keys format memory |
| Analyzer import index | Unchanged after gate | Runs only on full process |
| ML / Gemini | **None** | Explicit non-requirement |

## Suggested Build Order (for roadmap phases ~51+)

Dependencies flow top → bottom. Parallelizable items noted.

1. **COL-Score (pure scorer + tests)**  
   - `bridge-type-column-score.js`  
   - No API/UI yet  
   - Unblocks everything Type-related

2. **COL-Wire into column map (no confirm)**  
   - Resolver in normalizer: scorer winner → `columnMap.violationIssueType`  
   - Keep promote as empty fallback  
   - processUpload contract: wrong-header cases improve without UI  
   - Depends on: (1)

3. **COL-City format memory store**  
   - `bridge-city-format-store.js` + `BRIDGE_CITY_FORMATS_ROOT`  
   - fingerprint + load/save  
   - Depends on: nothing hard (can parallel with 1)

4. **COL-Confirm gate in processUpload + API**  
   - Early return `TYPE_COLUMN_CONFIRM_REQUIRED`  
   - Resume with `confirmedTypeHeader` → save memory  
   - Depends on: (1), (2), (3)

5. **COL-Confirm UI**  
   - Modal in `bridge.js`; re-process with chosen header  
   - Admin-only persist messaging  
   - Depends on: (4)

6. **LBL-Short labels**  
   - `bridge-short-label.js` + review-groups field + Train title  
   - Independent of confirm; can parallel (1)–(4)  
   - Depends on: none of COL critically

7. **TEST-Regression lock**  
   - Wrong-column maps, format reuse, confirm pause, shortLabel display-only  
   - Depends on: (1)–(6)

**Phase ordering rationale:**
- Scorer before gate (gate needs candidates).
- Store before gate (gate needs memory compare).
- Wire-without-confirm ships value early and locks mapping correctness before UX.
- Short labels are orthogonal — schedule anytime after groups exist (already shipped); prefer before final TEST phase.
- Do not start multi-tenant sessions or ML classifiers.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Pipeline integration points | HIGH | Verified in `processUpload` / normalizer / API |
| New module vs extend detectIntakeColumnMap | HIGH | Matches v1.7 pure-helper precedent |
| Confirm gate placement | HIGH | Must be pre-normalize |
| City format storage location | HIGH | Pattern from brain/lists; separate from brain |
| shortLabel data flow | HIGH | Display-only parallel field |
| Scoring heuristics details | MEDIUM | Header+shape weights need unit matrix in phase research |
| Multi-file batch confirm UX | MEDIUM | Spec per distinct fingerprint; implement carefully |
| Admin-only confirm policy | MEDIUM | Aligned with brain admin writes; confirm product copy in REQUIREMENTS |

## Gaps to Address in Phase Research

- Exact score weights / thresholds / sample size N
- HTTP status for gate: **recommend 409** vs soft 200 flag (clients differ)
- Whether non-admin may process with suggested column without persisting memory
- Batch: pause whole batch vs per-file confirm
- Fingerprint: include sheet name or not for multi-sheet workbooks

## Sources

- Current pipeline: `lib/bridge-engine/index.js` `processUpload`
- Column map: `lib/bridge-intake-schema.js` `detectIntakeColumnMap`, `mapRawRow`
- Promote fallback: `lib/bridge-category-promote.js`
- Groups/labels: `lib/bridge-review-groups.js`, `lib/bridge-stable-text.js`
- Brain store pattern (do **not** reuse for formats): `lib/bridge-brain-store.js`, `lib/config.js` `BRIDGE_BRAIN_ROOT`
- Volume-safe list store pattern: `lib/bridge-list-store.js`
- Product locks: `.planning/PROJECT.md` v1.8, `.planning/STATE.md`
- Codebase architecture: `.planning/codebase/ARCHITECTURE.md`
- Prior pure-helper research: `.planning/phases/48-category-promotion-signal-shape/48-RESEARCH.md`

---
*Architecture research for: Type Column Intelligence (v1.8 Filter / Data Bridge)*
*Researched: 2026-07-09*
*Confidence: HIGH on integration; MEDIUM on scoring heuristics*
