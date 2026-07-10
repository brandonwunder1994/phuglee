# Phase 59: Efficiency Operator Path - Research

**Researched:** 2026-07-10  
**Domain:** Filter day-2 operator time — format auto-reuse, stacked Train, bulk download, residual UX friction  
**Confidence:** HIGH (as-built GATE/LIST/Train/gold verified in code + tests); MEDIUM only on which residual clicks are highest pain without a live operator session

## Summary

Phase 59 shortens the **day-2 / known-format** path to a **saved, downloadable list** without trading accuracy or re-coupling Filter to Analyze. Unlike greenfield efficiency work, the three EFF-01 pillars already ship:

1. **Format auto-reuse (GATE-03)** — matching fingerprint reuses last confirmed Type header with **no confirm modal** (`typeResolution.source === 'auto_reuse'`, `formatMatched: true`).
2. **Stacked Train** — Type-keyed review groups with short labels, search, pagination, and ×N counts (one Approve/Deny moves a stack, not a row grind).
3. **Bulk download** — Saved lists **Download all (CSV/XLSX)** + per-list download; list store multi-city accumulate.

What is **not** done: operator-visible proof that day-2 is shorter, residual click/copy friction after Phases 56–58, and **EFF-02 regression locks** so “efficiency” cannot reintroduce silent drops, skip Train when needed, or resurrect Analyze push. Server already computes `processingMeta.durationMs` and full `typeResolution` — the UI never surfaces either. Post-save flash teaches “download from Saved lists” but offers no one-click download of the list just saved. Train is click-only (no A/D keyboard). Runtime re-architecture is **out of scope** unless a real city is profiled slow (REQUIREMENTS Future).

**Primary recommendation:** Prefer **lock + light UX polish over new infra**. Zero new packages. Wire visibility + 1–2 path-shorteners (reuse chip, post-save download, optional Train keyboard) and freeze EFF-02 with static + gold + GATE-02/03 + independence tests. Do **not** weaken Type confirm, hide Train groups, auto-save, or touch engine algorithms for micro-optimizations.

---

<user_constraints>
## User Constraints (from CONTEXT.md / product locks)

**No `59-CONTEXT.md`** — discuss-phase was not run. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, PROJECT.md, v2.0 research SUMMARY, orchestrator brief, and shipped Phases 55–58.

### Locked Decisions

- **EFF-01:** Operator path to a saved list is shorter for day-2 / known formats: **format auto-reuse**, **stacked Train where applicable**, **bulk download** — without trading away accuracy
- **EFF-02:** No single-dimension “efficiency” that increases **silent drops**, **skips Train when needed**, or **re-couples Filter to Analyze**
- **Depends on Phases 57–58:** Accuracy gold frozen; learning path trustworthy — efficiency must not regress gold P/R or game learning by hiding groups
- **Zero new npm packages** — pure CommonJS + vanilla `public/` JS/CSS + `node --test`
- **Prefer lock + light UX polish over new infra** — no new product modules, stores, or services
- **Preserve IND / ACC / LRN locks** from Phases 55–58 (no push, no silent drop, gold green, phrases proposed-only, type rules live)
- **GATE-02/03 coexistence:** First/changed format still requires admin confirm; same fingerprint → auto_reuse only (never rubber-stamp confirm away)
- **No auto-save every process** (REQUIREMENTS Out of Scope)
- **No auto-delete lists after download**
- **No Filter → Analyze auto-push / “Send to Analyze”**
- **AGENTS.md:** never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores as part of coding/restarts/deploys
- **Phase 59 scope:** Day-2 operator path only — not full milestone QA packaging (60), not learning metrics redesign (58 done), not accuracy tagger rewrites (57 done)

### Claude's Discretion

- Exact residual polish set (research recommends: **format reuse chip in results meta**, **post-save one-click download of just-saved list**, **optional Train A/D keyboard** when Train mode focused — not all required if time-boxed)
- Whether to surface `durationMs` as a light meta fragment (recommended optional; not a perf rewrite)
- Whether post-save download is CSV-only primary vs CSV+XLSX (recommend **CSV primary** matching Download-all hierarchy)
- Whether Train keyboard is in scope or deferred if click path is already acceptable (recommend **include if cheap** — pure client listener, no server)
- How aggressively to cut confirm dialogs (research: **do not remove** dirty-guard, Train-before-Save soft, Deny≥10, Type confirm on change — only avoid **adding** more confirms)
- Process runtime profiling — only if a real large city is slow; default **skip engine perf** this phase
- Docs touch: light EFF day-2 line in DATA-STANDARDS / TEST-PLAN if cheap

### Deferred Ideas (OUT OF SCOPE)

- Full regression suite packaging (Phase 60)
- Explicit large-file runtime budget phase (Future Requirements — only if real city is slow)
- List tags/folders, load-saved-list-back-into-Train
- Soft-flag `already_imported` UI without drop
- Server-side multi-tenant sessions
- Auto-activate phrases / unsupervised ML
- Auto-save draft on every process
- Re-enabling “Send to Analyze”
- Fingerprint algorithm redesign / confirm rubber-stamp
- New npm packages, React, component libraries
- Shared store with Analyzer learned-brain
- Skip-trace / enrichment inside Filter
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **EFF-01** | Day-2 / known formats: shorter path via format auto-reuse, stacked Train, bulk download — without trading accuracy | As-built GATE-03 + review-groups stacking + download-all. Gaps: UI does not show reuse; post-save download not one-click; Train keyboard missing; no EFF static/path tests. Polish + lock day-2 path; keep gold green. |
| **EFF-02** | No efficiency that increases silent drops, skips Train when needed, or re-couples Filter→Analyze | Negative locks: gold ACC suite; GATE-02 still 409 on first format; Train groups still rendered for admin; independence banned CTAs + no push module; no new silent-drop reasons; no auto-skip Train / hide groups. |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### Format auto-reuse — COMPLETE (backend + GATE tests)

| Capability | Location | Status |
|------------|----------|--------|
| Fingerprint (order-independent headers) | `lib/bridge-city-format-store.js` `computeFormatFingerprint` | ✅ |
| Durable memory per cityId + uploadType | `saveCityFormat` / `loadCityFormat` under `BRIDGE_CITY_FORMATS_ROOT` | ✅ |
| First/changed → 409 `TYPE_COLUMN_CONFIRM_REQUIRED` | `lib/bridge-engine/index.js` `resolveTypeColumnGate` | ✅ GATE-02 |
| Match → `auto_reuse`, no confirm field | same; `source = 'auto_reuse'`, `formatMatched = true` | ✅ GATE-03 |
| Admin modal + re-POST | `public/js/bridge.js` `openTypeColumnConfirmDialog` + resume FormData | ✅ |
| Water skips Type gate | engine water path | ✅ |
| Batch mixed fingerprint hard-fail | GATE-06 | ✅ |
| UI shows “reused Type / format matched” | `renderResults` / results meta | ❌ **gap** |
| UI shows `durationMs` | results meta / KPIs | ❌ **gap** (server has it) |

**GATE-03 contract (must stay green):**

```javascript
// tests/bridge-engine.test.js — matching fingerprint reuses without confirm field
// seed admin confirm → second processUpload without confirmedTypeHeader
// expect: ok, columnMap.violationIssueType preserved, typeResolution.source === 'auto_reuse'
```

### Stacked Train — COMPLETE (structure); light polish optional

| Capability | Location | Status |
|------------|----------|--------|
| Type/description group stacks with `count`, `rowIds` | `lib/bridge-review-groups.js` | ✅ |
| Stable free-text keys (timestamp strip) | Phase 49 helpers | ✅ |
| Short labels display-only | Phase 53 / `bridge-short-label` | ✅ |
| Search + page (TRAIN_PAGE_SIZE 40) | `bridge.js` | ✅ |
| Approve/Deny mutates `lastResult` only (not list store) | decisions API + client | ✅ |
| Soft Train-before-Save (admin) | Phase 56 | ✅ |
| Deny confirm when count ≥ 10 | `DENY_CONFIRM_THRESHOLD = 10` | ✅ keep |
| Train keyboard (A/D / Enter) | `bridge-train.js` / `bridge.js` | ❌ **gap** |
| Auto-open Train when open groups | results default mode | ❌ defaults to `kept` (acceptable; do not force-skip) |

### Bulk download + multi-city path — COMPLETE (Phase 56)

| Capability | Location | Status |
|------------|----------|--------|
| Save list primary CTA | `#bridge-save-list` | ✅ LIST-01 |
| Multi-list accumulate | `bridge-list-store` | ✅ LIST-02 |
| Download all CSV/XLSX | `#bridge-download-all-csv` / `-xlsx` + API | ✅ |
| Per-list CSV/XLSX | lists table actions | ✅ |
| Save flash + scroll to lists | `resetImportAreaAfterSave` | ✅ |
| One-click download of **just-saved** list | save success path | ❌ **gap** |
| Dirty-guard before process clobber | `processUpload` confirm | ✅ keep |
| No Analyze push CTAs | factory-ux + independence tests | ✅ |

### Day-2 click path (as-built vs ideal)

```
DAY-1 (new format) — longer, intentional:
  City → Type → Response datetime → Drop → Process
  → Type confirm modal (admin) → Process resume
  → (optional) Train stacks → Save → Download all / per-list

DAY-2 (same city+uploadType+headers) — should skip confirm:
  City → Type → Response datetime → Drop → Process
  → auto_reuse (no modal) ✅
  → Train only if new/undecided groups remain
  → Save → Download

RESIDUAL FRICTION ON DAY-2:
  • No visible “Format reused · Type: Vio Cat” confidence signal
  • Save flash scrolls to lists but no Download-this-list button
  • Train still mouse-only for remaining groups
  • Response datetime always required (product — keep; not EFF scope to remove)
  • Dirty-guard confirm if unsaved prior city (correct safety — keep)
```

### What must NOT change for “speed”

| Anti-efficiency move | Why forbidden (EFF-02 / ACC / IND) |
|----------------------|-------------------------------------|
| Skip Type confirm on fingerprint change | Wrong Type → global brain poison |
| Auto-approve / hide Train groups | Games LRN; skips Train when needed |
| Silent-drop “no Type” / unresolved map | ACC-02; inventory loss |
| Auto-save every process | Freezes pre-Train rows; Out of Scope |
| Re-wire Analyze push | IND-01/02; product death |
| Default-on `already_imported` hard-drop | IND-04; empties re-work lists |
| Full-file fingerprint | Re-confirm every day (row churn) — worse EFF |

---

## Standard Stack

### Core

| Library / module | Version / location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node.js 20+ CommonJS | runtime | Engine + API | Existing; no TS/build |
| `lib/bridge-city-format-store.js` | shipped v1.8 | Fingerprint + format memory | GATE-03 source of truth — **do not rewrite** |
| `lib/bridge-engine/index.js` | shipped | Gate + `typeResolution` + `durationMs` | Read meta; avoid perf rewrites |
| `lib/bridge-review-groups.js` | shipped | Stacked Train groups | Stacking already correct |
| `lib/bridge-list-store.js` | shipped | Multi-list + download-all | Bulk path complete |
| `public/js/bridge.js` | shipped | Process / save / download / confirm | **Primary Phase 59 touch** |
| `public/js/bridge-train.js` | shipped | Pure Train helpers + card HTML | Optional keyboard helpers only |
| `public/bridge.html` + `public/css/bridge.css` | shipped | CTAs / flash / lists | Light polish only |
| `xlsx@0.18.5` | locked | XLSX downloads | Do not swap |
| `node --test` + `node:assert/strict` | built-in | EFF + regression locks | Project standard |

### Supporting

| Module / file | Purpose | When to use |
|---------------|---------|-------------|
| `tests/bridge-engine.test.js` | GATE-02/03/04/06 | Keep green; optional day-2 path assert already covered by GATE-03 |
| `tests/bridge-list-factory-ux.test.js` | LIST static UX | Extend or sibling EFF static strings |
| `tests/bridge-accuracy-gold.test.js` | ACC gold keep/kill | EFF-02 accuracy non-regression |
| `tests/bridge-independence.test.js` | No Analyze push | EFF-02 re-coupling ban |
| `tests/bridge-review-groups.test.js` | Stack keys | Stacking regression if Train polish |
| `tests/bridge-train-ux.test.js` | Train pure helpers | Keyboard helper unit tests if added |
| Phase 57 gold fixtures | `tests/fixtures/bridge/gold/` | Measurable accuracy bar |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Light UX polish + locks | Engine rewrite / worker threads | No measured large-file pain; high risk to ACC; Future Requirements |
| Surface existing `typeResolution` / `durationMs` | New telemetry service | Overkill; meta already on process payload |
| Post-save download of saved list id | Auto-download on every save | Surprises operators mid multi-city day; prefer explicit click |
| Train A/D keyboard | Bulk multi-group Approve | Too dangerous for global brain; stack-at-a-time is correct |
| Remove Type confirm “for speed” | Always auto_reuse scorer pick | Brain poison; violates GATE-02 + EFF-02 |
| Remove dirty-guard / Train-before-Save | Fewer confirms | Loses unsaved work / pre-Train saves — LIST pitfalls |

**Installation:** none.

```bash
# verification (no new packages)
npm test
node --test tests/bridge-engine.test.js tests/bridge-list-factory-ux.test.js tests/bridge-accuracy-gold.test.js tests/bridge-independence.test.js
# after public/ edits:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1
```

---

## Architecture Patterns

### Recommended touch structure (no new product folder)

```
lib/
├── bridge-city-format-store.js   # KEEP — no algorithm change
├── bridge-engine/index.js        # KEEP — already emits typeResolution + durationMs
├── bridge-list-store.js          # KEEP — download-all already works
└── bridge-review-groups.js       # KEEP — stacking already works

public/
├── bridge.html                   # OPTIONAL — flash CTA / reuse chip markup hooks
├── js/bridge.js                  # MODIFY — reuse meta, post-save download, optional keyboard
├── js/bridge-train.js            # OPTIONAL — pure helper for keyboard target if needed
└── css/bridge.css                # LIGHT — reuse chip / flash download button

tests/
├── bridge-efficiency-path.test.js  # NEW recommended — EFF-01/02 static + contract locks
├── bridge-engine.test.js           # KEEP GATE-03 green (day-2 backend)
├── bridge-accuracy-gold.test.js    # KEEP green (EFF-02 accuracy)
├── bridge-independence.test.js     # KEEP green (EFF-02 no re-couple)
└── bridge-list-factory-ux.test.js  # KEEP + optional EFF string extensions
```

### Pattern 1: Day-2 path = same process API, fewer human steps

**What:** Server path identical; day-2 skips only the **confirm modal** when fingerprint matches memory.  
**When to use:** Every known city re-upload.  
**Example (as-built — do not break):**

```javascript
// lib/bridge-engine/index.js — GATE-03 branch (verified)
} else if (memoryMatch) {
  typeHeader = Object.prototype.hasOwnProperty.call(memory, 'typeHeader')
    ? memory.typeHeader
    : null;
  source = 'auto_reuse';
  formatMatched = true;
}
```

### Pattern 2: Surface existing meta (no new API)

**What:** `renderResults` already receives full process payload including `processingMeta.typeResolution` and `processingMeta.durationMs`.  
**When to use:** Day-2 confidence + optional timing.  
**Recommended chip copy (discretion):**

| Condition | Operator-visible fragment |
|-----------|---------------------------|
| `source === 'auto_reuse'` | `Format reused · Type: {header}` or `Format reused · No type column` |
| `source === 'admin_confirm'` | `Type confirmed · {header}` (optional; day-1) |
| `durationMs` present | ` · {N}s` (optional, rounded) |

**Do not** invent new process fields or endpoints for this.

### Pattern 3: Post-save download shortcut (list factory seam)

**What:** `saveCurrentList` already returns `data.list` with id; flash currently text-only.  
**When to use:** Immediately after save when operator is ready to enrich (end of day or single-city).  
**Shape:**

```javascript
// Conceptual — after successful POST /api/bridge/lists
// data.list.id available → flash includes button/link that calls downloadSavedList(id, 'csv')
// Does NOT auto-download; does NOT clear other lists
```

### Pattern 4: Train keyboard (optional, client-only)

**What:** When `resultsMode === 'train'` and focus is not in an input, map keys to first visible undecided card.  
**Recommended keys:** `a` / `Enter` → Approve; `d` → Deny (with existing Deny≥10 confirm).  
**When to use:** Admin grinding remaining stacks on day-2 after brain already killed most types.  
**Must not:** Fire when typing in `#bridge-train-search` or list name; must not bulk-decide all groups.

### Anti-Patterns to Avoid

- **Rubber-stamp confirm:** “Always accept suggested header without modal” — poisons Type memory.
- **Hide Train as efficiency:** Emptying review groups without decisions — violates EFF-02 + LRN-02.
- **Silent drop for cleaner lists:** Banned ACC-02 reasons.
- **New store / metrics service for “operator timing”:** Client meta chip is enough.
- **Engine micro-opts without profile:** High risk, low EFF-01 value (path is human-click bound).
- **Auto-download on save:** Interrupts multi-city staging days.
- **Reintroduce Analyze CTAs** under any “export faster” name.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Day-2 Type mapping | New ML column classifier | Existing format memory + GATE-03 | Shipped, tested, volume-safe |
| Stack rows for Train | Per-row approve UI | Existing review groups | One decision ×N already |
| Bulk enrich handoff | Zip-of-zips / new export engine | `download-all` + list store | Shipped; freeze export columns |
| Process timing product | APM / Prometheus | `processingMeta.durationMs` on payload | Already computed |
| Independence lock | New auth gateway | Phase 55 tests + static bans | Already green |
| Accuracy bar | New fixture framework | Phase 57 gold suite | Already in `npm test` |

**Key insight:** EFF-01 is mostly **product proof + residual clicks**, not missing algorithms. Hand-rolling a second path would fork the factory and break GATE/LIST locks.

---

## Common Pitfalls

### Pitfall 1: Optimizing away Type confirm (confirm fatigue → rubber-stamp)

**What goes wrong:** Day-2 “efficiency” skips confirm on **changed** fingerprints or auto-accepts suggested header without samples.  
**Why it happens:** Confirm feels slow; operators want zero modals.  
**How to avoid:** Only skip when `memory.fingerprint === fingerprint` (GATE-03). Keep GATE-02 409 tests green.  
**Warning signs:** `admin_confirm` count collapses while Type map errors rise; Status/Date wins Type column.

### Pitfall 2: “Fewer Train clicks” by hiding groups

**What goes wrong:** Cap groups, auto-approve, or filter undecided out of UI.  
**Why it happens:** Confuses efficiency with learning metrics gaming.  
**How to avoid:** Stacking + brain apply reduce **necessary** clicks; never hide. LRN-02 + EFF-02 tests.  
**Warning signs:** Train empty while FN pool full of junk types.

### Pitfall 3: Silent drops as “cleaner lists”

**What goes wrong:** Drop no-Type / unresolved / low-confidence to speed Save.  
**Why it happens:** Cleaner kept counts look efficient.  
**How to avoid:** ACC-02 gold + banned reason regex; inventory stays for review/FN.  
**Warning signs:** Gold keep fixtures fail; discardReasons invent `no_type`.

### Pitfall 4: Re-coupling Filter → Analyze for “one-click done”

**What goes wrong:** “Send to enrich pipeline / Analyze” resurrected as efficiency.  
**Why it happens:** Old product muscle memory.  
**How to avoid:** Independence static bans; no push module; download remains handoff.  
**Warning signs:** Banned CTA strings; `bridge-analyzer-push` reappears.

### Pitfall 5: Post-save UX that breaks multi-city day

**What goes wrong:** Auto-download, auto-clear other lists, or navigate away from upload.  
**Why it happens:** Optimizing single-city mental model.  
**How to avoid:** Keep `resetImportAreaAfterSave` ready-for-next-city; download is optional explicit.  
**Warning signs:** Operators lose staged lists mid-day.

### Pitfall 6: Engine perf rabbit hole

**What goes wrong:** Phase spends budget on parse/tag micro-opts with no operator pain.  
**Why it happens:** `durationMs` exists and looks optimizable.  
**How to avoid:** Default skip; only profile if a real city is slow (Future Requirements).  
**Warning signs:** Large engine diffs with no EFF path tests.

---

## Code Examples

Verified patterns from as-built code (2026-07-10):

### GATE-03 auto_reuse (backend — keep)

```javascript
// Source: lib/bridge-engine/index.js resolveTypeColumnGate
// memoryMatch = stored fingerprint equals current header fingerprint
if (hasConfirm) {
  typeHeader = resolveConfirmedHeader(confirmedTypeHeader);
  source = 'admin_confirm';
  formatMatched = false;
} else if (memoryMatch) {
  typeHeader = Object.prototype.hasOwnProperty.call(memory, 'typeHeader')
    ? memory.typeHeader
    : null;
  source = 'auto_reuse';
  formatMatched = true;
}
```

### Process meta already on client payload (surface only)

```javascript
// Source: lib/bridge-engine/index.js processUpload return
processingMeta: {
  // ...
  typeResolution: { header, score, runnerUp, source, fingerprint, formatMatched },
  durationMs: Date.now() - started
}
```

### Download all (bulk — keep)

```javascript
// Source: public/js/bridge.js
async function downloadAllSavedLists(format) {
  const res = await fetch(`/api/bridge/lists/download-all?format=${fmt}`, {
    cache: 'no-store',
    headers: bridgeHeaders()
  });
  // blob → <a download> → loadSavedLists()
}
```

### Recommended results meta extension (conceptual)

```javascript
// public/js/bridge.js renderResults — append, don't replace LIST copy
const tr = data.processingMeta && data.processingMeta.typeResolution;
let reuseLabel = '';
if (tr && tr.source === 'auto_reuse') {
  reuseLabel = tr.header
    ? ` · Format reused · Type: ${tr.header}`
    : ' · Format reused · No type column';
}
const ms = data.processingMeta && data.processingMeta.durationMs;
const timeLabel = Number.isFinite(ms) ? ` · ${(ms / 1000).toFixed(1)}s` : '';
// resultsMeta.textContent = base + reuseLabel + timeLabel
```

### EFF-02 static ban sketch (tests)

```javascript
// tests/bridge-efficiency-path.test.js (recommended NEW)
// - GATE-03 string / auto_reuse path still documented in engine
// - Download all anchors present (LIST-01 carry)
// - No banned Analyze CTAs
// - No auto-save-on-process patterns
// - renderResults / process path still builds reviewGroups for admin Train
// - gold suite still required in npm test (Phase 60 will package; Phase 59 asserts green)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Confirm Type every upload | Confirm first/changed; auto_reuse on match | v1.8 Phase 52 | Day-2 skips modal |
| Row-by-row Train | Type-stacked groups + short labels | v1.6–v1.8 | One Deny ×N |
| Single lastResult / push to Analyze | Multi-list Save → Download all | v2.0 Phase 55–56 | List factory |
| Learning unmeasured | Paired metrics + gold P/R | v2.0 Phase 58 | Safe to polish EFF now |
| No EFF locks | Phase 59 locks + light UX | **this phase** | Prove shorter path |

**Deprecated/outdated:**

- “Send to Analyze” as completion — deleted Phase 55  
- Treating Export/Preview CSV as product download — de-emphasized Phase 56  
- Efficiency-by-silent-drop or hide-Train — explicit anti-features  

---

## Open Questions

1. **Is process runtime a Phase 59 deliverable?**
   - What we know: `durationMs` exists; research SUMMARY says profile only after accuracy freezes; Future Requirements defer large-file budget unless real city is slow.
   - What's unclear: Whether any production city currently feels slow.
   - Recommendation: **Surface duration optionally; do not rewrite engine** unless user reports pain mid-phase.

2. **Train keyboard vs post-save download — which residual click is higher value?**
   - What we know: Both are client-only; stacking already reduces Train volume via brain (Phase 58).
   - What's unclear: Admin still grinds many stacks on day-2 vs mainly multi-city download friction.
   - Recommendation: Ship **reuse chip + post-save download** as core EFF-01 polish; add **Train keyboard** if plan budget allows (Wave 2 optional).

3. **Should day-2 auto-switch results mode to Train when open groups remain?**
   - What we know: Soft Train-before-Save already warns; default mode is `kept`.
   - What's unclear: Whether auto-switch helps or annoys multi-city operators.
   - Recommendation: **Do not auto-switch** this phase — optional one-line “N groups ready in Train” in meta/status is enough.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include full section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node --test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-efficiency-path.test.js tests/bridge-list-factory-ux.test.js tests/bridge-engine.test.js` |
| Full suite command | `npm test` |
| Live gate (public/ edits) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| EFF-01 | Matching fingerprint process succeeds without confirm field (`auto_reuse`) | unit/integration | `node --test tests/bridge-engine.test.js` (GATE-03) | ✅ |
| EFF-01 | Download all CSV/XLSX anchors + API path present | static + API | `node --test tests/bridge-list-factory-ux.test.js tests/bridge-api-handlers.test.js` | ✅ |
| EFF-01 | Stacked Train groups still produced (count ≥ 1 stacks, not only row grind) | unit | `node --test tests/bridge-review-groups.test.js` | ✅ |
| EFF-01 | UI surfaces format reuse (copy/chip contract) | static | `node --test tests/bridge-efficiency-path.test.js` | ❌ Wave 0 |
| EFF-01 | Post-save download affordance for saved list (if implemented) | static | same | ❌ Wave 0 |
| EFF-01 | Optional Train keyboard helpers (if implemented) | unit/static | `tests/bridge-train-ux.test.js` and/or efficiency-path | ⚠️ extend |
| EFF-02 | Gold keep/kill accuracy not regressed | integration | `node --test tests/bridge-accuracy-gold.test.js` | ✅ |
| EFF-02 | First/changed format still requires confirm (no rubber-stamp) | integration | GATE-02 in `bridge-engine.test.js` | ✅ |
| EFF-02 | No Analyze push CTAs / no push module | static + unit | `tests/bridge-independence.test.js` + factory-ux bans | ✅ |
| EFF-02 | No silent-drop banned reasons on gold | integration | ACC-02 in gold suite | ✅ |
| EFF-02 | Train not skipped when groups exist (admin chrome still built) | static/unit | efficiency-path + train-ux | ❌ Wave 0 partial |
| EFF-02 | No auto-save-on-process | static | efficiency-path source scan | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-efficiency-path.test.js tests/bridge-list-factory-ux.test.js` (+ any touched suite)
- **Per wave merge:** `node --test tests/bridge-efficiency-path.test.js tests/bridge-engine.test.js tests/bridge-accuracy-gold.test.js tests/bridge-independence.test.js tests/bridge-list-factory-ux.test.js`
- **Phase gate:** Full `npm test` green + `scripts/verify-live.ps1` if `public/` touched before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-efficiency-path.test.js` — EFF-01 path locks (reuse UI contract, bulk download carry-forward, day-2 narrative strings) + EFF-02 anti-patterns (no auto-save, no push CTAs, GATE-02 still present, Train not stripped)
- [ ] Extend GATE-03 / gold / independence as **must-stay-green** citations in plan verification (no rewrites required if green)
- [ ] If Train keyboard ships: unit coverage for key handler guardrails (ignore when input focused; Deny still confirms ≥10)
- [ ] Framework install: **none** — `node --test` already project standard

*(Existing GATE-03, gold, independence, list-factory-ux cover backend pillars; Wave 0 adds EFF-specific static/path locks the planner can turn red before polish.)*

---

## Recommended Plan Shape (for planner)

Prefer **2–3 sequential plans** (TDD-friendly):

| Plan | Intent | Touches |
|------|--------|---------|
| **59-01** | Wave 0 EFF tests RED → document as-built locks (GATE-03, download-all, stacking, EFF-02 bans) | `tests/bridge-efficiency-path.test.js` |
| **59-02** | Light UX polish: format reuse (+ optional duration) in results meta; post-save download of saved list | `public/js/bridge.js`, light HTML/CSS |
| **59-03** | Optional Train keyboard + full suite / verify-live / EFF-02 cross-suite green | `bridge.js` / `bridge-train.js`, docs light |

If compressed to **2 plans:** merge 02+03 (polish + keyboard optional + suite gate).

**Success bar (roadmap):**

1. Day-2 known format: no Type modal; stacked Train when needed; bulk download path; gold still green.  
2. No efficiency change increases silent drops, skips Train when needed, or re-couples Analyze.

---

## Sources

### Primary (HIGH confidence)

- Codebase (2026-07-10): `lib/bridge-engine/index.js` (GATE + `durationMs` + `typeResolution`), `lib/bridge-city-format-store.js`, `lib/bridge-review-groups.js`, `lib/bridge-list-store.js`, `public/js/bridge.js`, `public/js/bridge-train.js`, `public/bridge.html`
- Tests: `tests/bridge-engine.test.js` (GATE-02/03), `tests/bridge-city-format-store.test.js`, `tests/bridge-list-factory-ux.test.js`, `tests/bridge-accuracy-gold.test.js`, `tests/bridge-independence.test.js`, `tests/bridge-api-handlers.test.js` (download-all)
- Requirements / roadmap: `.planning/REQUIREMENTS.md` (EFF-01/02), `.planning/ROADMAP.md` Phase 59, `.planning/STATE.md`
- Prior research: `.planning/research/SUMMARY.md`, `FEATURES.md`, `PITFALLS.md`, `ARCHITECTURE.md`; Phase 52/56/57/58 RESEARCH.md
- Spot-check 2026-07-10: gold + GATE-01 + list-factory-ux **30/30 pass**

### Secondary (MEDIUM confidence)

- Residual click ranking (reuse chip vs keyboard vs post-save download) — no live operator session this research; prioritization is product judgment
- Industry confirm-gate patterns (Flatfile/OneSchema-class) — already mapped in FEATURES.md; reuse only on stable schema fingerprint

### Tertiary (LOW confidence)

- Whether any production city needs process runtime work this milestone — flag for Phase 60 / Future if observed

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new deps; all modules verified in tree + tests |
| Architecture | HIGH | Day-2 path is existing seams; polish surface is `bridge.js` |
| Pitfalls | HIGH | Confirm rubber-stamp / hide-Train / silent-drop / push from shipped pitfalls + EFF-02 |
| Residual UX priority order | MEDIUM | No timed operator study; recommendations ordered by code-gap size |

**Research date:** 2026-07-10  
**Valid until:** ~30 days (stable product surface; re-open if large-file pain is reported)

---
*Research complete. Ready for `/gsd:plan-phase 59` planner consumption.*
