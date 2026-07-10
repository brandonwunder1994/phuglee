# Architecture Research

**Domain:** Distress OS Filter (Data Bridge) — Independence, multi-list staging, accuracy & learning (v2.0)
**Researched:** 2026-07-10
**Confidence:** HIGH for as-built seams (verified in `lib/`, `public/js/bridge.js`); MEDIUM for product-gap sizing (UX elevation vs greenfield)

## Standard Architecture

### System Overview

v2.0 does **not** invent a new product surface or shared DB. It re-centers Filter as a **standalone list factory** and strengthens the **in-Filter learning loop**. Three product moves plug into existing seams:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  UI  public/bridge.html + public/js/bridge.js (+ bridge-train.js)            │
│  · process · Train Approve/Deny · Save list (primary CTA) · multi-list panel │
│  · download / download-all · attach to Collect (optional)                    │
│  · single lastResult working set (ephemeral until Save)                      │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ /api/bridge/*
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  API  lib/bridge-api.js                                                      │
│  process · lists CRUD/download · brain decisions/undo/rules · attach/history │
│  ★ NO process-path write to Analyze (already true; v2.0 locks + purges dead) │
└───┬─────────────────────┬──────────────────────────┬─────────────────────────┘
    │                     │                          │
    ▼                     ▼                          ▼
┌─────────────┐   ┌──────────────────┐    ┌────────────────────┐
│ Engine      │   │ List store       │    │ Brain stack        │
│ processUp-  │   │ bridge-list-     │    │ store / apply /    │
│ load + batch│   │ store.js         │    │ decisions / miner  │
└──────┬──────┘   └────────┬─────────┘    └─────────┬──────────┘
       │                   │                        │
       │                   ▼                        ▼
       │          data/filter-lists/         BRIDGE_BRAIN_ROOT/
       │          {scopeKey}/                global-brain.json
       │            index.json
       │            {listId}/meta.json
       │            {listId}/rows.json
       │
       │  READ-ONLY soft link (keep)
       ▼
┌──────────────────┐     optional legacy (quarantine / delete in v2.0)
│ analyzer-import- │     lib/bridge-analyzer-push.js  ──X──► Analyze write
│ index.js         │     (NOT called from handleProcess today)
└──────────────────┘
```

**Product pipeline after v2.0 (locked):**

```
Collect (city files)
    → Filter process (tag + brain + dedupe + optional already_imported)
    → Train (admin) → brain rules (global)
    → Save list(s) → Download → external enrich/skip-trace
    → Manual Analyze import
```

No Filter → Analyze **write** path. Analyze → Filter **read** (address index) remains intentional soft coupling.

### Component Responsibilities

| Component | Responsibility | New vs modified | Typical implementation |
|-----------|----------------|-----------------|------------------------|
| `handleProcess` | Upload → `processUpload(Batch)`; return payload only | **Modified** (lock: assert no push; docs/tests) | `lib/bridge-api.js` |
| `processUpload` | Parse → type gate → normalize/tag → dedupe → import-filter → **brain apply** → distress filter → rowIds → review groups | **Modified** (accuracy/learning only) | `lib/bridge-engine/index.js` |
| List store | User-scoped multi-list durable staging | **Mostly exists; modify** for any meta/UX gaps | `lib/bridge-list-store.js` |
| Lists API | CRUD, download, download-all, clear | **Exists; polish** | `lib/bridge-api.js` list handlers |
| Filter UI | Process results, Train, Save/Download CTAs, multi-list panel | **Modified** (CTA primacy, working-set hygiene) | `public/js/bridge.js` |
| Brain store | Global rules + events + metrics | **Modified** (learning bar metrics) | `lib/bridge-brain-store.js` |
| Brain apply | Promote/suppress type+phrase before distress filter | **Modified** (accuracy) | `lib/bridge-brain-apply.js` |
| Brain decisions | Admin Approve/Deny → rules + list mutation | **Modified** (learning quality) | `lib/bridge-brain-decisions.js` |
| Phrase miner | Proposed phrases from deny events | **Modified** (activation efficiency) | `lib/bridge-phrase-miner.js` |
| Review groups | Train grouping keys (timestamp-stable) | **Modified** (accuracy) | `lib/bridge-review-groups.js` |
| Type column + city format | Scorer + confirm gate + format memory | **Carry forward** (v1.8); accuracy touch only if needed | `bridge-type-column-score.js`, `bridge-city-format-store.js` |
| Distress tagger | Base keep/kill regex categories | **Modified** (accuracy pass) | `lib/bridge-distress-tagger.js` |
| Import address index | Strip rows already in Analyze session | **Keep** (read-only soft coupling) | `analyzer-import-index.js` + `import-filter.js` |
| Analyzer push adapter | Bridge rows → Analyze session write | **Delete or quarantine** | `lib/bridge-analyzer-push.js` |
| Forge attach | Version dataset + response KPI on city | **Unchanged** (independent of Analyze) | attach handlers + `forge-client` |
| Format store | Per-city Type header fingerprint | **Unchanged** domain boundary | `BRIDGE_CITY_FORMATS_ROOT` |

## Recommended Project Structure

v2.0 stays in the existing shell layout. Prefer **pure modules + thin API wiring** (v1.6–v1.8 pattern). No new top-level product folder.

```
lib/
├── bridge-api.js                 # MODIFY — routes; independence lock; list/brain polish
├── bridge-engine/
│   ├── index.js                  # MODIFY — processUpload order; accuracy/learning hooks only
│   ├── normalizer.js             # MODIFY only if type/map accuracy needs it
│   ├── import-filter.js          # KEEP (read-only Analyze soft link)
│   └── parsers/                  # KEEP
├── bridge-list-store.js          # MODIFY if meta/status/fields needed; API surface largely done
├── bridge-export.js              # KEEP (CSV/XLSX for downloads)
├── bridge-analyzer-push.js       # DELETE or move to legacy/ — not on process path
├── bridge-brain-store.js         # MODIFY — metrics for learning bar
├── bridge-brain-apply.js         # MODIFY — apply order / rule quality
├── bridge-brain-decisions.js     # MODIFY — decision → rule quality
├── bridge-phrase-miner.js        # MODIFY — propose → activate efficiency
├── bridge-review-groups.js       # MODIFY — grouping accuracy
├── bridge-distress-tagger.js     # MODIFY — keep/kill accuracy
├── bridge-type-column-score.js   # KEEP (v1.8)
├── bridge-city-format-store.js   # KEEP (v1.8)
├── bridge-short-label.js         # KEEP (display-only)
├── analyzer-import-index.js      # KEEP read-only
└── config.js                     # KEEP FILTER_LISTS_ROOT / BRIDGE_BRAIN_ROOT

public/
├── bridge.html                   # MODIFY — CTA hierarchy (Save/Download first-class)
└── js/
    ├── bridge.js                 # MODIFY — lastResult lifecycle, lists UX, no push
    └── bridge-train.js           # MODIFY — Train efficiency / labels only

data/                             # runtime (gitignored) — DO NOT wipe in agents
├── filter-lists/{scopeKey}/      # multi-list store
└── bridge-brain/global-brain.json

tests/
├── bridge-list-store.test.js     # KEEP + extend
├── bridge-api-handlers.test.js   # MODIFY — process never pushes
├── bridge-engine*.test.js        # MODIFY — accuracy locks
└── bridge-analyzer-push.test.js  # DELETE with module or reframe as “must not be required by process”
```

### Structure Rationale

- **In-process Filter:** Same as v1.x — zero new service boundary; roadmapper phases stay file-local.
- **List store under `FILTER_LISTS_ROOT`:** Already volume-safe; multi-list is directory-per-list + `index.json` — extend, don’t replace.
- **Brain separate from list store and from Analyzer learned-brain:** Carry-forward v1.6 decision; accuracy/learning must not merge domains.
- **Push module as dead code:** Treating it as “optional library” invites re-coupling. Quarantine/delete in independence phase.

## Architectural Patterns

### Pattern 1: Independence boundary (Filter write ban)

**What:** Filter may **read** Analyze state for de-dupe; Filter must never **write** Analyze session/records from process, save, or Train.
**When to use:** Every v2.0 phase that touches process, lists, or brain.
**Trade-offs:** Operators must manually import after enrich (product intent). Soft read coupling still requires Analyzer data root / process availability for `already_imported` stats.

**Example (as-built process handler):**

```javascript
// lib/bridge-api.js handleProcess — keep this contract
const payload = await processUploadBatch(fileList, batchArgs);
// Filter only — do not auto-push to Analyze. Lists are saved explicitly via /api/bridge/lists.
sendJson(res, 200, payload);
```

**Enforcement for v2.0:**

1. Static: process path must not `require('bridge-analyzer-push')`.
2. Test: handler/unit lock that `pushRowsToAnalyzer` is never invoked from process.
3. UI: primary CTA is Save / Download, not “Send to Analyze”.

### Pattern 2: Ephemeral working set → durable multi-list store

**What:** `lastResult` in `public/js/bridge.js` is a **single working set** (process + Train mutations). Durability is only via `POST /api/bridge/lists` into `data/filter-lists/{scopeKey}/`.
**When to use:** Multi-city sequential days; external enrichment batches.
**Trade-offs:** Processing city B without saving city A loses the working set. That is correct if Save is primary — v2.0 UX must make the risk obvious (and ideally block silent overwrite).

```
lastResult (client memory)
    │  processUpload overwrites
    │  Train decision mutates rows / reviewGroups / stats
    ▼
POST /api/bridge/lists  →  saveList()  →  index.json + {id}/meta.json + {id}/rows.json
    │
    ▼
GET .../download | download-all  →  CSV/XLSX (markDownloaded status)
```

**Do not** invent a second parallel store (e.g. session draft DB) unless UX research proves multi-working-set is required. Prefer: Save → clear working set → next city (already partially implemented via `resetImportAreaAfterSave`).

### Pattern 3: Brain apply before distress filter (learning plug-in)

**What:** Global brain rules re-tag rows **after** import-filter and **before** `filterDistressOnly`, so suppress/promote changes who enters kept vs FN review pools.
**When to use:** All code_violation process runs; water is no-op (BRAIN-03).
**Trade-offs:** Suppress-last-wins means promote can be overridden — intentional (v1.6). Accuracy work must preserve water early-exit and order tests.

```
normalize/tagRow → dedupe → filterAlreadyImported
    → applyBrainToRows (promote_type → promote_phrase → suppress_phrase → suppress_type)
    → filterDistressOnly
    → assignRowIds + buildReviewGroups
```

### Pattern 4: Decision write path is brain + client lists only

**What:** `POST /api/bridge/brain/decisions` mutates global brain and returns mutated `rows` / `notDistressedRows` / `reviewGroups`. Client applies to `lastResult`. **Does not** touch list store or Analyze.
**When to use:** Admin Train Approve/Deny.
**Trade-offs:** Saving a list **after** Train is the operator’s job; list store has no automatic “save trained result” unless v2.0 adds optional auto-save. Prefer explicit Save CTA over silent list writes.

### Pattern 5: Pure helper + thin engine wire (accuracy modules)

**What:** Accuracy improvements ship as pure functions (score, group key, phrase mine) with engine/API only wiring. Matches v1.7–v1.8 (e.g. `bridge-type-column-score.js`).
**When to use:** Any keep/kill, Type, grouping, or learning algorithm change.
**Trade-offs:** Slightly more files; massively better testability and no Analyze dependency leakage.

## Data Flow

### Request Flow — process (no Analyze write)

```
[User: city + file(s)]
    ↓
public/js/bridge.js processUpload()
    ↓ POST multipart /api/bridge/process
handleProcess → processUploadBatch → processUpload
    ↓
parse → type confirm gate (v1.8) → normalizeRawRows/tagRow
    → dedupeRows → loadImportAddressIndex (READ Analyze)
    → filterAlreadyImported
    → loadBrain + applyBrainToRows
    → filterDistressOnly
    → assignRowIds + buildReviewGroups
    ↓
JSON { rows, notDistressedRows, reviewGroups, stats, processingMeta }
    ↓
lastResult = data; renderResults; Train chrome if admin
    ✗ never pushRowsToAnalyzer
```

### Request Flow — save / multi-list / download (primary product path)

```
[User: Save list]
    ↓ POST /api/bridge/lists { name, rows: lastResult.rows, city, stats, ... }
handleListCreate → saveList
    ↓
FILTER_LISTS_ROOT/{storageKey}/index.json + {listId}/…
    ↓
UI: loadSavedLists + resetImportAreaAfterSave (ready for next city)

[User: Download all]
    ↓ GET /api/bridge/lists/download-all?format=csv|xlsx
buildDownloadAll → browser file
    ↓ external enrich / skip-trace
    ↓ manual Analyze import (outside Filter)
```

### Request Flow — Train → brain learning (independent of lists & Analyze)

```
[Admin: Approve/Deny group]
    ↓ POST /api/bridge/brain/decisions
applyDecision(brain, currentRows, notDistressedRows)
    → typeRules upsert/disable + events + phrase mine (proposed)
    → saveBrain (version RMW)
    ↓
response mutates lastResult lists + reviewGroups
    ↓ (later process runs)
applyBrainToRows uses active rules → fewer wrong keeps/kills → fewer Train actions
```

### State Management

| State | Location | Owner | Lifetime |
|-------|----------|-------|----------|
| Working process result | `lastResult` in `bridge.js` | Client | Until next process or page reload; cleared after successful Save |
| Saved lists | `FILTER_LISTS_ROOT/{scope}/` | List store | Until user delete/clear |
| Global brain | `BRIDGE_BRAIN_ROOT/global-brain.json` | Brain store | Durable; admin decisions |
| City Type format memory | `BRIDGE_CITY_FORMATS_ROOT` | Format store | Durable; admin confirm |
| Analyze session addresses | Analyzer data root / API | Import index (read) | Soft cache (~5 min TTL; force on process) |
| Forge bridge datasets | Form Forge city profile | Attach API | Independent KPI/history |

### Key Data Flows (v2.0 deltas)

1. **Independence:** Process/save/Train remain write-isolated from Analyze; purge dead push so it cannot be re-wired casually.
2. **Multi-list:** Sequential cities accumulate in list store; download-all is the enrichment handoff; not a single `lastResult`.
3. **Learning bar:** Decision events + active rules + (recommended) process-time rule-hit counters feed “Approve/Deny volume falls over time.”
4. **Accuracy:** Changes stay inside tagger / groups / brain apply / type gate — never “fix accuracy by pushing to Analyze for re-scan.”

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|---------------------------|
| Single admin, local/Railway (current) | Monolith shell + file stores; fine. Header user scope OK. |
| Multi-operator same tenant | Scope keys already isolate lists; brain remains **global** (product). Don’t split brain per user. |
| Very large city files / many lists | List `rows.json` size + decision POST body (15MB soft debt) — stream/export and decision payload thinning only if operator pain appears. |
| Multi-tenant SaaS | Out of scope for v2.0 (needs real sessions); independence work should not depend on it. |

### Scaling Priorities

1. **First bottleneck:** Operator time on Train Approve/Deny (learning quality), not HTTP scale.
2. **Second bottleneck:** Process runtime on large OCR/PDF batches — optimize parsers/tagger only after independence + list UX.
3. **Third bottleneck:** Decision POST shipping full row arrays — defer unless Train latency hurts.

## Anti-Patterns

### Anti-Pattern 1: Re-coupling “for convenience”

**What people do:** Re-enable `pushRowsToAnalyzer` after process or after Save “so Analyze has the list.”
**Why it's wrong:** Violates core value (enrich outside; manual import); blurs Filter/Analyze domains; undoes independence milestone.
**Do this instead:** Save + Download + document manual Analyze import. Keep push deleted/quarantined.

### Anti-Pattern 2: Treating import-filter as “push coupling” to remove

**What people do:** Strip `filterAlreadyImported` to “fully decouple.”
**Why it's wrong:** That path is **read-only** and prevents re-working leads already in Analyze; product still wants it.
**Do this instead:** Keep import-filter; label it soft coupling in architecture docs; never write back.

### Anti-Pattern 3: Merging Filter brain with Analyzer learned-brain

**What people do:** Share stores so “one brain rules all.”
**Why it's wrong:** Different domains (text tags vs vision tiers); v1.6 explicitly separated.
**Do this instead:** Improve Filter brain metrics/apply only; Analyzer brain stays out of scope.

### Anti-Pattern 4: Accuracy fixes that only work after Analyze import

**What people do:** Defer keep/kill quality to Analyze classification.
**Why it's wrong:** Re-couples product flow; learning bar is **Filter Train volume**, not Analyze review volume.
**Do this instead:** Fix tagger/brain/groups so kept lists are trustworthy before download.

### Anti-Pattern 5: Multi-list store rewrite

**What people do:** Replace filesystem list store with DB or Analyzer session-as-lists.
**Why it's wrong:** Store already matches product (`index` + per-list meta/rows, scope keys, download-all); rewrite burns phase budget.
**Do this instead:** Elevate UX and any missing meta; keep atomic JSON writes.

### Anti-Pattern 6: Auto-save every process without Train

**What people do:** Persist every process result immediately to lists.
**Why it's wrong:** Admin may Train-mutate `lastResult` after process; auto-save freezes pre-Train rows or creates junk lists.
**Do this instead:** Explicit Save after Train (admin) or after process (customer). Optional “Save & next city” CTA is fine; silent auto-save is not.

### Anti-Pattern 7: lastResult multi-city without durable save

**What people do:** Array of in-memory results across cities with no disk.
**Why it's wrong:** Refresh/reload loses a day’s work; contradicts multi-list store purpose.
**Do this instead:** One working set + durable multi-list panel.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Property Analyzer | **Read** address index only (`analyzer-import-index` / `/api/import-address-index`) | Soft coupling; keep. **No** Filter write via process. |
| Property Analyzer bridge-import | Legacy HTTP/disk push via `bridge-analyzer-push.js` | **Not** on process path; delete/quarantine in independence phase. Manual import UI in Analyze remains the product path. |
| Form Forge | City summaries; attach dataset + response KPI | Independent of Analyze; keep. |
| External enrich / skip-trace | Offline / third-party after download | Outside codebase; download-all is the handoff. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ Bridge API | REST JSON / multipart | Same origin shell |
| API ↔ Engine | In-process function call | `processUpload` / batch |
| API ↔ List store | In-process | Scope from `X-Phuglee-User` / plan |
| API ↔ Brain | In-process load/save | Admin gate on writes |
| Engine ↔ Import index | Async load Set | Force refresh each process |
| Engine ↔ Brain apply | Pure function | No fs inside apply |
| List store ↔ Brain | **None** | Save does not train; train does not auto-save |
| List store ↔ Analyze | **None** | Download is human bridge |
| Format store ↔ Brain | **None** | Separate roots (v1.8) |
| Filter brain ↔ Analyzer learned-brain | **None** | Hard domain split |

### New vs Modified (v2.0 summary)

| Kind | Items |
|------|--------|
| **NEW (only if learning bar needs it)** | Process-time rule-hit metrics helper; optional UI “Save & next city” / dirty-working-set guard; independence regression tests |
| **MODIFY** | `bridge-api.js`, `bridge-engine`, tagger, review-groups, brain-*, list-store (meta only), `bridge.js` / `bridge.html` CTAs, docs (`DATA-STANDARDS`, audit that still list auto-push as a feature) |
| **DELETE / QUARANTINE** | Process-path use of `pushRowsToAnalyzer`; ideally module + tests that imply push is product behavior |
| **KEEP AS-IS** | Multi-list filesystem layout; import-filter read path; Forge attach; city format memory; short labels display-only |

## Suggested Build Order (phases from 55)

Dependency rule: **decouple push before list UX elevation; accuracy/learning must not reintroduce Analyze writes.**

```
55 Independence lock
    → 56 List factory UX (Save/Download primary; multi-list workflow)
        → 57 Accuracy structure pass (tagger / type / groups / process)
            → 58 Learning loop strength (decisions → rules → fewer Train actions)
                → 59 Efficiency (runtime + operator time + cross-city reuse)
                    → 60 Integration QA / regression (no re-couple; verify-live)
```

| Phase (suggested) | Goal | Touches | Depends on | Avoids |
|-------------------|------|---------|------------|--------|
| **55 — Independence lock** | Prove and harden “Filter never writes Analyze”; remove dead push surface; docs/tests | `bridge-api`, `bridge-analyzer-push` (delete/quarantine), tests, docs, UI copy that still implies push | Nothing | List redesign, accuracy rewrites |
| **56 — List factory UX** | Make multi-list Save/Download the hero path; working-set hygiene after process/Train; sequential city day workflow | `bridge.js`, `bridge.html`, minor `bridge-list-store` / list API if gaps | 55 (so Save isn’t “instead of push” half-done) | Brain algorithm changes; Analyze features |
| **57 — Accuracy structure** | Keep/kill, Type/format, grouping correctness so first-pass lists need less Train | tagger, review-groups, normalizer/type gate, engine only | 55 (boundary clear); 56 optional but preferred so correct rows land in lists | Any Analyze write; brain store schema churn unless required |
| **58 — Learning loop** | Stronger decision→rule→apply so Approve/Deny volume falls; metrics for the bar | brain-decisions, brain-apply, phrase-miner, brain-store metrics, Train UI | 57 (train against better groups/types) | Push; list store rewrite |
| **59 — Efficiency** | Operator time, process duration, cross-city reuse (format memory, batch) | engine perf, format reuse UX, Train batching | 57–58 for meaningful “reuse” | New product modules |
| **60 — QA lock** | processUpload e2e + list e2e + “no push require” + verify-live | tests, `scripts/verify-live.ps1` | 55–59 | New features |

**Ordering rationale:**

1. **Independence first** — product definition of done for v2.0; prevents later phases from “temporarily” calling push.
2. **Lists second** — store/API already exist; UX elevation is the real gap (primary CTA, multi-city day). Doing this before deep accuracy means operators can stage correct-enough lists immediately.
3. **Accuracy before learning strength** — bad groups/types poison rules; fix structure then reinforce brain.
4. **Learning before pure perf** — success metric is fewer Approve/Deny actions; runtime secondary.
5. **QA last** — regression suite must include independence invariants forever.

**Research flags for later phase digs:**

- Phase 55: Inventory all references to push (docs, GSD-AUDIT, tests) — mostly mechanical.
- Phase 56: Whether dirty-guard / “Save & next” needs design research (UX), not architecture rewrite.
- Phase 57–58: Likely need deeper per-topic research (tagger false positives, phrase activation rates, learning metrics schema).
- Phase 59: Profile processUpload duration only after accuracy freezes.

## processUpload stage diagram (v2.0 target — same skeleton)

```
buffer + filename + city + uploadType + user scope
        │
        ▼
   [parse tabular | document/OCR]
        │
        ▼
   [type column gate + city format memory]     ← v1.8; accuracy-only tweaks
        │
        ▼
   normalizeRawRows ── tagRow (base distress)
        │
        ▼
   dedupeRows (within file / batch merge)
        │
        ▼
   loadImportAddressIndex (Analyze READ)       ← soft coupling KEEP
        │
        ▼
   filterAlreadyImported
        │
        ▼
   applyBrainToRows (global brain)             ← learning path
        │
        ▼
   filterDistressOnly (code violations)
        │
        ▼
   assignRowIds → buildReviewGroups
        │
        ▼
   { rows, notDistressedRows, reviewGroups, stats, processingMeta }
        │
        ✗  NO pushRowsToAnalyzer
        │
        ▼
   [UI lastResult] → Train? → POST /lists → download → external → manual Analyze
```

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Process has no auto-push today | HIGH | `handleProcess` comment + no require of push module in process path |
| Multi-list store exists | HIGH | `bridge-list-store.js` + full lists API + UI panel |
| Soft Analyze read coupling | HIGH | `import-filter` + `analyzer-import-index` every process |
| Brain learning plug-in points | HIGH | apply → decisions → phrase miner verified |
| UX gap vs greenfield lists | MEDIUM | Store done; product elevation is UI/workflow, not new persistence |
| Exact phase count 55–60 | MEDIUM | Suggested for roadmapper; may compress 59/60 |

## Sources

- Code (2026-07-10): `lib/bridge-api.js`, `lib/bridge-engine/index.js`, `lib/bridge-list-store.js`, `lib/bridge-analyzer-push.js`, `lib/bridge-brain-*.js`, `public/js/bridge.js`, `public/bridge.html`
- Product: `.planning/PROJECT.md` (v2.0 goals, out of scope auto-push), `.planning/STATE.md`
- Prior architecture: `.planning/codebase/ARCHITECTURE.md` (2026-07-09)
- Docs: `docs/bridge/DATA-STANDARDS.md` (Filter saved lists; no auto-push), `docs/bridge/API.md`
- Prior milestone research: `.planning/research/ARCHITECTURE.md` (v1.8 Type Column — superseded by this file for roadmap focus)

---
*Architecture research for: Filter Independence & Learning (v2.0)*
*Researched: 2026-07-10*
*Feeds roadmap phases starting at 55; do not commit from researcher — orchestrator commits*
```
