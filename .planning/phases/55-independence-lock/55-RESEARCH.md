# Phase 55: Independence Lock - Research

**Researched:** 2026-07-10  
**Domain:** Filter write-isolation from Analyze — no push, quarantine dead adapter, `already_imported` hard-drop off by default  
**Confidence:** HIGH (all seams verified in live `lib/` + `tests/` + `public/js/bridge.js`)

## Summary

Phase 55 locks the v2.0 product boundary: **Filter is a list factory, not an Analyze feeder.** Process, save/list, and Train already omit Analyze writes in production code — `handleProcess` only returns `processUploadBatch` payload; list store writes only under `FILTER_LISTS_ROOT`; brain decisions mutate only `BRIDGE_BRAIN_ROOT`. The residual risk is **resurrection**: `lib/bridge-analyzer-push.js` still exists with positive unit tests and GSD-AUDIT still documents auto-push as a ✓ feature, so a later plan can re-wire it casually.

Independence is incomplete without **IND-04**. `processUpload` still always `loadImportAddressIndex` + `filterAlreadyImported` and hard-drops matches with reason `already_imported`. Under the external-enrich → manual Analyze import flow, re-filter/purge/re-work empties kept lists silently. Requirements lock: **hard-drop off by default**; optional future opt-in only.

**Primary recommendation:** (1) Delete (preferred) or quarantine `bridge-analyzer-push.js` + reframe/remove its positive tests; (2) flip process path so `filterAlreadyImported` is **not applied unless explicit opt-in**; (3) add a small independence regression suite (static source bans + process/save negative contracts + default-off import-filter processUpload); (4) update DATA-STANDARDS / GSD-AUDIT so agents do not restore push. **Zero new npm packages.**

---

<user_constraints>
## User Constraints

**No `55-CONTEXT.md`** — discuss-phase was not run. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, PROJECT.md, and the orchestrator brief.

### Locked Decisions

- **IND-01:** Process, save, Train, and list APIs never auto-push or write leads into Analyze (no `bridge-import-records` / session write from Filter)
- **IND-02:** Legacy Analyze-push adapter (`bridge-analyzer-push` and any call sites/UI) is deleted or quarantined so it cannot be re-wired without failing tests
- **IND-03:** Automated negative tests prove process + save paths never require Analyze push and never invent Analyze session writes
- **IND-04:** `already_imported` Analyze-index filtering is **off by default** (re-work / purge / re-filter keeps full lists); optional enable only via explicit opt-in if implemented later
- **Product pipeline:** Collect → Filter process → Train (admin) → Save list → Download → external enrich → **manual** Analyze import
- **No Filter → Analyze auto-push / “Send to Analyze”** (PROJECT.md out of scope; core value)
- **Zero new npm packages** preferred (v2.0 research SUMMARY) — pure CommonJS + `node --test`
- **AGENTS.md:** never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores as part of coding/restarts
- **Phase 55 scope:** Independence lock only — not list UX redesign (56), not accuracy gold fixtures (57), not learning metrics (58)

### Claude's Discretion

- **Delete vs quarantine** for `bridge-analyzer-push.js` (research recommends **delete** — zero production require sites)
- Exact opt-in flag name for future import-filter (`applyAlreadyImportedFilter` vs `filterAlreadyImported: true`) — only if cheap; UI toggle **not** required this phase
- Whether to still call `loadImportAddressIndex` when filter is off (research recommends **skip load** when off — avoids soft cost and stale-index confusion)
- New test file (`tests/bridge-independence.test.js`) vs extend existing handler/engine files (recommend **dedicated independence file** + invert the one engine test that asserts hard-drop)
- How aggressively to edit docs (minimum: DATA-STANDARDS cross-ref section + GSD-AUDIT auto-push row; TEST-PLAN optional)
- Whether UI copy that mentions “already in Analyze (hidden)” is updated in 55 (recommended light touch when stats always 0 by default) vs deferred to Phase 56 LIST copy

### Deferred Ideas (OUT OF SCOPE)

- Soft-flag `already_imported` in UI without drop (future requirement; not IND-04 minimum)
- Explicit freeze/version of download column contract for enrich vendors (SUMMARY 55–56; not IND success criteria — leave export alone unless a touch forces it)
- List factory UX / Save-Download hero CTAs / dirty-working-set guards (Phase 56)
- Accuracy gold fixtures / tagger changes (Phase 57)
- Learning metrics (Phase 58)
- Efficiency / format reuse polish (Phase 59)
- Full milestone regression QA suite (Phase 60) — Phase 55 only ships independence locks
- Re-enabling “Send to Analyze” as a convenience path
- Merging Filter brain with Analyzer learned-brain
- Deleting Analyzer’s own `POST /api/bridge-import-records` endpoint (manual Analyze import may still use Analyzer-side tools; Filter must not call it)
- Multi-tenant session security for import index scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **IND-01** | Process, save, Train, list APIs never auto-push or write leads into Analyze | As-built: `handleProcess` comment + no `require('./bridge-analyzer-push')` in `bridge-api.js`; `saveList` only writes `FILTER_LISTS_ROOT`; decisions only `saveBrain`. Lock with static bans + handler contracts. |
| **IND-02** | Legacy `bridge-analyzer-push` deleted or quarantined so re-wire fails tests | Module exists; **only** required by `tests/bridge-analyzer-push.test.js` (positive mapping tests). Delete module + reframe tests as “process path must not require push module.” Update GSD-AUDIT. |
| **IND-03** | Automated negative tests: process + save never require push / invent Analyze session writes | Today: single assert `json.analyzerPush === undefined` on process success. Need static source scan + list-create isolation + optional session-file non-touch. |
| **IND-04** | `already_imported` hard-drop **off by default**; re-work keeps full lists | Engine always filters today (`index.js` ~342–343). Invert default; keep pure `import-filter.js` for future opt-in; invert `processUpload filters rows already in Property Analyzer` test. |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### Write path status (Filter → Analyze)

| Surface | File / handler | Writes Analyze? | Notes |
|---------|----------------|-----------------|-------|
| Process | `lib/bridge-api.js` `handleProcess` | **No** | Calls `processUploadBatch` → `sendJson(200, payload)`. Comment: “do not auto-push.” |
| Engine | `lib/bridge-engine/index.js` `processUpload` | **No** | Parse → type gate → normalize → dedupe → **import-filter READ** → brain → distress → groups. No push require. |
| Save list | `handleListCreate` → `bridge-list-store.saveList` | **No** | Atomic JSON under `FILTER_LISTS_ROOT/{scope}/`. |
| List download / clear / patch | list handlers | **No** | Export CSV/XLSX only. |
| Train decisions | `handleBrainDecision` → `applyDecision` + `saveBrain` | **No** | Mutates brain + returns client row lists. |
| Attach | `handleAttach` | **No** (Form Forge) | City KPI / bridge dataset — independent of Analyze. |
| Push adapter | `lib/bridge-analyzer-push.js` `pushRowsToAnalyzer` | **Would write** | POSTs `/api/bridge-import-records` or disk-merges `distressAnalyzerSession_LATEST.json`. **Not called from any Filter happy path.** |

### Residual coupling (READ)

| Surface | Behavior today | Phase 55 action |
|---------|----------------|-----------------|
| `loadImportAddressIndex` + `filterAlreadyImported` | **Hard-drops** matching rows every process (`force: true`) | **Default off** (IND-04). Keep pure helper. |
| UI stats copy | “N already in Analyze (hidden from this list)” | Becomes dead when filter off; light copy cleanup optional |
| Analyzer endpoint | `modules/property-analyzer/routes/bridge.js` still has `POST /api/bridge-import-records` | **Keep** on Analyze side for manual/compat; Filter must not call |

### Push module call graph

```
lib/bridge-analyzer-push.js
  └── required ONLY by tests/bridge-analyzer-push.test.js
  └── NOT required by bridge-api, bridge-engine, list-store, brain-*, public/js/bridge.js

grep production require of pushRowsToAnalyzer: ZERO
UI "Send to Analyze" button: NONE (only “nothing was sent to Analyze” success copy)
```

### Existing independence-ish tests (insufficient alone)

| Test | File | What it proves | Gap |
|------|------|----------------|-----|
| Process success has no `analyzerPush` field | `bridge-api-handlers.test.js` | Response shape | Does not prove no side-effect write / no require |
| Push record mapping | `bridge-analyzer-push.test.js` | **Productizes** dead adapter | Must delete/reframe — currently encourages keeping module |
| `filterAlreadyImported` pure unit | `bridge-import-filter.test.js` | Helper still works | Keep for future opt-in; not process default |
| processUpload hard-drops imported | `bridge-engine.test.js` | **Locks wrong default for v2.0** | Must invert under IND-04 |

---

## Standard Stack

### Core

| Library / module | Version / location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node.js 20+ CommonJS | runtime | Filter shell | Existing; no TS/build |
| `lib/bridge-api.js` | existing | Process / lists / brain routes | Independence enforcement point |
| `lib/bridge-engine/index.js` | existing | `processUpload` pipeline | IND-04 default flip lives here |
| `lib/bridge-engine/import-filter.js` | existing | Pure `filterAlreadyImported` | Keep; do not delete (future opt-in) |
| `lib/analyzer-import-index.js` | existing | Read-only Analyze address index | Soft coupling; skip load when filter off |
| `lib/bridge-list-store.js` | existing | Save/download lists | Prove no Analyze writes |
| `node --test` + `node:assert/strict` | Node built-in | Independence regression | Project standard (`npm test`) |

### Supporting

| Module / file | Purpose | When to use |
|---------------|---------|-------------|
| `lib/bridge-analyzer-push.js` | Legacy write adapter | **Delete** (or quarantine) this phase |
| `tests/bridge-api-handlers.test.js` | HTTP process/list contracts | Extend with list-create + stronger process asserts |
| `tests/bridge-engine.test.js` | processUpload e2e | Invert already_imported default test |
| `tests/bridge-import-filter.test.js` | Pure filter helper | Keep green (helper still valid) |
| `docs/bridge/DATA-STANDARDS.md` | Product contract | Update cross-ref section to default-off |
| `docs/bridge/GSD-AUDIT.md` | Agent trap | Remove auto-push as ✓ feature |
| `public/js/bridge.js` | Stats / “hidden” copy | Optional light cleanup |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| **Delete** push module | Quarantine under `lib/legacy/` with throw-on-load | Quarantine keeps discovery surface; agents restore from docs. Delete + static “must not exist / must not be required” is stronger. |
| Default-off hard-drop | Soft-flag only (keep rows, mark `already_imported` flag) | Soft-flag is nicer UX later but out of IND-04 minimum; adds schema/UI work. Prefer skip filter entirely for 55. |
| Default-off hard-drop | Remove import-filter module entirely | Loses future opt-in and pure unit tests; overkill. |
| Skip index load when off | Always load index for stats only | Wastes I/O; re-introduces stale-index confusion in `importIndexCount` UI. Skip unless opt-in. |

**Installation:** none — `npm install` not required.

```bash
# verification only
npm test
# focused:
node --test tests/bridge-independence.test.js tests/bridge-engine.test.js tests/bridge-api-handlers.test.js
```

---

## Architecture Patterns

### Recommended touch structure (no new product folder)

```
lib/
├── bridge-api.js                 # KEEP contract; optional assert comments; no push require
├── bridge-engine/
│   ├── index.js                  # MODIFY — default skip filterAlreadyImported
│   └── import-filter.js          # KEEP pure helper (future opt-in)
├── bridge-list-store.js          # KEEP (prove no Analyze side effects)
├── bridge-analyzer-push.js       # DELETE (preferred) or move to legacy/
└── analyzer-import-index.js      # KEEP; only loaded when opt-in filter on

tests/
├── bridge-independence.test.js   # NEW — IND-01..04 negative + static bans
├── bridge-engine.test.js         # MODIFY — invert already_imported default
├── bridge-api-handlers.test.js   # MODIFY — strengthen process/save negatives
├── bridge-import-filter.test.js  # KEEP pure helper tests
└── bridge-analyzer-push.test.js  # DELETE or reframe as “module absent / not required”

docs/bridge/
├── DATA-STANDARDS.md             # MODIFY — already_imported default-off; no auto-push
└── GSD-AUDIT.md                  # MODIFY — retire auto-push feature row
```

### Pattern 1: Filter write ban (hard boundary)

**What:** No Filter process / save / Train / list path may call `pushRowsToAnalyzer`, POST `/api/bridge-import-records`, or write `distressAnalyzerSession_*.json`.  
**When to use:** Every change that touches process, lists, or brain in v2.0.  
**Enforcement:**

1. **Static:** source of `bridge-api.js`, `bridge-engine/**`, `bridge-list-store.js`, `bridge-brain-*.js` must not contain `bridge-analyzer-push` or `pushRowsToAnalyzer`.
2. **Module absence:** `require.resolve('../lib/bridge-analyzer-push')` fails **or** (if quarantined) process path still never requires it.
3. **Runtime:** process/list responses never include `analyzerPush` / import batch IDs; list save does not create/modify Analyzer session files under a temp `ANALYZER_DATA_ROOT`.

```javascript
// lib/bridge-api.js handleProcess — keep this contract (as-built)
const payload = await processUploadBatch(fileList, batchArgs);
// Filter only — do not auto-push to Analyze. Lists are saved explicitly via /api/bridge/lists.
sendJson(res, 200, payload);
```

### Pattern 2: Import-filter opt-in (default off)

**What:** Hard-drop against Analyze index is a **legacy coupling mode**, not list-factory default.  
**When to use:** `processUpload` / batch only.  
**Recommended API (engine-level, no UI this phase):**

```javascript
// lib/bridge-engine/index.js — target shape
const applyAlreadyImportedFilter = opts.applyAlreadyImportedFilter === true;

let importFiltered = { rows: deduped.rows, removedCount: 0, removed: [] };
let importIndex = { count: 0, addresses: new Set(), sources: null };

if (applyAlreadyImportedFilter) {
  importIndex = await loadImportAddressIndex({ username, plan, force: true });
  importFiltered = filterAlreadyImported(deduped.rows, importIndex.addresses);
}
// else: skip load + skip hard-drop → full deduped set proceeds to brain/distress
```

**Why skip load when off:** avoids force-refresh cost every process; prevents UI “N addresses in Analyze” implying filtering happened; matches IND-04 “off by default.”

**Do not** invent multipart UI field in Phase 55 unless needed for a test — unit tests can pass `applyAlreadyImportedFilter: true` to prove helper still wired.

### Pattern 3: Delete dead write surface (not “optional library”)

**What:** Treat push as deleted product surface, not a dormant helper.  
**When to use:** IND-02.  
**Why:** Architecture research: “Treating it as optional library invites re-coupling.”

**Delete package:**

| Action | Path |
|--------|------|
| Delete | `lib/bridge-analyzer-push.js` |
| Delete or replace | `tests/bridge-analyzer-push.test.js` → independence static ban |
| Leave alone | Analyzer `bridge-import-records` (manual import world) |
| Docs | GSD-AUDIT, any plan notes that list auto-push as live |

### Pattern 4: Negative tests as product locks

**What:** Independence is proven by **absence** of side effects, not by happy-path mapping of push records.  
**When to use:** IND-03; also Phase 60 will re-assert.

### Anti-Patterns to Avoid

- **Re-wiring push “for convenience” after Save** — violates core value; external enrich skipped.
- **Treating import-filter removal as “full decouple” then also deleting the pure helper** — keep helper; change default only.
- **Leaving GSD-AUDIT auto-push ✓** — agents restore features from audit tables.
- **Measuring independence only via `analyzerPush === undefined`** — field can be absent while disk merge still runs.
- **Default-on hard-drop “until UI toggle ships”** — IND-04 forbids; re-work stays broken.
- **Wiping filter-lists / brain to test independence** — Agents.md hard rule; use temp `config.*_ROOT` only.
- **Scope creep into list CTA redesign** — Phase 56.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Analyze address matching | New fuzzy matcher | Existing `import-filter.js` + `analyzer-import-index` | Already tested; only default policy changes |
| List persistence | New DB / session store | `bridge-list-store.js` | Multi-list filesystem already ships |
| Independence “service” | New middleware framework | Static source bans + `node:test` | Monolith; zero-dep pattern |
| Push quarantine framework | Feature-flag service | Delete module + fail tests on require | Simplest permanent lock |
| Soft-flag UI system | Full review flag schema | Defer; default-off is enough for IND-04 | Out of phase |

**Key insight:** This phase is **policy + deletion + tests**, not new algorithms. The dangerous work is accidental re-coupling and silent hard-drop, not greenfield design.

---

## Common Pitfalls

### Pitfall 1: Independence that only removes push (IND-04 ignored)

**What goes wrong:** Push deleted; process still hard-drops every address already in Analyze → purge/re-work shows “Every record… already in your Analyze session.”  
**Why:** Historical design when Filter auto-pushed; push removed first, filter left on.  
**How to avoid:** Ship IND-04 in same phase as push purge (roadmap success criteria #4). Invert engine default + invert the processUpload hard-drop test.  
**Warning signs:** `stats.alreadyImported` dominates after purge; `NO_USABLE_ROWS` with onlyImported message.

### Pitfall 2: Positive push tests keep the module alive

**What goes wrong:** `bridge-analyzer-push.test.js` fails if module deleted → implementer “restores” module to green suite.  
**How to avoid:** Delete/reframe that test file **in the same plan** as module delete.  
**Warning signs:** PR that re-adds `lib/bridge-analyzer-push.js` to fix tests.

### Pitfall 3: Docs still teach auto-push

**What goes wrong:** GSD-AUDIT row “Auto-push kept rows to Analyzer | ✓” causes agent restoration.  
**How to avoid:** Update GSD-AUDIT + DATA-STANDARDS in the independence plan.  
**Warning signs:** New plan “wires Analyzer again for convenience.”

### Pitfall 4: Soft coupling confused with write coupling

**What goes wrong:** Someone deletes `analyzer-import-index` entirely “for independence,” or keeps hard-drop because architecture said “keep soft read.”  
**How to avoid:** Requirements win: hard-drop **off by default**. Soft **read** may remain available behind opt-in; soft **write** is banned.  
**Warning signs:** Debates that cite ARCHITECTURE.md “keep import-filter” without reading PITFALLS/IND-04.

### Pitfall 5: List save tests that don’t isolate Analyzer root

**What goes wrong:** Negative “save doesn’t write Analyze” is vacuous if `ANALYZER_DATA_ROOT` points at real user session.  
**How to avoid:** Point `config.ANALYZER_DATA_ROOT` (and list/brain roots) at temp dirs in tests; assert session file absent after save/process.  
**Warning signs:** Tests pass but touch real `data/` trees; Agents.md violation risk.

### Pitfall 6: Opt-in flag default true by accident

**What goes wrong:** `opts.applyAlreadyImportedFilter !== false` leaves legacy on.  
**How to avoid:** Require **strict** `=== true` for enable. Document in DATA-STANDARDS.  
**Warning signs:** Old engine test still green without code change.

### Pitfall 7: UI still says rows were “hidden” when filter off

**What goes wrong:** Operator confuses zero `alreadyImported` messaging with bugs, or residual copy implies Analyze gate.  
**How to avoid:** Light copy update: don’t emphasize hidden-in-Analyze when count is 0; keep “nothing was sent to Analyze.” Full LIST copy is Phase 56.  
**Warning signs:** Stub note always mentions Analyze after every process.

### Pitfall 8: Batch path forgets the default

**What goes wrong:** `processUpload` fixed but `processUploadBatch` / merge reintroduces filter.  
**How to avoid:** Filter only inside `processUpload`; batch calls processUpload per file — one flip covers both if no second call site. Verify with grep.  
**Warning signs:** Single-file OK, multi-file still drops.

---

## Code Examples

### Engine default-off (target)

```javascript
// Source: recommended wire for lib/bridge-engine/index.js (Phase 55)
// After dedupeRows(normalized.kept):

const applyAlreadyImportedFilter = opts.applyAlreadyImportedFilter === true;

let importIndex = { count: 0, addresses: new Set(), sources: null, loadedAt: Date.now() };
let importFiltered = { rows: deduped.rows, removedCount: 0, removed: [] };

if (applyAlreadyImportedFilter) {
  // Always refresh so Analyze purges take effect when opt-in is used.
  importIndex = await loadImportAddressIndex({ username, plan, force: true });
  importFiltered = filterAlreadyImported(deduped.rows, importIndex.addresses);
}

// Continue: applyBrainToRows(importFiltered.rows, ...) → filterDistressOnly → ...
// stats.alreadyImported = importFiltered.removedCount  // 0 by default
// processingMeta.importIndexCount = importIndex.count // 0 by default
```

### Static independence ban (target test)

```javascript
// Source: recommended tests/bridge-independence.test.js pattern
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const FILTER_WRITE_PATHS = [
  'lib/bridge-api.js',
  'lib/bridge-engine/index.js',
  'lib/bridge-list-store.js',
  'lib/bridge-brain-decisions.js',
  'lib/bridge-brain-apply.js',
  'lib/bridge-brain-store.js'
];

for (const rel of FILTER_WRITE_PATHS) {
  test(`IND-01/02: ${rel} must not reference bridge-analyzer-push`, () => {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.equal(src.includes('bridge-analyzer-push'), false);
    assert.equal(src.includes('pushRowsToAnalyzer'), false);
    assert.equal(src.includes('bridge-import-records'), false);
  });
}

test('IND-02: bridge-analyzer-push module is not loadable from lib/', () => {
  assert.throws(() => require.resolve('../lib/bridge-analyzer-push'));
});
```

### processUpload default keeps rows that match Analyze index

```javascript
// Invert of current tests/bridge-engine.test.js hard-drop test
test('IND-04: processUpload does not hard-drop already_imported by default', async () => {
  // mock loadImportAddressIndex with address present in fixture
  // call processUpload WITHOUT applyAlreadyImportedFilter
  // assert row still in result.rows (if distressed)
  // assert result.stats.alreadyImported === 0
});

test('IND-04: processUpload hard-drops only when applyAlreadyImportedFilter === true', async () => {
  // same mock; pass applyAlreadyImportedFilter: true
  // assert alreadyImported >= 1 and address absent from kept
});
```

### List save does not write Analyzer session

```javascript
// Temp ANALYZER_DATA_ROOT + FILTER_LISTS_ROOT
// POST /api/bridge/lists with sample rows
// assert save ok
// assert !fs.existsSync(sessionFile under analyzer root)
// assert no call path to push (static ban covers require)
```

---

## State of the Art (project-local)

| Old approach (pre-v2.0 / residual) | Current / Phase 55 target | Impact |
|------------------------------------|---------------------------|--------|
| Auto-push kept rows after process | No push; save/download only | External enrich possible |
| Dead `bridge-analyzer-push.js` still in tree | Delete + negative tests | Cannot re-wire casually |
| `already_imported` hard-drop always on | **Off by default** | Re-work / purge keeps full lists |
| Docs: GSD-AUDIT auto-push ✓ | Docs: push retired | Agents stop restoring |
| Test: process asserts hard-drop | Test: process asserts keep by default | Locks IND-04 |

**Deprecated/outdated:**

- **Auto-push as Filter feature** — product out of scope; delete adapter
- **DATA-STANDARDS “rows that match are removed” as unconditional** — update to default-off / opt-in
- **Positive unit tests of `pushRowsToAnalyzer` as product behavior** — replace with absence locks
- **Architecture note “keep import-filter as always-on soft coupling”** — superseded by IND-04 for hard-drop policy (read helper may remain)

---

## Open Questions

1. **Should opt-in be wired through HTTP multipart in Phase 55?**
   - What we know: IND-04 allows “if implemented later.”
   - What's unclear: whether any operator needs hard-drop during this milestone.
   - Recommendation: **engine flag only** in 55; no UI toggle. Phase 56+ can add toggle if product wants soft-flag UX.

2. **Delete vs quarantine path for push module?**
   - What we know: zero production requires.
   - Recommendation: **delete**. If legal/audit wants history, git retains it; do not leave `lib/` importable surface.

3. **Should `processingMeta.importIndexCount` remain when filter off?**
   - Recommendation: **0 / null sources** when skipped — honesty over “we still counted.” Soft-flag phase can reintroduce count without drop.

4. **Export contract freeze in 55?**
   - SUMMARY mentioned 55–56; IND success criteria do not require it.
   - Recommendation: **do not touch export** in 55 unless a required edit forces it; Phase 56 list UX is the natural home.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-independence.test.js tests/bridge-import-filter.test.js` |
| Full suite command | `npm test` |
| Live gate (if public/ touched) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| IND-01 | Process handler / engine / list-store / brain decision sources never reference push or bridge-import-records | unit (static) | `node --test tests/bridge-independence.test.js` | ❌ Wave 0 |
| IND-01 | `POST /api/bridge/process` success has no `analyzerPush` and does not require push module | integration | `node --test --test-name-pattern="process" tests/bridge-api-handlers.test.js` | ⚠️ partial (`analyzerPush` only) |
| IND-01 | `POST /api/bridge/lists` save does not create Analyzer session files | integration | `node --test tests/bridge-independence.test.js` | ❌ Wave 0 |
| IND-01 | Train decision path does not require push (static + optional API) | unit/static | independence static ban includes `bridge-brain-decisions.js` | ❌ Wave 0 |
| IND-02 | `lib/bridge-analyzer-push.js` absent (or not resolvable); re-require fails | unit | `node --test tests/bridge-independence.test.js` | ❌ Wave 0 (today module **exists**) |
| IND-02 | Positive push mapping suite removed or replaced | unit | suite must not require deleted module | ⚠️ `bridge-analyzer-push.test.js` must change |
| IND-03 | Negative suite covers process + save (above rows) | integration | independence file | ❌ Wave 0 |
| IND-04 | processUpload with mocked non-empty index **keeps** matching distressed rows by default | processUpload e2e | `node --test --test-name-pattern="IND-04|already_imported" tests/bridge-engine.test.js` | ❌ must invert existing test |
| IND-04 | Optional: `applyAlreadyImportedFilter: true` still hard-drops (proves helper wired) | processUpload e2e | same | ❌ Wave 0 |
| IND-04 | Pure `filterAlreadyImported` still unit-tested | unit | `node --test tests/bridge-import-filter.test.js` | ✅ |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-independence.test.js tests/bridge-import-filter.test.js` (+ engine IND-04 pattern if engine touched)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green; if any `public/` edit, `scripts/verify-live.ps1` green before claiming live

### Wave 0 Gaps

- [ ] `tests/bridge-independence.test.js` — static bans + module absence + save/process negative side-effect contracts (IND-01, IND-02, IND-03)
- [ ] Invert / replace `processUpload filters rows already in Property Analyzer` in `tests/bridge-engine.test.js` for IND-04 default-off
- [ ] Optional opt-in true path test (recommended, small)
- [ ] Delete or reframe `tests/bridge-analyzer-push.test.js` so suite does not depend on deleted module
- [ ] Docs: `docs/bridge/DATA-STANDARDS.md` Property Analyzer Cross-Reference section; `docs/bridge/GSD-AUDIT.md` auto-push row
- [ ] No new test framework install required

*(Existing pure import-filter tests stay — they test the helper, not process default.)*

---

## Suggested Plan Decomposition (for planner)

Opinionated, small plans — mechanical + high confidence:

| Plan | Goal | Primary files | Reqs |
|------|------|---------------|------|
| **55-01** | Default-off `already_imported` in `processUpload` (+ optional opt-in flag); invert/add engine tests | `lib/bridge-engine/index.js`, `tests/bridge-engine.test.js` | IND-04 |
| **55-02** | Delete push module; independence static + process/save negative tests; remove/reframe push tests | `lib/bridge-analyzer-push.js` (delete), `tests/bridge-independence.test.js` (new), `tests/bridge-analyzer-push.test.js` (delete/reframe), `tests/bridge-api-handlers.test.js` (strengthen) | IND-01, IND-02, IND-03 |
| **55-03** | Docs + light UI copy cleanup so agents/operators don’t restore push or expect hard-drop | `docs/bridge/DATA-STANDARDS.md`, `docs/bridge/GSD-AUDIT.md`, optional `public/js/bridge.js` stats strings | IND-01, IND-02, IND-04 messaging |

**Order rationale:** Flip process default first (behavior operators feel), then delete dead write surface + lock tests (so nothing re-couples), then docs/copy (stop agent resurrection). Alternatively 55-02 before 55-01 is fine if planner prefers “write ban first”; both must land before phase verify.

**Do not** include Phase 56 list CTA redesign or accuracy fixtures in these plans.

---

## Sources

### Primary (HIGH confidence)

- Code (2026-07-10): `lib/bridge-api.js` (`handleProcess` ~220–318, list create ~977–1007, brain decision ~584+), `lib/bridge-engine/index.js` (import filter ~341–343, `noUsableRowsMessage` ~104–114), `lib/bridge-engine/import-filter.js`, `lib/bridge-analyzer-push.js` (full module), `lib/bridge-list-store.js` (`saveList`), `public/js/bridge.js` (save ~1505+, results copy ~1853–1870)
- Tests: `tests/bridge-api-handlers.test.js` (analyzerPush assert), `tests/bridge-analyzer-push.test.js`, `tests/bridge-engine.test.js` (hard-drop test ~484–514), `tests/bridge-import-filter.test.js`
- Product: `.planning/REQUIREMENTS.md` IND-01..04, `.planning/ROADMAP.md` Phase 55, `.planning/STATE.md`, `.planning/PROJECT.md` core value / out of scope
- Research: `.planning/research/SUMMARY.md`, `ARCHITECTURE.md`, `PITFALLS.md` (Pitfalls 1–2, 9; independence phase mapping)
- Docs: `docs/bridge/DATA-STANDARDS.md` (no auto-push + still documents hard-drop), `docs/bridge/GSD-AUDIT.md` (auto-push still ✓), `docs/bridge/TEST-PLAN.md` C-09/C-20/H-02..04
- Agents.md — never wipe filter-lists / brain volumes

### Secondary (MEDIUM confidence)

- Architecture “keep soft read coupling” vs Pitfalls/IND-04 “hard-drop off by default” — **resolved by requirements:** hard-drop off; helper may remain for opt-in
- Exact multipart opt-in field name — discretionary; not required for phase success

### Tertiary (LOW confidence)

- None material for planning — domain is fully in-repo

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new deps; modules and test runner verified |
| Architecture | HIGH | Call graph and process pipeline read end-to-end |
| Pitfalls | HIGH | PITFALLS.md + live residual hard-drop + dead push module |
| IND-04 product default | HIGH | REQUIREMENTS IND-04 + STATE decisions explicit |
| Delete vs quarantine | MEDIUM–HIGH | Evidence favors delete; quarantine acceptable if planner prefers |

**Research date:** 2026-07-10  
**Valid until:** ~2026-08-10 (stable in-repo domain; re-verify only if push reintroduced or engine pipeline rewritten)

---
*Phase 55 research — Independence Lock*  
*Feeds gsd-planner PLAN.md; researcher writes file; commit via gsd-tools when enabled*
