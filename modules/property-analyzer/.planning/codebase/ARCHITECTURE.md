# Architecture

**Analysis Date:** 2026-07-04

## Pattern Overview

**Overall:** Local-first monolith — Node.js HTTP proxy server + vanilla browser SPA with shared domain libraries

**Key Characteristics:**
- Single-process Node server (`server.js`) serves static assets, proxies Google Maps/Gemini APIs, and persists session data to disk
- Browser app is framework-free IIFE modules mounted on a global `PDA.env` runtime object
- Core business logic (tiering, imagery routing, export schema, JSON parsing) lives in `lib/` using a UMD dual-runtime pattern (CommonJS for Node tests, `PDA.lib.*` for browser)
- Classification pipeline runs client-side during scan; server handles imagery fetch/cache, AI proxy, and durable session backup
- No database — canonical state is JSON files on disk plus browser localStorage/IndexedDB

## Layers

**Server Entry & Composition:**
- Purpose: Boot HTTP server, wire dependencies, enforce auth on POST `/api/*`
- Location: `server.js`
- Contains: Auth token management, API stats, route registration, safety tick scheduling
- Depends on: `lib/config.js`, `lib/router.js`, `lib/backups.js`, `lib/safety.js`, `routes/*`, `imagery-cache.js`
- Used by: `npm start`, `launch-analyzer.bat`, `start-server.bat`

**HTTP Routing:**
- Purpose: Map URL paths to handlers; thin delegation layer
- Location: `routes/static.js`, `routes/session.js`, `routes/maps.js`, `routes/imagery.js`, `routes/gemini.js`
- Contains: Static file serving, session CRUD, Maps proxy, imagery cache endpoints, Gemini vision proxy
- Depends on: `lib/router.js`, `lib/http.js`, `lib/backups.js`, `imagery-cache.js`
- Used by: `server.js` via `createRouter()` dispatch

**Shared Domain Logic:**
- Purpose: Pure/deterministic rules reusable in browser and Node tests
- Location: `lib/`
- Contains: Tier engine, imagery routing, Gemini JSON repair, export schema, backup logic, classification metrics, learned brain caps
- Depends on: Other `lib/` modules (e.g. `imagery-routing.js` → `tier-engine.js`)
- Used by: Browser via `/lib/*` allowlist in `routes/static.js`; tests via `require()`

**Client Runtime (PDA.env):**
- Purpose: UI orchestration, scan workers, review flow, rendering, session sync
- Location: `public/js/`
- Contains: `config.js` (constants/prompts), `state.js` (API helpers), `app.js` (scan pipeline), `scan.js`, `review.js`, `render.js`, `session.js`, `imagery.js`
- Depends on: `PDA.lib.*` from `lib/`, `DistressPersistence` from `persistence.js`, SheetJS CDN
- Used by: `public/index.html` script load order

**Persistence & Safety:**
- Purpose: Durable session storage, incremental scan logs, auto/milestone backups, offsite mirror
- Location: `persistence.js` (client), `lib/backups.js`, `lib/safety.js`, `lib/fs-atomic.js`, `lib/backup-logic.js`
- Contains: Debounced saves, version history, scan-result JSONL append, promote-to-LATEST, rolling snapshots
- Depends on: `lib/config.js` paths, `lib/learned-brain.js`, `lib/tier-counts.js`
- Used by: Client `session.js`; server `routes/session.js`, startup promote in `server.js`

**Imagery Cache:**
- Purpose: Fetch Google imagery once, serve permanently from disk (optional R2 mirror)
- Location: `imagery-cache.js`, `routes/maps.js`, `routes/imagery.js`
- Contains: Address-hash index, local files under `property_imagery/`, cache-one API, cached-imagery serving
- Depends on: `lib/fs-atomic.js`, optional `@aws-sdk/client-s3`
- Used by: Maps routes during fetch; client via `/api/cached-imagery/*` URLs

## Data Flow

**Scan Pipeline (per address):**

1. `processOneRecord()` in `public/js/app.js` claims a record from `state.records`
2. `processAddress()` fetches street view via `fetchStreetViewImagery()` → `GET /api/sv-base64` or `/api/property-imagery` (`routes/maps.js`)
3. Maps route checks `imagery-cache.js` first; on miss, calls Google APIs and caches to `property_imagery/`
4. `finalizeStreetAnalysis()` sends image to `analyzeWithGemini()` → `POST /api/gemini-vision` (`routes/gemini.js`) with model fallback chain
5. `parseGeminiResponse()` in `public/js/app.js` uses `lib/gemini-json.js` to extract structured fields
6. If `streetAnalysisNeedsSatellite()` (`lib/imagery-routing.js`) is true, fetches satellite and runs `classifyWithSatellite()`, then `reconcileSatelliteWithStreetView()`
7. Otherwise `finalizePropertyDistress()` applies `computeLeadTier()` from `lib/tier-engine.js`
8. `attachTierRationale()` + `applyLearnedTierRules()` enrich result; pushed to `state.results`
9. `DistressPersistence.scheduleSave()` debounces client save; `POST /api/scan-result` appends incremental JSONL in `scan_results/`
10. `lib/backups.js` promotes incremental results into `distressAnalyzerSession_LATEST.json` when batch thresholds met

**Review & Learning Loop:**

1. User opens review mode via `public/js/review.js` — queue built from tier filters and `needsReview` flags
2. Affirmation/correction actions call `captureCorrectionEvent()` / `captureAffirmationEvent()` in `public/js/scan.js`
3. Events append to session brain fields: `learnedRules`, `tierCorrections`, `scoreCorrections`, `categoryCorrections`, `correctionEvents` (capped by `lib/learned-brain.js`)
4. Approved learned rules inject into Gemini prompts via `buildAnalysisPrompt()` in `public/js/config.js`
5. Milestone saves trigger `lib/backups.js` milestone snapshots and `lib/safety.js` offsite copy

**Session Load (startup):**

1. Browser fetches `GET /api/session-summary?lite=1` for fast counts/metadata (`routes/session.js`)
2. Full results loaded via `GET /api/session-results` paginated or from localStorage/IndexedDB via `DistressPersistence`
3. Server merges `scan_results/*.jsonl` incremental log into canonical session before serving (`lib/backups.js`)

**Export:**

1. User triggers export from sidebar → `public/js/session.js` / `public/js/render.js`
2. `lib/export-schema.js` maps records to dial-ready columns; `lib/export-profiles.js` selects profile
3. SheetJS (`xlsx.full.min.js` CDN) generates Excel/CSV client-side — no server export endpoint

**State Management:**
- In-memory: `state` object on `PDA.env` — `results`, `records`, `processed`, review flags, filter state (`public/js/state.js`, mutated across modules)
- Browser durable: `localStorage` key `distressAnalyzerSession`, IndexedDB store, debounced by `persistence.js`
- Server canonical: `distressAnalyzerSession_LATEST.json` at project root; incremental `scan_results/scan_results_YYYY-MM-DD.jsonl`
- Imagery durable: `property_imagery/index.json` + hashed files per address/type

## Key Abstractions

**PDA.env Module Pattern:**
- Purpose: Share one runtime namespace across client IIFE modules without bundler
- Examples: `public/js/app.js`, `public/js/config.js`, `public/js/state.js`, `public/js/scan.js`
- Pattern: `(function(global) { const R = PDA.env; with(R) { R.fn = function(){} } })(global)` — all functions attach to `R`

**UMD Shared Library:**
- Purpose: Same logic in browser and Node test runner
- Examples: `lib/tier-engine.js`, `lib/gemini-json.js`, `lib/imagery-routing.js`, `lib/export-schema.js`, `lib/review-training.js`
- Pattern: `module.exports = factory()` when `require` exists; else `PDA.lib.name = factory()`

**Tier Engine:**
- Purpose: Deterministic lead bucket from AI score, category, indicators, satellite fusion
- Examples: `lib/tier-engine.js`, mirrored in `public/js/review.js` for client-side re-tier
- Pattern: `computeLeadTier(score, category, { indicators, satelliteClassification, reason })` → `distressed` | `well_maintained` | `vacant` | `unavailable` | `blurred`

**Record Key:**
- Purpose: Stable identity for merge/review across session reloads
- Examples: `lib/backup-logic.js` (`recordKeyFromResult`), used in `lib/backups.js`, `public/js/scan.js`
- Pattern: Hash of normalized address + optional disambiguators

**Router Context (ctx):**
- Purpose: Dependency injection for route modules
- Examples: `routes/session.js`, `routes/gemini.js` — each exports `register(ctx)`
- Pattern: `server.js` builds `ctx` object with `router`, `sendJson`, `backups`, `config`, etc.

**Learned Brain:**
- Purpose: Bounded correction/training payload embedded in session JSON
- Examples: `lib/learned-brain.js`, `lib/learned-rules.js`, brain UI in `public/js/config.js`
- Pattern: `buildLearnedBrainPayload()` caps arrays; merged on session load

## Entry Points

**Node Server:**
- Location: `server.js`
- Triggers: `npm start`, `node server.js`, `launch-analyzer.bat`
- Responsibilities: Listen on `127.0.0.1:3456`, serve UI, proxy APIs, run safety ticks, startup session promote

**Browser SPA:**
- Location: `public/index.html`
- Triggers: User opens `http://localhost:3456`
- Responsibilities: Load CSS/JS chain, inject auth token via `routes/static.js`, bootstrap `PDA.env` modules

**Client Scan Orchestrator:**
- Location: `public/js/app.js` — `startScan()`, `processOneRecord()`, `processAddress()`
- Triggers: User uploads spreadsheet and clicks scan
- Responsibilities: Concurrent worker pool, rate limiting, per-address imagery+AI pipeline, result assembly

**Session API:**
- Location: `routes/session.js`
- Triggers: Client `apiFetch()` calls, persistence proxy mode
- Responsibilities: Summary, paginated results, backup upload/download, scan-result append, safety status

**Classification Test Harness:**
- Location: `tests/golden-set.test.js`, `scripts/run-golden-set.js`, `tests/classification-metrics.test.js`
- Triggers: `npm run test:golden`, `npm run test:metrics`
- Responsibilities: Replay fixtures against `lib/tier-engine.js` and metrics without browser

## Error Handling

**Strategy:** Fail gracefully per-address during scan; fail closed on auth; log server faults to `logs/server.log`

**Patterns:**
- Scan retries: `processOneRecord()` retries up to 5 times with `waitForRateLimit()` (`public/js/app.js`)
- Gemini fallback: Model chain `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-1.5-flash` in `routes/gemini.js`; JSON salvage via `lib/gemini-json.js`
- Street AI failure: `salvagePartialJson()` + `buildImageryConfirmedFallback()` returns degraded tier instead of crashing scan (`public/js/app.js`)
- Server handler catch-all: `server.js` wraps dispatch in try/catch → `sendJson(res, 500, { error })`
- Imagery miss: Maps routes return `{ ok: false, error, hint }`; client shows `showFatalError()` for API config issues
- Auth: `requireAuth()` on all `POST /api/*` — 401 if `X-PDA-Token` or Bearer mismatch

## Cross-Cutting Concerns

**Logging:** `console.log/warn/error` on server; client `log()` helper in `PDA.env`; dedicated files `logs/server.log`, `logs/imagery-cache.log`, `gemini_audit/*.jsonl`

**Validation:** No schema framework — manual JSON parse with try/catch in routes; `lib/gemini-json.js` repairs malformed AI output; tier normalization in `lib/tier-engine.js`

**Authentication:** Auto-generated or env-provided `PDA_AUTH_TOKEN`; injected into HTML as `window.__PDA_AUTH_TOKEN__` by `routes/static.js`; client sends via `apiFetch()` header `X-PDA-Token`

**Concurrency:** Maps queue max 12 (`routes/maps.js`); Gemini queue max 8 (`routes/gemini.js`); client scan workers capped by `DEFAULT_CONCURRENT_LIMIT` in `public/js/config.js`

**Backup Safety:** `lib/safety.js` auto-tick promotes incremental scans, rolling snapshots, optional OneDrive offsite mirror; `lib/fs-atomic.js` for crash-safe writes

---

*Architecture analysis: 2026-07-04*