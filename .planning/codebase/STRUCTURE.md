# Codebase Structure

**Analysis Date:** 2026-07-09

## Directory Layout

```
distress-os/
├── server.js                 # Shell HTTP entry (routes, static, proxy, bridge)
├── package.json              # Root Node deps (xlsx, pdf-parse, mammoth, tesseract)
├── api/
│   └── server.js             # Serverless/platform entry adapter
├── lib/                      # In-process shell + Filter/Bridge logic
│   ├── bridge-api.js         # /api/bridge/* route table
│   ├── bridge-engine/        # processUpload pipeline + parsers
│   ├── bridge-*.js           # Tagger, list store, dedup, export, push, schema
│   ├── analyzer-*.js         # Import index, auth, proxy, process, embed
│   ├── forge-*.js            # Forge client, proxy, process
│   └── config.js / runtime.js
├── public/                   # Shell static UI (HTML/CSS/JS)
│   ├── bridge.html           # Filter page
│   ├── collect.html          # Collect hub
│   ├── heat.html / command.html / vault.html / index.html
│   ├── js/                   # Client scripts (bridge.js, shell, auth, home)
│   ├── css/                  # Design tokens + page styles
│   ├── images/ / videos/ / data/
├── data/
│   └── filter-lists/         # Default saved Filter lists (per-user dirs)
├── modules/
│   ├── form-forge/           # Collect product (Python Flask)
│   └── property-analyzer/    # Analyze product (Node)
├── tests/                    # Root Node test suite (bridge-heavy)
├── scripts/                  # Server lifecycle, verify, ops utilities
├── docs/
│   ├── bridge/               # Filter/Bridge API + data standards
│   └── gsd/                  # Planning milestones/plans
├── AGENTS.md                 # Agent rules (server must stay live)
└── README.md
```

## Directory Purposes

**`lib/`:**
- Purpose: All in-process Node logic for Distress OS shell and Filter
- Contains: `*.js` modules (CommonJS `require`/`module.exports`)
- Key files:
  - `lib/bridge-api.js` — Bridge HTTP handlers
  - `lib/bridge-engine/index.js` — `processUpload`
  - `lib/bridge-distress-tagger.js` — Strong vs standard distress tags
  - `lib/bridge-list-store.js` — Saved list filesystem repository
  - `lib/bridge-analyzer-push.js` — Optional Filter→Analyze adapter
  - `lib/analyzer-import-index.js` — Analyze address set for already-imported
  - `lib/config.js` — Paths, ports, route map
- Subdirectories: `lib/bridge-engine/parsers/` (spreadsheet, pdf, docx, text, image-ocr, row-extract)

**`public/`:**
- Purpose: Browser-facing shell and marketing UI (no bundler)
- Contains: HTML pages, page CSS, client JS, media
- Key files:
  - `public/bridge.html` + `public/js/bridge.js` + `public/css/bridge.css` — Filter
  - `public/collect.html` + `public/js/collect-records.js` — Collect hub
  - `public/js/shell-nav.js`, `shell.js`, `auth-*.js` — chrome + session
- Subdirectories: `public/js/coverage/` (coverage map dock/modals), `public/css/coverage/`

**`modules/form-forge/`:**
- Purpose: Collect — FOIA forms, city tracker, coverage, email
- Contains: Python app (`review_portal/`), forms PDFs, city data, scripts
- Key files: `run_review_portal.py`, `review_portal/app.py`, `review_portal/bridge_dataset.py`
- Subdirectories: `data/`, `forms/`, `scripts/`, `tests/`, `docs/gsd/`

**`modules/property-analyzer/`:**
- Purpose: Analyze — import, scan, tier, review, export
- Contains: Node server, lib, routes, public UI, session/users data
- Key files:
  - `server.js` — Analyzer HTTP entry
  - `lib/bridge-import-records.js` — Session append for bridge-shaped records
  - `lib/learned-brain.js` — Per-session training corrections
  - `routes/bridge.js` — `POST /api/bridge-import-records`
- Subdirectories: `lib/`, `routes/`, `public/`, `users/`, `tests/`, `property_imagery/`

**`data/filter-lists/`:**
- Purpose: Local default root for Filter saved lists (when no `PDA_DATA_ROOT` / `FILTER_LISTS_ROOT`)
- Contains: Per-scope folders (`alice/`, `bob/`, …) with `index.json` and list dirs
- Key files: `{scope}/index.json`, `{scope}/{listId}/meta.json`, `rows.json`

**`tests/`:**
- Purpose: Root-level Node test suite (`node --test`)
- Contains: `*.test.js`, `fixtures/bridge/*`
- Key files: `bridge-engine.test.js`, `bridge-api*.test.js`, `bridge-list-store.test.js`, `bridge-distress-tagger.test.js`

**`scripts/`:**
- Purpose: Ops — headless server start/stop/verify, migrations, audits
- Contains: PowerShell (`restart.ps1`, `verify-live.ps1`, `ensure-server.ps1`), Node/Python one-offs
- Key files: `scripts/verify-live.ps1`, `scripts/restart.ps1` (required after site edits per `AGENTS.md`)

**`docs/bridge/`:**
- Purpose: Filter/Bridge contracts and rules
- Contains: `API.md`, `DATA-STANDARDS.md`, `TAGGING-RULES.md`, `TEST-PLAN.md`, `GSD-AUDIT.md`

**`docs/gsd/`:**
- Purpose: Product planning artifacts (milestones, phase plans)
- Contains: Markdown plans under `milestones/`, `plans/`

## Key File Locations

**Entry Points:**
- `server.js` — Main Distress OS server
- `api/server.js` — Platform/serverless adapter
- `modules/form-forge/run_review_portal.py` — Collect child
- `modules/property-analyzer/server.js` — Analyze child
- `launch-distressos.bat` — Windows launcher

**Configuration:**
- `lib/config.js` — Ports, `PUBLIC`, module paths, `DISTRESS_ROUTES`, `FILTER_LISTS_ROOT`, `ANALYZER_DATA_ROOT`
- `lib/runtime.js` — Vercel/embedded analyzer/remote Forge flags
- `package.json` — Root scripts and deps
- `modules/form-forge/requirements.txt` — Python deps
- `modules/property-analyzer/package.json` — Analyzer deps
- `railway.toml`, `vercel.json`, `Dockerfile` — Deploy targets
- Env files may exist — **do not commit secrets**; note existence only

**Filter / Bridge core:**
- `lib/bridge-api.js` — Routes
- `lib/bridge-engine/index.js` — `processUpload`
- `lib/bridge-engine/normalizer.js` — Column map + tag + normalize
- `lib/bridge-engine/import-filter.js` — Already-imported filter
- `lib/bridge-engine/validator.js` — Row keep/discard
- `lib/bridge-engine/parsers/*` — File type parsers
- `lib/bridge-distress-tagger.js` — Distress signal tagging
- `lib/bridge-intake-schema.js` — Columns, aliases, discard reasons
- `lib/bridge-dedup.js` — Within-file near-duplicates
- `lib/bridge-list-store.js` — List persistence
- `lib/bridge-export.js` — CSV/XLSX builders
- `lib/bridge-analyzer-push.js` — Optional Analyze push
- `lib/analyzer-import-index.js` — Address index from Analyze session
- `lib/multipart.js` — Multipart form parse for process upload
- `public/js/bridge.js` — Filter UI controller

**Filter → Analyze integration:**
- `lib/analyzer-import-index.js` (read Analyze → Filter)
- `lib/bridge-analyzer-push.js` (write Filter → Analyze, not on process path)
- `modules/property-analyzer/routes/bridge.js`
- `modules/property-analyzer/lib/bridge-import-records.js`
- `modules/property-analyzer/lib/import-address-index.js` (analyzer-side index API)

**Collect integration:**
- `lib/forge-client.js`, `lib/forge-proxy.js`, `lib/forge-process.js`
- Form Forge portal APIs used by Bridge for cities + attach

**Shell UI pages (routes in `lib/config.js` `DISTRESS_ROUTES`):**
- `/` → `public/index.html`
- `/heat` → `public/heat.html`
- `/command` → `public/command.html`
- `/bridge` → `public/bridge.html` (Filter)
- `/collect` → `public/collect.html`
- `/vault` → `public/vault.html`

**Testing:**
- `tests/*.test.js` — Shell + Bridge
- `tests/fixtures/bridge/` — Sample city list files
- `modules/form-forge/tests/` — Python Collect tests
- `modules/property-analyzer/tests/` — Analyze tests

**Documentation:**
- `README.md` — Product overview and local start
- `AGENTS.md` / `Agents.md` — Agent server-live rules
- `docs/bridge/API.md` — Bridge endpoint contract
- `docs/bridge/DATA-STANDARDS.md` — Pipeline semantics (no auto-push)
- `docs/bridge/TAGGING-RULES.md` — Distress tag rules

## Naming Conventions

**Files:**
- kebab-case.js: Shell and Bridge modules — e.g. `bridge-list-store.js`, `analyzer-import-index.js`
- kebab-case.test.js: Root tests matching feature — e.g. `bridge-engine.test.js`
- kebab-case.css / .html: Public assets — e.g. `bridge.css`, `bridge.html`
- snake_case.py: Form Forge Python modules — e.g. `bridge_dataset.py`
- UPPERCASE.md: Project-level docs — `README.md`, `AGENTS.md`

**Directories:**
- kebab-case: `bridge-engine/`, `filter-lists/`, `property-analyzer/`
- Feature folders under public: `js/coverage/`, `css/coverage/`

**Special Patterns:**
- `lib/bridge-*.js` — All Filter-domain modules at lib root
- `lib/bridge-engine/` — Only the multi-step process pipeline + parsers
- `public/js/bridge.js` — Single-page Filter controller (not split modules)
- List IDs: `lst_{timestamp}_{hex}` from `bridge-list-store.js`
- User scope dirs: storage key folders under `data/filter-lists/` and analyzer `users/`

## Where to Add New Code

**New Filter process stage (e.g. new discard rule):**
- Pipeline orchestration: `lib/bridge-engine/index.js` (`processUpload`)
- Stage implementation: new file under `lib/bridge-engine/` or extend `import-filter.js` / tagger
- Discard reason constant: `lib/bridge-intake-schema.js` `DISCARD_REASONS`
- Tests: `tests/bridge-engine.test.js` or dedicated `tests/bridge-*.test.js`
- Docs: `docs/bridge/DATA-STANDARDS.md`

**New distress indicator / tagging rule:**
- Implementation: `lib/bridge-distress-tagger.js` `INDICATOR_CATEGORIES`
- Tests: `tests/bridge-distress-tagger.test.js`
- Rules doc: `docs/bridge/TAGGING-RULES.md`
- **Global training brain:** prefer loading external rules here (or via thin `lib/training-brain.js` imported by tagger) rather than scattering regex

**New Bridge API route:**
- Handler + route match: `lib/bridge-api.js` `handle()`
- Wire-up already covered by `server.js` prefix `/api/bridge`
- Tests: `tests/bridge-api.test.js`, `tests/bridge-api-handlers.test.js`
- Contract: `docs/bridge/API.md`

**New Filter list feature (save/export/meta):**
- Storage: `lib/bridge-list-store.js`
- API: `lib/bridge-api.js` list handlers
- UI: `public/js/bridge.js` + `public/bridge.html` / `public/css/bridge.css`
- Tests: `tests/bridge-list-store.test.js`

**Filter → Analyze auto-push (if re-enabled):**
- Call site: `lib/bridge-api.js` after successful process or list action
- Adapter: `lib/bridge-analyzer-push.js` (already implements push + disk fallback)
- Analyzer endpoint: `modules/property-analyzer/routes/bridge.js` + `lib/bridge-import-records.js`
- Do **not** reintroduce push without updating `docs/bridge/DATA-STANDARDS.md` product rules

**New shell page:**
- HTML: `public/{name}.html`
- CSS: `public/css/{name}.css`
- JS: `public/js/{name}.js`
- Route: add to `lib/config.js` `DISTRESS_ROUTES`
- Nav: `public/js/shell-nav.js` (and related shell chrome)

**New Collect (Form Forge) feature:**
- Implementation: `modules/form-forge/review_portal/`
- Tests: `modules/form-forge/tests/`
- Bridge city/attach contracts: coordinate with `lib/bridge-api.js` + `lib/forge-client.js`

**New Analyze feature:**
- Implementation: `modules/property-analyzer/lib/` and/or `routes/`
- UI: `modules/property-analyzer/public/`
- Tests: `modules/property-analyzer/tests/`
- Training brain: `lib/learned-brain.js`, `lib/learned-rules.js`, `lib/review-training.js`

**Shared utilities (shell-level):**
- Prefer `lib/` with kebab-case name
- User/session scope: extend `lib/phuglee-user.js` or analyzer `user-session.js` carefully (shared import)

**Global training brain (recommended placement):**
- Shared rules store: new `lib/training-brain.js` (or `modules/shared/training-brain/`)
- Readers: `lib/bridge-distress-tagger.js`, analyzer classify/tier modules
- Writers: analyzer review-training promote path only
- Tests: root `tests/` for Filter consumers; analyzer `tests/` for classify consumers

## Special Directories

**`data/filter-lists/`:**
- Purpose: Durable Filter list staging
- Source: Written at runtime by `bridge-list-store.js`
- Committed: Sample/dev scopes may exist; production uses volume via `FILTER_LISTS_ROOT` / `PDA_DATA_ROOT`

**`modules/property-analyzer/users/`:**
- Purpose: Per-user Analyzer sessions
- Source: Runtime session saves
- Committed: May include local dev sessions — treat as data

**`modules/property-analyzer/property_imagery/`:**
- Purpose: Cached street/satellite imagery
- Source: Runtime fetch/cache
- Committed: Large binary cache present in repo

**`modules/form-forge/data/`:**
- Purpose: City registry, form layouts, submission logs, backups
- Source: Collect product runtime + seeds
- Committed: Yes (product data)

**`node_modules/` (root and analyzer):**
- Purpose: Installed dependencies
- Generated: Yes (`npm install`)
- Committed: No (root); analyzer may vendor depending on project practice — prefer install

**`.planning/codebase/`:**
- Purpose: GSD codebase maps (this file, ARCHITECTURE.md, etc.)
- Source: `/gsd:map-codebase` workers
- Committed: Yes when planning is tracked

**`scripts/_audit*.png` / `_pipeline*.png`:**
- Purpose: Visual audit screenshots from agent sessions
- Generated: Yes
- Committed: Often present; not runtime-critical

---

### Filter pipeline file map (quick)

| Stage | File |
|-------|------|
| UI upload | `public/js/bridge.js` |
| HTTP process | `lib/bridge-api.js` → `handleProcess` |
| Orchestrate | `lib/bridge-engine/index.js` → `processUpload` |
| Parse | `lib/bridge-engine/parsers/*` |
| Normalize + tag | `lib/bridge-engine/normalizer.js` + `lib/bridge-distress-tagger.js` |
| Dedupe | `lib/bridge-dedup.js` |
| Already imported | `lib/analyzer-import-index.js` + `lib/bridge-engine/import-filter.js` |
| Distress keep | `lib/bridge-distress-tagger.js` → `filterDistressOnly` |
| Save lists | `lib/bridge-list-store.js` via `POST /api/bridge/lists` |
| Attach Collect | `lib/bridge-api.js` → `handleAttach` → Forge |
| Optional Analyze push | `lib/bridge-analyzer-push.js` (not on process path) |

---

*Structure analysis: 2026-07-09*
*Update when directory structure changes*
