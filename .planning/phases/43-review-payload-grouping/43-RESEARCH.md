# Phase 43: Review payload + grouping - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Bridge process response — false-negative row pool, type-stacked review groups, stable rowIds  
**Confidence:** HIGH

## Summary

Phase 43 extends the Filter **process response** so admins (and later decision APIs) receive a **reviewable false-negative pool** and **stacked violation-type groups**, not only thin discard previews. Today `filterDistressOnly` already keeps full row objects on `removed[].row`, but the engine throws them away via `mapDistressDiscards` → `{ reason, rawPreview }`. Phase 43 must surface those full rows as `notDistressedRows`, assign stable `rowId`s, and build `reviewGroups` for both kept and FN sets.

This phase is **API/payload only** — no admin UI, no decision writes. It **depends on Phase 42** so brain apply runs before the keep/drop split (promote can shrink FN pool; suppress can grow it). Grouping must use the **same `violationTypeKey` normalization** as brain type rules so Phase 45 decisions hit the same keys.

**Primary recommendation:** Add pure `lib/bridge-review-groups.js` (`assignRowIds`, `buildReviewGroups`, `groupIdFor`); wire in `processUpload` after brain + `filterDistressOnly`; return `notDistressedRows` + `reviewGroups` (+ cap/truncated flags); keep non-review discards thin in `discarded` only.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Group by normalized city Violation/Issue Type (stack identical types)
- Empty type → group by exact description
- Cap FN rows (e.g. 5000) with truncated flag
- Non-review discards (dedupe, bad address) stay in discarded only
- Depends on phase 42 brain already applied before split

### Claude's Discretion

- groupId hashing scheme
- Exact ReviewGroup field names consistent with later DEC/TRAIN phases

### Deferred Ideas (OUT OF SCOPE)

Admin UX (44), decisions (45)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REV-01 | Admin can access full not-distressed row payloads after process (false-negative pool), not only discard previews | Extract full rows from `filterDistressOnly(...).removed[].row` into `notDistressedRows`; do not strip to `rawPreview` |
| REV-02 | System groups review rows by normalized city Violation/Issue Type (stack identical types; empty type uses description) | `buildReviewGroups` + shared `violationTypeKey`; empty type → exact `descriptionNotes` sub-key |
| REV-03 | Each review group exposes matched distress signals and description samples that triggered (or failed) the flag | `matchedIndicators` union + `descriptionSamples` (≤5 distinct) on each `ReviewGroup` |
| REV-04 | Each process row has a stable rowId for decision targeting | `assignRowIds` on kept + FN before grouping; `group.rowIds[]` references them |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node `crypto` | built-in | Deterministic `groupId` / short hash for `rowId` | Already used in `bridge-list-store.js`; no new deps |
| `lib/bridge-review-groups.js` | **create** | Pure rowId + grouping | Unit-testable; design §4.3 contract |
| `lib/bridge-engine/index.js` | existing | Wire FN split, ids, groups into `processUpload` response | Single process path |
| `lib/bridge-distress-tagger.js` | existing | `filterDistressOnly` already returns full `removed[].row` | Do not re-implement keep/drop |
| `lib/bridge-brain-store.js` | Phase 42 | Export/reuse `violationTypeKey` | Same keys as type rules (DEC-03/04) |
| `lib/bridge-brain-apply.js` | Phase 42 | Applied **before** distress split | Locked dependency |
| `node:test` + `node:assert/strict` | built-in | Unit/integration tests | Project standard (`npm test`) |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/bridge-intake-schema.js` | Normalized row field names (`violationIssueType`, `descriptionNotes`, …) | Group samples + full FN shape |
| Design spec §4.3 | Canonical response / `ReviewGroup` shape | Field names for DEC/TRAIN consistency |
| `tests/fixtures/bridge/code-violations-varied.csv` | Weeds + trash kept, fence permit FN | Engine integration assertions |
| `public/js/bridge.js` | Consumes process JSON as `lastResult` | **Do not change in 43** — new fields ignored until 44 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `bridge-review-groups.js` | Inline grouping in engine | Engine already dense; pure module matches phase-42 pattern + easy unit tests |
| Full FN rows only in `discarded` with richer shape | Keep one array | Breaks design contract; pollutes non-review discards; harder train UX |
| Random UUID `rowId` | Content hash + index | Random is fine within one response; **prefer deterministic hash+index** so rebuilds/tests are stable |
| Server processToken draft store | Client holds full arrays | Phase 45 plans stateless decisions; no draft store in 43 |
| Cap at 500 groups only | Cap rows at 5000 | Locked: cap **FN rows**; group pagination is phase 47 UX |

**Installation:** none — no new npm packages.

```bash
# verify
node --test tests/bridge-review-groups.test.js
npm test
```

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-review-groups.js      # CREATE — assignRowIds, buildReviewGroups, groupIdFor, MAX_FN_REVIEW_ROWS
├── bridge-brain-store.js        # Phase 42 — reuse violationTypeKey
├── bridge-brain-apply.js        # Phase 42 — already applied before split
├── bridge-distress-tagger.js    # REUSE filterDistressOnly (removed[].row)
└── bridge-engine/
    └── index.js                 # MODIFY — FN payload, ids, groups, stats/discarded split

tests/
├── bridge-review-groups.test.js # CREATE — grouping matrix
└── bridge-engine.test.js        # EXTEND — process response contract
```

### Pattern 1: Pipeline stage order (locked)

```
parse → normalize/tagRow → dedupe → import-filter
  → loadBrain + applyBrainToRows          # Phase 42
  → filterDistressOnly                    # kept vs FN
  → assignRowIds(kept) + assignRowIds(FN)
  → cap FN (5000) + truncated flag
  → buildReviewGroups both sections
  → response
```

**Do not** build groups before brain apply — promote/suppress change which section a type lands in.

### Pattern 2: Response contract (lock field names — discretion resolved)

Align with design spec §4.3 so Phases 44–45 need no rename:

```js
// processUpload success body (additions)
{
  // existing
  ok: true,
  rows: KeptRow[],              // each has rowId
  discarded: DiscardSummary[],  // NON-review only: bad address, dedupe, already_imported, blank, …
  stats: ProcessingStats,       // stats.noDistress = pre-cap FN count

  // NEW (REV-01..04)
  notDistressedRows: Row[],     // full normalized rows; capped
  reviewGroups: {
    distressed: ReviewGroup[],
    notDistressed: ReviewGroup[]
  },
  // brainMeta may already exist from 42; extend:
  brainMeta: {
    // …phase 42 fields…
    notDistressedTruncated: boolean,
    notDistressedTotal: number,   // pre-cap count
    notDistressedReturned: number // post-cap length
  }
}
```

**Recommended `ReviewGroup` fields (lock for TRAIN/DEC):**

```js
{
  groupId: string,                 // deterministic hash
  section: 'distressed' | 'not_distressed',
  violationTypeLabel: string,      // display: first non-empty type label, or description for empty-type groups
  violationTypeKey: string,        // normalized; '__unknown__' when type empty
  descriptionKey: string | null,   // set only when type empty (exact descriptionNotes trim); else null
  count: number,
  rowIds: string[],
  sampleAddresses: string[],       // up to 5
  matchedIndicators: string[],     // union of row.matchedIndicators
  descriptionSamples: string[],    // up to 5 distinct non-empty
  confidenceLevels: string[],      // unique levels present
  isSingleton: boolean             // count === 1
}
```

### Pattern 3: Grouping rules (locked product)

| Case | Group key | Behavior |
|------|-----------|----------|
| Non-empty `violationIssueType` | `violationTypeKey(type)` | **One group per type** even if descriptions differ (stack N rows) |
| Empty / whitespace type | `violationTypeKey('')` → `__unknown__` **plus** exact `descriptionNotes` trim | Separate groups per distinct description |
| Empty type + empty description | `__unknown__` + empty desc key | Single bucket; usually singleton |
| Water shut-off | All rows are kept | `notDistressedRows = []`; still group kept by type for future train chrome |

```js
// Source: design spec §4.2 + CONTEXT empty-type rule
function violationTypeKey(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return key || '__unknown__';
}
```

**Import `violationTypeKey` from `bridge-brain-store` (phase 42).** If phase 42 put it only on apply module, re-export from store or a single shared export — **one implementation only**.

### Pattern 4: groupId hashing (discretion — recommended)

Deterministic, short, collision-resistant enough for process-scoped ids:

```js
const crypto = require('crypto');

function groupIdFor(section, typeKey, descriptionKey = null) {
  const parts = [section, typeKey];
  if (typeKey === '__unknown__' || descriptionKey != null) {
    parts.push(String(descriptionKey ?? ''));
  }
  const digest = crypto
    .createHash('sha1')
    .update(parts.join('\u0001'))
    .digest('hex')
    .slice(0, 12);
  return `g_${digest}`;
}
```

- Prefix `g_` distinguishes from `rowId` (`r_…`) and type-rule ids (`tr_…`).
- Include `descriptionKey` **only** for empty-type groups (or always pass `null` for typed groups) so typed stacks stay one id per type+section.

### Pattern 5: rowId assignment (REV-04)

```js
function shortHash(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.join('\u0001'))
    .digest('hex')
    .slice(0, 8);
}

function assignRowIds(rows, { prefix = 'r' } = {}) {
  return (rows || []).map((row, index) => {
    if (row.rowId) return row; // idempotent
    const h = shortHash([
      row.streetAddress || '',
      row.violationIssueType || '',
      row.violationDate || '',
      row.descriptionNotes || '',
      String(index)
    ]);
    return { ...row, rowId: `${prefix}_${index}_${h}` };
  });
}
```

- **Stable within one process response** (required for decisions).
- Index in the id guarantees uniqueness if content collides.
- Prefer **immutable map** over mutating nested objects shared with lists.
- Assign **after** distress split, **before** grouping, on both arrays (use same helper; optional prefix `rk` / `rn` not required if global uniqueness holds).

### Pattern 6: Discarded vs FN split (locked)

| Source | Destination | Shape |
|--------|-------------|-------|
| normalize (no address, blank, non-property) | `discarded` | thin `{ reason, rawPreview }` |
| dedupe | `discarded` | thin + optional `duplicateOf` |
| already imported | `discarded` | thin |
| `filterDistressOnly` removed (`no_distress_signal`) | **`notDistressedRows` only** | **full row** + `rowId` |
| kept strong (or water) | `rows` | full row + `rowId` |

**Do not** put full FN rows into `discarded`.  
**Do not** put dedupe/import failures into `notDistressedRows`.

`mapDistressDiscards` can remain for legacy thin previews **or** stop feeding FN into `allDiscarded`. Prefer:

```js
const allDiscarded = [
  ...normalized.discarded,
  ...dedupDiscards,
  ...importDiscards
  // intentionally omit distress FN thin previews
];
const notDistressedRows = distressFiltered.removed.map((item) => item.row);
```

Stats:

```js
stats.noDistress = notDistressedTotal; // pre-cap
stats.discarded = allDiscarded.length; // non-review only after change
// OR keep stats.discarded including noDistress for KPI continuity —
// recommend: stats.discarded = nonReviewDiscarded.length + notDistressedTotal
// so existing KPI "Discarded (other)" math in bridge.js still makes sense
```

**KPI continuity note:** `bridge.js` computes  
`discarded - noDistress` for “Discarded (other)”. Preserve `stats.noDistress` and keep `stats.discarded` as **total removed from kept path** (non-review + FN) so UI KPIs stay correct without client changes.

### Pattern 7: FN cap

```js
const MAX_FN_REVIEW_ROWS = 5000;

const notDistressedTotal = fullFnRows.length;
const notDistressedTruncated = notDistressedTotal > MAX_FN_REVIEW_ROWS;
const notDistressedRows = notDistressedTruncated
  ? fullFnRows.slice(0, MAX_FN_REVIEW_ROWS)
  : fullFnRows;
// Build notDistressed review groups FROM capped array (only returned rows)
// Report totals in brainMeta / processingMeta
```

### Pattern 8: Zero-kept but FN present (important product seam)

**Current behavior:** `!finalKept.length` → throw `NO_USABLE_ROWS` (API 422) with only thin `discarded` + stats.  
**Problem:** All-generic city files never return a process body → Phase 44 cannot open Train brain on pure FN pools.

**Recommendation (implement in phase 43):**

- If `notDistressedRows.length > 0` (pre- or post-cap) **and** `uploadType === 'code_violation'`, return **200** with `rows: []`, full FN payload, groups, stats — do **not** throw.
- Throw `NO_USABLE_ROWS` only when **both** kept and FN pools are empty (everything was bad address / dedupe / already imported).
- Water: keep current behavior (zero kept after other filters still 422 if nothing left).

Update `NO_USABLE_ROWS` client path later in 44 if needed; for 43, engine + tests own the contract.

### Pattern 9: Client consumption today (`public/js/bridge.js`)

```js
// processUpload → renderResults(data)
lastResult = data;
const rows = data.rows || [];
// save/export/attach use lastResult.rows only
// KPIs use stats.kept / stats.noDistress / stats.discarded
// NEW fields ignored until phase 44 — safe additive response
```

**Do not modify bridge.js in phase 43** (CONTEXT: no admin UI).

### Anti-Patterns to Avoid

- **Thin FN previews only** — fails REV-01; train cannot show addresses/descriptions.
- **Grouping by raw type string** — case/spacing splits identical city types; breaks DEC type rules.
- **Mixing empty-type rows into one `__unknown__` without description split** — violates locked empty-type rule.
- **Putting dedupe/import into FN pool** — cannot “approve promote” a non-property discard.
- **Building groups before brain apply** — wrong section membership.
- **Uncapped 50k FN JSON** — memory/latency; locked 5000 + truncated.
- **Admin UI / decision endpoints** — phases 44–45.
- **Sharing Analyzer learned-brain** — forbidden (D10 / product).
- **Treating historical `docs/gsd/plans/2026-07-09-phase-43-*.md` as authority** — reference only; GSD phase plans under `.planning/phases/` win.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keep vs drop distress | Custom second filter | `filterDistressOnly` | Already correct; exposes full `removed[].row` |
| Type normalization | Ad-hoc lowercasing | Shared `violationTypeKey` | Must match brain type rules |
| Group id uniqueness | UUID per call without content | Deterministic `groupIdFor` hash | Stable rebuilds + tests |
| FN persistence | New DB / processToken store | Response fields only | Stateless until 45 |
| Admin auth for payload | Gate process response | Open on process; gate writes in 45 | All users process; only admin trains later |
| Sample extraction | ML summarization | First N unique strings | Deterministic, cheap |

**Key insight:** Phase 43 is a **pure reshape** of data the pipeline already has after tag + brain + distress split. Complexity belongs in a small pure module + careful discard accounting — not new infrastructure.

## Common Pitfalls

### Pitfall 1: Losing full FN rows at mapDistressDiscards
**What goes wrong:** Response only has `rawPreview` addresses.  
**Why it happens:** Current `mapDistressDiscards` strips `item.row`.  
**How to avoid:** Map `removed` → full rows **before** any thin discard mapping; omit FN from thin-only path.  
**Warning signs:** `notDistressedRows[0]` missing `violationIssueType` / `descriptionNotes`.

### Pitfall 2: Groups built without shared violationTypeKey
**What goes wrong:** “High Grass” vs “high grass” become two groups; later suppress_type misses half.  
**Why it happens:** Local normalize differs from brain store.  
**How to avoid:** Single import of `violationTypeKey`.  
**Warning signs:** Group count > distinct types when case differs.

### Pitfall 3: Empty type collapsed incorrectly
**What goes wrong:** Free-text-only rows stack into one false mega-group.  
**Why it happens:** Only keying on `__unknown__`.  
**How to avoid:** Empty type → group by exact trimmed description.  
**Warning signs:** `isSingleton` false for unrelated free-text rows.

### Pitfall 4: Cap after grouping without truncated flag
**What goes wrong:** Silent data loss; admin thinks file fully reviewed.  
**Why it happens:** Slice without metadata.  
**How to avoid:** Set `brainMeta.notDistressedTruncated` + totals.  
**Warning signs:** `notDistressedTotal > 5000` but flag false.

### Pitfall 5: Zero-kept 422 hides FN pool
**What goes wrong:** Pure FN uploads never return review payload.  
**Why it happens:** Legacy `NO_USABLE_ROWS` gate.  
**How to avoid:** Success when FN pool non-empty (Pattern 8).  
**Warning signs:** Integration test with all-standard CSV gets 422 and empty body.

### Pitfall 6: Phase 42 not applied yet / wrong order
**What goes wrong:** FN set ignores promote/suppress; groups disagree with next process.  
**Why it happens:** Phase 43 coded against pre-brain engine.  
**How to avoid:** Explicit dependency; wire after `applyBrainToRows`.  
**Warning signs:** Engine missing `loadBrain` call in process path.

### Pitfall 7: Mutating rows that later get saved
**What goes wrong:** Saved lists pick up internal grouping fields accidentally.  
**Why it happens:** In-place mutation + accidental extra props.  
**How to avoid:** Prefer `{ ...row, rowId }`; only add `rowId` (and existing brain annotations from 42).  
**Warning signs:** Export columns include unexpected keys (rowId is OK to ignore in EXPORT_COLUMNS until product wants it).

### Pitfall 8: matchedIndicators missing on FN groups
**What goes wrong:** REV-03 incomplete for “failed the flag” narrative.  
**Why it happens:** Assuming FN always empty indicators — usually true for base regex, but brain-suppressed rows may still carry history.  
**How to avoid:** Always union whatever is on rows; empty array is valid (UI shows “No signal text” in 44).  
**Warning signs:** Distressed groups have chips; not-distressed groups omit field entirely.

### Pitfall 9: Water FN pollution
**What goes wrong:** Water rows appear as not-distressed.  
**Why it happens:** Mis-applying code_violation filter to water.  
**How to avoid:** Keep `filterDistressOnly` water pass-through; assert empty FN for water fixture.  
**Warning signs:** Water process returns `notDistressedRows.length > 0`.

## Code Examples

### Extract FN full rows (engine sketch)

```js
// lib/bridge-engine/index.js — after import-filter + brain apply
const { filterDistressOnly } = require('../bridge-distress-tagger');
const {
  assignRowIds,
  buildReviewGroups,
  MAX_FN_REVIEW_ROWS
} = require('../bridge-review-groups');

// brainApplied.rows from phase 42
const distressFiltered = filterDistressOnly(brainApplied.rows, uploadType);

const kept = assignRowIds(distressFiltered.rows);
const fnAll = assignRowIds(
  distressFiltered.removed.map((item) => item.row).filter(Boolean)
);

const notDistressedTotal = fnAll.length;
const notDistressedTruncated = notDistressedTotal > MAX_FN_REVIEW_ROWS;
const notDistressedRows = notDistressedTruncated
  ? fnAll.slice(0, MAX_FN_REVIEW_ROWS)
  : fnAll;

const reviewGroups = {
  distressed: buildReviewGroups(kept, 'distressed'),
  notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
};

// Success if kept OR (code_violation FN pool non-empty)
if (!kept.length && !fnAll.length) {
  // throw NO_USABLE_ROWS with non-review discarded only
}
```

### buildReviewGroups core

```js
// lib/bridge-review-groups.js
function buildReviewGroups(rows, section) {
  const map = new Map();

  for (const row of rows || []) {
    const typeLabel = String(row.violationIssueType || '').trim();
    const typeKey = violationTypeKey(typeLabel);
    const desc = String(row.descriptionNotes || '').trim();
    const descriptionKey = typeKey === '__unknown__' ? desc : null;
    const mapKey = descriptionKey == null
      ? `${section}|${typeKey}`
      : `${section}|${typeKey}|${descriptionKey}`;

    let g = map.get(mapKey);
    if (!g) {
      g = {
        groupId: groupIdFor(section, typeKey, descriptionKey),
        section,
        violationTypeLabel: typeLabel || desc || '(no type)',
        violationTypeKey: typeKey,
        descriptionKey,
        count: 0,
        rowIds: [],
        sampleAddresses: [],
        matchedIndicators: [],
        descriptionSamples: [],
        confidenceLevels: [],
        _indicatorSet: new Set(),
        _descSet: new Set(),
        _confSet: new Set()
      };
      map.set(mapKey, g);
    }

    g.count += 1;
    if (row.rowId) g.rowIds.push(row.rowId);
    if (g.sampleAddresses.length < 5 && row.streetAddress) {
      g.sampleAddresses.push(row.streetAddress);
    }
    for (const ind of row.matchedIndicators || []) {
      if (!g._indicatorSet.has(ind)) {
        g._indicatorSet.add(ind);
        g.matchedIndicators.push(ind);
      }
    }
    if (desc && !g._descSet.has(desc) && g.descriptionSamples.length < 5) {
      g._descSet.add(desc);
      g.descriptionSamples.push(desc);
    }
    const conf = row.confidenceLevel;
    if (conf && !g._confSet.has(conf)) {
      g._confSet.add(conf);
      g.confidenceLevels.push(conf);
    }
  }

  return [...map.values()]
    .map(({ _indicatorSet, _descSet, _confSet, ...pub }) => ({
      ...pub,
      isSingleton: pub.count === 1
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.violationTypeLabel.localeCompare(b.violationTypeLabel);
    });
}
```

### Fixture expectation (code-violations-varied.csv)

| Address | Type | Expected section |
|---------|------|------------------|
| 123 Main St | Overgrown weeds | distressed (strong) |
| 456 Oak Ave | Accumulation of trash | distressed (strong) |
| (empty) | Parking lot… | discarded (no address) — **not** FN |
| 901 Pine Dr | Fence permit | not_distressed FN |

→ `reviewGroups.distressed.length >= 2` (or 1 if types collapse — they differ)  
→ `notDistressedRows` includes fence permit with full fields  
→ empty City Hall row **not** in FN pool

## Exact Files to Create / Modify

| Action | Path | Why |
|--------|------|-----|
| **Create** | `lib/bridge-review-groups.js` | REV-02..04 pure logic + `MAX_FN_REVIEW_ROWS` |
| **Create** | `tests/bridge-review-groups.test.js` | Grouping matrix unit tests |
| **Modify** | `lib/bridge-engine/index.js` | FN extract, ids, groups, zero-kept policy, response fields |
| **Modify** | `tests/bridge-engine.test.js` | Assert `notDistressedRows`, `rowId`, `reviewGroups` on fixture |
| **Optional** | `lib/bridge-api.js` | Pass-through already `sendJson(res, 200, payload)` — only change if 422 path should include FN (prefer engine 200 instead) |
| **Optional** | `lib/bridge-distress-tagger.js` | No change required if `removed[].row` kept; optional helper `splitDistressRows` not needed |
| **Do not modify** | `public/js/bridge.js` / `bridge.html` | Phase 44 |
| **Do not create** | brain decision routes | Phase 45 |
| **Depends on** | Phase 42 brain modules wired in engine | Apply before split |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FN hard-dropped to thin `discarded` | Full `notDistressedRows` + groups | Phase 43 | Admin can train false negatives |
| No stable row identity | `rowId` on every process row | Phase 43 | Decision targeting (45) |
| Type stacking only mental model | Server `reviewGroups` | Phase 43 | UI cards in 44 are pure render |
| Base regex only | Brain apply then split | Phase 42→43 | Groups reflect learned rules |

**Deprecated/outdated:**
- Hand plan `docs/gsd/plans/2026-07-09-phase-43-filter-review-groups.md` — **reference only** for task sketch; GSD `.planning/phases/43-*` is authority.
- Architecture map line that still ends process at `filterDistressOnly → stats` without FN — update when implementing.

## Open Questions

1. **Zero-kept success vs 422 with FN details?**
   - What we know: Current API 422 omits full FN rows; train UX needs them.
   - What's unclear: Whether product wants empty kept list UI vs error banner.
   - **Recommendation:** 200 with `rows: []` + FN payload when FN exists (Pattern 8). Document in plan success criteria.

2. **Where to hang truncated flags — `brainMeta` vs `processingMeta`?**
   - Design puts brain-ish meta under `brainMeta`; truncation is process payload concern.
   - **Recommendation:** Put `notDistressedTruncated/Total/Returned` on `brainMeta` if phase 42 already returns that object; else `processingMeta` is fine — pick one and use consistently in 44.

3. **Include `rowId` in saved lists / export?**
   - What we know: Save posts `lastResult.rows` as-is; EXPORT_COLUMNS omit rowId.
   - **Recommendation:** Allow rowId to ride on saved JSON (harmless); do not add to CSV export in 43.

4. **Sort order of rowIds within a group?**
   - **Recommendation:** Encounter order (stable with input order after assign).

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-review-groups.test.js` |
| Full suite command | `npm test` |
| Live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` (if server touched; engine-only usually N/A) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REV-01 | processUpload returns full FN row fields (address, type, description, tag) | integration | `node --test tests/bridge-engine.test.js` | ❌ Wave 0 extend |
| REV-01 | FN pool excludes no-address / dedupe discards | integration | `node --test tests/bridge-engine.test.js` | ❌ Wave 0 extend |
| REV-01 | Cap at 5000 sets truncated flag; length ≤ 5000 | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-02 | 20 rows same type → 1 group count 20 | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-02 | 2 types → 2 groups | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-02 | Empty type different descriptions → separate groups | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-02 | Case/spacing type labels stack via violationTypeKey | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-03 | matchedIndicators union on distressed group | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-03 | descriptionSamples unique max 5 | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| REV-04 | Every kept + FN row has unique rowId | integration | `node --test tests/bridge-engine.test.js` | ❌ Wave 0 extend |
| REV-04 | group.rowIds ⊆ section rows' rowIds | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 |
| Edge | Water: notDistressedRows empty; all kept have rowId | integration | `node --test tests/bridge-engine.test.js` | ❌ Wave 0 extend |
| Edge | Zero kept + FN → ok success (not 422) if Pattern 8 adopted | integration | `node --test tests/bridge-engine.test.js` | ❌ Wave 0 |
| Regression | Existing process fixture counts still green | suite | `npm test` | ✅ existing |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-review-groups.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-review-groups.test.js` — covers REV-02, REV-03, REV-04 unit matrix + cap helper if tested pure
- [ ] Extend `tests/bridge-engine.test.js` — REV-01 process contract + water + optional all-FN success
- [ ] Framework install: none — already `node:test`
- [ ] Phase 42 modules must exist/wire first (`bridge-brain-store`, `bridge-brain-apply`) — prerequisite gap if 42 incomplete

*(No pre-existing review-group tests — Wave 0 is the new pure module tests + engine assertions.)*

## Sources

### Primary (HIGH confidence)

- `.planning/phases/43-review-payload-grouping/43-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — REV-01..04
- `.planning/ROADMAP.md` — Phase 43 success criteria
- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` §4.2–4.3 — response + ReviewGroup schema
- `lib/bridge-distress-tagger.js` — `filterDistressOnly` full `removed[].row`
- `lib/bridge-engine/index.js` — current process/discard mapping
- `lib/bridge-api.js` — process JSON pass-through / 422 path
- `public/js/bridge.js` — `lastResult` consumption (additive-safe)
- `.planning/phases/42-brain-store-runtime-apply/42-RESEARCH.md` — apply-before-split, `violationTypeKey`
- `.planning/codebase/ARCHITECTURE.md` — pipeline stages
- `tests/fixtures/bridge/code-violations-varied.csv` — FN + kept fixture

### Secondary (MEDIUM confidence)

- `docs/gsd/plans/2026-07-09-phase-43-filter-review-groups.md` — historical task sketch (reference only)
- `docs/gsd/plans/2026-07-09-phase-45-filter-brain-decisions.md` — downstream field consumers (`groupId`, `rowIds`)
- `docs/gsd/milestones/M7-filter-superpower-brain.md` — milestone constraints

### Tertiary (LOW confidence)

- None material — domain is fully in-repo; no external library research required.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — pure Node crypto + existing engine; zero new deps
- Architecture: **HIGH** — design §4.3 + CONTEXT + live `filterDistressOnly` agree
- Pitfalls: **HIGH** — current thin-discard path and zero-kept 422 are verified in source

**Research date:** 2026-07-09  
**Valid until:** 2026-08-08 (stable in-repo domain; re-check if processUpload stage order or response schema changes)

---

## RESEARCH COMPLETE

**Phase:** 43 - review-payload-grouping  
**Confidence:** HIGH

### Key Findings

- `filterDistressOnly` already retains full rows on `removed[].row`; engine currently strips them via `mapDistressDiscards` — fix is extract, not re-parse.
- Ship pure `lib/bridge-review-groups.js` with design §4.3 `ReviewGroup` fields; reuse phase-42 `violationTypeKey`; empty type → exact description groups.
- Cap FN at **5000** with truncated + total metadata; non-review discards stay thin in `discarded` only.
- Prefer **200 OK with empty `rows`** when FN pool non-empty so pure-generic files are still reviewable (else REV-01 fails for all-FN uploads).
- No UI changes; additive JSON is safe for `bridge.js` until phase 44.

### File Created

`.planning/phases/43-review-payload-grouping/43-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Built-in crypto + existing modules; no third-party APIs |
| Architecture | HIGH | Design contract + live pipeline code aligned |
| Pitfalls | HIGH | Thin discard loss + 422 zero-kept verified in source |

### Open Questions

- Zero-kept → 200 vs 422 (recommend 200 when FN exists).
- Truncation flags on `brainMeta` vs `processingMeta` (prefer `brainMeta` if 42 already has it).

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
