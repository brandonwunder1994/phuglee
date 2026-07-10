# Stack Research

**Domain:** Distress OS Filter Independence & Learning (v2.0) — decouple Filter from Analyze auto-push; multi-list staging; deeper accuracy/efficiency on heterogeneous city files; brain learning so Approve/Deny volume falls over time  
**Researched:** 2026-07-10  
**Confidence:** HIGH  
**Milestone:** v2.0 (subsequent — extends shipped Filter pipeline; not greenfield)

## Recommended Stack

### Verdict (one line)

**Add zero npm packages.** All three v2.0 capability areas ship by deleting/retiring residual Analyze-push coupling, extending existing pure CommonJS modules + file-backed stores, and hardening the HITL brain loop already in `lib/bridge-brain-*`. Prefer existing stack; only re-evaluate a library after a measured failure of pure heuristics.

### Core Technologies (unchanged base)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 20+ (runtime 24.x local; Docker `node:20-bookworm-slim`) | Shell + in-process Filter pipeline | Production stack; all Filter work stays in-process under `server.js` |
| JavaScript CommonJS | existing | `lib/bridge-*.js` + `lib/bridge-engine/` | Every Filter module is CJS; no TS/build step |
| Vanilla browser JS | existing | Filter UI in `public/js/bridge.js`, Train in `bridge-train.js` | No React rewrite (backlog-only); wizard + lists panel already present |
| Node built-in `http` | built-in | `/api/bridge/*` via `lib/bridge-api.js` | Shell is raw HTTP — do not introduce Express/Fastify |
| Node built-in `fs` + atomic JSON | built-in | Lists, brain, city formats | Proven pattern (`writeJsonAtomic` in list/brain/format stores); volume-safe on Railway |
| Node built-in `crypto` | built-in | List IDs, fingerprints, phrase/rule IDs | Already used in `bridge-list-store`, format memory, review groups |
| `node --test` | built-in | Regression locks for independence + learning bar | Suite ~460 after v1.8; keep parity with `tests/bridge-*.test.js` |
| `xlsx` | 0.18.5 (locked) | Spreadsheet parse + list export CSV/XLSX | Already on process + download paths; do not re-parse or swap engines |

### Capability map → stack (what changes)

| v2.0 capability | Stack action | Primary integration points |
|-----------------|--------------|----------------------------|
| **(1) No Filter→Analyze auto-push** | **Code delete / UI cleanup** — process path already does not call push | `lib/bridge-api.js` (confirmed: no push after `processUploadBatch`), `lib/bridge-analyzer-push.js` (retire or quarantine), docs/tests that still describe auto-push |
| **(1) Multi-list save/download store** | **Extend existing store + UX** — backend already complete | `lib/bridge-list-store.js`, `/api/bridge/lists*`, `public/js/bridge.js` lists panel |
| **(2) Heterogeneous city accuracy/efficiency** | **Pure JS heuristics only** — extend scorer, aliases, tagger, stable keys, format memory | `bridge-type-column-score`, `bridge-city-format-store`, `bridge-intake-schema`, `bridge-distress-tagger`, `bridge-stable-text`, `bridge-review-groups` |
| **(3) Brain learning → fewer Approve/Deny** | **HITL hybrid only** — better rules, metrics, apply coverage; no ML stack | `bridge-brain-store`, `bridge-brain-apply`, `bridge-brain-decisions`, `bridge-phrase-miner`, Train UI |

### Supporting modules (existing — extend, do not replace)

| Module | Version | Purpose | When / how for v2.0 |
|--------|---------|---------|---------------------|
| `lib/bridge-list-store.js` | existing | User-scoped multi-list CRUD + CSV/XLSX download + download-all + clear | **Primary list factory.** Ensure process → save is the default post-process action; UX for sequential multi-city staging (name, status ready/downloaded, delete). No new DB. |
| `lib/bridge-export.js` | existing | `rowsToCsv` / `rowsToXlsxBuffer` | Keep as only export codec for lists and process downloads |
| `lib/bridge-api.js` | existing | All `/api/bridge/*` handlers | Independence: keep process free of push; lists routes stay source of truth. Optional: metrics endpoints for learning bar. |
| `lib/bridge-engine/index.js` | existing | `processUpload` / batch | Accuracy path: type gate → normalize → tag → brain apply → split kept/FN. No Analyze side effects. |
| `lib/bridge-analyzer-push.js` | existing | Optional session append into Analyzer | **Do not call from process.** For v2.0 independence: remove call sites if any remain, deprecate module + tests, or leave unexported dead code with explicit “manual Analyze import only” docs. |
| `lib/analyzer-import-index.js` + `bridge-engine/import-filter.js` | existing | Drop rows already present in Analyze session | **Soft coupling only** (de-dupe, not push). Keep unless product wants pure Filter with zero Analyze reads; if kept, document as optional skip-already-imported, not “send to Analyze.” |
| `lib/bridge-api.js` `handleAttach` | existing | Form Forge portal attach (`/api/portal/city/…/bridge/attach`) | **Not Analyze push.** Keep for Collect/Forge dataset history. Do not confuse with independence work. |
| `lib/bridge-brain-store.js` | existing | `global-brain.json`, caps, version RMW, metrics | Extend metrics for learning bar (trendable counters); keep file-backed, global, admin-trained |
| `lib/bridge-brain-apply.js` | existing | Promote/suppress type + phrase on rows | Efficiency: ensure apply runs on every process so trained rules reduce Train volume |
| `lib/bridge-brain-decisions.js` | existing | Approve/Deny → list mutation + type rules + events | Learning: type rules go live immediately; preserve undo + 409 version conflict |
| `lib/bridge-phrase-miner.js` | existing | Deny → proposed phrase rules (admin activate) | Learning: improve candidate quality / dedupe; **never** auto-activate without admin (product lock) |
| `lib/bridge-type-column-score.js` | existing (v1.8) | Single Type column winner | Accuracy: tighten value-shape features for more city layouts |
| `lib/bridge-city-format-store.js` | existing (v1.8) | Per-city fingerprint + confirmed Type header | Efficiency: reuse = fewer confirm modals across heterogeneous files |
| `lib/bridge-short-label.js` | existing (v1.8) | Display-only Train titles | Keep display-only; never store as type key |
| `lib/bridge-review-groups.js` + `bridge-stable-text.js` | existing | Stable group keys / timestamp strip | Accuracy: fewer singleton Train groups → less Approve/Deny noise |
| `lib/bridge-distress-tagger.js` | existing | Base regex `INDICATOR_CATEGORIES` | Accuracy: keep/kill catalog + brain on top; no ML replacement |
| `lib/config.js` | existing | `FILTER_LISTS_ROOT`, `BRIDGE_BRAIN_ROOT`, `BRIDGE_CITY_FORMATS_ROOT` | Volume roots already correct; no new store root required unless a dedicated learning-metrics file is split out (prefer brain metrics first) |
| `public/js/bridge.js` | existing | Process, save list, lists panel, attach, Train hooks | Independence UX: copy + flow “save/download only — nothing sent to Analyze”; multi-list staging prominence |
| Form Forge (optional) | Flask/Python child | City registry + attach history | Unchanged for Filter independence |

### New modules (pure JS — no install; only if roadmap needs them)

| Module (proposed) | Purpose | Why not a library |
|-------------------|---------|-------------------|
| `lib/bridge-learning-metrics.js` (optional) | Derive learning bar: decisions-per-process trend, % groups auto-resolved by brain, rule hit counts over time | Pure reduce over `brain.events` + process `processingMeta`; no time-series DB needed at single-tenant scale |
| `lib/bridge-type-synonyms.js` (optional) | Cross-city type key aliases (“High Grass” ↔ “Weeds/Grass”) for rule reuse | Domain table + normalize; fuzzy npm packages add non-determinism and dep weight |
| `lib/bridge-tag-policy.js` (optional) | Centralize keep/kill policy review outcomes if tagger catalog is audited | Keep pure + testable; avoid scattering policy in UI |

Only create these when a phase proves the logic does not fit cleanly in existing brain/tagger modules.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npm test` → `node --test tests/**/*.test.js` | Unit + processUpload e2e locks | Add independence lock: process response has no `analyzerPush`; lists CRUD still green; brain apply reduces group volume fixtures |
| `scripts/verify-live.ps1` | Health after `public/` edits | Mandatory per Agents.md |
| `scripts/restart.ps1` | Headless local server | Never block on `node server.js` in agent shell |
| No bundler | Static Filter UI | Lists + Train stay vanilla DOM |

## Installation

```bash
# No new runtime dependencies for v2.0 Filter Independence & Learning.
# Existing bridge deps already cover parse/export/OCR:

# (already installed — versions from package-lock)
# xlsx@0.18.5  mammoth@1.12.0  pdf-parse@2.4.5  tesseract.js@7.0.0

# Dev: built-in test runner only
npm test

# Live check after UI edits
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

If a future phase measures pure heuristics failing the accuracy bar on a curated multi-city fixture set, re-evaluate **then** — not at milestone start.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| File-backed multi-list JSON (`bridge-list-store`) | SQLite / Postgres / Redis list store | Multi-writer multi-tenant SaaS with concurrent index updates; not current single-operator + header-scoped shell |
| Delete/disable `pushRowsToAnalyzer` from Filter process | Keep optional “Send to Analyze” button | Only if product reverses independence; current milestone locks **no push** |
| Soft import-filter (already-in-Analyze de-dupe) | Hard-remove all Analyzer reads from Filter | If operators need every address even when already in Analyze session; independence still holds without push |
| HITL type + phrase rules (existing brain) | Embeddings / LLM auto-tag | Only after HITL plateaus on measured city set **and** admin gate still wraps every live rule |
| Pure string normalize + synonym table | `fuse.js` / `string-similarity` / Levenshtein package | Only if synonym table + `violationTypeKey` still miss cross-city near-matches in production samples |
| Atomic JSON brain file | Separate metrics service / Prometheus | Single-tenant admin metrics; brain `events` array is enough for learning-bar charts |
| Vanilla lists panel UX | React/Vue list manager | Explicit backlog only; doubles surface and breaks static `public/` model |
| Keep Form Forge attach | Remove all attach | Attach is Collect/Forge dataset archival, not Analyze push — different product path |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| TensorFlow / ONNX / `transformers.js` / scikit-learn bridge | Heavy, non-deterministic, no labeled municipal corpus, fights accuracy regression locks | HITL type/phrase rules + deterministic tagger |
| OpenAI / Gemini for keep/kill or Type | Latency, cost, network, hard to test; product forbids ML without admin gate | Admin Train + proposed phrases |
| React / Vite / SPA rewrite | Out of scope for v2.0; Filter UI already multi-panel | Vanilla `bridge.js` lists + Train |
| Express / Fastify / new API framework | Shell is raw `http` + `bridge-api.js` | Extend existing handlers |
| New npm schema-mapping / ETL SaaS | FOIA privacy, vendor lock, extra process | In-repo heuristics + city format memory |
| Shared store with Analyzer `learned-brain` | Different domain (vision tiers vs text tags); corrupts both products | Filter `global-brain.json` only |
| Per-user / per-city brains | Product is global shared quality | Global brain + per-city **format** memory only |
| Auto-activate phrase rules without admin | Controllability lock from v1.6 | Proposed → admin activate |
| Re-introducing auto-push to Analyze | Explicit v2.0 anti-feature | Save list → external enrich → manual Analyze import |
| SQLite just for list index concurrency | Rare multi-writer; atomic JSON is enough | Keep `writeJsonAtomic`; optional version field later |
| Streaming rewrite of multipart/process | Valuable later for huge OCR jobs; not required for independence/learning | Existing buffer path + `MAX_ROWS`; byte cap only if upload incidents justify |
| Replacing `xlsx` with ExcelJS/SheetJS Pro | No feature gap for list export; churn risk | Stay on locked `xlsx@0.18.5` |

## Stack Patterns by Variant

**If work is Filter↔Analyze independence only:**
- Use delete/retire of push call sites + UI copy + test lock (`analyzerPush` absent)
- Because list store and process path already implement the product model

**If work is multi-city staging UX only:**
- Use `bridge-list-store` + lists panel polish (auto-save option, clearer multi-city queue, download/clear workflows)
- Because no new persistence layer is justified

**If work is accuracy on heterogeneous city files:**
- Use pure extensions to scorer / format memory / aliases / stable keys / tagger catalog
- Because v1.7–v1.8 already established the no-dep pattern that regression-locks cleanly

**If work is learning bar (Approve/Deny volume falls):**
- Use brain apply coverage + decision metrics + type-key reuse improvements + phrase quality
- Because success is “rules fire on next upload,” not model training

**If accuracy bar fails after measured fixtures (late milestone only):**
- Re-open fuzzy match package or admin-gated LLM assist for edge cities
- Because early adoption of ML would hide heuristic debt and break deterministic tests

## Integration notes (roadmap consumers)

### Independence

1. **Process:** `handleProcess` already comments and implements no push — verify no regression re-adds `pushRowsToAnalyzer`.
2. **Lists:** `POST/GET/DELETE /api/bridge/lists`, download, download-all, clear — treat as the Filter product sink.
3. **Push module:** `lib/bridge-analyzer-push.js` + `tests/bridge-analyzer-push.test.js` — candidates for deprecation once no production require remains (grep-clean).
4. **Attach:** Form Forge attach stays; rename UI strings if operators confuse “attach” with Analyze.
5. **Import index:** Document as optional de-dupe against Analyze session addresses — not a data handoff.

### Accuracy / efficiency

1. Prefer **fixture-driven** pure functions (city sheets as test fixtures) over new deps.
2. Format memory + Type scorer are the cross-city reuse stack; brain is the tag-quality stack — do not merge stores.
3. Runtime efficiency: avoid full re-parse; work on already-normalized rows; keep brain apply O(rules × rows) with existing caps (500 type / 500 phrase / 2000 events).

### Learning bar

1. Type rules: live on decision (immediate global effect) — primary lever for fewer Train actions.
2. Phrase rules: proposed-only until admin activates — secondary lever; improve mining quality, not auto-live.
3. Metrics today: `totalDecisions`, active suppress/promote counts — extend for **rate** metrics (decisions per upload, % groups with prior rule hit) without new infra.
4. Do not ship unsupervised auto-suppress; learning must remain auditable and undoable.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node 20+ | All `lib/bridge-*` CJS | No ESM migration planned |
| `xlsx@0.18.5` | `bridge-export`, list download, spreadsheet parser | Locked; do not bump mid-milestone without export fixture re-run |
| `mammoth@1.12.0` / `pdf-parse@2.4.5` / `tesseract.js@7.0.0` | Engine parsers only | Unrelated to independence; leave alone unless parse accuracy phase needs it |
| File stores under `FILTER_LISTS_ROOT` / `BRIDGE_BRAIN_ROOT` / `BRIDGE_CITY_FORMATS_ROOT` | Railway `PDA_DATA_ROOT` nesting | Config already volume-safe; never wipe in agent ops |

## Confidence by area

| Area | Confidence | Notes |
|------|------------|-------|
| Zero new deps for independence | HIGH | Process no-push verified in `bridge-api.js`; list store complete; push module orphaned from process |
| Zero new deps for multi-list | HIGH | Full CRUD + download-all in `bridge-list-store.js` + UI panel |
| Zero new deps for accuracy | HIGH | v1.7–v1.8 pure-JS pattern shipped; heterogeneous files are heuristic domain |
| Zero new deps for learning bar | HIGH | Brain HITL stack shipped v1.6; metrics extension is pure reduce |
| When to reconsider fuzzy/ML libs | MEDIUM | Needs measured multi-city failure set — not assumed |

## Sources

- `package.json` / `package-lock.json` — locked deps: `xlsx@0.18.5`, `mammoth@1.12.0`, `pdf-parse@2.4.5`, `tesseract.js@7.0.0` (HIGH)
- `lib/bridge-api.js` — process path: no auto-push; lists + brain + Form Forge attach routes (HIGH)
- `lib/bridge-list-store.js` — multi-list file store API surface (HIGH)
- `lib/bridge-analyzer-push.js` — push implementation still present but not process-wired (HIGH)
- `lib/bridge-brain-store.js`, `bridge-brain-apply.js`, `bridge-brain-decisions.js`, `bridge-phrase-miner.js` — HITL learning stack (HIGH)
- `lib/config.js` — volume roots for lists/brain/formats (HIGH)
- `.planning/PROJECT.md`, `.planning/STATE.md` — v2.0 milestone intent, no-push product lock (HIGH)
- `.planning/codebase/STACK.md` — shell stack inventory 2026-07-09 (HIGH)
- `.planning/research/STACK.md` (v1.8 prior) — zero-dep Type column pattern (HIGH)
- Docs: `docs/bridge/API.md`, `DATA-STANDARDS.md` — “no automatic push to Analyze” already documented (HIGH)
- Design: `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` D6–D8 HITL + stack locks (HIGH)

---
*Stack research for: Distress OS Filter Independence & Learning (v2.0)*  
*Researched: 2026-07-10*
