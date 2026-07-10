# Phase 60: Regression QA Lock - Research

**Researched:** 2026-07-10  
**Domain:** v2.0 Filter Independence & Learning — permanent milestone regression bar (independence + gold accuracy + processUpload e2e + full suite + live gate)  
**Confidence:** HIGH

## Summary

Phase 60 does **not** implement product features. Phases 55–59 already ship independence, list factory UX, gold accuracy fixtures, learning metrics, and efficiency path polish. The full suite is currently **519 pass / 0 fail**. Live gate tooling (`scripts/verify-live.ps1`) is green (health=200 home=200). Focused bar suites are green: independence **10/10**, gold **8/8**, engine Type/format/water + IND-04 + v1.7/v1.8 TEST patterns **23/23** under a representative name pattern.

What remains is the **milestone permanent bar** required by **v2.0 TEST-01..03**: (1) independence regression contracts for no-push + `already_imported` default-off stay in CI (`npm test`), (2) ACC gold fixtures stay in `npm test` and green, (3) `scripts/verify-live.ps1` green after milestone work with processUpload e2e still covering Type / format / water paths. This is a **lock-and-ship** phase in the same family as Phases 50 and 54 — package existing green contracts into durable, named, documented gates rather than re-building Filter.

**Primary recommendation:** Prefer **docs + optional thin v2.0 TEST titles + suite/live ship gate** over new product code. Zero new npm packages. Do not re-implement IND/ACC/EFF. Only fix product modules if a lock fails. Recommend **2 plans** (Plan 01: permanent bar packaging; Plan 02: full `npm test` + verify-live) matching Phase 54 precedent.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

**No `60-CONTEXT.md`** — discuss-phase was not run for this phase. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, PROJECT.md, prior phase verifications, and the orchestrator brief.

### Locked Decisions

- Phase 60 is **lock-and-ship only** — do **not** re-implement IND/LIST/ACC/LRN/EFF product features
- Requirements: **TEST-01**, **TEST-02**, **TEST-03** (v2.0 meanings — see phase requirements; **not** v1.7/v1.8 TEST IDs)
- Prefer **wiring existing suites into permanent CI contracts** and filling any e2e gaps over new product features
- Success criteria:
  1. Independence regression suite locks no-push + `already_imported` default-off behavior in CI
  2. Gold accuracy fixtures from ACC run in `npm test` and stay green
  3. `scripts/verify-live.ps1` green after milestone work; processUpload e2e still covers Type/format/water paths
- **CI in this repo** means `npm test` (`node --test tests/**/*.test.js`) — no GitHub Actions / external CI config present
- AGENTS.md: never wipe filter lists / bridge brain / Form Forge / Analyzer user stores; verify-live after public/server edits (Phase 60 should not need public/server edits)
- Depends on Phases 55–59 (all complete)

### Claude's Discretion

- New milestone meta-file vs tag existing test titles with `TEST-0N (v2.0)`
- Whether to add IND-04 into `bridge-independence.test.js` for literal “independence suite locks already_imported” wording vs document engine IND-04 as part of the independence bar
- Whether to add optional npm script aliases (`test:independence`, `test:gold`, `test:v2-bar`) — not required by success criteria
- Optional one-line update to `docs/bridge/TEST-PLAN.md` (recommended) and light DATA-STANDARDS / GSD-AUDIT pointers
- One plan vs two (recommend **2**: packaging then suite+live gate, Phase 54 pattern)

### Deferred Ideas (OUT OF SCOPE)

- Playwright / browser e2e for Train chrome, confirm modal, flash download (human optional smoke already noted in 56/59 VERIFICATION)
- New gold cities or accuracy tagger rework (Phase 57 complete)
- Learning dashboard expansion (Phase 58 complete; LRN not reopened)
- Soft-flag `already_imported` UI without drop
- External CI provider (GitHub Actions) setup
- Monorepo full `scripts/verify.ps1` cross-app sweep (not required — prior locks used `npm test` + verify-live only)
- Product “efficiency” or Type scorer changes “to make the suite greener”
- Wiping runtime data stores
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **TEST-01** | Independence regression suite locks no-push + `already_imported` default-off behavior | **Exists:** `tests/bridge-independence.test.js` (IND-01/02/03 static bans + process/save no Analyze sessions); engine/edge/stress `IND-04` processUpload default-off + opt-in hard-drop. **Gap:** no single v2.0-named permanent bar title; IND-04 lives outside the independence file; TEST-PLAN lacks IND/TEST-01 map. **Action:** keep green + package (tag/docs; optional IND-04 add to independence file). |
| **TEST-02** | Gold accuracy fixtures from ACC run in CI (`npm test`) and stay green | **Exists:** `tests/bridge-accuracy-gold.test.js` (8 ACC-01/02/03 contracts) + `tests/fixtures/bridge/gold/*` already matched by `tests/**/*.test.js`. **Gap:** no explicit `TEST-02 (v2.0)` label; bar is de-facto green. **Action:** re-run + document permanent inclusion; optional title tag. |
| **TEST-03** | `scripts/verify-live.ps1` green after milestone work; processUpload e2e still covers Type/format/water paths | **Exists:** engine COL/GATE/water/BRAIN-03 + gold water-hostile + v1.8 Type/format locks; verify-live green at research time. **Gap:** no explicit v2.0 ship-gate packaging / TEST-PLAN line. **Action:** assert Type/format/water still green under focused patterns; full suite + verify-live final task. |
</phase_requirements>

---

## Gap Analysis (current tree vs v2.0 TEST-01..03)

| Req | Existing automated coverage (post-55–59) | In `npm test`? | Gap for Phase 60 |
|-----|------------------------------------------|----------------|------------------|
| **TEST-01** no-push | ✅ `bridge-independence.test.js` — 6 static write-path bans, module absence, process + list save no `analyzerPush` / no Analyzer session files | ✅ yes | **Packaging:** name as permanent v2.0 bar; ensure cannot be deleted silently (TEST-PLAN + titles) |
| **TEST-01** `already_imported` default-off | ✅ Engine IND-04 (default keep + opt-in drop); edge + stress IND-04 doubles | ✅ yes | **Wording gap:** not inside independence file. Prefer add thin IND-04 to independence suite **or** document independence bar = independence file + IND-04 engine patterns |
| **TEST-02** gold ACC | ✅ `bridge-accuracy-gold.test.js` 8/8 + 5 gold fixtures | ✅ yes | **Lock only** — re-assert green; optional `TEST-02 (v2.0)` title on file header/tests |
| **TEST-03** Type e2e | ✅ COL-01..04, TEST-01 (v1.8) trap/map, gold type-trap | ✅ yes | Keep green; do not overwrite v1.7/v1.8 titles |
| **TEST-03** format e2e | ✅ GATE-02/03/04/06, TEST-02 (v1.8) FP change | ✅ yes | Keep green |
| **TEST-03** water e2e | ✅ water_shut_off process, BRAIN-03 ignore suppress, GATE water skip, gold water-hostile | ✅ yes | Keep green |
| **TEST-03** live | ✅ `scripts/verify-live.ps1` health+home 200 | n/a (separate) | Explicit final gate task |

**Research-time baseline (2026-07-10):**

| Gate | Result |
|------|--------|
| `node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js` | **18 pass / 0 fail** |
| `node --test --test-name-pattern="IND-04\|GATE-\|COL-\|water\|TEST-0" tests/bridge-engine.test.js` | **23 pass / 0 fail** |
| `npm test` | **519 pass / 0 fail** (~6.3s) |
| `scripts/verify-live.ps1` | **LIVE ok health=200 home=200** |

**Already green — do not re-implement (only keep green):**

| Area | Evidence |
|------|----------|
| IND-01..03 independence | `tests/bridge-independence.test.js` (Phase 55-02) |
| IND-04 default-off | `tests/bridge-engine.test.js`, `bridge-edge-cases.test.js`, `bridge-stress.test.js` |
| ACC gold keep/deny/water/type/silent-drop | `tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/` |
| LIST factory UX | `tests/bridge-list-factory-ux.test.js` |
| LRN metrics anti-game | `tests/bridge-learning-metrics.test.js` |
| EFF path + anti re-couple | `tests/bridge-efficiency-path.test.js` |
| v1.7 TEST-01/02/03 (different meanings) | engine description-only / Vio Cat / typed stack |
| v1.8 TEST-01/02/03 (different meanings) | engine scorer trap / FP change / shortLabel |
| Live server gate | `scripts/verify-live.ps1` |

### Critical naming collision (carry-forward from Phase 54)

`TEST-01` / `TEST-02` / `TEST-03` are **reused across milestones** with different semantics:

| Title fragment | v1.7 | v1.8 | **v2.0 (this phase)** |
|----------------|------|------|------------------------|
| TEST-01 | Description-only High Grass timestamps → 1 group | Alias-first trap → true Type column | **Independence: no-push + already_imported default-off** |
| TEST-02 | Unmapped Vio Cat promote | Fingerprint reuse + change reconfirm | **Gold ACC fixtures in npm test** |
| TEST-03 | Typed High Grass stacks + suite/live | Short label display-only + suite/live | **verify-live + processUpload Type/format/water still covered** |

**Planner must use disambiguated titles** for any *new* tests:

- `TEST-01 (v2.0): …`
- `TEST-02 (v2.0): …`
- `TEST-03 (v2.0): …`

Leave all bare `(TEST-01)` v1.7 and `TEST-0N (v1.8)` tests **untouched**. Focused runs:

```bash
node --test --test-name-pattern="v2\\.0" tests/**/*.test.js
node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js
npm test
```

---

## Standard Stack

### Core

| Library / Tool | Version / Location | Purpose | Why Standard |
|----------------|--------------------|---------|--------------|
| `node:test` + `node:assert/strict` | Node 20+ | Automated contracts | Project standard (`package.json` `"test": "node --test tests/**/*.test.js"`) |
| `processUpload` / `processUploadBatch` | `lib/bridge-engine` | Full pipeline e2e | Proves Type/format/water/IND-04 composition |
| `tests/bridge-independence.test.js` | Phase 55 | No-push permanent bar | Static bans + process/save negatives |
| `tests/bridge-accuracy-gold.test.js` | Phase 57 | ACC gold permanent bar | Keep/deny/water/type/silent-drop |
| `scripts/verify-live.ps1` | repo scripts | Health + homepage HTTP 200; auto-ensure server | AGENTS.md mandatory live gate |
| Temp isolation | `config.BRIDGE_BRAIN_ROOT`, `BRIDGE_CITY_FORMATS_ROOT`, `FILTER_LISTS_ROOT`, `ANALYZER_DATA_ROOT` | Test isolation without wiping user data | Existing before/after hooks |

### Supporting

| Module / File | Purpose | When to Use |
|---------------|---------|-------------|
| `tests/bridge-engine.test.js` | IND-04 + COL/GATE/water + v1.7/v1.8 TEST e2e | Keep green; optional thin v2.0 tags only |
| `tests/bridge-edge-cases.test.js` / `bridge-stress.test.js` | IND-04 doubles | Keep green |
| `tests/fixtures/bridge/gold/*` | ACC fixture corpus | Do not delete; gold suite depends on them |
| `docs/bridge/TEST-PLAN.md` | Case → automated file map | **Recommended** permanent bar section for TEST-01..03 (v2.0) |
| `docs/bridge/DATA-STANDARDS.md` / `GSD-AUDIT.md` | Independence / already_imported policy | Already document IND; optional cross-link |
| `scripts/restart.ps1` / `ensure-server.ps1` | Headless server | Only if verify-live needs ensure |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tag/docs existing suites | New `tests/bridge-v20-regression-bar.test.js` that re-runs all contracts | Isolates milestone names; **risk of duplication**. Prefer tag + TEST-PLAN unless planner wants a thin meta file that only asserts bar files exist + runs 1–2 smoke asserts |
| Move IND-04 into independence file | Leave IND-04 only in engine | Independence wording of TEST-01 is cleaner if IND-04 also lives in independence suite (small processUpload copy or shared helper) |
| Wire verify-live into `npm test` | Separate PowerShell gate | Live server is not unit; keep separate per AGENTS.md / Phase 50–54 |
| GitHub Actions CI | Document `npm test` as CI | No Actions config today; success criteria say “CI” = suite that agents/humans run before ship |
| Playwright e2e | processUpload + static UI contracts | Out of stack; 56/59 already use source-level UI locks |

**Installation:** none — zero new npm packages.

```bash
# Permanent bar (quick)
node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js
node --test --test-name-pattern="IND-04|GATE-|COL-|water|TEST-0" tests/bridge-engine.test.js

# Full suite + live (ship gate)
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## Architecture Patterns

### Recommended project structure (Phase 60 touch set)

```
tests/
├── bridge-independence.test.js     # KEEP / optional: add IND-04 + TEST-01 (v2.0) titles
├── bridge-accuracy-gold.test.js    # KEEP / optional: TEST-02 (v2.0) titles in headers
├── bridge-engine.test.js           # KEEP green — Type/format/water/IND-04 (read-only unless red)
└── fixtures/bridge/gold/           # KEEP — ACC corpus (never delete)

docs/bridge/
└── TEST-PLAN.md                    # EXTEND — permanent v2.0 bar map (TEST-01..03)

scripts/
└── verify-live.ps1                 # RUN only — do not rewrite unless broken

# Read-only product (fix only if a lock fails):
lib/bridge-engine/index.js          # IND-04 gate, processUpload composition
lib/bridge-api.js
lib/bridge-list-store.js
# never reintroduce: lib/bridge-analyzer-push.js
```

### Pattern 1: Milestone regression lock (Phase 50/54 family)

**What:** Final milestone phase packages already-green contracts into named permanent gates + suite/live ship.

**When to use:** After all product phases for a milestone complete (here: 55–59).

**How:**

1. Inventory existing suites vs REQUIREMENTS TEST-IDs (this RESEARCH).
2. Fill only true gaps (titles, docs, missing half-asserts).
3. Run full `npm test`.
4. Run `scripts/verify-live.ps1`.
5. Record exact pass counts in SUMMARY for drift tracking (Phase 54: 460; Phase 55: 471; Phase 57: 490; Phase 59: 519; Phase 60 research: **519**).

### Pattern 2: Independence permanent bar (TEST-01)

**What:** Two layers must both stay green:

1. **No-push / no Analyze write** — static string bans on Filter write paths + deleted adapter + process/list API negatives (`bridge-independence.test.js`).
2. **`already_imported` default-off** — `opts.applyAlreadyImportedFilter === true` strict gate in `lib/bridge-engine/index.js`; default path never loads import index / never hard-drops.

**Recommended packaging (planner choice):**

| Option | Action | Pros |
|--------|--------|------|
| **A (preferred)** | Add 1–2 thin tests to `bridge-independence.test.js` titled `TEST-01 (v2.0): already_imported default-off` (+ optional opt-in still works), reusing engine IND-04 CSV pattern with isolated temp roots | Literal “independence suite locks both” |
| **B** | Document bar = independence file + engine IND-04; only add TEST-PLAN + title comments | Zero duplication; slightly weaker file cohesion |

Do **not** re-delete push module work or rewrite engine gate if already green.

### Pattern 3: Gold permanent bar (TEST-02)

**What:** `tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/` must remain under `tests/` so `npm test` always picks them up.

**When to use:** Any claim that ACC keep/deny/water/type/silent-drop still holds for the milestone.

**Do not:** Move gold fixtures out of `tests/`, skip gold file, or replace processUpload gold with pure unit-only tagger tests.

### Pattern 4: processUpload Type/format/water composition (TEST-03 half)

**What:** Assert the three operator-critical process paths remain covered by existing engine/gold e2e — not new product behavior.

| Path | Canonical existing locks |
|------|--------------------------|
| **Type** | COL-01/04, TEST-01 (v1.8) 409 suggestedHeader + map cells, gold type-trap |
| **Format** | GATE-02 first confirm, GATE-03 auto_reuse, TEST-02 (v1.8) FP change reconfirm |
| **Water** | water_shut_off process, GATE water skip confirm, BRAIN-03 ignore suppress, gold water-hostile |

**When to use:** Final focused run before suite/live ship. Only add a new processUpload if one path is missing (research finds **none missing**).

### Pattern 5: Live gate separate from unit suite

**What:** `npm test` never starts HTTP. Phase 60 final task runs `scripts/verify-live.ps1` (exit 0 only if `/api/health` and `/` return 200; auto-ensure/restart if down).

**When to use:** Final verification only. Phase 60 should not edit `public/` or `server.js`; if verify-live fails, restart headless and re-check — never leave blocking `node server.js` in agent shell.

### Pattern 6: Disambiguated TEST titles (v2.0)

**What:** Titles include both requirement ID and milestone marker.

**Examples:**

```text
TEST-01 (v2.0): Filter write paths ban Analyze push strings
TEST-01 (v2.0): process success never invents Analyzer session files
TEST-01 (v2.0): already_imported hard-drop off by default
TEST-02 (v2.0): gold ACC suite remains in npm test (keep/deny/water/type)
TEST-03 (v2.0): processUpload Type/format/water e2e still green (meta / focused gate)
```

Existing ACC-01/IND-01 titles may stay; adding `(v2.0)` is optional if TEST-PLAN maps clearly.

### Anti-Patterns to Avoid

- **Re-implementing independence or gold product code** — Phase 60 is a lock; only bugfix if red
- **Overwriting v1.7 / v1.8 TEST-01/02/03 titles** or reusing bare `(TEST-01)` for new semantics
- **Deleting gold fixtures** or independence suite “to clean up”
- **Claiming TEST-01 locked without already_imported** — no-push alone is incomplete
- **Claiming TEST-02 locked via unit tagger only** — gold processUpload is the ACC bar
- **Browser automation for lock phase** — processUpload + static UI contracts suffice
- **Wiping `data/filter-lists/` / `data/bridge-brain/` / Analyzer sessions**
- **Wiring live server into unit suite**
- **Product scope creep** (“while we’re here” scorer/UX polish)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| No-push proof | Custom mock Analyze importer | Existing independence static bans + process/save negatives | Production write paths already scanned |
| already_imported default-off | Reimplement import-filter in test | Real `processUpload` with stubbed index + assert default does not load/drop | Must lock production gate `=== true` |
| Gold keep/kill | New fixture framework | Existing `bridge-accuracy-gold.test.js` + gold CSV/TXT | Phase 57 corpus is the ACC bar |
| Type/format/water e2e | Playwright | Existing engine COL/GATE/water + gold water | Already composition-locked |
| Live health check | Ad-hoc curl in chat | `scripts/verify-live.ps1` | Ensures + restarts headless; AGENTS.md |
| New test framework | Jest/Vitest | `node:test` | Project standard |
| External CI YAML | GitHub Actions for this phase | `npm test` as CI contract | No Actions in repo; success criteria satisfied by suite permanence |
| Full re-audit of Filter | New product phase | Phases 55–59 VERIFICATION + this bar | Milestone already product-complete |

**Key insight:** Unit and phase suites already prove the pieces. Phase 60 freezes the **composed milestone bar** so future work cannot re-couple Analyze, drop gold, or ship with a dead server.

---

## Common Pitfalls

### Pitfall 1: Confusing v1.7 / v1.8 / v2.0 TEST-* IDs

**What goes wrong:** Planner renames description-only TEST-01 thinking it is independence lock.

**Why it happens:** Same IDs reused across milestones in one engine file + REQUIREMENTS.

**How to avoid:** Always use `TEST-0N (v2.0): …` for new titles; leave v1.7 and v1.8 tests untouched; map evidence carefully in VERIFICATION.

**Warning signs:** Focused pattern `TEST-01` runs wrong semantic; verification maps wrong evidence.

### Pitfall 2: Declaring TEST-01 done from independence file alone

**What goes wrong:** No-push green but `already_imported` default-off not treated as permanent bar (or someone re-enables default drop later without CI fail).

**Why it happens:** IND-04 lives in engine/edge/stress, not independence header.

**How to avoid:** Explicitly include IND-04 in TEST-01 evidence (add to independence suite **or** document dual-file bar + keep engine IND-04 titles).

**Warning signs:** VERIFICATION lists only static push bans for TEST-01.

### Pitfall 3: Moving or skipping gold fixtures

**What goes wrong:** Gold suite “cleaned up” or fixtures moved outside `tests/` → `npm test` no longer runs ACC.

**Why it happens:** Someone treats gold as optional research artifacts.

**How to avoid:** Gold file + fixtures are permanent CI; TEST-02 fails if they disappear.

**Warning signs:** `npm test` pass count drops by ~8 without an intentional delete explanation.

### Pitfall 4: Treating verify-live as optional

**What goes wrong:** Suite green, local server dead — TEST-03 fails success criteria.

**How to avoid:** Explicit final task: `verify-live.ps1` exit 0. No public edits expected; restart if down via `scripts/restart.ps1`.

**Warning signs:** Agent ends without health 200.

### Pitfall 5: Re-running product phases as “fixes”

**What goes wrong:** Scope expands into efficiency polish, learning UI, or tagger rewrites when suite is already green.

**Why it happens:** Regression phases feel like “one more pass.”

**How to avoid:** Plan `files_modified` should be tests + docs only unless a lock fails; then fix the smallest production module.

**Warning signs:** Diffs in `public/js/bridge.js` or tagger without a red test first.

### Pitfall 6: Wiping runtime data during suite/live

**What goes wrong:** Operator filter lists / brain destroyed during “cleanup.”

**Why it happens:** Confusion between temp test roots and production `data/`.

**How to avoid:** Tests use temp roots only; never delete `data/filter-lists/` or `data/bridge-brain/` as part of Phase 60.

### Pitfall 7: False “missing e2e” for Type/format/water

**What goes wrong:** Planner schedules large new processUpload suite when COL/GATE/water already lock the paths.

**Why it happens:** TEST-03 wording lists three paths without pointing at existing titles.

**How to avoid:** Use the inventory table; focused pattern run is enough for packaging proof.

---

## Code Examples

Verified patterns from the current tree (research run 2026-07-10).

### TEST-01 — no-push static ban (existing)

```js
// Source: tests/bridge-independence.test.js
const FILTER_WRITE_PATHS = [
  'lib/bridge-api.js',
  'lib/bridge-engine/index.js',
  'lib/bridge-list-store.js',
  'lib/bridge-brain-decisions.js',
  'lib/bridge-brain-apply.js',
  'lib/bridge-brain-store.js'
];
const FORBIDDEN = [
  'bridge-analyzer-push',
  'pushRowsToAnalyzer',
  'bridge-import-records'
];
// Each path must not include FORBIDDEN strings; push module must be MODULE_NOT_FOUND
```

### TEST-01 — process/save Analyze-session negatives (existing)

```js
// Source: tests/bridge-independence.test.js
// POST /api/bridge/process success:
//   json.analyzerPush === undefined
//   no distressAnalyzerSession_*.json under isolated ANALYZER_DATA_ROOT
// POST /api/bridge/lists save:
//   list meta under FILTER_LISTS_ROOT only
//   still zero Analyzer session files
```

### TEST-01 — already_imported default-off (existing engine; optional independence copy)

```js
// Source: tests/bridge-engine.test.js IND-04
// Default processUpload with non-empty stub import index:
//   result.stats.alreadyImported === 0
//   row still kept
//   loadImportAddressIndex must NOT run when filter off
//
// Opt-in:
//   applyAlreadyImportedFilter: true
//   → hard-drop + alreadyImported count
//
// Production gate (lib/bridge-engine/index.js):
//   const applyAlreadyImportedFilter = opts.applyAlreadyImportedFilter === true;
```

### TEST-02 — gold suite inclusion (existing)

```js
// Source: tests/bridge-accuracy-gold.test.js
// Fixtures: tests/fixtures/bridge/gold/
//   keep-distress-mixed.csv
//   deny-junk-admin.csv
//   water-hostile-types.txt
//   type-trap-status-vio.csv
//   no-type-notes-only.csv
// package.json: "test": "node --test tests/**/*.test.js"  // includes this file
```

### TEST-03 — Type / format / water processUpload (existing titles)

```text
Type:   COL-01/04, TEST-01 (v1.8) 409 suggestedHeader + map cells, gold type-trap
Format: GATE-02 first confirm, GATE-03 auto_reuse, TEST-02 (v1.8) FP change
Water:  water_shut_off process, GATE water skip, BRAIN-03 ignore suppress, ACC-01 gold water-hostile
```

### Ship gate commands

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Expect: 519+ pass / 0 fail (count may rise if thin titles add tests)
# Expect: LIVE ok health=200 home=200
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Filter auto-push to Analyze | Push adapter deleted; independence suite bans resurrection | Phase 55 (v2.0) | TEST-01 no-push half |
| `already_imported` on by default | Strict opt-in `applyAlreadyImportedFilter === true` | Phase 55 IND-04 | Re-work lists stay full |
| Accuracy by audit notes | Gold processUpload fixtures in CI | Phase 57 | TEST-02 bar |
| Ad-hoc processUpload smoke | Named COL/GATE/water + v1.7/v1.8 TEST e2e | Phases 50, 54 | TEST-03 composition half |
| “Is the site up?” manual | `scripts/verify-live.ps1` auto-ensure | AGENTS.md / prior locks | TEST-03 live half |
| Milestone ship without package | Dedicated regression-lock phase | Phases 50, 54, **60** | Permanent bar for v2.0 |

**Deprecated/outdated:**

- `lib/bridge-analyzer-push.js` — deleted; must stay gone (IND-02)
- Default Analyze-index hard-drop on process — off unless explicit opt-in (IND-04)
- Treating gold fixtures as temporary Wave 0 scaffolding — they are permanent TEST-02 CI

---

## Open Questions

1. **Should IND-04 move into `bridge-independence.test.js`?**
   - What we know: TEST-01 wording says “Independence regression suite locks … already_imported”; implementation is currently engine/edge/stress.
   - What's unclear: whether user considers multi-file “independence suite” acceptable.
   - **Recommendation:** Option A — add thin IND-04 tests with `TEST-01 (v2.0)` titles into independence file (small duplication OK for bar cohesion).

2. **One plan or two?**
   - What we know: Phase 54 used Plan 01 (locks) + Plan 02 (suite+live only); research baseline already fully green.
   - **Recommendation:** 2 plans for clean gates; compress to 1 if executor wants atomic ship (packaging + suite + live in one plan).

3. **Optional npm script aliases?**
   - What we know: not required by REQUIREMENTS.
   - **Recommendation:** skip unless cheap; document commands in TEST-PLAN instead.

4. **Will suite count stay 519?**
   - What we know: research baseline 519; thin new tests may add 1–3.
   - **Recommendation:** SUMMARY records exact post-phase count; do not force 519 forever.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include this section for VALIDATION.md generation.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js` |
| Full suite command | `npm test` |
| Live gate | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| Estimated runtime | ~6–15s suite + live |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TEST-01 | No Analyze push strings on Filter write paths | static | `node --test --test-name-pattern="IND-01/02" tests/bridge-independence.test.js` | ✅ |
| TEST-01 | Push adapter absent / not loadable | unit | `node --test --test-name-pattern="IND-02" tests/bridge-independence.test.js` | ✅ |
| TEST-01 | process + list save invent no Analyzer sessions / no analyzerPush | integration | `node --test --test-name-pattern="IND-01/03" tests/bridge-independence.test.js` | ✅ |
| TEST-01 | `already_imported` hard-drop off by default | e2e process | `node --test --test-name-pattern="IND-04" tests/bridge-engine.test.js` | ✅ (engine); ⚠️ optional independence add |
| TEST-01 | Opt-in already_imported still works | e2e process | same IND-04 pattern | ✅ |
| TEST-02 | Gold keep Strong distress | e2e process | `node --test --test-name-pattern="ACC-01" tests/bridge-accuracy-gold.test.js` | ✅ |
| TEST-02 | Gold deny junk to FN | e2e process | same | ✅ |
| TEST-02 | Gold water never type-suppressed | e2e process | same | ✅ |
| TEST-02 | Gold no silent-drop banned reasons | e2e process | `node --test --test-name-pattern="ACC-02" tests/bridge-accuracy-gold.test.js` | ✅ |
| TEST-02 | Gold single Type winner keep-green | e2e process | `node --test --test-name-pattern="ACC-03" tests/bridge-accuracy-gold.test.js` | ✅ |
| TEST-02 | Gold included in full CI | suite | `npm test` (must execute gold file) | ✅ |
| TEST-03 | processUpload Type path | e2e process | `node --test --test-name-pattern="COL-|TEST-01 \\(v1\\.8\\)" tests/bridge-engine.test.js` | ✅ |
| TEST-03 | processUpload format path | e2e process | `node --test --test-name-pattern="GATE-|TEST-02 \\(v1\\.8\\)" tests/bridge-engine.test.js` | ✅ |
| TEST-03 | processUpload water path | e2e process | `node --test --test-name-pattern="water" tests/bridge-engine.test.js` + gold water | ✅ |
| TEST-03 | Live server health + homepage | smoke live | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` | ✅ script |

### Sampling Rate

- **Per task commit:** quick bar — independence + gold (+ engine pattern if titles touched)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + `scripts/verify-live.ps1` exit 0 before `/gsd:verify-work`
- **Max feedback latency:** ~120 seconds

### Wave 0 Gaps

- [ ] Optional: `TEST-01 (v2.0)` titled IND-04 (and/or no-push) markers in `tests/bridge-independence.test.js` — **only if** planner chooses Option A packaging
- [ ] Optional: `docs/bridge/TEST-PLAN.md` permanent v2.0 bar section (TEST-01/02/03 → files) — **recommended**
- [ ] Framework install: **none**
- [ ] Missing product e2e for Type/format/water: **None** — already covered
- [ ] Missing gold / independence suites: **None** — already in `npm test`

*(If planner chooses docs-only packaging: Wave 0 code gaps = none — execute packaging + suite/live immediately.)*

### Suggested plan shape (for planner)

| Plan | Wave | Intent | Primary files |
|------|------|--------|---------------|
| **60-01** | 1 | Permanent bar packaging: TEST-PLAN map + optional `TEST-0N (v2.0)` titles / IND-04 in independence | `docs/bridge/TEST-PLAN.md`, optional `tests/bridge-independence.test.js` |
| **60-02** | 2 | Ship gate: full `npm test` + `verify-live.ps1` (zero product edits if green) | SUMMARY only if gates green |

If compressed to **1 plan:** packaging + suite + live in one autonomous plan (still two task groups).

---

## Sources

### Primary (HIGH confidence)

- Live tree: `tests/bridge-independence.test.js`, `tests/bridge-accuracy-gold.test.js`, `tests/bridge-engine.test.js`, `tests/fixtures/bridge/gold/`
- Live tree: `lib/bridge-engine/index.js` IND-04 gate (`applyAlreadyImportedFilter === true`)
- Live tree: `package.json` test script; `scripts/verify-live.ps1`
- Research runs 2026-07-10: independence+gold 18/18; engine pattern 23/23; full suite **519/0**; verify-live **200/200**
- `.planning/REQUIREMENTS.md` TEST-01..03; `.planning/ROADMAP.md` Phase 60; `.planning/STATE.md` Phase 59 complete
- Prior lock research: `.planning/phases/50-regression-lock/50-RESEARCH.md`, `.planning/phases/54-regression-lock/54-RESEARCH.md`
- Prior ship evidence: Phase 55/57/59 VERIFICATION.md (independence, gold, suite baselines)

### Secondary (MEDIUM confidence)

- `docs/bridge/TEST-PLAN.md` ACC/LRN/EFF map (missing v2.0 TEST permanent bar section — gap confirmed by read)
- `docs/bridge/DATA-STANDARDS.md` / `GSD-AUDIT.md` independence policy notes
- Phase 54-02 SUMMARY pattern: suite+live ship gate with zero product edits when green

### Tertiary (LOW confidence)

- Whether future external CI will be added (out of scope); treat `npm test` as CI for this phase

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Confirmed package.json + node:test + existing suites |
| Architecture / packaging | HIGH | Matches Phase 50/54 lock patterns; inventory verified in tree |
| Gap analysis | HIGH | Focused + full suite + live run during research |
| Pitfalls | HIGH | Naming collisions proven historically (v1.7/v1.8); independence/IND-04 split verified |
| Exact future plan count | MEDIUM | 1 vs 2 plans is discretion; both valid |

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (30 days — stable test infra; re-verify pass counts if suite drifts)

**Baseline to beat / keep:**

| Metric | Value |
|--------|-------|
| Full suite | 519 pass / 0 fail |
| Independence | 10 tests green |
| Gold ACC | 8 tests green |
| Live | health=200 home=200 |
