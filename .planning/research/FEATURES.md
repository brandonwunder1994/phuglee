# Feature Research

**Domain:** Filter list factory — independence, multi-list staging, heterogeneous-city accuracy, continuous brain learning (v2.0)
**Researched:** 2026-07-10
**Confidence:** HIGH (codebase + shipped v1.6–v1.8 + locked PROJECT/STATE decisions); MEDIUM (industry HITL / staging-workflow norms)

## Context (already shipped — do not re-spec as greenfield)

| Capability | Where | Role relative to v2.0 |
|------------|-------|------------------------|
| Process upload (parse → normalize → tag → brain → keep/kill) | `lib/bridge-engine`, tagger, brain-apply | Core factory; accuracy pass improves this path |
| Type column scoring + format confirm gate | v1.8 COL/GATE | Heterogeneous city accuracy foundation |
| Category promote empty-only + stable groups + short labels | v1.7–v1.8 | Train usability; must not regress |
| Admin Train Approve/Deny → global type/phrase rules | v1.6 BRAIN/TRAIN/DEC/PHRASE | Learning loop already exists; v2.0 measures + tightens it |
| Saved lists CRUD + download-all + clear-all | `lib/bridge-list-store.js`, `/api/bridge/lists*`, Saved lists panel | Multi-list staging largely built; polish + workflow lock |
| Process does **not** call push today | `bridge-api` handleProcess comment; tests assert no `analyzerPush` | Product still wants remnant push path removed / never re-coupled |
| Optional Form Forge attach | `/api/bridge/attach` | Keep optional; not Analyze |
| `bridge-analyzer-push.js` module | Still in tree | Legacy adapter — anti-feature for this milestone if wired back |
| `alreadyImported` filter via Analyze session index | `import-filter` + `analyzer-import-index` | Soft Analyze coupling on process; product may keep (dedupe) or relax under independence |

**Gap statement:** Filter is already closer to a list factory than a push pipeline, but the product narrative and code still carry Analyze-era coupling (`bridge-analyzer-push`, import-index discard, “day of uploads” mental model). Operators need a durable multi-city staging workflow (save → enrich outside → manual Analyze import), a full accuracy pass so heterogeneous city files don’t thrash Train, and a measurable learning bar: Approve/Deny of code violations becomes less frequent as the global brain absorbs admin decisions.

## Expected Operator Behavior

Canonical post-v2.0 loop (admin + customer Filter; only admin trains):

```
COLLECT (outside / Form Forge)
  city response arrives (portal / email / FOIA dump)

FILTER — per city file
  1. Select city + upload type (code_violation | water_shut_off)
  2. Drop file(s) → process
  3. If first/changed format (admin): confirm ONE Type column (or none)
  4. System: map columns, tag distress, apply global brain, keep strong / stage FN pool
  5. Admin (when needed): Train — Approve/Deny stacked violation types
        ├── fixes current kept/FN lists immediately
        └── writes global rules for every future upload
  6. Save filtered list → appears in Saved lists (bottom); import area clears for next city
  7. Optional: Attach versioned dataset to Form Forge city profile (KPI only)

STAGING (multi-city)
  8. Repeat 1–6 for more cities — lists persist until operator deletes them
  9. Download one list or Download all (CSV/XLSX) for third-party enrichment / skip-trace

EXTERNAL (outside Distress OS)
  10. Enrich / skip-trace / hand-edit as needed

ANALYZE (manual only)
  11. Operator imports fully prepared list into Analyze (no Filter push)
  12. Scan / review / export dial-ready

SUCCESS SIGNALS
  - Fewer Train Approve/Deny actions per city over time (same type vocabulary already handled)
  - Less operator time per city (format reuse, stacked groups, bulk download)
  - Acceptable process runtime on large heterogeneous sheets
  - Cross-city reuse: rules + format memory help city N without re-teaching city 1 lessons
```

**Customer (non-admin) path:** Upload → process → save/download lists. No Train chrome. Benefits from admin-trained global brain automatically.

**Admin path:** Same + Type confirm on new formats + Train + brain panel (activate phrases, undo, metrics).

## Feature Landscape

### Table Stakes (Users Expect These)

Features operators assume for a Filter-as-list-factory. Missing = workflow feels broken or still “push-coupled.”

| Feature | Why Expected | Complexity | Notes / existing dependency |
|---------|--------------|------------|----------------------------|
| **No automatic Filter → Analyze push** | Product core: enrich outside, then manual Analyze import | LOW | Process already omits push; remove/retire `pushRowsToAnalyzer` call sites + UI affordances; lock tests (C-20 style) |
| **Explicit Save list after process** | Staging is intentional, not silent side-effect | LOW | Exists (`POST /api/bridge/lists` + save panel). Ensure save remains required; never auto-save into Analyze |
| **Multi-city lists persist until deleted** | Sequential city work must not overwrite prior lists | LOW–MEDIUM | List store is multi-list by design; kill any single-`lastResult`-only mental model in UX copy; never wipe lists on process/restart |
| **List rename / per-list download (CSV+XLSX) / delete** | Staging area hygiene | LOW | Shipped in list store + UI |
| **Download all as one sheet** | Operators batch enrich many cities at once | LOW | Shipped (`download-all`); mark downloaded status |
| **Clear messaging: Filter ≠ Analyze** | Prevents “where did my leads go?” and accidental re-coupling | LOW | Lead copy exists; extend empty states, save success, Analyze import docs |
| **Heterogeneous city process still works** | Every city export is different headers/shapes | MEDIUM–HIGH | Depends on v1.8 Type scorer + format gate + v1.7 promote/groups; v2.0 accuracy pass audits residual failures |
| **Keep/kill distress tagging with visible reasons** | Operators must trust what stayed vs dropped | MEDIUM | Tagger + FN pool + Train groups shipped; accuracy pass may tighten rules without silent drops |
| **Admin Train still works after save workflow** | Learning is primary accuracy metric | LOW | Decisions mutate `lastResult` before save; document: Train then Save (or re-process after rules) |
| **Optional Form Forge attach (not Analyze)** | City Tracker turnaround KPIs | LOW | Keep optional; independent of list factory |
| **Regression: process never invents Analyze session writes** | Independence must be test-locked | LOW | Handler + engine tests |

### Differentiators (Competitive Advantage)

Align with core value: filter non-deals with a brain that learns; stage clean multi-city lists for external enrichment.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Global HITL brain that reduces future Approve/Deny volume** | Competitors re-filter the same junk types every city; Phuglee learns once | MEDIUM | v1.6 loop exists; v2.0 differentiates on **measured decline** of Train actions + rule hit rates |
| **Learning health surface (admin)** | “Is the brain getting smarter?” is the sellable superpower | MEDIUM | Beyond raw `totalDecisions`: decisions-per-process, auto-applied suppress/promote hits, new-type vs known-type ratio over time |
| **Per-city format memory + Type confirm** | Zero-friction day-2 uploads without silent wrong maps | Already mostly shipped | Differentiator vs dumb column renamers; keep as accuracy backbone |
| **Type-stacked Train (not row grind)** | One Deny kills 40 High Grass rows + future cities | Shipped | Protect with correct Type column + short display labels |
| **Multi-list master staging + Download all** | Operator runs a full market day, then one enrichment batch | LOW–MEDIUM | UX polish: city/type chips, record totals, “ready vs downloaded,” non-destructive clear |
| **Cross-city rule reuse (efficiency peer)** | Admin tax paid once; customers inherit quality | MEDIUM | Global brain product decision; metrics should show cross-city apply |
| **Accuracy pass on residual heterogeneous failure modes** | Real FOIA dumps still break Train/groups | HIGH | Audit: keep/kill edge cases, singleton noise, phrase propose quality, batch mixed formats, large files |
| **Operator-time efficiency (not just runtime)** | Time-to-saved-list is the real KPI | MEDIUM | Fewer confirms, fewer Train clicks, clearer save/download path |

### Anti-Features (Explicitly Do Not Build)

Quality gate for requirements scoping — commonly requested or historically tempting, but wrong for this product.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-push Filter → Analyze** | “Seamless pipeline” | Blocks external enrich/skip-trace; mixes half-ready leads into Analyze; couples modules | Save/download lists; manual Analyze import of prepared data |
| **Silent drop leads** (no Type, no distress, no address edge) | “Cleaner lists” | Hides real inventory; destroys trust; blocks FN Train | Keep for review / FN pool / explicit discard reasons + previews |
| **Blend / concatenate multiple Type columns** | “Capture category + subtype” | Unstable groups; brain poison; v1.8 COL anti-pattern | Single winner Type column; subtype stays in notes/raw |
| **Non-admin training** | Scale labeling | Quality control / sellable integrity; poisoned global brain | Admin-only Train + decisions API 403 |
| **Per-user / per-city brains** | Multi-tenant customization | Fragmented quality; no cross-city reuse; product is shared global quality | One global brain; per-city **format** memory only (not type rules) |
| **Re-introduce Analyze push button “optional”** | Power-user shortcut | Becomes default path; undoes independence narrative | Never on Filter; Analyze has its own import |
| **Auto-save every process to lists** | Fewer clicks | Junk intermediate runs clutter staging; Train-before-save lost | Explicit Save after operator is happy with Train/result |
| **Auto-delete lists after download** | “Tidy staging” | Destroys user work (Agents.md); re-download / re-enrich needs history | Persist until explicit Delete / Clear all |
| **Skip-trace / enrichment inside Filter** | One-stop shop | Wrong product boundary; bloat; delays list factory | External tools; Filter only stages clean distress lists |
| **Black-box ML fine-tune without admin gate** | “SOTA learning” | Uncontrollable, untestable, hard to undo | HITL type + proposed phrases → admin activate |
| **Shared store with Analyzer learned-brain** | Code reuse | Different domain (vision tiers vs text tags) | Patterns only (atomic JSON, caps); separate files/APIs |
| **Wipe filter-lists / brain to “reset accuracy”** | Dev convenience | Destroys operator work | Separate test fixtures; never tidy user volumes |
| **Force confirm every upload** | Max safety | Fatigue; defeats format memory | Confirm first time + format change only |
| **Replace stored type with short/LLM label** | Pretty UI | Breaks match/export/brain keys | Display-only short labels (shipped) |

## Feature Dependencies

```
[Independence: no Analyze push]
    └──requires──> Explicit Save list + Download paths (shipped)
    └──conflicts──> Auto-push / push button / process-side session writes
    └──enhances──> Multi-list staging (Filter is destination, not pass-through)

[Multi-list staging]
    └──requires──> Durable list store (FILTER_LISTS_ROOT) — shipped
    └──requires──> Process produces kept rows (pipeline)
    └──enhances──> External enrich → manual Analyze import
    └──soft-couples──> alreadyImported index (optional Analyze read; not push)

[Heterogeneous-city accuracy]
    └──requires──> Type column score + single winner (v1.8)
    └──requires──> Format fingerprint + confirm gate (v1.8)
    └──requires──> Promote empty-only + stable groups (v1.7)
    └──requires──> Distress tagger + brain apply (v1.6)
    └──feeds──> Train group quality
                    └──feeds──> Brain rule quality
                         └──feeds──> Fewer future Approve/Deny  ← success metric

[Continuous brain learning]
    └──requires──> Admin-only decisions + audit (v1.6)
    └──requires──> Runtime apply on every process (v1.6)
    └──requires──> Correct Type keys (v1.8) — else learning poisons
    └──enhanced-by──> Learning metrics / decision-volume trends (v2.0 gap)
    └──conflicts──> Per-user brains, non-admin train, auto-ML live rules

[Efficiency: operator time + runtime + cross-city reuse]
    └──requires──> Format auto_reuse (operator time)
    └──requires──> Type-stacked Train (operator time)
    └──requires──> Download all (operator time)
    └──requires──> Process performance budget (runtime)
    └──requires──> Global brain apply (cross-city reuse)
```

### Dependency Notes

- **Independence requires Save/Download, not Analyze:** If push is removed without a trustworthy staging UX, operators lose the “where do leads go?” answer. Lists panel is the destination.
- **Learning requires Type accuracy:** Wrong Type column → wrong group keys → wrong suppress/promote → every city gets worse. v1.8 is prerequisite; v2.0 accuracy pass must not reopen blend/silent-drop.
- **Train-then-Save order:** Decisions mutate in-session `lastResult`. Saved lists snapshot rows at save time. Operators should Train before Save for that list; new rules still apply on next process for other cities.
- **alreadyImported is not push:** Reading Analyze addresses to drop duplicates is a soft coupling. Product may keep it as dedupe or make it optional under independence — but it must not write to Analyze.
- **Clear all is operator-only:** Never agent/deploy “cleanup.” Confirm dialog already matches Agents.md spirit.

## MVP Definition (this milestone = v2.0)

Not a greenfield MVP — **milestone-minimum** to declare Filter independence + learning bar met.

### Ship in v2.0

- [ ] **Independence lock** — No process/UI/API path auto-pushes or one-clicks leads into Analyze; legacy push module unreferenced or clearly dead; regression tests
- [ ] **Multi-list staging as primary workflow** — Save → multi-city accumulate → download one/all → delete only on purpose; copy and empty states teach the loop
- [ ] **Accuracy pass (implement, not audit-only)** — Fix residual keep/kill, Type/format, Train grouping, and brain-apply issues found on real heterogeneous city files
- [ ] **Learning bar instrumentation** — Admin can see that brain activity is working (rules applied / decision volume trends); success = Approve/Deny code-violation volume falls over comparable uploads
- [ ] **Efficiency peer metrics** — Operator path shorter (reuse format, stacked Train, bulk download); no single-dimension tradeoff that tanks runtime or reuse
- [ ] **Regression suite + verify-live** — processUpload e2e + list independence tests green

### Add after v2.0 validation

- [ ] Richer learning dashboard (time-series decisions/process, per-type rule effectiveness)
- [ ] Optional toggle: skip `alreadyImported` filter when Analyze session should not influence Filter
- [ ] List tags / folders (market day, campaign) if staging volume grows
- [ ] Server-side sessions (replace spoofable admin header) for multi-tenant

### Explicitly later / never for this product line

- [ ] Skip-trace vendors inside Filter
- [ ] Auto-push or “send to Analyze” convenience
- [ ] Per-user brains / non-admin Train
- [ ] Multi-column Type blend
- [ ] Unsupervised ML live rules without admin gate

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Remove/lock no Analyze auto-push | HIGH | LOW | P1 |
| Multi-list save/download/delete workflow polish + copy | HIGH | LOW–MEDIUM | P1 |
| Heterogeneous accuracy pass (keep/kill + Type/Train residual) | HIGH | HIGH | P1 |
| Learning success metric (decision volume / rule hits) | HIGH | MEDIUM | P1 |
| Format reuse + Type gate remain correct (no regression) | HIGH | LOW (protect) | P1 |
| Download all + downloaded status | HIGH | LOW (exists) | P1 |
| Cross-city brain reuse visible in meta/metrics | MEDIUM–HIGH | MEDIUM | P2 |
| Optional alreadyImported policy clarity | MEDIUM | LOW–MEDIUM | P2 |
| Process runtime improvements | MEDIUM | MEDIUM–HIGH | P2 |
| List organization (tags/folders) | LOW–MEDIUM | MEDIUM | P3 |
| Enrichment integrations | LOW (out of scope) | HIGH | — anti / later |

**Priority key:**
- P1: Must have for v2.0 milestone done
- P2: Should have if accuracy/efficiency pass surfaces them
- P3: Nice to have after independence + learning bar proven

## Competitor / Pattern Mapping

Not SaaS competitors — **workflow patterns** operators already know.

| Pattern | Typical tools | Our approach |
|---------|---------------|--------------|
| Import mapping confirm | Flatfile, OneSchema, CSVBox | Type column confirm + format fingerprint (shipped); accuracy pass hardens |
| Staging before CRM | Spreadsheet “working tabs,” enrichment vendors | Saved multi-city lists + download-all; **no** CRM/Analyze auto-ingest |
| HITL labeling → model improve | Label studios, active learning | Admin Approve/Deny type stacks → global rules; phrases proposed-only |
| Dedup against existing CRM | Salesforce import skip | Optional `alreadyImported` vs Analyze index (read-only); never write-back push |
| Per-tenant models | Enterprise ML | **Rejected** — one global brain for sellable shared quality |

## Implications for REQUIREMENTS.md Categories

Suggested requirement buckets (IDs to assign in requirements phase):

| Category | Table stakes / differentiators to capture | Anti-features to list in Out of Scope |
|----------|-------------------------------------------|----------------------------------------|
| **IND — Independence** | No push; no Analyze write from Filter process; docs/UI independence | Auto-push, optional push button |
| **LIST — Multi-list staging** | Persist multi-city; save/rename/download/delete/download-all; clear only explicit | Auto-save all processes; auto-delete on download; wipe on deploy |
| **ACC — Accuracy pass** | Residual keep/kill, Type/format, grouping, brain-apply fixes on heterogeneous files | Silent drop; Type blend; short-label as stored type |
| **LRN — Learning bar** | Measure/show declining Approve/Deny need; rule apply on process | Non-admin train; per-user brains; auto-ML live |
| **EFF — Efficiency** | Operator time + runtime + cross-city reuse peer goals | Optimize one dimension by harming another |
| **TEST — Regression** | Independence + list + process e2e locks | — |

**Dependencies on existing (do not rebuild):** list store, processUpload, brain store/apply/decisions, Type scorer, format store, Train UI, Form Forge attach.

## Sources

- `.planning/PROJECT.md`, `.planning/STATE.md` — v2.0 locked intent
- `.planning/milestones/v1.6-REQUIREMENTS.md`, `v1.7-REQUIREMENTS.md`, `v1.8-REQUIREMENTS.md` — shipped foundations
- `docs/bridge/API.md`, `DATA-STANDARDS.md` — Filter-only process + lists contract
- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — HITL learning model
- `lib/bridge-list-store.js`, `lib/bridge-api.js`, `public/bridge.html`, `public/js/bridge.js` — staging UX reality
- `lib/bridge-analyzer-push.js` — legacy push surface to retire from product path
- Agents.md — never wipe filter-lists / brain as “cleanup”
- Industry patterns: import confirm gates (Flatfile/OneSchema-class), HITL labeling loops, external enrichment before CRM ingest (mapped; MEDIUM confidence)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Independence table stakes | HIGH | Product docs + process path already non-push; remnant module is cleanup |
| Multi-list staging | HIGH | CRUD + download-all exist; v2.0 is workflow lock + polish |
| Heterogeneous accuracy | MEDIUM–HIGH | Stack shipped; residual failure modes need audit-during-implement |
| Learning bar | MEDIUM | Loop exists; **decline-in-Train-volume** metric UX not fully productized |
| Anti-features | HIGH | Explicitly locked across PROJECT + prior milestones |

## Gaps to Address in Later Research / Phases

- Exact residual accuracy bugs on real city fixtures (needs phase research with sample files)
- Whether `alreadyImported` stays on by default under full independence (product call)
- Concrete learning metrics formula (events per N processes vs absolute decision count)
- Performance budget for large multi-file batches (runtime peer of efficiency)

---
*Feature research for: Distress OS Filter Independence & Learning (v2.0)*
*Researched: 2026-07-10*
*Supersedes prior FEATURES.md focus on v1.8 Type Column Intelligence alone*
