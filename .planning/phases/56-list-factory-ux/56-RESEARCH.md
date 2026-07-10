# Phase 56: List Factory UX - Research

**Researched:** 2026-07-10  
**Domain:** Filter multi-city list factory — Save/Download hero path, durable staging, workflow teaching copy  
**Confidence:** HIGH (store/API fully verified; UX gaps verified in live `bridge.html` / `bridge.js`; Phase 55 independence locks in place)

## Summary

Phase 56 is **workflow elevation, not a new store**. `lib/bridge-list-store.js` already provides user-scoped multi-list CRUD, CSV/XLSX download, download-all, rename, delete, clear-all, and `ready`/`downloaded` status under volume-safe `FILTER_LISTS_ROOT`. Lists API handlers and tests already prove persistence isolation from Analyze. Phase 55 deleted push and locked no Analyze writes — operators must not see “send to Analyze” as a path.

What is **not** done: post-process CTA hierarchy still centers a results table + optional client **Export CSV**, while durable **Download** lives only in the Saved lists panel; there is **no dirty-guard** when process overwrites `lastResult`; Train has **no “then Save”** seam guidance; pipeline/proof-rail/empty-state copy does not teach the full factory loop **Process → (Train) → Save → Download → external enrich → manual Analyze import**. LIST-02 is largely backend-true today — Phase 56 must make that truth **operator-visible** and regression-locked without inventing a second store or auto-save.

**Primary recommendation:** Keep `bridge-list-store` + lists API as-is. Modify `public/bridge.html` + `public/js/bridge.js` (+ light CSS) to (1) make **Save list** the undisputed post-process primary CTA and **Download one/all** the post-save primary path, (2) add working-set hygiene (confirm before process clobbers unsaved kept rows; soft Train-before-Save warn for admin), (3) ship the LIST-03 teaching pack across hero, pipeline/results, save panel, lists empty/toolbar, and train status — without reintroducing push or auto-saving every process. **Zero new npm packages.**

---

<user_constraints>
## User Constraints (from CONTEXT.md / product locks)

**No `56-CONTEXT.md`** — discuss-phase was not run. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, PROJECT.md, Phase 55 research/UI-SPEC, and the orchestrator brief.

### Locked Decisions

- **LIST-01:** After process (and optional Train), operator’s primary path is **Save list** then **Download** (one or all) — not “send to Analyze”
- **LIST-02:** Saved multi-city lists persist until the operator deletes them (process, restart, and deploy do not wipe the list store)
- **LIST-03:** UI workflow and copy teach Process → (Train) → Save → Download for external enrich → manual Analyze import
- **Product pipeline:** Collect → Filter process → Train (admin, optional) → Save list(s) → Download → external enrich → **manual** Analyze import
- **No Filter → Analyze auto-push / “Send to Analyze”** — Phase 55 deleted `bridge-analyzer-push.js`; independence tests must stay green
- **`already_imported` hard-drop off by default** (IND-04) — do not reintroduce default hard-drop or imply rows were hidden in Analyze when count is 0
- **Zero new npm packages** — pure CommonJS + vanilla `public/` JS/CSS + `node --test`
- **AGENTS.md:** never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores as part of coding/restarts/deploys
- **Extend, don’t rewrite** list store / lists API (v2.0 research: multi-list store already complete; gap is UX elevation)
- **No auto-save every process** (REQUIREMENTS Out of Scope) — Train-before-Save would be lost; clutter staging
- **No auto-delete lists after download** (REQUIREMENTS Out of Scope)
- **Phase 56 scope:** List factory UX only — not accuracy gold fixtures (57), not learning metrics (58), not efficiency deep polish (59), not full milestone QA (60)

### Claude's Discretion

- Exact dirty-guard UX: confirm dialog vs inline banner when process would overwrite unsaved `lastResult` (research recommends **confirm on process** when kept rows exist and not yet saved)
- Soft vs hard block when admin has open Train groups at Save (research recommends **soft confirm**, not hard block — customer path has no Train)
- Whether to add a post-save “Download this list” affordance that jumps to lists panel / triggers single-list download (recommended light touch)
- How aggressively to rework pipeline step labels / proof-rail (prefer light copy + one workflow strip over full nav redesign)
- Clear-all confirm strength (typed phrase vs existing count confirm) — discretionary; never remove confirm
- Whether client **Export CSV** on results toolbar stays as secondary “preview export” or is de-emphasized / renamed so it doesn’t compete with Save → Download (research recommends **de-emphasize / rename**, not delete without product need)
- Docs touch: light LIST workflow lines in DATA-STANDARDS / API.md if stale; not a docs rewrite phase

### Deferred Ideas (OUT OF SCOPE)

- List tags/folders, load-saved-list-back-into-Train
- Soft-flag `already_imported` in UI without drop
- Explicit freeze/version of download column contract for enrich vendors (beyond current export) — do not change export schema unless forced
- Auto-save draft on every process
- Multi-working-set / multi-city in-memory array without disk
- Re-enabling “Send to Analyze”
- Accuracy tagger/group/Type changes (Phase 57)
- Learning metrics dashboard (Phase 58)
- Efficiency / format-reuse deep polish (Phase 59)
- Full regression suite expansion (Phase 60) — Phase 56 only locks LIST behaviors
- Server-side multi-tenant sessions
- Skip-trace / enrichment inside Filter
- shadcn / React / new component library
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **LIST-01** | After process (and optional Train), primary path is **Save list** then **Download** (one or all) — not “send to Analyze” | As-built: `#bridge-save-list` is primary orange CTA; no push button. Gaps: Download only in lists panel; results **Export CSV** competes; no post-Train save nudge. Elevate CTA hierarchy + forbid Analyze CTAs (static string ban). |
| **LIST-02** | Multi-city lists persist until operator deletes (process / restart / deploy do not wipe) | Store under `FILTER_LISTS_ROOT` (volume-safe via `PDA_DATA_ROOT`); multi-list `index.json` + per-list dirs; process never calls `clearAllLists`. Gaps: no dirty-guard when process clobbers `lastResult`; UI doesn’t teach durability; clear-all still one confirm. Lock persistence tests + no wipe on process. |
| **LIST-03** | UI workflow + copy teach Process → (Train) → Save → Download → external enrich → manual Analyze import | Partial independence copy from Phase 55. Gaps: empty state / pipeline / train / save success omit full loop; no workflow strip. Ship teaching pack across hero, results, save, lists, train — without Analyze push language. |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### List store & API (COMPLETE — do not rebuild)

| Capability | Location | Status |
|------------|----------|--------|
| Save list | `saveList` → `FILTER_LISTS_ROOT/{scope}/index.json` + `{id}/meta.json` + `rows.json` | ✅ |
| List summaries | `GET /api/bridge/lists` | ✅ |
| Rename | `PATCH /api/bridge/lists/:id` | ✅ |
| Delete one | `DELETE /api/bridge/lists/:id` | ✅ |
| Clear all | `DELETE /api/bridge/lists` or `POST .../clear` | ✅ operator confirm in UI |
| Download one CSV/XLSX | `GET .../:id/download?format=` + `markDownloaded` | ✅ |
| Download all | `GET .../download-all?format=` + mark all downloaded | ✅ |
| User scope | `resolveSessionScope` / `X-Phuglee-User` | ✅ |
| Volume safety | `FILTER_LISTS_ROOT` → `PDA_DATA_ROOT/filter-lists` on Railway | ✅ |
| Status | `ready` \| `downloaded` + `downloadedAt` | ✅ |
| Max rows | `MAX_ROWS = 100000` | ✅ |
| Independence | Save writes only list root; Phase 55 tests | ✅ |

### Filter UI (PARTIAL — Phase 56 focus)

| Surface | Selector / behavior | LIST gap |
|---------|---------------------|----------|
| Hero lead | Mentions download + Analyze separate | Good baseline; can tighten LIST-03 loop |
| Pipeline | City → Type → Upload → Results | No Save / Download step language |
| Process results | KPIs, table, stub note | Stub says “Save… nothing was sent to Analyze” when clean |
| Results toolbar | **Export CSV** (client blob from `lastResult`) | Competes with durable Save → Download narrative |
| Save panel | Name + **Save list** primary | Hero CTA present; no Download here |
| Attach panel | Optional Form Forge (not Analyze) | Keep secondary; already independence-safe |
| Train wrap | Admin Approve/Deny mutates `lastResult` only | No “Save after Train” guidance |
| Saved lists panel | Table + Download all + per-list CSV/XLSX + Clear all | Download lives here; empty state incomplete loop |
| After save | `resetImportAreaAfterSave` clears working set, flash “Upload next city” | Good multi-city flow **if** save happened |
| Dirty guard | **None** — `processUpload` overwrites via `renderResults` | LIST-02 / Pitfall 3 & 8 |
| Push CTA | **Absent** (Phase 55) | Must remain absent |

### Working-set model (must preserve)

```
lastResult (client memory only)
  processUpload → overwrites
  Train decision → mutates rows / groups / stats
  Save → POST /api/bridge/lists (snapshot of lastResult.rows)
       → resetImportAreaAfterSave (clears lastResult)
  Download → from list store (durable), not lastResult
```

**Implication:** Unsaved process/Train work dies on next process or reload. That is acceptable product design **only if** UX makes Save obvious and warns before clobber.

### Phase 55 locks that Phase 56 must not break

- No `bridge-analyzer-push` module; independence static bans
- No “Send to Analyze” / push CTAs
- `alreadyImported === 0` → no “hidden from this list” / Analyze index vanity copy
- Save list remains explicit user action
- `npm test` + `verify-live.ps1` if `public/` touched

---

## Standard Stack

### Core

| Library / module | Version / location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node.js 20+ CommonJS | runtime | Lists API + store | Existing shell; no TS/build |
| `lib/bridge-list-store.js` | existing | Multi-list durable staging | Complete; extend meta only if needed |
| `lib/bridge-api.js` list handlers | existing | CRUD / download / download-all / clear | Already wired; polish only if API gap |
| `lib/bridge-export.js` + `bridge-intake-schema` | existing | CSV/XLSX export columns | Freeze — do not change column contract |
| `public/js/bridge.js` | existing | lastResult lifecycle, save, lists UI | Primary Phase 56 touch |
| `public/bridge.html` | existing | Save panel, lists panel, copy surfaces | Primary Phase 56 touch |
| `public/css/bridge.css` | existing | Phuglee tokens; save/lists styles | Light hierarchy polish only |
| `xlsx@0.18.5` | locked dep | XLSX downloads | Do not swap |
| `node --test` + `node:assert/strict` | Node built-in | LIST regression locks | Project standard |

### Supporting

| Module / file | Purpose | When to use |
|---------------|---------|-------------|
| `tests/bridge-list-store.test.js` | Store unit | Extend for LIST-02 persistence semantics if gaps |
| `tests/bridge-api-handlers.test.js` | Lists HTTP CRUD + download-all | Already covers API; extend if new endpoints |
| `tests/bridge-independence.test.js` | No Analyze writes on save | Must stay green |
| `docs/bridge/DATA-STANDARDS.md` | Saved lists + workflow | Light LIST-03 workflow wording |
| `docs/bridge/API.md` | Lists routes | Fix stale `alreadyImported` always-on line if touched |
| Phase 55 UI-SPEC | Color/type/CTA hierarchy | Reuse tokens; Save stays orange primary |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Elevate existing Save/Download UX | Rewrite list store to DB | Store already multi-list + volume-safe; rewrite burns phase budget |
| Explicit Save after process/Train | Auto-save every process | Out of scope; freezes pre-Train rows; clutters staging |
| Confirm before process clobbers unsaved | Silent overwrite (current) | Current loses trained/unsaved work (Pitfall 3/8) |
| Confirm before process clobbers | Full multi-working-set in memory | Complexity; reload still loses data; prefer Save + guard |
| Soft Train-before-Save warn | Hard-block Save until all groups decided | Too rigid; admin may intentionally skip rare groups |
| De-emphasize results Export CSV | Delete Export CSV | Preview export still useful; rename/secondary is enough |
| Teaching copy in existing panels | New multi-step wizard | Overkill; operators already know city→upload |

**Installation:** none.

```bash
# verification
npm test
node --test tests/bridge-list-store.test.js tests/bridge-api-handlers.test.js tests/bridge-independence.test.js
# after public/ edits:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1
```

---

## Architecture Patterns

### Recommended touch structure (no new product folder)

```
lib/
├── bridge-list-store.js          # KEEP — only touch if meta/status gap (unlikely)
├── bridge-api.js                 # KEEP list handlers — only if API contract gap
└── bridge-export.js              # KEEP — freeze export columns

public/
├── bridge.html                   # MODIFY — workflow copy, CTA labels, empty states
├── js/bridge.js                  # MODIFY — dirty-guard, save/train seam, lists UX polish
└── css/bridge.css                # MODIFY light — CTA hierarchy / workflow strip if needed

tests/
├── bridge-list-store.test.js     # KEEP + optional LIST-02 locks
├── bridge-api-handlers.test.js   # KEEP lists CRUD
├── bridge-independence.test.js   # KEEP green
└── bridge-list-factory-ux.test.js  # NEW recommended — static copy bans + workflow strings + no wipe helpers
```

### Pattern 1: Ephemeral working set → durable multi-list store

**What:** `lastResult` is single-slot client state; durability only via `POST /api/bridge/lists`.  
**When to use:** Every sequential city day.  
**Example (as-built save):**

```javascript
// public/js/bridge.js — keep contract
const data = await fetchJson('/api/bridge/lists', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name,
    rows: lastResult.rows,           // post-Train snapshot when admin trained first
    stats: lastResult.stats || {},
    cityId: lastResult.city?.id || selectedCity?.id || '',
    cityName: lastResult.city?.city || selectedCity?.city || '',
    state: lastResult.city?.state || selectedCity?.state || '',
    uploadType: lastResult.uploadType || selectedUploadType,
    sourceFile: lastResult.sourceFile || '',
    processingMeta: lastResult.processingMeta || {}
  })
});
await loadSavedLists();
resetImportAreaAfterSave(savedName); // ready for next city
```

### Pattern 2: CTA hierarchy (LIST-01)

**What:** Visual and interaction priority after process:

| Priority | Control | Role |
|----------|---------|------|
| **Primary** | `#bridge-save-list` “Save list” | Orange accent; land here after process / after Train |
| **Secondary (post-save)** | Download all CSV (lists toolbar) + per-list CSV/XLSX | Enrichment handoff |
| **Tertiary** | Optional attach to city profile | Form Forge KPI only |
| **Forbidden** | Send/Push/Import to Analyze | Phase 55 + LIST-01 |

**When to use:** Any results/save/lists UI edit.  
**Do not** promote Attach or Export CSV above Save.

### Pattern 3: Dirty working-set guard (LIST-02 seam)

**What:** Before starting a new process that would replace `lastResult` with kept rows, confirm:

```text
You have N kept rows that are not saved yet.
Process a new file anyway? Unsaved work (including Train decisions) will be lost.
[Cancel] [Process and discard]
```

**When to use:** `processUpload()` entry when `lastResult?.rows?.length > 0`.  
**Optional:** `beforeunload` when unsaved kept rows exist (browser-native; discretionary).  
**Do not** auto-save to avoid the confirm.

### Pattern 4: Train → Save seam (soft)

**What:** Admin decisions mutate only `lastResult`. After decision success, status may say: “Decision saved to brain. Save list below when this city is ready.” On Save click, if open undecided groups remain, soft confirm: “N Train groups still open. Save list anyway?”  
**When to use:** Admin path only (`isBridgeAdmin()`).  
**Do not** hard-block Save; do not auto-write list store from decisions.

### Pattern 5: Teaching pack surfaces (LIST-03)

| Surface | Teaching content |
|---------|------------------|
| Hero / lead | Filter stages multi-city lists for download; Analyze only after external enrich |
| Results heading / stub | Process done → (Train if admin) → Save list |
| Save panel lead | Store for more cities; then download for enrichment; nothing sent to Analyze |
| Save success flash | Saved — next city **or** download from Saved lists when ready to enrich |
| Lists empty | Process → Save list → Download (one or all) → enrich outside → manual Analyze import |
| Lists panel lead | Master staging; lists stay until you delete; download for skip-trace |
| Train panel lead (optional line) | Train then Save so this list matches your decisions |

### Anti-Patterns to Avoid

- **Re-adding “Send to Analyze”** — violates LIST-01 and Phase 55.
- **Auto-save on process** — freezes pre-Train; out of scope.
- **Auto-delete after download** — destroys operator work.
- **Treating client Export CSV as the product Download** — not durable; not multi-city.
- **Rewriting list store / introducing draft DB** — store is done.
- **Wiping filter-lists in tests against real roots** — use temp `FILTER_LISTS_ROOT` only.
- **Silent process overwrite of trained lastResult** — Pitfall 3.
- **Changing export column order/names** — Pitfall 7; enrich + Analyze import break.
- **Scope creep into accuracy/learning** — Phases 57–58.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Multi-list persistence | New DB, Redis, session store | `bridge-list-store.js` + `FILTER_LISTS_ROOT` | Atomic JSON + volume path already correct |
| CSV/XLSX export | Custom spreadsheet writer | `bridge-export` / existing `buildDownload*` | Column contract frozen for enrichers |
| Download all merge | New batch engine | `buildDownloadAll` | List Name/City/State prefix columns already shipped |
| Auth/user scope | New session system | Existing `resolveSessionScope` / headers | Multi-tenant sessions deferred |
| CTA framework | React modal kit / shadcn | Existing `bridge-btn` + `window.confirm` | Vanilla Filter shell |
| Workflow engine | State machine library | Simple flags + copy on existing panels | Single working set is enough |
| Independence guarantees | Re-implement push bans | Keep `bridge-independence.test.js` green | Already locked Phase 55 |

**Key insight:** Phase 56 value is **operator path clarity** (Save → Download, Train seam, durability messaging), not new persistence algorithms.

---

## Common Pitfalls

### Pitfall 1: Train decisions never land on the saved list

**What goes wrong:** Admin Saves before Train, or processes next city without Save → download still has denied types; trained working set evaporates.  
**Why:** Decisions mutate client `lastResult` only; list store is a snapshot.  
**How to avoid:** Soft Train-before-Save warn; post-decision “Save list when ready”; dirty-guard on process.  
**Warning signs:** Deny “Fence Permit” but download still contains fence permits for that batch.

### Pitfall 2: Multi-list store “done” but staging still single-slot

**What goes wrong:** Operators believe multi-city is automatic; process B without save loses A.  
**Why:** `lastResult` is one slot; `resetImportAreaAfterSave` only runs after save.  
**How to avoid:** Dirty-guard + copy that Save is what accumulates cities; lists panel shows many saved cities.  
**Warning signs:** “My city disappeared” after processing another file.

### Pitfall 3: Export CSV mistaken for product Download

**What goes wrong:** Operator exports from results toolbar, skips Save, loses multi-city staging and downloaded status.  
**Why:** Button labeled “Export CSV” sits near results; durable download is lower on page.  
**How to avoid:** De-emphasize/rename (e.g. “Preview CSV”); keep Save primary; lists panel “Download” language for durable path.  
**Warning signs:** Empty Saved lists while operator claims they “downloaded.”

### Pitfall 4: Clear-all / agent wipe

**What goes wrong:** Clear-all wipes a day of lists; agents “tidy” filter-lists.  
**Why:** Clear is one confirm; Agents.md must be respected by implementers.  
**How to avoid:** Keep strong confirm (optionally typed); never call clear from process/deploy scripts; tests only on temp roots.  
**Warning signs:** Production lists empty after “cleanup” PR.

### Pitfall 5: Re-coupling Analyze in copy or CTA

**What goes wrong:** “Send to Analyze” or “already hidden in Analyze” returns in LIST copy pack.  
**Why:** Historical mental model; Phase 55 only light-touched UI.  
**How to avoid:** Static string bans in tests; reuse Phase 55 forbidden CTA list; keep “nothing was sent to Analyze” as reassurance only.  
**Warning signs:** New button or stub that implies Analyze is the sink.

### Pitfall 6: Export schema drift while polishing download UX

**What goes wrong:** “Cleaner” headers break enrich vendors / Analyze import.  
**Why:** Download is the product API to the outside world.  
**How to avoid:** Do not change `EXPORT_COLUMN_ORDER` / `toExportRow` in this phase; UI-only download promotion.  
**Warning signs:** Enricher “can’t find Street Address.”

### Pitfall 7: Docs still say import filter always removes rows

**What goes wrong:** API.md still states addresses in Analyze are removed (pre-IND-04). Agents restore hard-drop.  
**How to avoid:** If docs are touched, align with default-off + opt-in only.  
**Warning signs:** New plan “restores already_imported by default.”

### Pitfall 8: Save success only says “next city,” never “download when ready”

**What goes wrong:** Operator stacks cities but never finds download path for enrichment day.  
**How to avoid:** Flash + lists lead mention Download one/all after staging.  
**Warning signs:** Full Saved lists, operator asks “how do I get files out?”

---

## Code Examples

### Dirty-guard before process (target)

```javascript
// Source: recommended wire for public/js/bridge.js processUpload()
async function processUpload() {
  if (!selectedCity || !selectedUploadType || !selectedFiles.length) return;

  if (lastResult && Array.isArray(lastResult.rows) && lastResult.rows.length > 0) {
    const n = lastResult.rows.length;
    const ok = window.confirm(
      `You have ${n.toLocaleString()} kept row(s) that are not saved yet.\n\n` +
      `Process a new file anyway? Unsaved work (including any Train decisions) will be lost.`
    );
    if (!ok) return;
  }

  // ... existing responseAt check + fetch process ...
}
```

### Soft Train-before-Save (target)

```javascript
// Source: recommended wire for saveCurrentList() when admin
function countOpenTrainGroups() {
  if (!isBridgeAdmin() || !lastResult) return 0;
  const g = getReviewGroups(lastResult);
  const all = (g.distressed || []).concat(g.notDistressed || []);
  // Prefer undecided if BridgeTrain exposes decided keys; else total groups as soft signal
  return all.length;
}

async function saveCurrentList() {
  if (!lastResult?.rows?.length) {
    setSaveStatus('Process a file with kept rows before saving.', 'error');
    return;
  }
  if (isBridgeAdmin()) {
    const open = countOpenTrainGroups();
    // Only warn when groups exist and operator may still be mid-Train
    if (open > 0 && resultsMode === 'train') {
      const ok = window.confirm(
        `${open} Train group(s) are still visible. Save this list now?\n\n` +
        `Tip: Finish Approve/Deny first so this download matches your decisions.`
      );
      if (!ok) return;
    }
  }
  // ... existing POST /api/bridge/lists ...
}
```

### LIST-03 empty state copy (target)

```html
<!-- public/bridge.html #bridge-lists-empty -->
<div id="bridge-lists-empty" class="bridge-lists-empty">
  No saved lists yet. Process a city file, Train if needed (admin), click Save list,
  then Download one or all for external enrichment. Import into Analyze only after skip-trace.
</div>
```

### Static UX locks (target test)

```javascript
// Source: recommended tests/bridge-list-factory-ux.test.js
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '../public/bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/js/bridge.js'), 'utf8');

test('LIST-01: no Send/Push to Analyze CTAs in Filter UI', () => {
  for (const banned of ['Send to Analyze', 'Push to Analyze', 'Import to Analyzer']) {
    assert.equal(html.includes(banned), false);
    assert.equal(js.includes(banned), false);
  }
});

test('LIST-01: Save list CTA present', () => {
  assert.match(html, /id="bridge-save-list"/);
  assert.match(html, /Save list/);
});

test('LIST-01: Download all controls present', () => {
  assert.match(html, /id="bridge-download-all-csv"/);
  assert.match(html, /Download all/);
});

test('LIST-03: workflow teaches Save and Download / manual Analyze', () => {
  // After phase: empty or lead copy should mention Save + Download + Analyze import/enrich
  const corpus = html + js;
  assert.match(corpus, /Save list/);
  assert.match(corpus, /[Dd]ownload/);
  assert.match(corpus, /[Aa]nalyze/); // independence / manual import language
});

test('LIST-02: process path does not clear list store', () => {
  const api = fs.readFileSync(path.join(__dirname, '../lib/bridge-api.js'), 'utf8');
  // handleProcess must not call clearAllLists
  const processSlice = api.slice(api.indexOf('async function handleProcess'), api.indexOf('async function handle', api.indexOf('async function handleProcess') + 1));
  assert.equal(processSlice.includes('clearAllLists'), false);
});
```

### Persistence lock (existing pattern — keep)

```javascript
// tests/bridge-list-store.test.js already proves multi-list + scope + clear is explicit
// Extend if needed: two saves survive third save (accumulate, not replace)
test('LIST-02: multiple city lists accumulate until deleted', () => {
  saveList({ name: 'City A', rows: [{ streetAddress: '1 A' }], city: 'A', username: 'op' });
  saveList({ name: 'City B', rows: [{ streetAddress: '2 B' }], city: 'B', username: 'op' });
  const { lists } = listSummaries({ username: 'op' });
  assert.equal(lists.filter((l) => l.name === 'City A' || l.name === 'City B').length, 2);
});
```

---

## State of the Art (project-local)

| Old approach | Current / Phase 56 target | Impact |
|--------------|---------------------------|--------|
| Filter as Analyze feeder | List factory: Save → Download → enrich → manual Analyze | Product boundary (v2.0) |
| Single mental model `lastResult` only | Working set + durable multi-list panel | Multi-city day |
| Push adapter in tree | Deleted (Phase 55) | No re-couple |
| Independence copy only | Full Process → Train → Save → Download teaching pack | LIST-03 |
| Silent process overwrite | Confirm if unsaved kept rows | Protect Train/save work |
| Export CSV as peer of Save | Save primary; Export de-emphasized | LIST-01 clarity |
| Lists empty: “Process… Save list” | Full loop including Download + enrich + Analyze | Operator education |

**Deprecated/outdated:**

- Auto-push / “Send to Analyze” as Filter feature
- API.md claim that process always removes Analyze addresses (pre-IND-04)
- Treating Phase 56 as greenfield list store work

---

## Open Questions

1. **How strong should the Train-before-Save gate be?**
   - What we know: Saving mid-Train freezes dirty types on that list; brain still gets rules.
   - What's unclear: Whether operators want hard block.
   - Recommendation: **Soft confirm only** when Train tab active / groups visible; never block customers.

2. **Should results “Export CSV” stay?**
   - What we know: Client-side, no list store, no downloaded status.
   - Recommendation: Keep but rename/de-emphasize to “Preview CSV” (or move under secondary); primary path remains Save → Download.

3. **Typed confirm for Clear all?**
   - What we know: Count confirm exists.
   - Recommendation: Optional upgrade (`type CLEAR`) if cheap; not required for LIST success if count confirm remains.

4. **Pipeline step “5 Save/Download”?**
   - What we know: 4 steps today end at Results.
   - Recommendation: Prefer results heading + workflow strip over renumbering entire pipeline (less churn); discretionary.

5. **Export contract freeze docs this phase?**
   - SUMMARY suggested 55–56; not a LIST success criterion.
   - Recommendation: Do **not** change columns; optional one-line “export stable” in DATA-STANDARDS only if docs already open.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-list-store.test.js tests/bridge-list-factory-ux.test.js tests/bridge-independence.test.js` |
| Full suite command | `npm test` |
| Live gate (if `public/` touched) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LIST-01 | Filter HTML/JS has **Save list** CTA; Download all controls present | unit (static) | `node --test tests/bridge-list-factory-ux.test.js` | ❌ Wave 0 |
| LIST-01 | No “Send/Push to Analyze” / push CTA strings in Filter UI | unit (static) | same | ❌ Wave 0 |
| LIST-01 | Lists API download + download-all still work | integration | `node --test --test-name-pattern="lists|download" tests/bridge-api-handlers.test.js` | ✅ |
| LIST-01 | Process/save still never invent Analyze writes | integration | `node --test tests/bridge-independence.test.js` | ✅ |
| LIST-02 | Multi-list accumulate (two saves → two summaries) | unit | `node --test tests/bridge-list-store.test.js` | ✅ (extend if needed) |
| LIST-02 | User scope isolation; clear only via clearAllLists | unit | same | ✅ |
| LIST-02 | `handleProcess` does not call `clearAllLists` / wipe lists root | unit (static) | factory-ux or independence file | ❌ Wave 0 |
| LIST-02 | Save writes under `FILTER_LISTS_ROOT` only | integration | independence list-save test | ✅ |
| LIST-03 | Workflow copy corpus includes Process/Save/Download + enrich or manual Analyze language | unit (static) | factory-ux test | ❌ Wave 0 |
| LIST-03 | Empty lists / save panel copy not implying Analyze as sink | unit (static) | same | ❌ Wave 0 |
| LIST-03 | Manual browser: Process → Save → Download all → lists persist after restart | manual-only | `verify-live.ps1` + operator path | manual |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-list-factory-ux.test.js tests/bridge-list-store.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green; after any `public/` edit, `scripts/verify-live.ps1` green before claiming live

### Wave 0 Gaps

- [ ] `tests/bridge-list-factory-ux.test.js` — LIST-01/03 static CTA + forbidden Analyze strings + workflow copy presence; LIST-02 process-does-not-wipe static check
- [ ] Optional: extend `tests/bridge-list-store.test.js` with explicit “accumulate multi-city” assertion if not already covered by download-all fixture
- [ ] Optional: assert save success / empty-state strings once final copy locked
- [ ] No new test framework install required
- [ ] Browser dirty-guard / confirm dialogs are **manual** or untestable in `node:test` without JSDOM — do not invent Puppeteer this phase

*(Existing list-store + API handler + independence tests cover backend LIST-02 durability and LIST-01 download mechanics.)*

---

## Suggested Plan Decomposition (for planner)

Opinionated, small plans — high confidence, UI-heavy:

| Plan | Goal | Primary files | Reqs |
|------|------|---------------|------|
| **56-01** | LIST-03 teaching pack + LIST-01 CTA hierarchy copy (hero, results, save panel, lists empty/lead, train nudge); de-emphasize Export CSV; forbid Analyze CTAs | `public/bridge.html`, `public/js/bridge.js` (stub/flash strings), light `bridge.css` | LIST-01, LIST-03 |
| **56-02** | Working-set hygiene: dirty-guard on process; soft Train-before-Save; save flash mentions download path; optional scroll-to-lists after save (already partial) | `public/js/bridge.js` | LIST-01, LIST-02 |
| **56-03** | Tests + docs: factory-ux static suite; process-does-not-wipe; keep independence green; light DATA-STANDARDS/API LIST workflow; verify-live | `tests/bridge-list-factory-ux.test.js`, optional store extend, docs | LIST-01, LIST-02, LIST-03 |

**Order rationale:** Copy/CTA first (operator-visible LIST-01/03), then guards (LIST-02 seam), then locks/docs so agents cannot reintroduce push or wipe narratives.

**Do not** include Phase 57 accuracy fixtures, brain metrics, or export column renames.

---

## Sources

### Primary (HIGH confidence)

- Code (2026-07-10): `lib/bridge-list-store.js` (full), `lib/bridge-api.js` list handlers ~962–1083 + routes ~1112–1167, `lib/config.js` `FILTER_LISTS_ROOT`, `public/bridge.html` (hero, results, save, lists), `public/js/bridge.js` (`saveCurrentList`, `resetImportAreaAfterSave`, `renderResults`, `processUpload`, lists CRUD UI), `public/css/bridge.css` save/lists styles
- Tests: `tests/bridge-list-store.test.js`, `tests/bridge-api-handlers.test.js` (lists CRUD + download-all), `tests/bridge-independence.test.js` (save isolation)
- Product: `.planning/REQUIREMENTS.md` LIST-01..03, `.planning/ROADMAP.md` Phase 56, `.planning/STATE.md` (next = 56)
- Research: `.planning/research/SUMMARY.md` Phase 56, `ARCHITECTURE.md` Pattern 2 ephemeral→durable, `FEATURES.md` multi-list staging, `PITFALLS.md` Pitfalls 3, 7, 8
- Phase 55: `55-RESEARCH.md`, `55-UI-SPEC.md` (no push; Save primary; LIST pack deferred), `55-VERIFICATION.md` (passed)
- Docs: `docs/bridge/DATA-STANDARDS.md` Filter Saved Lists, `docs/bridge/API.md` lists routes
- Agents.md — never wipe filter-lists / brain volumes; verify-live after public/

### Secondary (MEDIUM confidence)

- Dirty-guard / soft Train warn exact copy — product UX discretion; patterns from PITFALLS.md
- Whether Export CSV rename is required vs sufficient de-emphasis — not locked in requirements
- API.md stale alreadyImported line — verified present; fix when docs touched

### Tertiary (LOW confidence)

- Typed CLEAR confirm for clear-all — optional polish, not required by LIST IDs
- beforeunload adoption rates on SPA-like Filter page — discretionary

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new deps; store/API/UI files verified end-to-end |
| Architecture | HIGH | Working-set vs list store seams read from live code + v2.0 research |
| Pitfalls | HIGH | PITFALLS 3/8 + verified no dirty-guard + Export CSV competition |
| Exact copy strings | MEDIUM | LIST-03 requires teaching pack; final wording is discretionary |
| Dirty-guard UX shape | MEDIUM–HIGH | Confirm-on-process strongly indicated; beforeunload optional |

**Research date:** 2026-07-10  
**Valid until:** ~2026-08-10 (stable in-repo domain; re-verify if list store or Filter results layout is rewritten)

---
*Phase 56 research — List Factory UX*  
*Feeds gsd-planner PLAN.md; researcher writes file; commit via gsd-tools when enabled*
