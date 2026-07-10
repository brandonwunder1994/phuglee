# Phase 42: Brain store + runtime apply - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Bridge global durable brain (JSON file store) + runtime tag apply in `processUpload`  
**Confidence:** HIGH

## Summary

Phase 42 introduces a **global, file-backed Filter brain** and wires **active** type/phrase rules into every Filter process so tagging can improve for all users. There is **no admin UI, no decisions API, and no grouping** in this phase — only durable storage + pure apply + engine integration. Rules will be seeded by tests (and later by phase 45 writes); empty/missing brain must be a no-op.

The codebase already has the exact patterns to copy: volume-safe path config (`FILTER_LISTS_ROOT` in `lib/config.js`), atomic JSON write (`writeJsonAtomic` in `lib/bridge-list-store.js`), base tagging (`tagRow` in `lib/bridge-distress-tagger.js`), and pipeline orchestration (`processUpload` in `lib/bridge-engine/index.js`). Brain apply belongs **after base `tagRow` (already done in normalizer) and before `filterDistressOnly`**, so promote rules can save false negatives that base regex missed, and suppress rules can demote false positives before the keep/drop split.

**Primary recommendation:** Create `lib/bridge-brain-store.js` + pure `lib/bridge-brain-apply.js`; add `BRIDGE_BRAIN_ROOT` to config; load brain once per `processUpload` and apply to rows after import-filter, before distress filter; never type-suppress water shut-off.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Scope
- Global brain file only (not per-user)
- Filter/Bridge only — do not touch Analyzer learned-brain
- Water shut-off never type-suppressed

#### Storage
- Volume-safe path pattern like `FILTER_LISTS_ROOT` (prefer under PDA_DATA_ROOT / dedicated BRIDGE_BRAIN_ROOT)
- Atomic write (tmp + rename) like `bridge-list-store.js`

#### Apply order
- After base tagRow, before distress filter
- promote type → base/phrase promote → suppress phrase → suppress type (suppress wins on conflict)
- Empty brain = no-op process still works

### Claude's Discretion
- Exact JSON schema field names within brain document
- Whether apply lives in tagger module vs separate bridge-brain-apply.js (prefer separate pure module + wire from engine)

### Deferred Ideas (OUT OF SCOPE)
Admin UI, review groups, decisions API, phrase mining UI — phases 43–47
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BRAIN-01 | System persists a global Filter brain file on a durable volume-safe path (same durability pattern as filter lists) | `BRIDGE_BRAIN_ROOT` + `loadBrain`/`saveBrain` with atomic tmp+rename; default under `PDA_DATA_ROOT/bridge-brain` or `data/bridge-brain` |
| BRAIN-02 | System applies active brain rules on every Filter process so future uploads improve for all users | `applyBrainToRows` called from `processUpload` before `filterDistressOnly`; active `suppress_type` / `promote_type` / active phrase rules only |
| BRAIN-03 | Water shut-off uploads are never type-suppressed by the brain | `applyBrainToRow` early-return / skip type rules when `uploadType === 'water_shut_off'`; keep water default tag |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node `fs` + `path` | built-in | Read/write brain JSON | Same as list store; no new deps |
| `lib/config.js` | existing | Volume-safe path for brain root | Mirrors `FILTER_LISTS_ROOT` / `PDA_DATA_ROOT` pattern |
| `lib/bridge-brain-store.js` | **create** | Global brain load/save/empty | Persistence isolation (BRAIN-01) |
| `lib/bridge-brain-apply.js` | **create** | Pure apply of active rules to rows | Discretion preference; unit-testable without engine |
| `lib/bridge-distress-tagger.js` | existing | Base `tagRow`, `STRONG_DISTRESSED_TAG`, `buildSearchText` | Reuse tags + search text; do not fork regex catalog |
| `lib/bridge-engine/index.js` | existing | Wire apply into `processUpload` | Single process path for all users (BRAIN-02) |
| `node:test` + `node:assert/strict` | built-in | Unit/integration tests | Project standard (`npm test`) |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/bridge-intake-schema.js` `UPLOAD_TYPES` | Default tags (`Standard Code Violation`, water high-value) | Force standard on suppress; know water default |
| `lib/bridge-list-store.js` `writeJsonAtomic` pattern | Atomic durability | Copy into brain store (do not import list-store helpers if private — re-implement small helpers in store) |
| Temp dir + `config.BRIDGE_BRAIN_ROOT` mutation | Test isolation | Mirror `tests/bridge-list-store.test.js` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `bridge-brain-apply.js` | Fold into `bridge-distress-tagger.js` | Context prefers separate pure module; tagger stays base-regex only |
| Shared Analyzer `learned-brain.js` | Filter-native store | **Forbidden** — different domain; product constraint D10 |
| DB / Redis brain | File JSON | Overkill; stack is filesystem-first; volume-safe path matches deploy |
| Apply inside normalizer | Apply in engine after import-filter | Engine keeps stages explicit; avoids loading brain for discarded-at-validate rows only if applied later — either OK; prefer engine after import-filter |

**Installation:** none — no new npm packages.

```bash
# verify only
npm test
node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js
```

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── config.js                      # ADD BRIDGE_BRAIN_ROOT (+ optional BRIDGE_BRAIN_PATH helper usage)
├── bridge-brain-store.js          # CREATE — emptyBrain, loadBrain, saveBrain, brainPath, violationTypeKey
├── bridge-brain-apply.js          # CREATE — applyBrainToRow, applyBrainToRows (pure)
├── bridge-distress-tagger.js      # REUSE exports; optional tiny export tweaks only if needed
├── bridge-list-store.js           # PATTERN ONLY — atomic write
└── bridge-engine/
    ├── index.js                   # MODIFY — load brain + apply before filterDistressOnly
    └── normalizer.js              # leave tagRow as-is (base layer)

data/
└── bridge-brain/                  # runtime default root (gitignore like filter-lists)
    └── global-brain.json

tests/
├── bridge-brain-store.test.js     # CREATE
├── bridge-brain-apply.test.js     # CREATE
└── bridge-engine.test.js          # EXTEND optional: processUpload with seeded brain
```

### Pattern 1: Volume-safe path (copy from FILTER_LISTS_ROOT)

**What:** Prefer explicit env root; else nest under `PDA_DATA_ROOT`; else local `data/…`.  
**When to use:** Any durable Filter artifact that must survive Railway redeploys.  
**Example:**

```js
// Source: lib/config.js (FILTER_LISTS_ROOT pattern)
BRIDGE_BRAIN_ROOT: process.env.BRIDGE_BRAIN_ROOT
  ? path.resolve(process.env.BRIDGE_BRAIN_ROOT)
  : (process.env.PDA_DATA_ROOT
    ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-brain')
    : path.join(ROOT, 'data', 'bridge-brain')),
```

Canonical file: `path.join(config.BRIDGE_BRAIN_ROOT, 'global-brain.json')`.

### Pattern 2: Atomic JSON write

**What:** Write temp file then `renameSync` to final path.  
**When to use:** All brain saves (tests now; decisions later).  
**Example:**

```js
// Source: lib/bridge-list-store.js writeJsonAtomic
function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}
```

### Pattern 3: Soft read with empty fallback

**What:** Missing/corrupt brain → empty document, never throw on process.  
**When to use:** `loadBrain()` on every process.  
**Example:**

```js
// Source: lib/bridge-list-store.js readJson pattern
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('[Bridge brain] Could not read', filePath, err.message);
    return fallback;
  }
}
```

### Pattern 4: Pipeline insert point

**What:** Current stages in `processUpload`:

```
parse → normalizeRawRows (tagRow) → dedupe → import-filter → filterDistressOnly → stats
```

**Insert:**

```
… → import-filter → loadBrain() → applyBrainToRows → filterDistressOnly → stats
```

**Why after import-filter:** Already-imported rows never need brain mutation for keep decisions.  
**Why before filterDistressOnly:** Promote can turn Standard → Strong so rows survive keep filter; suppress can demote Strong → Standard so they drop.

### Pattern 5: Recommended brain document schema (discretion)

Align with design spec §4.1 so phases 45–47 need no rename:

```js
function emptyBrain() {
  return {
    version: 1,
    updatedAt: null,
    typeRules: [],
    phraseRules: [],
    events: [],
    metrics: {
      totalDecisions: 0,
      typeRulesActive: 0,
      phraseRulesActive: 0,
      phraseRulesProposed: 0
    }
  };
}
```

**Type rule (active only applied in phase 42):**

```js
{
  id: 'tr_…',
  kind: 'suppress_type' | 'promote_type',
  violationTypeKey: 'high grass and weeds',  // via violationTypeKey(label)
  violationTypeLabel: 'High Grass and Weeds',
  status: 'active' | 'disabled',
  // … audit fields optional until phase 45
}
```

**Phrase rule (only `status === 'active'` applied; proposed never affects process):**

```js
{
  id: 'pr_…',
  kind: 'promote_phrase' | 'suppress_phrase',
  pattern: 'string',
  patternType: 'literal' | 'regex',
  status: 'proposed' | 'active' | 'rejected' | 'disabled'
}
```

### Pattern 6: Apply order per row (locked)

For `code_violation` only (water skips type rules — BRAIN-03):

1. **Base tag already on row** from `tagRow` (do not re-run regex inside apply).
2. **`promote_type`** if active rule key matches `violationTypeKey(row.violationIssueType)` → force `STRONG_DISTRESSED_TAG`; append rule id / reason.
3. **`promote_phrase`** if active phrase matches search text → force strong (base already applied; this is “phrase promote”).
4. **`suppress_phrase`** if active match → force `Standard Code Violation` (or `UPLOAD_TYPES.code_violation.defaultTag`); clear or annotate indicators.
5. **`suppress_type`** if active match → force standard (**last = wins** over promote on same key).

For `water_shut_off`: return row unchanged for type suppress/promote; phrase rules may no-op in v1 (recommended: skip all brain type rules; skip phrase apply too for water to match product “pass-through”).

**Search text for phrases:** reuse `buildSearchText(row)` from tagger (normalized fields only is OK if raw not available post-normalize; optional pass-through raw is out of scope for phase 42 if row already has type/description).

### Anti-Patterns to Avoid

- **Importing Analyzer `learned-brain.js`:** Forbidden domain coupling.
- **Throwing when brain file missing:** Breaks all process; must empty-fallback.
- **Applying `proposed` phrase rules:** Product law — only `active`.
- **Type-suppressing water:** Violates BRAIN-03 and product pass-through.
- **Writing brain from process path:** Process is read-only apply; writes come later (decisions).
- **Mutating global brain object in apply:** Pure function returns new/mutated row copies; do not write disk inside apply.
- **Hand-rolling crypto versioning / 409 now:** Caps + optimistic concurrency are phase 47; version field on document is fine for forward-compat but no conflict API yet.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic durable JSON | Custom fsync protocols | `tmp + renameSync` from list-store | Already proven on Windows + volume |
| Volume path resolution | Hardcoded `data/` only | `config.BRIDGE_BRAIN_ROOT` like lists | Redeploy wipe risk |
| Base distress regex | Second regex catalog in brain | Existing `INDICATOR_CATEGORIES` + `tagRow` | Brain layers on top |
| Standard / strong tag strings | Magic literals scattered | `STRONG_DISTRESSED_TAG`, `UPLOAD_TYPES.*.defaultTag` | Consistency with filterDistressOnly |
| Test isolation | Writing to `data/bridge-brain` | Temp dir + config override | Same as list-store tests |
| Admin auth / decisions | API routes now | Phases 45–46 | Out of scope |
| Grouping / FN payload | `notDistressedRows` | Phase 43 | Out of scope |

**Key insight:** Phase 42 is a thin persistence + pure transform layer. Complexity of training UX, decisions, and phrase mining must not leak in — but **active phrase apply** should still work so phase 46 activation has a consumer.

## Common Pitfalls

### Pitfall 1: Apply after filterDistressOnly
**What goes wrong:** Promote never keeps false negatives; suppress never drops false positives in kept set.  
**Why it happens:** Wiring “anywhere after tag” without checking stage order.  
**How to avoid:** Apply on `importFiltered.rows` then call `filterDistressOnly`.  
**Warning signs:** Unit apply tests pass but `processUpload` kept counts unchanged.

### Pitfall 2: Process throws on missing brain
**What goes wrong:** Fresh deploys / empty volume break Filter for everyone.  
**Why it happens:** `readFileSync` without exists check.  
**How to avoid:** `loadBrain()` → emptyBrain on missing/corrupt.  
**Warning signs:** Engine tests fail only when temp brain path empty.

### Pitfall 3: Water type suppress
**What goes wrong:** Water rows demoted to standard and discarded or mis-tagged.  
**Why it happens:** Shared apply path forgets uploadType branch.  
**How to avoid:** First line of apply: if water, return row unchanged (type rules).  
**Warning signs:** Existing water tagger tests green but engine water fixture drops rows after brain seed.

### Pitfall 4: Suppress does not win conflicts
**What goes wrong:** Same type has promote + suppress; promote wins and keeps junk.  
**Why it happens:** Applying suppress before promote.  
**How to avoid:** Locked order ends with suppress_type.  
**Warning signs:** Conflict unit test fails.

### Pitfall 5: Type key mismatch (case/spacing)
**What goes wrong:** Rule for `"High Grass"` never matches `"high grass"` / extra spaces.  
**Why it happens:** Comparing raw labels.  
**How to avoid:** Shared `violationTypeKey(label)` = trim → lower → collapse whitespace; empty → `__unknown__`.  
**Warning signs:** Integration test with mixed case fails.

### Pitfall 6: Config mutation not restored in tests
**What goes wrong:** Parallel/suite pollution of real data path.  
**Why it happens:** Forgot `after()` restore.  
**How to avoid:** Copy list-store before/after pattern for `BRIDGE_BRAIN_ROOT`.  
**Warning signs:** Files appear under repo `data/bridge-brain` during tests.

### Pitfall 7: Coupling to hand-rolled docs/gsd plans
**What goes wrong:** Planner executes superseded `docs/gsd/plans/2026-07-09-phase-42-*.md` as authority.  
**Why it happens:** Historical plans still exist.  
**How to avoid:** Treat them as **reference only**; authoritative output is `.planning/phases/42-*/` from GSD.  
**Warning signs:** Plan tasks diverge from CONTEXT locked decisions.

### Pitfall 8: Regex ReDoS in phrase patterns
**What goes wrong:** Malicious/complex regex hangs process.  
**Why it happens:** Unvalidated `patternType: 'regex'`.  
**How to avoid:** Prefer literal includes for phase 42; if regex, wrap try/catch + max length; never throw process-wide.  
**Warning signs:** Hang on process with bad seeded rule (phase 47 hardens further).

## Code Examples

Verified patterns from this repo / design:

### Config addition

```js
// lib/config.js — mirror FILTER_LISTS_ROOT
BRIDGE_BRAIN_ROOT: process.env.BRIDGE_BRAIN_ROOT
  ? path.resolve(process.env.BRIDGE_BRAIN_ROOT)
  : (process.env.PDA_DATA_ROOT
    ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-brain')
    : path.join(ROOT, 'data', 'bridge-brain')),
```

### violationTypeKey

```js
// Source: design spec §4.2
function violationTypeKey(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return key || '__unknown__';
}
```

### Engine wire (sketch)

```js
// lib/bridge-engine/index.js — after importFiltered, before filterDistressOnly
const { loadBrain } = require('../bridge-brain-store');
const { applyBrainToRows } = require('../bridge-brain-apply');

const brain = loadBrain();
const brainApplied = applyBrainToRows(importFiltered.rows, brain, { uploadType });
const distressFiltered = filterDistressOnly(brainApplied.rows, uploadType);

// processingMeta:
//   brainVersion: brain.version,
//   brainAppliedRuleIds: brainApplied.appliedRuleIds
```

### Apply suppress/promote semantics

```js
const { STRONG_DISTRESSED_TAG } = require('./bridge-distress-tagger');
const { UPLOAD_TYPES } = require('./bridge-intake-schema');
const STANDARD = UPLOAD_TYPES.code_violation.defaultTag;

// promote → distressedSignalTag = STRONG_DISTRESSED_TAG
// suppress → distressedSignalTag = STANDARD; matchedIndicators = [] or keep with brain note
// optional annotation: row.brainApplied = ['tr_xxx'] or reasons ['brain:suppress-type']
```

### Test isolation (store)

```js
// Source: tests/bridge-list-store.test.js pattern
const config = require('../lib/config');
const originalRoot = config.BRIDGE_BRAIN_ROOT;
let tempRoot;
before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-'));
  config.BRIDGE_BRAIN_ROOT = tempRoot;
});
after(() => {
  config.BRIDGE_BRAIN_ROOT = originalRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
```

## Exact Files to Create / Modify

| Action | Path | Why |
|--------|------|-----|
| **Create** | `lib/bridge-brain-store.js` | BRAIN-01 persistence |
| **Create** | `lib/bridge-brain-apply.js` | Pure runtime apply (discretion) |
| **Create** | `tests/bridge-brain-store.test.js` | Missing→empty, save round-trip, path |
| **Create** | `tests/bridge-brain-apply.test.js` | promote/suppress/conflict/water/empty/phrases |
| **Modify** | `lib/config.js` | `BRIDGE_BRAIN_ROOT` |
| **Modify** | `lib/bridge-engine/index.js` | load + apply + brainMeta on response |
| **Optional modify** | `lib/bridge-distress-tagger.js` | Only if need re-export; prefer apply imports existing symbols |
| **Optional modify** | `tests/bridge-engine.test.js` | One integration case with seeded brain |
| **Optional modify** | `.gitignore` | Add `data/bridge-brain/` like `data/filter-lists/` |
| **Do not modify** | `modules/property-analyzer/lib/learned-brain.js` | Separate product |
| **Do not create yet** | `lib/bridge-api.js` brain routes | Phases 45–46 |
| **Do not modify yet** | `public/js/bridge.js` | Phases 43–44 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `INDICATOR_CATEGORIES` only | Base regex + layered global brain rules | v1.6 phase 42 | Future uploads learn without redeploy |
| FN permanently hard-dropped with no learning path | Still hard-dropped for list, but promote rules can pre-keep them | Phase 42 apply; phase 43 surfaces FN | Training loop foundation |
| Analyzer session learned-brain | Separate Filter global brain file | Explicit product split | No shared store |

**Deprecated/outdated:**
- Hand-authored `docs/gsd/plans/2026-07-09-phase-42-filter-brain-store-apply.md` — **reference only** (see SUPERSEDED note); GSD phase plans under `.planning/phases/` supersede execution authority.
- Structure map suggestion of shared `lib/training-brain.js` across Filter+Analyze — **do not** implement shared store; Filter-native modules only.

## Open Questions

1. **Annotate rows with brain reasons?**
   - What we know: Design mentions `brain:promote-type` / `brain:suppress-type` reasons.
   - What's unclear: Whether phase 42 must expose fields on rows vs only `processingMeta.brainAppliedRuleIds`.
   - Recommendation: Set optional `row.brainAppliedRuleIds` (array) and aggregate unique ids into `processingMeta`; keep tags compatible with `filterDistressOnly` / export. Do not break export schema.

2. **Phrase apply on water?**
   - What we know: Type suppress must never apply to water.
   - What's unclear: Whether active suppress_phrase could ever touch water text.
   - Recommendation: Skip **all** brain apply for `water_shut_off` in phase 42 (simplest BRAIN-03 + pass-through).

3. **Where to put `violationTypeKey`?**
   - Options: store module vs apply module.
   - Recommendation: Export from `bridge-brain-store.js` (shared with later decisions) and re-use from apply; or put in a tiny shared helper — store is fine.

4. **Should phase 42 create empty file on load or only on first save?**
   - Spec: missing = empty; create on first write.
   - Recommendation: `loadBrain` does not create file; `saveBrain` creates. Tests call `saveBrain` to seed.

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — discovery via `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js` |
| Full suite command | `npm test` |
| Live smoke (post-site) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BRAIN-01 | Missing brain path loads empty document without throw | unit | `node --test tests/bridge-brain-store.test.js` | ❌ Wave 0 |
| BRAIN-01 | saveBrain + loadBrain round-trip preserves typeRules | unit | `node --test tests/bridge-brain-store.test.js` | ❌ Wave 0 |
| BRAIN-01 | Brain root follows config override (temp dir) | unit | `node --test tests/bridge-brain-store.test.js` | ❌ Wave 0 |
| BRAIN-02 | Active suppress_type forces non-strong tag for matching type | unit | `node --test tests/bridge-brain-apply.test.js` | ❌ Wave 0 |
| BRAIN-02 | Active promote_type forces STRONG for matching type | unit | `node --test tests/bridge-brain-apply.test.js` | ❌ Wave 0 |
| BRAIN-02 | suppress_type wins over promote_type same key | unit | `node --test tests/bridge-brain-apply.test.js` | ❌ Wave 0 |
| BRAIN-02 | Empty brain leaves tags unchanged | unit | `node --test tests/bridge-brain-apply.test.js` | ❌ Wave 0 |
| BRAIN-02 | Active promote_phrase / suppress_phrase only when status active | unit | `node --test tests/bridge-brain-apply.test.js` | ❌ Wave 0 |
| BRAIN-02 | processUpload applies brain before distress filter (kept count changes) | integration | `node --test tests/bridge-engine.test.js` (new case) or brain-apply engine harness | ❌ Wave 0 |
| BRAIN-03 | water_shut_off ignores suppress_type | unit | `node --test tests/bridge-brain-apply.test.js` | ❌ Wave 0 |
| Regression | Existing tagger + engine suite still green | suite | `npm test` | ✅ existing |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + optional `scripts/verify-live.ps1` if any server-facing change (engine only — still verify if server restarted)

### Wave 0 Gaps

- [ ] `tests/bridge-brain-store.test.js` — covers BRAIN-01
- [ ] `tests/bridge-brain-apply.test.js` — covers BRAIN-02, BRAIN-03
- [ ] Optional: extend `tests/bridge-engine.test.js` with seeded brain + small CSV fixture for process path
- [ ] Framework install: none — already on `node:test`
- [ ] Optional: `.gitignore` entry `data/bridge-brain/`

*(No pre-existing brain test infrastructure — Wave 0 is the new test files above.)*

## Sources

### Primary (HIGH confidence)

- `lib/config.js` — `FILTER_LISTS_ROOT` / `PDA_DATA_ROOT` durability pattern
- `lib/bridge-list-store.js` — `writeJsonAtomic`, soft `readJson`
- `lib/bridge-distress-tagger.js` — `tagRow`, `filterDistressOnly`, `STRONG_DISTRESSED_TAG`, water pass-through
- `lib/bridge-engine/index.js` — `processUpload` stage order
- `lib/bridge-engine/normalizer.js` — base `tagRow` at normalize time
- `.planning/phases/42-brain-store-runtime-apply/42-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — BRAIN-01..03
- `.planning/ROADMAP.md` — phase success criteria
- `.planning/codebase/{ARCHITECTURE,STRUCTURE,CONVENTIONS,TESTING,CONCERNS}.md` — maps and gaps
- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — schema + apply order + path

### Secondary (MEDIUM confidence)

- `docs/gsd/plans/2026-07-09-phase-42-filter-brain-store-apply.md` — historical task sketch (superseded for authority; useful file list)
- `docs/gsd/milestones/M7-filter-superpower-brain.md` — milestone constraints

### Tertiary (LOW confidence)

- None material — domain is fully in-repo; no external library research required.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — pure Node patterns already in repo; no third-party APIs
- Architecture: **HIGH** — design spec + CONTEXT + live pipeline code agree on insert point
- Pitfalls: **HIGH** — concerns map and water/FN product rules are explicit

**Research date:** 2026-07-09  
**Valid until:** 2026-08-08 (stable in-repo domain; re-check only if processUpload stage order changes)

---

## RESEARCH COMPLETE

**Phase:** 42 - brain-store-runtime-apply  
**Confidence:** HIGH

### Key Findings
- Copy list-store atomic JSON + `FILTER_LISTS_ROOT` volume path for `BRIDGE_BRAIN_ROOT` / `global-brain.json`.
- Prefer separate pure `lib/bridge-brain-apply.js` + store module; wire in engine after import-filter, before `filterDistressOnly`.
- Locked apply order ends with suppress_type (wins); empty brain no-op; water never type-suppressed (skip type rules entirely for water).
- Do not touch Analyzer learned-brain; no UI/API/decisions in this phase.
- Wave 0 tests: `bridge-brain-store.test.js` + `bridge-brain-apply.test.js` (+ optional engine integration).

### File Created
`.planning/phases/42-brain-store-runtime-apply/42-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Existing Node fs patterns; zero new deps |
| Architecture | HIGH | CONTEXT + design + live pipeline aligned |
| Pitfalls | HIGH | Documented FN/water/order risks in codebase maps |

### Open Questions
- Row-level brain annotations vs processingMeta only (recommend both light ids).
- Skip all brain apply for water vs only type rules (recommend skip all for phase 42).

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
