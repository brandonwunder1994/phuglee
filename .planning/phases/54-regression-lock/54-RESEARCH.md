# Phase 54: Regression Lock - Research

**Researched:** 2026-07-10  
**Domain:** v1.8 Type Column Intelligence — processUpload e2e regression lock + full suite + live gate  
**Confidence:** HIGH

## Summary

Phase 54 does **not** implement product features. Phases 51 (COL scorer + force map), 52 (format memory + confirm gate), and 53 (display-only short labels) already ship the milestone behavior with green unit/integration contracts. The full suite is currently **456 pass / 0 fail**. Live gate tooling (`scripts/verify-live.ps1`) is already standard per AGENTS.md.

What remains is the **milestone lock-and-ship** required by **v1.8 TEST-01..03**: named processUpload (or equivalent composition) fixtures that prove (1) alias-first poison loses to the true Type column on the process path, (2) same fingerprint reuses without confirm and **fingerprint change requires confirm again**, (3) short labels shorten display while stored type / export / group keys stay full — plus green `npm test` and `scripts/verify-live.ps1`.

Most COL/GATE/LBL unit and process contracts already exist under phase-prefixed names (`COL-*`, `GATE-*`, `LBL-*`). The **primary real gaps** are: (a) no sequential **fingerprint-change → reconfirm** processUpload test, (b) no **processUpload → reviewGroups.shortLabel** composition lock, (c) **v1.7 TEST-01/02/03 title collision** in the same engine file (different meanings), and (d) COL process traps always pass `confirmedTypeHeader`, so they prove override/cells correctly but do not assert **scorer `suggestedHeader` on the 409 process path**.

**Primary recommendation:** One plan — extend `tests/bridge-engine.test.js` with v1.8-named processUpload locks (reuse + fill gaps), keep existing COL/GATE/LBL green, run `npm test` + `scripts/verify-live.ps1`. No new npm packages. No product code unless a lock fails (then fix 51–53 modules only).

---

## User Constraints

**No `54-CONTEXT.md`** — discuss-phase was not run for this phase. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, and the orchestrator brief.

### Locked Decisions (from milestone + brief)

- Phase 54 is **lock-and-ship only** — do **not** re-implement COL/GATE/LBL features
- Requirements: **TEST-01**, **TEST-02**, **TEST-03** (v1.8 meanings — see phase requirements)
- Prefer **extending processUpload / engine tests** over new product modules
- Success criteria:
  1. Automated fixture: alias-first would map narrative/date/status → scorer maps true category Type on processUpload
  2. Automated fixture: same city same fingerprint reuses confirmed header without confirm; **fingerprint change requires confirm again**
  3. Automated fixture: short label shortens display; stored type + export + group keys unchanged
  4. `npm test` and `scripts/verify-live.ps1` are green
- AGENTS.md: never wipe filter lists / bridge brain / city formats runtime data; verify-live after public/server edits (Phase 54 should not need public edits)

### Claude's Discretion

- New test file vs extend `tests/bridge-engine.test.js` (recommend **extend**, same as Phase 50)
- Whether to tag/rename existing COL/GATE tests with v1.8 `TEST-*` IDs vs add thin milestone wrappers
- Whether to strengthen COL trap with 409 `suggestedHeader` assert vs rely on pure scorer + override process tests
- Optional one-line update to `docs/bridge/TEST-PLAN.md` or TAGGING-RULES (not required by success criteria)

### Deferred Ideas (OUT OF SCOPE)

- Playwright / browser e2e for confirm modal or Train chrome (human optional smoke already noted in 52/53 VERIFICATION)
- Re-scoring fingerprint to include value-shape signature (Phase 52 locked header-only sha1)
- Multi-tenant auth for confirm
- New scorer heuristics, short-label max changes, format store schema changes
- Monorepo full `scripts/verify.ps1` sweep (not required — CONTEXT for v1.7 used npm test + verify-live only)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **TEST-01** | Automated: sheet where alias-first would map a narrative/date/status column → scorer maps the true category Type column | Pure trap matrix (`bridge-type-column-score.test.js`) + COL process traps (`bridge-engine.test.js`). **Strengthen:** assert 409 `suggestedHeader` is scorer winner for trap CSV **without** confirm; keep process success path mapping true Type (cells High Grass not Open/status). Tag as v1.8 TEST-01. |
| **TEST-02** | Automated: same city same fingerprint reuses confirmed header without confirm; fingerprint change requires confirm again | GATE-03 covers reuse half. **Primary gap:** sequential same-city fingerprint change without confirm → `TYPE_COLUMN_CONFIRM_REQUIRED`. Use dedicated `city.id` isolation. |
| **TEST-03** | Automated: short label shortens display; stored type + export + group keys unchanged; `npm test` + `verify-live` green | LBL unit/export/train-ux green. **Gap:** processUpload e2e with long ordinance type → `reviewGroups.*.shortLabel` shorter, full `violationTypeLabel` / keys / row type preserved. Then full suite + live gate. |

---

## Gap Analysis (current tree vs v1.8 TEST-01..03)

| Req | Unit / component coverage (post-51–53) | processUpload / composition | Gap for Phase 54 |
|-----|----------------------------------------|-----------------------------|------------------|
| **TEST-01** | ✅ Pure trap matrix (Status→Vio Cat, Violation Desc→Issue Type, etc.) | ⚠️ COL-01/04 process traps green but always pass `confirmedTypeHeader` (override path, not live scorer force). GATE-04 asserts `suggestedHeader` is string\|null only — **not** that trap winner is Vio Cat | **Tag + strengthen:** 409 path `suggestedHeader === 'Vio Cat'` for Status/Vio Cat trap; keep/assert process map + cells; title must include v1.8 TEST-01 without colliding meaning with v1.7 TEST-01 |
| **TEST-02** | ✅ Store fingerprint order-independence (`bridge-city-format-store.test.js`) | ✅ GATE-03 reuse; ✅ GATE-02 first-upload confirm; ❌ **no** “seed format A → process format B → 409 again” sequential test | **Add** fingerprint-change reconfirm processUpload (core missing half of TEST-02 wording) |
| **TEST-03** | ✅ Pure short-label; groups LBL-01/02; export LBL-02; train-ux LBL-01/03 | ❌ No engine test asserts `shortLabel` on `result.reviewGroups` from processUpload | **Add** processUpload long-type → shortLabel + full preserved; run `npm test` + `verify-live.ps1` |

**Already green — do not re-implement (only keep green):**

| Area | Evidence |
|------|----------|
| COL-01..04 pure + process | `tests/bridge-type-column-score.test.js` (12), engine COL-01/02/03/04 |
| GATE-01 store | `tests/bridge-city-format-store.test.js` (12) |
| GATE-02/03/04/06 + META-01 + water skip | `tests/bridge-engine.test.js` Phase 52 block |
| API 409 TYPE_COLUMN_CONFIRM | `tests/bridge-api-handlers.test.js` |
| LBL pure / groups / export / train source | short-label, review-groups, export, train-ux tests |
| v1.7 accuracy locks (different TEST IDs) | engine tests titled `(TEST-01)` description-only timestamps, `(TEST-02)` Vio Cat promote, `(TEST-03)` typed stack — **keep; do not overwrite** |
| Full suite baseline | `npm test` → **456 pass / 0 fail** (2026-07-10 research run) |

### Critical naming collision

v1.7 Phase 50 already stamped **TEST-01 / TEST-02 / TEST-03** into `tests/bridge-engine.test.js` with **different semantics**:

| Title fragment | v1.7 meaning (shipped) | v1.8 meaning (this phase) |
|----------------|------------------------|---------------------------|
| TEST-01 | Description-only High Grass + timestamps → 1 group count N | Alias-first trap → true Type column |
| TEST-02 | Unmapped Vio Cat promote + labels | Fingerprint reuse + change reconfirm |
| TEST-03 | Typed High Grass stacks | Short label display-only + suite/live green |

**Planner must use disambiguated titles**, e.g.:

- `TEST-01 (v1.8): processUpload Status Description trap → suggested Type Vio Cat / map not status`
- `TEST-02 (v1.8): same fingerprint auto_reuse; fingerprint change requires confirm again`
- `TEST-03 (v1.8): processUpload long type → shortLabel; full type/keys unchanged`

Avoid bare `(TEST-01)` alone for new tests. Prefer `--test-name-pattern="v1\\.8|TEST-01 \\(v1\\.8\\)"` for focused runs.

---

## Standard Stack

### Core

| Library / Tool | Version / Location | Purpose | Why Standard |
|----------------|--------------------|---------|--------------|
| `node:test` + `node:assert/strict` | Node 20+ | Automated contracts | Project standard (`package.json` `"test": "node --test tests/**/*.test.js"`) |
| `processUpload` / `processUploadBatch` | `lib/bridge-engine` | Full pipeline e2e (parse → gate → normalize → tag → brain → groups) | Only path that proves COL+GATE+LBL composition for Train |
| `scripts/verify-live.ps1` | repo scripts | Health + homepage HTTP 200; auto-ensure server | AGENTS.md mandatory live gate |
| Temp isolation | `config.BRIDGE_BRAIN_ROOT` + `config.BRIDGE_CITY_FORMATS_ROOT` | Test isolation without wiping user data | Already in engine `before`/`after` hooks |

### Supporting

| Module / File | Purpose | When to Use |
|---------------|---------|-------------|
| `tests/bridge-engine.test.js` | **Primary** processUpload contracts | All v1.8 TEST-* e2e locks |
| `tests/bridge-type-column-score.test.js` | Pure COL trap matrix | Keep green; do not duplicate full matrix in engine |
| `tests/bridge-city-format-store.test.js` | GATE-01 fingerprint/store | Keep green |
| `tests/bridge-short-label.test.js` | Pure LBL-01 | Keep green |
| `tests/bridge-review-groups.test.js` | Group LBL-01/02 | Keep green; engine adds composition only |
| `tests/bridge-export.test.js` | LBL-02 export full type | Keep green (TEST-03 export half) |
| `tests/bridge-train-ux.test.js` | LBL-01/03 UI source contracts | Keep green; no Playwright |
| `docs/bridge/TEST-PLAN.md` | Optional case map | Discretion only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `bridge-engine.test.js` | New `tests/bridge-v18-regression.test.js` | Isolates milestone; engine file already owns processUpload + COL/GATE — **prefer extend** (Phase 50 precedent) |
| Full browser e2e | processUpload + group asserts | Out of stack; Train UI contracts already source-level in train-ux |
| Wire verify-live into npm test | Separate PowerShell gate | Live server is not unit; keep separate |
| Re-run pure matrices only | Skip processUpload composition | Would leave TEST-02 change-half and TEST-03 process shortLabel unlocked |

**Installation:** none — zero new npm packages.

```bash
node --test --test-name-pattern="v1\\.8" tests/bridge-engine.test.js
node --test tests/bridge-engine.test.js
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## Architecture Patterns

### Recommended project structure (Phase 54 touch set)

```
tests/
└── bridge-engine.test.js     # EXTEND — v1.8 TEST-01/02/03 processUpload locks

# Optional (discretion):
docs/bridge/TEST-PLAN.md      # one-line v1.8 TEST map

# Read-only unless a lock fails (then bugfix only):
lib/bridge-type-column-score.js
lib/bridge-city-format-store.js
lib/bridge-short-label.js
lib/bridge-review-groups.js
lib/bridge-engine/normalizer.js
lib/bridge-engine/index.js    # resolveTypeColumnGate
scripts/verify-live.ps1
```

### Pattern 1: processUpload contract (engine e2e)

**What:** In-memory CSV buffer → `processUpload({ buffer, filename, city, uploadType, username?, confirmedTypeHeader? })` → assert `processingMeta`, rows, `reviewGroups`.

**When to use:** Any claim that depends on gate + normalizer + tagger + grouping composition.

**Existing harness to copy** (`tests/bridge-engine.test.js`):

```js
// Source: tests/bridge-engine.test.js (before hook)
// Isolates BRIDGE_BRAIN_ROOT + BRIDGE_CITY_FORMATS_ROOT
const CITY = { id: 'arizona-marana', city: 'Marana', state: 'Arizona' };
// Prefer unique city.id per gate sequence test to avoid shared memory pollution
```

### Pattern 2: Disambiguated TEST titles (v1.8)

**What:** Titles include both requirement ID and milestone marker so failures map to REQUIREMENTS.md and do not confuse v1.7 locks.

**Examples:**

```text
TEST-01 (v1.8): Status Description trap → 409 suggestedHeader Vio Cat (scorer on process path)
TEST-01 (v1.8): processUpload maps Type to Vio Cat; cells High Grass not Open
TEST-02 (v1.8): matching fingerprint reuses confirmed Type (auto_reuse)
TEST-02 (v1.8): fingerprint change after confirm requires TYPE_COLUMN_CONFIRM_REQUIRED again
TEST-03 (v1.8): processUpload long type → shortLabel; full label/keys/row type preserved
```

### Pattern 3: Fingerprint-change reconfirm sequence

**What:** Dedicated city id → admin confirm format A → process format B (different header multiset) without confirm → must 409 → admin confirm B succeeds.

**When to use:** TEST-02 second half (success criteria #2).

**Header-only fingerprint:** `computeFormatFingerprint` is order-independent sorted normalized headers (sha1) — **not** full-file hash. Change FP by adding/renaming a real header (e.g. `Vio Cat` → `Issue Type`, or add `Case Number`).

### Pattern 4: Live gate separate from unit suite

**What:** `npm test` never starts HTTP. Phase 54 final task runs `scripts/verify-live.ps1` (exit 0 only if `/api/health` and `/` return 200; auto-ensure/restart if down).

**When to use:** Final verification only. Phase 54 should not edit `public/` or `server.js`; if verify-live fails, restart headless and re-check — do not leave blocking `node server.js` in agent shell.

### Anti-Patterns to Avoid

- **Re-implementing scorer/gate/short-label in tests:** Assert production `processUpload` output only
- **Overwriting v1.7 TEST-01/02/03 tests** or reusing bare `(TEST-01)` titles for new semantics
- **Shared `CITY` pollution:** GATE tests seed `arizona-marana`; fingerprint-change needs unique `city.id`
- **Passing `confirmedTypeHeader` when asserting live scorer suggestion:** Use no-confirm 409 path for suggestedHeader; use confirm/reuse for map/cells
- **Browser automation for short labels:** Server `reviewGroups.shortLabel` is source of truth for Train
- **Wiping `data/bridge-brain/` or `data/bridge-city-formats/`:** Tests use temp roots only
- **Product “improvements” to make a green suite greener:** Phase 54 is a lock; only fix bugs if a contract fails

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type column ranking in e2e | Custom header heuristics in test | Real `processUpload` / gate 409 `candidates` / pure scorer module | Must lock production path |
| Format fingerprint math | Reimplement sha1 in test | Seed via admin confirm; change headers; assert gate codes | Store + gate already unit-locked |
| Short-label heuristic in engine test | Copy dash/clause rules | Assert length + full preservation via process groups | Pure matrix already covers heuristic |
| Live health check | Ad-hoc curl in chat | `scripts/verify-live.ps1` | Ensures + restarts headless; AGENTS.md |
| New test framework | Jest/Vitest | `node:test` | Project standard |
| New fixture files | Large golden CSV corpus | Inline CSV strings (existing engine pattern) | Fast, readable, no fixture drift |
| Confirm UI e2e | Playwright | API/engine 409 + existing train-ux source tests | Out of scope for lock phase |

**Key insight:** Unit tests prove pieces (score, fingerprint, shortLabel). Phase 54 locks the **composed** processUpload path Train/Filter actually sees — especially the two underspecified compositions (FP change reconfirm; process shortLabel).

---

## Common Pitfalls

### Pitfall 1: Confusing v1.7 TEST-* with v1.8 TEST-*

**What goes wrong:** Planner renames or “fixes” description-only TEST-01 thinking it is the alias-first trap lock.

**Why it happens:** Same IDs reused across milestones in one file.

**How to avoid:** Always use `TEST-0N (v1.8): …` titles; leave v1.7 tests untouched.

**Warning signs:** Focused pattern `TEST-01` runs the wrong semantic; verification maps wrong evidence.

### Pitfall 2: Claiming TEST-01 locked only via confirmedTypeHeader override

**What goes wrong:** Process succeeds with `confirmedTypeHeader: 'Vio Cat'` without ever proving scorer suggested Vio Cat on process path.

**Why it happens:** After Phase 52, code_violation success path always sets `typeColumnOverride` (confirm or reuse); live scorer force is water-only unless override omitted.

**How to avoid:** For scorer-on-process proof: no confirm → catch `TYPE_COLUMN_CONFIRM_REQUIRED` → assert `details.suggestedHeader === 'Vio Cat'` (and optionally candidates[0]). Separately assert success path cells when Type is Vio Cat.

**Warning signs:** All COL process tests pass `confirmedTypeHeader`; no assert on `suggestedHeader` equality.

### Pitfall 3: Fingerprint “change” that does not change fingerprint

**What goes wrong:** Reorder columns or change cell values only — FP stays same → auto_reuse unexpectedly.

**Why it happens:** Fingerprint is order-independent **headers only** (Phase 52 plan lock).

**How to avoid:** Change header multiset (rename Type column, add real column). Assert FP strings differ if needed via store helper or 409 details.

**Warning signs:** Test expects 409 but gets 200 auto_reuse.

### Pitfall 4: City format memory pollution across tests

**What goes wrong:** Prior GATE-04/03 seeds `arizona-marana`; new TEST-02 change test flaky depending on order.

**Why it happens:** Shared `tempFormatsRoot` for whole file; same city id reuses memory.

**How to avoid:** Unique `city: { id: 'v18-fp-change-city', … }` for sequential change tests; GATE-03 may stay on CITY or use its own id.

**Warning signs:** Intermittent GATE-02 failures if something seeds CITY before first-upload test (current order works — do not reorder carelessly).

### Pitfall 5: TEST-03 rows not Strong Distressed / no groups

**What goes wrong:** Long type without vegetation keywords → FN or discard; shortLabel assert on empty distressed.

**Why it happens:** Keep filter is distress-only for code_violation.

**How to avoid:** Long type must still read as High Grass / weeds (or put weeds in notes with Type long ordinance that includes High Grass). Assert `result.rows.length >= 1` before groups.

**Warning signs:** `reviewGroups.distressed` empty; only notDistressed has shortLabel.

### Pitfall 6: Treating verify-live as optional

**What goes wrong:** Suite green, local server dead — Phase 54 success criteria #4 fails.

**How to avoid:** Explicit final task: `verify-live.ps1` exit 0. No public edits expected; restart if down.

**Warning signs:** Agent ends without health 200.

### Pitfall 7: Product scope creep

**What goes wrong:** “While we’re here” scorer tweaks or short-label max changes.

**How to avoid:** Phase 54 plan files_modified should be tests (+ optional docs) only unless a lock fails.

---

## Code Examples

Verified patterns from the current tree (adapt for v1.8 titles).

### TEST-01 — scorer suggestion on process path (409)

```js
// Source: adapt from tests/bridge-engine.test.js GATE-04 + COL trap CSV
// Pattern: no confirmedTypeHeader → TYPE_COLUMN_CONFIRM_REQUIRED
const csv = [
  'Property Address,Status Description,Vio Cat,Description,Open Date',
  '100 Main St,Open,High Grass,Weeds exceeding 12 inches as of 01/15/2024 10:30,01/15/2024',
  '200 Oak Ave,Closed,Trash,Junk in yard observed 02/01/2024 09:00,02/01/2024'
].join('\n');

let caught;
try {
  await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'v18-test01-trap.csv',
    city: { id: 'v18-col-trap-city', city: 'TrapTown', state: 'Arizona' },
    uploadType: 'code_violation'
  });
} catch (err) {
  caught = err;
}
assert.equal(caught.code, 'TYPE_COLUMN_CONFIRM_REQUIRED');
assert.equal(
  (caught.details || caught).suggestedHeader,
  'Vio Cat',
  'TEST-01 (v1.8): scorer suggestedHeader must beat Status Description on process path'
);
```

### TEST-01 — process map + cells (existing COL-01/04; tag as v1.8)

```js
// Source: tests/bridge-engine.test.js COL-01/04 (~L895)
// Keep asserts: columnMap.violationIssueType === 'Vio Cat'
// type cell includes High Grass, not Open
// Optionally rename title to include "TEST-01 (v1.8)" without removing COL-01/04 tags
```

### TEST-02 — reuse (existing GATE-03; tag)

```js
// Source: tests/bridge-engine.test.js GATE-03 (~L1149)
// seed admin confirm → reprocess without confirmedTypeHeader
// assert ok, columnMap Vio Cat, typeResolution.source === 'auto_reuse', formatMatched true
```

### TEST-02 — fingerprint change requires confirm again (NEW)

```js
// Recommended new contract
const city = { id: 'v18-fp-change-city', city: 'FpChange', state: 'Arizona' };
const formatA = [
  'Property Address,Status Description,Vio Cat,Open Date',
  '100 Main St,Open,High Grass,01/15/2024'
].join('\n');
const formatB = [
  'Property Address,Status Description,Issue Type,Open Date',
  '100 Main St,Open,High Grass,01/15/2024'
].join('\n'); // different header multiset → new fingerprint

await processUpload({
  buffer: Buffer.from(formatA, 'utf8'),
  filename: 'fp-a.csv',
  city,
  uploadType: 'code_violation',
  username: 'admin',
  confirmedTypeHeader: 'Vio Cat'
});

await assert.rejects(
  () =>
    processUpload({
      buffer: Buffer.from(formatB, 'utf8'),
      filename: 'fp-b.csv',
      city,
      uploadType: 'code_violation'
      // no confirm
    }),
  (err) => err && err.code === 'TYPE_COLUMN_CONFIRM_REQUIRED'
);
```

### TEST-03 — processUpload shortLabel composition (NEW)

```js
// Long ordinance-style type that still tags Strong Distressed
const longType =
  'High Grass and Weeds — Sec. 12-34 of the municipal code regarding vegetation height limits on residential parcels and enforcement procedures';
const csv = [
  'Property Address,Violation Type,Notes',
  `100 Main St,"${longType}",inspector field notes`,
  `200 Oak Ave,"${longType}",second parcel`
].join('\n');

const result = await processUpload({
  buffer: Buffer.from(csv, 'utf8'),
  filename: 'v18-shortlabel.csv',
  city: { id: 'v18-lbl-city', city: 'LabelVille', state: 'Arizona' },
  uploadType: 'code_violation',
  username: 'admin',
  confirmedTypeHeader: 'Violation Type'
});

const g = (result.reviewGroups.distressed || []).find((x) =>
  /high grass/i.test(x.violationTypeLabel || '')
);
assert.ok(g, 'TEST-03 (v1.8): distressed group exists');
assert.equal(typeof g.shortLabel, 'string');
assert.ok(g.shortLabel.length <= 64);
assert.ok(g.shortLabel.length < g.violationTypeLabel.length);
assert.ok(
  g.violationTypeLabel.includes('Sec.') || g.violationTypeLabel.length > g.shortLabel.length,
  'full label not replaced by short'
);
// Keys / row types full — not shortLabel
assert.ok(!String(g.violationTypeKey || '').includes('…'));
const row = result.rows.find((r) => String(r.streetAddress || '').includes('100 Main'));
assert.ok(row && String(row.violationIssueType).includes('High Grass'));
assert.ok(String(row.violationIssueType).length >= g.shortLabel.length);
```

### Suite + live gates

```bash
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Alias-first `detectIntakeColumnMap` Type | Scorer force / confirm override always wins Type map | Phase 51–52 | Alias table is scoring feature only |
| No per-city format memory | `BRIDGE_CITY_FORMATS_ROOT` + 409 confirm gate | Phase 52 | First/change → confirm; same FP → auto_reuse |
| Full walls in Train titles | Parallel `shortLabel` on groups only | Phase 53 | Display-only; keys/export/decisions full |
| v1.7 Phase 50 TEST-* | Description-only / promote / typed stack locks | 2026-07-10 | Still green; **different** from v1.8 TEST-* |

**Deprecated/outdated for this phase:**

- Relying solely on pure unit matrices for milestone ship (composition gaps remain)
- Bare `TEST-01` titles without milestone marker (collides with v1.7)

---

## Open Questions

1. **Should existing COL-01/04 / GATE-03 tests be renamed in place or duplicated with v1.8 titles?**  
   - What we know: Both approaches satisfy traceability if titles include `TEST-0N (v1.8)`.  
   - What's unclear: Preference for git blame / minimal diff.  
   - **Recommendation:** Prefer **add thin v1.8-named tests** that call shared fixtures (or rename titles to include both tags, e.g. `COL-01/04 / TEST-01 (v1.8): …`). Avoid deleting COL/GATE tags.

2. **Is 409 suggestedHeader enough for TEST-01, or must live scorer force run without override?**  
   - What we know: code_violation success always sets override; scorer ranks candidates pre-normalize for 409.  
   - What's unclear: REQUIREMENTS wording “scorer maps … on processUpload” could mean suggestion or final map.  
   - **Recommendation:** Lock **both** suggestedHeader (scorer) and success map/cells (true Type column used). That matches success criteria #1.

3. **Optional docs?**  
   - What we know: Phase 50 added TAGGING-RULES note; not required by v1.8 success criteria.  
   - **Recommendation:** Skip unless planner wants TEST-PLAN one-liner; do not block ship on docs.

---

## Validation Architecture

> Nyquist enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` (Node 20+) |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test --test-name-pattern="v1\\.8" tests/bridge-engine.test.js` |
| Full suite command | `npm test` |
| Live gate | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TEST-01 | Alias-first trap → scorer suggests true Type on process path | processUpload e2e (409) | `node --test --test-name-pattern="TEST-01 \\(v1\\.8\\)" tests/bridge-engine.test.js` | ⚠️ Partial — pure + COL override process; **missing** suggestedHeader equality lock |
| TEST-01 | Process maps Type column; cells not status/narrative | processUpload e2e | same pattern / `COL-01` | ✅ COL-01/04 engine tests (tag as v1.8) |
| TEST-02 | Same FP reuses without confirm (`auto_reuse`) | processUpload e2e | `node --test --test-name-pattern="GATE-03|TEST-02 \\(v1\\.8\\)" tests/bridge-engine.test.js` | ✅ GATE-03 (tag as v1.8) |
| TEST-02 | Fingerprint change requires confirm again | processUpload e2e | same | ❌ **Wave 0 — add** |
| TEST-03 | processUpload shortLabel shortens; full type/keys/rows preserved | processUpload e2e | `node --test --test-name-pattern="TEST-03 \\(v1\\.8\\)" tests/bridge-engine.test.js` | ❌ **Wave 0 — add** (unit LBL exists) |
| TEST-03 | Export full type not shortLabel | unit | `node --test tests/bridge-export.test.js` | ✅ |
| TEST-03 | Full suite green | suite | `npm test` | ✅ infra (456 baseline) |
| TEST-03 | Live server green | smoke | `scripts\verify-live.ps1` | ✅ script exists |

### Sampling Rate

- **Per task commit:** `node --test --test-name-pattern="v1\\.8|COL-01|GATE-03|LBL" tests/bridge-engine.test.js tests/bridge-type-column-score.test.js tests/bridge-short-label.test.js tests/bridge-review-groups.test.js tests/bridge-export.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green **and** `scripts/verify-live.ps1` exit 0 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-engine.test.js` — **TEST-01 (v1.8)** 409 `suggestedHeader` trap lock (Status Description + Vio Cat)
- [ ] `tests/bridge-engine.test.js` — **TEST-01 (v1.8)** tag/keep COL process map+cells asserts
- [ ] `tests/bridge-engine.test.js` — **TEST-02 (v1.8)** fingerprint-change reconfirm after seed (primary new test)
- [ ] `tests/bridge-engine.test.js` — **TEST-02 (v1.8)** tag/keep GATE-03 reuse
- [ ] `tests/bridge-engine.test.js` — **TEST-03 (v1.8)** processUpload long type → `shortLabel` + full preserved
- [ ] Final gate tasks: `npm test` + `scripts/verify-live.ps1` (no new framework install)

*(Unit LBL/COL/GATE files already exist — do not recreate pure matrices.)*

### Recommended plan shape (for planner)

**Single plan (Phase 50 precedent)** with 2–3 tasks:

1. **Task 1 — TEST-01 + TEST-02 locks:** suggestedHeader trap + FP change reconfirm + tag reuse/COL process  
2. **Task 2 — TEST-03 process shortLabel + suite + live:** engine shortLabel composition; `npm test`; `verify-live.ps1`

Optional Wave 0: if TDD-red preferred, add failing tests first then green (they should mostly pass once written if product is correct — except gaps are assertions not missing features).

---

## Sources

### Primary (HIGH confidence)

- `.planning/REQUIREMENTS.md` — v1.8 TEST-01..03 wording + traceability to Phase 54
- `.planning/ROADMAP.md` — Phase 54 success criteria
- `.planning/STATE.md` — Phase 53 complete; Phase 54 next
- `.planning/phases/51–53-*/51|52|53-VERIFICATION.md` — what is already verified
- `.planning/phases/50-regression-lock/50-RESEARCH.md` + `50-01-PLAN.md` — prior milestone lock pattern
- `tests/bridge-engine.test.js` — COL/GATE/v1.7 TEST process contracts (read + run)
- `lib/bridge-engine/index.js` — `resolveTypeColumnGate` (409 details, memoryMatch, override)
- `lib/bridge-engine/normalizer.js` — `forceTypeColumn` / scorer override semantics
- `package.json` — `npm test` script
- `scripts/verify-live.ps1` — live gate
- `AGENTS.md` — no wipe runtime data; verify-live rules
- Local run 2026-07-10: related files 94 pass; engine 41 pass; full suite **456 pass / 0 fail**

### Secondary (MEDIUM confidence)

- Phase 52 note: fingerprint is header-only (not value-shape) — from 52-VERIFICATION + store tests
- Orchestrator brief: prefer extend engine tests; no product re-implementation

### Tertiary (LOW confidence)

- None material — gaps are from direct inventory of test titles/asserts, not external ecosystem research

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Same node:test + processUpload + verify-live as Phase 50; confirmed in package.json + suite run |
| Architecture | HIGH | Gate/normalizer/groups code paths read; patterns copy existing engine harness |
| Gap analysis | HIGH | Grep + full read of engine COL/GATE block; suite green; missing FP-change + process shortLabel confirmed absent |
| Pitfalls | HIGH | Drawn from Phase 50 research + observed CITY pollution + override-vs-scorer semantics in normalizer/gate |
| Product changes needed | HIGH | **None expected** if composition already wired (51–53 VERIFICATION passed) |

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (30 days — stable internal test lock; re-inventory if 51–53 modules change)

---

## RESEARCH COMPLETE

**Phase:** 54 - Regression Lock  
**Confidence:** HIGH

### Key Findings

- Phase 54 is **tests + gates only** — COL/GATE/LBL product code already shipped and unit-locked (suite baseline **456 green**).
- **Real gaps:** (1) fingerprint-**change** reconfirm processUpload, (2) processUpload → `reviewGroups.shortLabel` composition, (3) scorer `suggestedHeader` equality on 409 for alias-first trap, (4) v1.8 TEST-* title disambiguation vs v1.7 TEST-*.
- Prefer **one plan**, extend `tests/bridge-engine.test.js`, unique `city.id`s, then `npm test` + `scripts/verify-live.ps1`.
- Do **not** overwrite v1.7 `(TEST-01|02|03)` engine tests — different milestone semantics.
- Zero new packages; no public/server edits expected (verify-live still required for success criteria #4).

### File Created

`.planning/phases/54-regression-lock/54-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | node:test + processUpload + verify-live verified in repo |
| Architecture | HIGH | Gate/normalizer/groups paths and harness documented |
| Pitfalls | HIGH | Name collision, override-vs-scorer, FP header-only, city pollution |

### Open Questions

- Rename-in-place vs add v1.8-titled wrappers for existing COL/GATE tests (recommend dual-tag or thin wrappers).
- Optional TEST-PLAN.md one-liner (non-blocking).

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
