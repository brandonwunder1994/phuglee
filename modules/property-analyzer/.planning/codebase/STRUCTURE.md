# Codebase Structure

**Analysis Date:** 2026-07-04

## Directory Layout

```
property-distress-analyzer/
├── server.js                 # Node HTTP entry — routes, auth, safety ticks
├── persistence.js            # Client auto-save / version history (served at /persistence.js)
├── imagery-cache.js          # Permanent imagery disk cache + optional R2
├── package.json              # Scripts, tailwind devDep, optional AWS SDK
├── .env                      # API keys and config (not committed; loaded by lib/config.js)
├── distressAnalyzerSession_LATEST.json   # Canonical session snapshot (root)
├── launch-analyzer.bat       # Primary Windows launcher (starts server + opens browser)
├── start-server.bat          # Server-only launcher
├── ensure-server.ps1         # Health-check / restart helper
├── tailwind.config.js        # Tailwind build config
├── lib/                      # Shared domain logic (Node + browser UMD)
├── routes/                   # HTTP route handlers (register(ctx) pattern)
├── public/                   # Browser SPA — HTML, CSS, client JS
│   ├── index.html            # Single-page app shell + script load order
│   ├── css/                  # Tailwind output + cyber theme layers
│   ├── js/                   # PDA.env client modules
│   └── fonts/                # Stateface icon font
├── tests/                    # Node built-in test runner (*.test.js)
│   └── fixtures/             # JSON golden cases and tier fixtures
├── scripts/                  # One-off maintenance, metrics, migration tools
├── docs/gsd/                 # GSD milestone documentation
├── .planning/                # GSD planning artifacts and codebase maps
├── property_imagery/         # Cached streetview/satellite images + index.json
├── scan_results/             # Incremental scan JSONL logs (scan_results_YYYY-MM-DD.jsonl)
├── backups/                  # auto/, milestones/, manual/, archive/ session copies
├── gemini_audit/             # Gemini request/response audit JSONL
├── logs/                     # server.log, server.pid, pda-auth.token, imagery-cache.log
└── scan_results/             # Server-side incremental result stream
```

## Directory Purposes

**`lib/`:**
- Purpose: Shared, testable domain logic consumed by browser (via allowlist) and Node tests
- Contains: `*.js` UMD modules — tier engine, export, backup logic, metrics, JSON repair
- Key files: `tier-engine.js`, `imagery-routing.js`, `gemini-json.js`, `backups.js`, `export-schema.js`, `learned-brain.js`, `config.js`

**`routes/`:**
- Purpose: HTTP endpoint handlers; no business logic duplication — delegate to lib/imagery-cache
- Contains: One file per concern, each exports `register(ctx)`
- Key files: `static.js`, `session.js`, `maps.js`, `gemini.js`, `imagery.js`

**`public/js/`:**
- Purpose: Browser-only UI orchestration on `PDA.env` namespace
- Contains: IIFE modules loaded in fixed order from `index.html`
- Key files: `config.js` (prompts/constants), `state.js` (fetch/state), `app.js` (scan core), `scan.js` (review training), `review.js`, `render.js`, `session.js`, `imagery.js`

**`public/css/`:**
- Purpose: Styling — Tailwind build + layered cyber theme CSS
- Contains: `input.css` (Tailwind source), `tailwind.css` (built), `app.css`, `cyber-*.css`, `tokens.css`
- Key files: `input.css`, `tailwind.css`, `cyber-theme.css`, `app.css`

**`tests/`:**
- Purpose: Node `--test` suites for lib/ parity, backup logic, classification regression
- Contains: `*.test.js` co-located by domain; `fixtures/*.json` for golden cases
- Key files: `tier-engine.test.js`, `golden-set.test.js`, `backup-logic.test.js`, `export-schema.test.js`

**`scripts/`:**
- Purpose: CLI utilities — not part of runtime server
- Contains: Migration, metrics runners, gap analysis, CSS pruning
- Key files: `run-golden-set.js`, `run-classification-metrics.js`, `migrate-imagery.js`

**`property_imagery/`:**
- Purpose: Durable imagery cache keyed by address hash
- Contains: `index.json`, `streetview/`, `satellite/` subdirs with hashed filenames
- Key files: `index.json`

**`backups/`:**
- Purpose: Tiered session backup retention (ephemeral, milestone, manual)
- Contains: Timestamped `distressAnalyzerSession_*.json` copies
- Key files: Subdirs `auto/`, `milestones/`, `manual/`, `archive/`

**`.planning/`:**
- Purpose: GSD project planning, phase docs, codebase reference maps
- Contains: `PROJECT.md`, `ROADMAP.md`, `phases/`, `codebase/`, `research/`
- Key files: `codebase/ARCHITECTURE.md`, `codebase/STRUCTURE.md`

## Key File Locations

**Entry Points:**
- `server.js`: Node HTTP server — start with `npm start`
- `public/index.html`: Browser SPA shell and script/CSS load order
- `launch-analyzer.bat`: Windows one-click start

**Configuration:**
- `lib/config.js`: Port, paths, backup limits, env file loader
- `.env`: `MAPS_API_KEY`, `GEMINI_API_KEY`, `PDA_AUTH_TOKEN`, optional `R2_*` vars (existence only — never commit)
- `tailwind.config.js`: CSS build paths
- `public/js/config.js`: Client constants, Gemini prompts, batch sizes

**Core Logic:**
- `public/js/app.js`: Scan pipeline — `processAddress`, `finalizeStreetAnalysis`, Gemini parse
- `lib/tier-engine.js`: Lead tier computation rules
- `lib/imagery-routing.js`: When to fetch satellite fallback
- `lib/backups.js`: Session merge, promote, milestone saves
- `imagery-cache.js`: Imagery fetch-once-serve-forever cache

**API Surface:**
- `routes/session.js`: `/api/session-summary`, `/api/scan-result`, `/api/session-backup`
- `routes/maps.js`: `/api/sv-base64`, `/api/satellite-base64`, `/api/property-imagery`
- `routes/gemini.js`: `/api/gemini-vision`, `/api/gemini-audit/*`
- `routes/imagery.js`: `/api/cached-imagery/*`, `/api/imagery/cache-one`

**Testing:**
- `tests/*.test.js`: Unit/integration tests — run `npm test`
- `tests/fixtures/`: `golden-cases.json`, `tier-cases.json`, `classification-smoke.json`
- `scripts/run-golden-set.js`: CLI golden replay companion to `tests/golden-set.test.js`

## Naming Conventions

**Files:**
- Client modules: `public/js/{domain}.js` — lowercase single word (`app.js`, `scan.js`, `review.js`)
- Shared libs: `lib/{kebab-case}.js` — multi-word domains use hyphens (`tier-engine.js`, `gemini-json.js`, `export-schema.js`)
- Routes: `routes/{domain}.js` — matches API area (`maps.js`, `gemini.js`, `session.js`)
- Tests: `tests/{subject}.test.js` — mirrors lib or feature name (`tier-engine.test.js`, `review-queue.test.js`)
- Fixtures: `tests/fixtures/{descriptive-kebab}.json`
- Session files: `distressAnalyzerSession_{SUFFIX}.json` at project root or in `backups/`
- Scan logs: `scan_results/scan_results_{YYYY-MM-DD}.jsonl`

**Directories:**
- Lowercase, hyphenated for multi-word (`property_imagery`, `scan_results`)
- `backups/{tier}/` for backup class (`auto`, `milestones`, `manual`, `archive`)

**Functions (client):**
- Attach to `PDA.env` as `R.functionName` — camelCase (`processAddress`, `computeLeadTier`)
- DOM helpers: `$()` id lookup pattern in `public/js/state.js`

**Functions (lib):**
- Named exports via `module.exports` factory return object — camelCase (`computeLeadTier`, `streetAnalysisNeedsSatellite`)

**Constants:**
- SCREAMING_SNAKE in both `lib/config.js` and `public/js/config.js` (`SESSION_LATEST_FILE`, `BATCH_SIZE`)

## Where to Add New Code

**New API Endpoint:**
- Primary code: `routes/{area}.js` — add handler via `router.get()` or `router.post()` inside `register(ctx)`
- Wire-up: Ensure `server.js` calls `{module}.register(ctx)` (already done for existing route files)
- Auth: POST routes auto-require auth in `server.js`; GET routes are open unless you add explicit check
- Tests: `tests/{endpoint-name}.test.js` using `node --test`

**New Shared Business Rule (used in browser + tests):**
- Implementation: `lib/{feature-name}.js` using UMD pattern (copy structure from `lib/tier-engine.js`)
- Browser exposure: Add filename to `LIB_ALLOWLIST` in `routes/static.js`
- Script tag: Add to `public/index.html` before client modules that depend on it
- Tests: `tests/{feature-name}.test.js`

**New Client UI Feature:**
- Primary code: New `public/js/{feature}.js` IIFE module OR extend the closest existing module
- Registration: Add `<script src="/js/{feature}.js?v=...">` in `public/index.html` before `app.js` if needed early, after dependencies otherwise
- State: Mutate `state` on `PDA.env`; persist via `scheduleSaveSession()` / `DistressPersistence.scheduleSave()`
- Styles: Add rules to appropriate `public/css/cyber-*.css` or `app.css`; rebuild Tailwind if utility classes needed (`npm run css:build`)

**New Export Column or Profile:**
- Schema: `lib/export-schema.js` — add column mapping
- Profiles: `lib/export-profiles.js` — add profile selector
- Tests: `tests/export-schema.test.js`, `tests/export-profiles.test.js`

**New Classification Rule:**
- Tier logic: `lib/tier-engine.js`
- Satellite trigger: `lib/imagery-routing.js`
- Prompt text: `public/js/config.js` — `buildAnalysisPrompt()`, `buildSatellitePrompt()`
- Regression: Add case to `tests/fixtures/golden-cases.json`; run `npm run test:golden`

**New Review Action:**
- Queue logic: `public/js/review.js`
- Training capture: `public/js/scan.js` — correction/affirmation event helpers
- Tests: `tests/review-training-flow.test.js`, `tests/review-queue.test.js`

**Utilities:**
- Shared helpers (Node + browser): `lib/{name}.js`
- Server-only helpers: `lib/{name}.js` (omit from `LIB_ALLOWLIST` if browser must not load)
- One-off CLI: `scripts/{verb}-{noun}.js`
- Client-only helpers: inline in relevant `public/js/*.js` module

## Special Directories

**`property_imagery/`:**
- Purpose: Permanent imagery cache (streetview + satellite PNG/JPG)
- Generated: Yes — populated during scans via `imagery-cache.js`
- Committed: Typically no (large binary assets; local runtime data)

**`scan_results/`:**
- Purpose: Append-only incremental scan log for crash recovery
- Generated: Yes — one JSONL file per day
- Committed: No

**`backups/`:**
- Purpose: Session snapshot retention across auto/milestone/manual tiers
- Generated: Yes — written by `lib/backups.js` and `lib/safety.js`
- Committed: No

**`gemini_audit/`:**
- Purpose: Audit trail of Gemini API calls
- Generated: Yes — JSONL per day from `routes/gemini.js`
- Committed: No

**`logs/`:**
- Purpose: Server PID, auth token file, error logs
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: npm dependencies (tailwindcss, optional @aws-sdk/client-s3)
- Generated: Yes — `npm install`
- Committed: No

**`distressAnalyzerSession_*.json` (project root):**
- Purpose: Canonical and recovery session snapshots
- Generated: Yes — primary file `distressAnalyzerSession_LATEST.json`
- Committed: Sometimes (project may ship a LATEST snapshot for dev)

**`.planning/`:**
- Purpose: GSD planning and codebase reference documentation
- Generated: By GSD workflow agents
- Committed: Yes

---

*Structure analysis: 2026-07-04*