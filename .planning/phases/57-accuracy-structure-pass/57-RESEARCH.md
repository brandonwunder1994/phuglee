# Phase 57: Accuracy Structure Pass - Research

**Researched:** 2026-07-10  
**Domain:** Filter keep/kill + Type/format accuracy — gold fixtures, no silent drops, v1.7–v1.8 lock preservation  
**Confidence:** HIGH (pipeline, locks, and test inventory verified in live `lib/` + `tests/`); MEDIUM on exact residual FPs/FNs (no real multi-city residual bug list in-repo)

## Summary

Phase 57 freezes **Filter accuracy structure** before learning metrics (58) and efficiency (59). The product bar is: real distress stays **kept**, junk is **denied** into the FN/review pool (not vanished), water is **never type-suppressed**, and accuracy work **never silent-drops inventory** solely for “no Type,” unresolved map, or cleaner kept counts. Fixes must land in **code** (tagger / normalizer / engine / groups / brain apply) — not audit-only notes.

The pipeline is already mature: v1.6 brain + FN pool, v1.7 promote + stable groups, v1.8 exclusive Type scorer + format confirm + display-only short labels, v2.0 independence (`already_imported` default-off). Full suite is **482 pass / 0 fail**. What is **missing** is a named **gold fixture suite** under ACC-01/02/03 that Phase 58 can score precision/recall against and Phase 60 can re-assert forever.

**Primary recommendation:** Wave 0 = durable gold city fixtures + ACC-named `processUpload` contracts (red→green). Implement keep/kill or Type residual **only when a gold fixture fails**. Never add hard-drop reasons for cleaner lists. Keep all COL/GATE/MAP/GROUP/LBL/BRAIN-water tests green (ACC-03). **Zero new npm packages.**

---

<user_constraints>
## User Constraints

**No `57-CONTEXT.md`** — discuss-phase was not run. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, PROJECT.md, v1.7–v1.8 archives, and the orchestrator brief.

### Locked Decisions

- **ACC-01:** Gold city fixtures lock residual keep/kill failures (real distress kept; junk denied; water never type-suppressed) — **implement fixes, not audit-only**
- **ACC-02:** Accuracy changes never silent-drop leads solely for “no Type,” unresolved map, or cleaner kept counts — rows stay for review / FN pool / explicit reasons
- **ACC-03:** v1.7–v1.8 locks preserved: single Type winner (no blend), empty-only category promote, stable group keys, display-only short labels, format confirm on first/changed fingerprint
- **Product pipeline:** Collect → Filter process → Train (admin) → Save list → Download → external enrich → **manual** Analyze import (Phases 55–56 already shipped independence + list UX)
- **Zero new npm packages** — pure CommonJS + `node --test` (v2.0 research SUMMARY)
- **AGENTS.md:** never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores as part of coding/restarts
- **Carry-forward product locks (still binding):**
  - No multi-column Type blend
  - No silent drop when Type unresolved / no Type column
  - `promoteCategoryFromRaw` empty-cell-only after scorer force map
  - Short labels display-only (never stored type / group key / export / decision key)
  - Format confirm on first/changed fingerprint; water skips Type confirm + type suppress
  - Phrases proposed-only until admin activate (do not auto-activate to “fix accuracy”)
  - Wrong keeps → Deny suppress; wrong drops → FN → Deny promote — reviewable paths
- **Phase 57 scope:** Accuracy structure + gold fixtures only — not learning metrics UI (58), not day-2 efficiency polish (59), not full milestone QA pack (60), not Analyze re-coupling

### Claude's Discretion

- Exact gold fixture file layout (recommend `tests/fixtures/bridge/gold/` + `tests/bridge-accuracy-gold.test.js` **or** extend `bridge-engine.test.js` with ACC-prefixed titles)
- Whether residual tagger FPs/FNs beyond TAGGING-RULES matrix are discovered during fixture authoring — if suite already green on gold matrix, phase still ships the lock (implements structure even if zero production code diffs)
- How many gold “cities” (recommend **3–5 synthetic heterogeneous shapes**, not one mega-file): vegetation+trash keep; permit/parking/junk-admin deny; Status/Date trap Type; description-only timestamps; water + hostile suppress rules
- Whether to touch `docs/bridge/TAGGING-RULES.md` / `TEST-PLAN.md` with ACC fixture map (optional)
- Whether pure unit gaps (tagger edge cases) get unit tests in addition to processUpload gold e2e

### Deferred Ideas (OUT OF SCOPE)

- Learning metrics dashboard / paired decision↓ + precision (Phase 58 — **consumes** gold fixtures)
- Format reuse / bulk download efficiency polish (Phase 59)
- Full independence + gold + e2e + verify-live milestone QA package (Phase 60 — re-runs gold)
- Soft-flag `already_imported` UI (future; IND-04 already default-off)
- Auto-activate phrases / unsupervised ML
- Multi-column Type blend, short-label as stored type
- Train CSS redesign, Analyze vision review
- Real operator FOIA dumps committed into git (use **synthetic** gold CSVs that encode real shapes; never commit private city PII)
- Load-saved-list-back-into-Train
- Server-side multi-tenant sessions
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ACC-01** | Gold city fixtures lock residual keep/kill failures (real distress kept; junk denied; water never type-suppressed) — implement fixes, not audit-only | Author durable fixtures + processUpload contracts for keep matrix (weeds/trash/blight/junk vehicle/property maintenance), deny matrix (permit/parking/trash-cans/HOA/noise), water e2e with active `suppress_type` still kept. Fix `bridge-distress-tagger.js` / engine only when a gold assert fails. |
| **ACC-02** | Accuracy changes never silent-drop leads solely for “no Type,” unresolved map, or cleaner kept counts — rows stay for review / FN pool / explicit reasons | Lock COL-02 / GATE-04 `__none__` / all-FN zero-kept policy: no `no_type*` discard reason; distressed without Type still kept or in FN; stats expose explicit reasons. Ban new hard-drop paths that only shrink kept counts. |
| **ACC-03** | v1.7–v1.8 locks preserved: single Type winner (no blend), empty-only promote, stable group keys, display-only short labels, format confirm on first/changed fingerprint | Keep green existing COL-01..04, MAP-01..03, GROUP/TEST-01..03 (v1.7), GATE-02/03/04/06, LBL/TEST-03 (v1.8), water BRAIN-03. Prefer re-assert via focused patterns or thin ACC-03 wrappers — do not re-implement features. |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### processUpload pipeline (accuracy-relevant)

```
parse (tabular/doc)
  → resolveTypeColumnGate (code_violation only; water skips confirm)
  → normalizeRawRows
       forceTypeColumn (scorer | confirm/reuse override | null)
       mapRawRow
       promoteCategoryFromRaw  // empty Type cell only (COL-03 / MAP)
       tagRow (+ raw cells search)
       non_property hard discard (code_violation apartments/commercial/highway)
  → dedupeRows
  → import-filter ONLY if applyAlreadyImportedFilter === true  // IND-04 default off
  → applyBrainToRows  // promote_type → promote_phrase → suppress_phrase → suppress_type
                      // water_shut_off: early return, no rules
  → filterDistressOnly  // Strong kept; Standard → FN pool (not thin discard)
  → assignRowIds + buildReviewGroups (stable keys + shortLabel display-only)
```

| Stage | Module | Keep/kill role |
|-------|--------|----------------|
| Type map | `bridge-type-column-score.js` + `normalizer.forceTypeColumn` | Exclusive single winner; null allowed |
| Category promote | `bridge-category-promote.js` | Empty-cell only; no blend |
| Base tag | `bridge-distress-tagger.js` | Strong vs Standard; water always high-value |
| Brain | `bridge-brain-apply.js` | Type/phrase promote/suppress; water no-op |
| Distress filter | `filterDistressOnly` | Kept vs **FN pool** (`no_distress_signal`) |
| Groups | `bridge-review-groups.js` + `bridge-stable-text.js` | Timestamp-stable keys; shortLabel parallel |
| Format gate | `bridge-engine` + `bridge-city-format-store` | Confirm first/changed FP; water skip |

### Critical semantics (planner must not confuse)

| Outcome | Where rows go | Silent drop? |
|---------|---------------|--------------|
| **Strong Distressed** | `result.rows` (kept list) | No |
| **Standard / no distress** | `notDistressedRows` + reviewGroups.notDistressed (FN pool, cap 5k) | **No** — reviewable; reason `no_distress_signal` in stats |
| **non_property / no_address / blank / duplicate** | thin `discarded` | Intentional non-leads / bad parse — **not** ACC-02 “no Type” class |
| **already_imported** | only if opt-in filter on | Default **off** (Phase 55) |
| **Missing Type column / unresolved** | still normalize/tag; keep if Strong; else FN | **Must not** invent drop (COL-02) |

**“Junk denied” = FN pool (Standard), not hard-delete.** ACC-01 “junk denied” means permit/parking/admin land in not-distressed (or thin discard only if non_property/no address), never as Strong kept.

### Existing fixtures & tests (not yet ACC-gold)

| Asset | Path | Covers |
|-------|------|--------|
| Varied CV CSV | `tests/fixtures/bridge/code-violations-varied.csv` | weeds + trash keep; fence permit FN; empty address discard |
| Water TXT | `tests/fixtures/bridge/water-shutoffs.txt` | water parse + keep |
| Engine e2e | `tests/bridge-engine.test.js` | COL/GATE/MAP/GROUP/LBL/BRAIN/water/IND-04 — **many** inline CSVs |
| Tagger unit | `tests/bridge-distress-tagger.test.js` | vegetation/trash/vehicle/structure/neglect; trash-cans; non-residential; parking on lawn; fence permit |
| Stress matrix | `tests/bridge-stress.test.js` | broader tag + format messiness |
| Promote unit | `tests/bridge-category-promote.test.js` | MAP empty-only |
| Groups unit | `tests/bridge-review-groups.test.js` | GROUP + LBL |
| Scorer unit | `tests/bridge-type-column-score.test.js` | COL trap matrix |

**Gap:** No file/suite titled **gold** / **ACC-*** that freezes the full keep/kill + water + no-silent-drop product bar as one named artifact for LRN/TEST phases.

### Independence locks to preserve (Phase 55 — do not break)

- No `bridge-analyzer-push` / no Filter write to Analyze
- `already_imported` hard-drop **off** unless `applyAlreadyImportedFilter === true`
- Static bans in `tests/bridge-independence.test.js`

---

## Standard Stack

### Core

| Library / module | Version / location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node.js 20+ CommonJS | runtime | Filter shell | Existing; no TS/build |
| `lib/bridge-engine` | `processUpload` / batch | Full accuracy path composition | Only e2e that proves tagger+Type+brain+groups |
| `lib/bridge-distress-tagger.js` | existing | Base keep/kill regex | ACC-01 primary fix surface |
| `lib/bridge-brain-apply.js` | existing | Water no-op; type/phrase order | Water + suppress locks |
| `lib/bridge-type-column-score.js` | existing | Exclusive Type winner | ACC-03 COL |
| `lib/bridge-category-promote.js` | existing | Empty-only promote | ACC-03 MAP/COL-03 |
| `lib/bridge-review-groups.js` + `bridge-stable-text.js` + `bridge-short-label.js` | existing | Stable keys + display short labels | ACC-03 GROUP/LBL |
| `lib/bridge-city-format-store.js` | existing | Fingerprint confirm/reuse | ACC-03 GATE |
| `node:test` + `node:assert/strict` | Node built-in | Gold + regression | `npm test` → 482 green baseline |
| `xlsx@0.18.5` | locked | Parse/export | Do not swap engines |

### Supporting

| Module / file | Purpose | When to use |
|---------------|---------|-------------|
| `docs/bridge/TAGGING-RULES.md` | Authoritative keep/kill policy text | Source matrix for gold rows |
| `tests/fixtures/bridge/` | Existing small fixtures | Extend with `gold/` subdirectory |
| `tests/bridge-engine.test.js` | Existing processUpload locks | Keep green; optionally host ACC wrappers |
| `tests/bridge-stress.test.js` | Messy inputs | Keep green; not a substitute for named gold |
| Temp `BRIDGE_BRAIN_ROOT` / `BRIDGE_CITY_FORMATS_ROOT` | Isolation | Always in gold e2e (never real volumes) |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| New `tests/bridge-accuracy-gold.test.js` | Extend only `bridge-engine.test.js` | Engine file already huge; **dedicated gold file** isolates ACC for Phase 58/60 and focused runs — **prefer dedicated** |
| Real city FOIA CSVs in git | Synthetic heterogeneous CSVs | Privacy + size; synthetic encodes shapes from diagnosis + TAGGING-RULES — **prefer synthetic** |
| Audit markdown only | Code fixes + fixtures | Violates ACC-01 “not audit-only” |
| Auto-activate phrases to clean lists | Base tagger + type rules via Train | Phrases stay proposed-only (product lock) |
| Raise distress threshold / silent drop weak keeps | Gold + FN review path | Violates ACC-02 and Pitfall 4 |
| New ML/embeddings classifier | Pure regex + HITL brain | Out of stack; zero-dep proven |

**Installation:** none.

```bash
# focused gold / accuracy
node --test tests/bridge-accuracy-gold.test.js
node --test --test-name-pattern="ACC-|COL-|GATE-|TEST-|BRAIN|water|MAP-|LBL" tests/bridge-engine.test.js tests/bridge-distress-tagger.test.js

# full + live
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## Architecture Patterns

### Recommended touch structure

```
tests/
├── fixtures/bridge/
│   └── gold/                          # NEW — durable city-shape CSVs
│       ├── keep-distress-mixed.csv    # weeds/trash/blight/vehicle/maintenance → kept
│       ├── deny-junk-admin.csv        # permit/parking/HOA/noise/trash-cans → FN (not Strong)
│       ├── type-trap-status-vio.csv   # Status+Vio Cat trap (COL)
│       ├── no-type-notes-only.csv     # COL-02 no silent drop
│       └── water-hostile-types.txt    # water + notes that match suppress keys
├── bridge-accuracy-gold.test.js       # NEW — ACC-01/02 processUpload contracts
└── bridge-engine.test.js              # KEEP green; optional thin ACC-03 re-assert titles

lib/
├── bridge-distress-tagger.js          # MODIFY only if gold keep/kill fails
├── bridge-engine/index.js             # MODIFY only if pipeline policy fails (prefer avoid)
├── bridge-engine/normalizer.js        # MODIFY only if Type/promote residual fails
├── bridge-brain-apply.js              # READ — water early-return must stay
├── bridge-category-promote.js         # READ — empty-only
├── bridge-type-column-score.js        # READ unless COL residual
├── bridge-review-groups.js            # READ unless group residual
└── bridge-stable-text.js / short-label.js  # READ

docs/bridge/
└── TAGGING-RULES.md / TEST-PLAN.md    # OPTIONAL ACC fixture map
```

### Pattern 1: Gold fixture first (measurement before keep/kill)

**What:** Encode expected outcomes as CSV + processUpload asserts **before** changing tagger thresholds.  
**When:** Every ACC-01 claim.  
**Why:** Pitfall 4 — “accuracy” that only shrinks kept counts is a product failure.

```javascript
// Source: recommended tests/bridge-accuracy-gold.test.js (pattern from bridge-engine.test.js)
// Isolate BRIDGE_BRAIN_ROOT + BRIDGE_CITY_FORMATS_ROOT in before/after
// code_violation: username 'admin' + confirmedTypeHeader for known header
// Assert:
//   expectedKeptAddresses every in result.rows with Strong tag
//   expectedJunkAddresses every in result.notDistressedRows (or absent from kept)
//   no discardReasons matching /no_type/
```

### Pattern 2: processUpload composition lock (not unit-only)

**What:** Gold tests call `processUpload` (parse → gate → normalize → tag → brain → distress → groups), not only `tagRow`.  
**When:** ACC-01/02. Unit tagger tests may **supplement** but cannot alone satisfy gold e2e.

### Pattern 3: Water early-return intact

**What:** `applyBrainToRows` returns shallow copy for `water_shut_off`; `filterDistressOnly` keeps all; Type confirm gate skipped.  
**When:** ACC-01 water clause + every brain/accuracy PR.

```javascript
// Source: lib/bridge-brain-apply.js (as-built)
if (uploadType === 'water_shut_off') {
  base.brainAppliedRuleIds = [];
  return base;
}
```

Gold: load water fixture + brain with active `suppress_type` whose key appears in water notes/type text → all water rows still kept; rule id **not** in `brainAppliedRuleIds` (existing engine test `processUpload water_shut_off ignores type suppress (BRAIN-03)` — promote into ACC-01 gold or re-assert).

### Pattern 4: Exclusive Type + empty-only promote (no re-open)

**What:** `forceTypeColumn` always sets `columnMap.violationIssueType` to scorer/override/null; promote only when mapped cell empty.  
**When:** ACC-03; any residual Type bug.

### Pattern 5: FN pool vs thin discard

**What:** Standard code violations → `notDistressedRows` with full rows for Train; thin `discarded` only for address/blank/non_property/duplicate/import.  
**When:** ACC-02 reviews — “denied junk” must remain Trainable (FN), not only a reason counter.

### Anti-Patterns to Avoid

- **Audit-only RESEARCH/PLAN with no failing fixture** — violates ACC-01
- **Silent drop for cleaner kept counts** — Pitfall 4; ACC-02
- **Auto-activate proposed phrases** to kill junk — global poison; PHRASE lock
- **Type blend / concatenate columns** — COL lock
- **Promote overriding non-empty scorer cells** — COL-03
- **Short label into `violationIssueType` or group key** — LBL lock
- **Water shares suppress_type path** — BRAIN-03
- **Re-enable `already_imported` default-on** while “cleaning” lists — IND-04
- **Wipe filter-lists/brain volumes for test setup** — Agents.md; use temp roots only
- **One mega-fixture that mixes two clerk schemas under one silent map** — GATE-06; prefer one list per format shape
- **Measuring success as “fewer kept rows”** — success is correct kept + reviewable FN

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Keep/kill classifier | New ML/embeddings service | `bridge-distress-tagger` INDICATOR_CATEGORIES + HITL brain | Controllable; tested; zero deps |
| Gold runner framework | Jest/Vitest/Playwright | `node:test` + processUpload | Project standard; 482 tests |
| Type column picker | Alias-first only / multi-column blend | `resolveTypeColumnHeader` + confirm gate | v1.8 locks |
| Category invent from notes | Dump description into Type always | `promoteCategoryFromRaw` empty-only + MAP-03 | Avoids free-text Type poison |
| Group clustering | Soft clustering / embeddings | `stripIncidentalTimestamps` + `stableTypeKey` / `stableDescriptionKey` | Shipped v1.7 |
| Silent “quality” filter | New discard reason `low_confidence_drop` | FN pool + Train Deny suppress | Reviewable; ACC-02 |
| Analyze re-scan for accuracy | Re-wire push | Fix Filter tagger/brain | Independence |

**Key insight:** Accuracy structure is a **fixture + policy** problem on a finished pipeline, not a greenfield algorithm. The dangerous work is inventing drops and re-breaking Type/group locks — not writing a new engine.

---

## Common Pitfalls

### Pitfall 1: “Accuracy” that silently drops leads (ACC-02)

**What goes wrong:** Tighten regex / add low-confidence drop / shrink FN cap → kept looks clean; real distress gone; no Train path.  
**Why:** Success metric misread as fewer rows.  
**How to avoid:** Gold keep-set must stay green after every tagger change; no new discard reasons without fixture + UI/stats visibility.  
**Warning signs:** Kept collapses; FN empty while clerk file full of High Grass.

### Pitfall 2: Audit-only phase (ACC-01)

**What goes wrong:** Markdown lists residual bugs; no code or tests change.  
**How to avoid:** Plans ship gold tests (and fixes if red). Phase incomplete if no ACC-named automated lock.

### Pitfall 3: Treating FN as silent drop (false ACC-02 failure)

**What goes wrong:** Planner “fixes” Standard rows by keeping everything Strong → junk floods lists.  
**How to avoid:** FN pool is **correct** deny path. Assert junk in `notDistressedRows`, not in `rows`.

### Pitfall 4: Brain poison from wrong Type residual (ACC-03)

**What goes wrong:** Residual wrong Type → Train Deny writes suppress on garbage keys → product-wide kill of real categories.  
**How to avoid:** Preserve COL/GATE; gold Type-trap fixtures; do not open Train on untrusted `typeResolution` in product guidance (code: keep confirm gate).

### Pitfall 5: Water type-suppress / Type confirm regression

**What goes wrong:** Shared apply/gate refactor drops water early-return.  
**How to avoid:** ACC-01 water gold + existing BRAIN-03 / GATE water skip tests in every wave.

### Pitfall 6: Re-implementing v1.7–v1.8 instead of locking

**What goes wrong:** Large rewrites of scorer/groups “for accuracy” reintroduce blend/silent drop.  
**How to avoid:** ACC-03 = keep existing tests green; fix only proven residual failures.

### Pitfall 7: Exact residual bugs unknown → invent speculative tagger rewrites

**What goes wrong:** Without real residual reports, broad pattern edits cause regressions.  
**How to avoid:** Gold matrix from **TAGGING-RULES + existing diagnosis shapes** first; only change code for red asserts. If all green, **ship fixtures** as the deliverable (structure lock for 58/60).

### Pitfall 8: Independence / list UX regression while editing engine

**What goes wrong:** Engine touch re-enables import hard-drop or couples Analyze.  
**How to avoid:** Don’t touch IND-04 default; leave list store alone; run independence tests if engine import path touched.

### Pitfall 9: Committing real PII city files

**What goes wrong:** Gold fixtures leak FOIA personal data into git.  
**How to avoid:** Synthetic addresses (`100 Main St`, etc.) only.

### Pitfall 10: Auto-activate phrases to pass gold junk denies

**What goes wrong:** Global false suppress.  
**How to avoid:** Fix base tagger or document Train suppress_type path; phrases stay proposed-only.

---

## Code Examples

### Gold keep/deny processUpload (target)

```javascript
// Source: recommended ACC-01 pattern (compose like tests/bridge-engine.test.js)
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { processUpload } = require('../lib/bridge-engine');

const GOLD = path.join(__dirname, 'fixtures', 'bridge', 'gold');
const CITY = { id: 'gold-city-keep-deny', city: 'Goldville', state: 'AZ' };

test('ACC-01: gold keep-distress-mixed keeps Strong weeds/trash/blight', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'keep-distress-mixed.csv'));
  const result = await processUpload({
    buffer,
    filename: 'keep-distress-mixed.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type' // match fixture header
  });
  assert.equal(result.ok, true);
  // every expected distress address in result.rows with Strong tag
  // no expected distress address only in notDistressedRows
});

test('ACC-01: gold deny-junk-admin does not keep permits/parking as Strong', async () => {
  // process deny fixture
  // assert permit/parking addresses absent from result.rows
  // assert present in result.notDistressedRows (FN) when address valid
});
```

### ACC-02 no silent drop for no Type (as-built COL-02 — re-title into gold)

```javascript
// Source: tests/bridge-engine.test.js COL-02 (keep green; ACC-02 gold may wrap)
// Address + Notes + Open Date only → weeds kept; columnMap.violationIssueType falsy;
// discardReasons must not match /no_type/
```

### Water hostile suppress (as-built BRAIN-03)

```javascript
// Source: tests/bridge-engine.test.js
// processUpload water_shut_off ignores type suppress (BRAIN-03)
// Active suppress_type on a key that appears in water text → rows still kept;
// brainAppliedRuleIds must not include that suppress rule
```

### Empty-only promote (as-built COL-03)

```javascript
// Source: lib/bridge-engine/normalizer.js
if (!String(mapped.violationIssueType || '').trim()) {
  const promoted = promoteCategoryFromRaw(rawRow, headers, columnMap, mapped);
  if (promoted) mapped.violationIssueType = promoted;
}
// Never concatenate multi-column Type
```

### Stable group keys (as-built GROUP)

```javascript
// Source: lib/bridge-review-groups.js
const typeKey = stableTypeKey(typeLabelRaw);
const descriptionKey = isUnknown ? stableDescriptionKey(descTrimmed) : null;
// shortLabel = shortLabelForDisplay(...) — parallel only
```

---

## State of the Art (project-local)

| Old approach | Current (post v1.6–v1.8 + 55) | Phase 57 target |
|--------------|-------------------------------|-----------------|
| Exact description groups → timestamp singletons | Stable strip keys (v1.7) | Keep green + gold composition |
| Alias-first Type / blend risk | Exclusive scorer + confirm (v1.8) | Keep green; residual only if gold red |
| Missing Type → unclear drop | COL-02 keep for review | ACC-02 named lock |
| Water could share suppress | Early-return + e2e | ACC-01 gold water |
| Accuracy = audit notes | — | **Gold fixtures + code fixes** |
| `already_imported` always drop | Default off (55) | Do not re-enable for “clean lists” |
| No named gold suite | Scattered engine/stress tests | **`gold/` + ACC tests** for 58/60 |

**Deprecated/outdated:**

- Audit-only accuracy pass as milestone deliverable
- Silent drop unresolved Type
- Multi-column Type blend
- Treating FN Standard rows as “lost inventory” that must all become Strong
- Positive “restore Analyze push” for quality control

---

## Open Questions

1. **What exact residual FPs/FNs remain on real cities?**
   - What we know: Suite green; TAGGING-RULES + stress matrix cover known policy; SUMMARY flagged residual as unknown without sample files.
   - What's unclear: Operator-specific clerk exports not in repo.
   - Recommendation: Encode **policy gold** from TAGGING-RULES + diagnosis shapes; if all green, ship locks. If implementer has private samples, convert shapes to synthetic rows **without PII**. Do not block planning on missing real FOIA dumps.

2. **Dedicated gold test file vs engine file only?**
   - Recommendation: **`tests/bridge-accuracy-gold.test.js`** + `tests/fixtures/bridge/gold/*` for ACC naming and Phase 58/60 discoverability.

3. **Must production code change if gold is already green?**
   - ACC-01 says implement fixes not audit-only — if fixtures pass without diffs, **fixtures + tests are the implementation of the lock**. Prefer no speculative tagger churn. Only edit lib/ when red.

4. **How does Phase 58 consume gold?**
   - LRN-01 needs gold precision/recall not degrading — Phase 57 should name fixtures and expected keep/FN sets so 58 can compute metrics without re-authoring.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-accuracy-gold.test.js tests/bridge-distress-tagger.test.js` |
| Full suite command | `npm test` |
| ACC-03 lock sample | `node --test --test-name-pattern="COL-|GATE-|TEST-|MAP-|LBL|BRAIN|water|GROUP" tests/bridge-engine.test.js` |
| Live gate (if public/ touched) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` |
| Baseline (research run) | **482 pass / 0 fail** |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ACC-01 | Gold mixed distress rows kept Strong (weeds/trash/blight/vehicle/maintenance) | processUpload e2e | `node --test --test-name-pattern="ACC-01" tests/bridge-accuracy-gold.test.js` | ❌ Wave 0 |
| ACC-01 | Gold junk (permit/parking/HOA/noise/trash-cans) not Strong; in FN when addressable | processUpload e2e | same | ❌ Wave 0 |
| ACC-01 | Water + hostile active suppress_type still kept; no type suppress apply | processUpload e2e | same (+ existing BRAIN-03) | ⚠️ partial engine BRAIN-03; promote into ACC gold |
| ACC-01 | Code fixes when gold red (tagger/engine) — not docs-only | unit + e2e | tagger + gold | ⚠️ tagger unit exists; wire to gold |
| ACC-02 | No Type column / unresolved: weeds still kept or FN; no `no_type*` discard | processUpload e2e | ACC-02 pattern | ⚠️ COL-02 engine; wrap as ACC-02 |
| ACC-02 | GATE `__none__` no silent drop | processUpload e2e | existing GATE-04 | ✅ engine |
| ACC-02 | All-FN file succeeds with empty kept (zero-kept policy) — inventory reviewable | processUpload e2e | existing all-FN test | ✅ engine |
| ACC-02 | No new hard-drop reason that only cleans kept counts (assert discard reason allowlist or absence of banned reasons) | processUpload e2e | gold | ❌ Wave 0 |
| ACC-03 | Single Type winner / no blend (COL-01/04 traps) | processUpload + unit | engine + type-column-score | ✅ |
| ACC-03 | Empty-only promote (COL-03 / MAP) | processUpload + unit | engine + category-promote | ✅ |
| ACC-03 | Stable group keys timestamps (v1.7 TEST-01/03) | processUpload + unit | engine + review-groups | ✅ |
| ACC-03 | Display-only short labels (LBL / v1.8 TEST-03) | processUpload + unit | engine + short-label | ✅ |
| ACC-03 | Format confirm first/changed fingerprint (GATE-02/03 / v1.8 TEST-02) | processUpload | engine | ✅ |
| ACC-03 | Optional thin wrappers titled `ACC-03: …` that call same asserts | processUpload | gold or engine | ❌ optional Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-accuracy-gold.test.js` (+ tagger if tagger touched)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green; if any `public/` edit, `scripts/verify-live.ps1` green before claiming live

### Wave 0 Gaps

- [ ] `tests/fixtures/bridge/gold/*.csv` (and water txt) — ACC-01/02 durable fixtures
- [ ] `tests/bridge-accuracy-gold.test.js` — ACC-01 keep/deny/water + ACC-02 no silent drop contracts
- [ ] Optional ACC-03 re-assert titles or document dependency on existing engine patterns
- [ ] If gold red: fix `lib/bridge-distress-tagger.js` (or narrow normalizer/engine) until green
- [ ] Optional: `docs/bridge/TEST-PLAN.md` ACC fixture map
- [ ] No new test framework install required
- [ ] Temp roots only — never wipe `data/filter-lists/` or `data/bridge-brain/`

*(Existing COL/GATE/MAP/GROUP/LBL/BRAIN/water/IND tests stay — ACC-03 regression surface.)*

---

## Suggested Plan Decomposition (for planner)

| Plan | Goal | Primary files | Reqs |
|------|------|---------------|------|
| **57-01** | Wave 0 gold fixtures + ACC-01/02 processUpload tests (may be red) | `tests/fixtures/bridge/gold/*`, `tests/bridge-accuracy-gold.test.js` | ACC-01, ACC-02 |
| **57-02** | Implement keep/kill or Type residual fixes until gold green; no speculative rewrites | `lib/bridge-distress-tagger.js` (± normalizer/engine only if proven) | ACC-01 |
| **57-03** | ACC-02 silent-drop allowlist/banned-reason asserts + ACC-03 regression wave (existing locks + optional wrappers); docs optional | gold tests, engine keep-green, optional TEST-PLAN | ACC-02, ACC-03 |

**Order rationale:** Fixtures first (measurement), then code only for reds, then lock pack so Phase 58 inherits a named gold suite. If 57-01 is already green, 57-02 may be empty or docs-only **only after** gold asserts exist — never skip 57-01.

**Do not** include learning metrics UI, efficiency CTAs, or Analyze re-coupling.

---

## Sources

### Primary (HIGH confidence)

- Code (2026-07-10): `lib/bridge-engine/index.js` (gate → normalize → import opt-in → brain → distress → groups), `lib/bridge-engine/normalizer.js` (forceType + empty promote + non_property), `lib/bridge-distress-tagger.js`, `lib/bridge-brain-apply.js`, `lib/bridge-category-promote.js`, `lib/bridge-type-column-score.js`, `lib/bridge-review-groups.js`, `lib/bridge-stable-text.js`, `lib/bridge-short-label.js`, `lib/bridge-city-format-store.js`
- Tests: `tests/bridge-engine.test.js` (COL/GATE/MAP/GROUP/LBL/BRAIN/water/IND), `tests/bridge-distress-tagger.test.js`, `tests/bridge-stress.test.js`, `tests/bridge-category-promote.test.js`, `tests/bridge-review-groups.test.js`, `tests/bridge-type-column-score.test.js`, `tests/bridge-independence.test.js`
- Fixtures: `tests/fixtures/bridge/code-violations-varied.csv`, `water-shutoffs.txt`
- Product: `.planning/REQUIREMENTS.md` ACC-01..03, `.planning/ROADMAP.md` Phase 57, `.planning/STATE.md`, `.planning/PROJECT.md` v1.7–v1.8 locks
- Archives: `.planning/milestones/v1.7-REQUIREMENTS.md`, `v1.8-REQUIREMENTS.md`
- Research: `.planning/research/SUMMARY.md`, `PITFALLS.md` (4, 5, 10, 12), `FEATURES.md`, `ARCHITECTURE.md`
- Diagnosis: `.planning/debug/filter-singleton-no-category.md` (grouping/type empty — fixed v1.7; shapes reusable)
- Docs: `docs/bridge/TAGGING-RULES.md`, independence Phase 55 RESEARCH locks
- Suite baseline: `npm test` → 482 pass (2026-07-10)

### Secondary (MEDIUM confidence)

- Exact residual heterogeneous-city FPs/FNs beyond policy matrix — no in-repo failure list; gold encodes policy truth
- Plan count 3 — discretionary compression if 57-01 already green (still need fixture ship)

### Tertiary (LOW confidence)

- None material for stack choice — domain fully in-repo

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new deps; modules and runner verified |
| Architecture | HIGH | processUpload path read end-to-end; FN vs thin discard semantics clear |
| Pitfalls | HIGH | PITFALLS.md + live COL/GATE/BRAIN tests |
| Residual bug inventory | MEDIUM | Policy gold clear; real-city residual unknown without samples |
| Gold fixture layout | MEDIUM–HIGH | Discretion on file split; pattern proven in engine tests |

**Research date:** 2026-07-10  
**Valid until:** ~2026-08-10 (stable in-repo domain; re-verify if tagger categories or process pipeline order rewrite)

---
*Phase 57 research — Accuracy Structure Pass*  
*Feeds gsd-planner PLAN.md; researcher writes file; commit via gsd-tools when enabled*
