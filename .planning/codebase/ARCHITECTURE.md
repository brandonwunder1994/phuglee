# Architecture

**Analysis Date:** 2026-07-09

## Pattern Overview

**Overall:** Unified reverse-proxy shell over two child product modules, plus an in-process Filter/Bridge pipeline

**Key Characteristics:**
- Single Node HTTP server (`server.js`) routes static shell pages, Bridge APIs, and proxied module traffic
- Collect (Form Forge, Python) and Analyze (Property Analyzer, Node) run as separate processes; Distress OS starts and proxies them
- Filter (Data Bridge) runs **in-process** under `/api/bridge/*` — parse, tag, dedupe, import-filter, list store
- File-based state (no shared database): Filter lists on disk, Analyzer session JSON, Form Forge city registry
- User scope via `X-Phuglee-User` / `X-Phuglee-Plan` headers (session-scoped storage keys)

## Layers

**Shell / Gateway:**
- Purpose: HTTP entry, static marketing/shell pages, health, module boot, reverse proxy
- Location: `server.js`, `lib/config.js`, `lib/runtime.js`, `lib/module-proxy.js`, `lib/forge-proxy.js`, `lib/analyzer-proxy.js`, `lib/forge-process.js`, `lib/analyzer-process.js`, `lib/embedded-analyzer.js`
- Contains: Request router, static file serving (range for video), MIME/cache headers, child process lifecycle
- Depends on: `lib/config`, `lib/runtime`, Bridge API, Forge/Analyzer proxies
- Used by: Browser clients at `http://127.0.0.1:3000/`

**Shell UI (public):**
- Purpose: Product surface — Logo Page, Heat/Command hub, Collect hub, Filter (Bridge), Vault
- Location: `public/*.html`, `public/js/`, `public/css/`
- Contains: Vanilla HTML/CSS/JS; no SPA framework
- Depends on: `/api/*` and proxied `/forge/*`, `/analyzer/*`
- Used by: End users after auth guard

**Filter / Bridge API:**
- Purpose: Process city response lists, tag distress signals, stage saved lists, attach versions to city profiles
- Location: `lib/bridge-api.js` (routes), `lib/bridge-engine/` (pipeline), `lib/bridge-list-store.js`, `lib/bridge-distress-tagger.js`, related schema/export modules
- Contains: Multipart upload handling, process pipeline orchestration, list CRUD, Forge attach proxy
- Depends on: Intake schema, parsers, tagger, dedup, import index, list store, Forge client, phuglee user scope
- Used by: `public/js/bridge.js` via `/api/bridge/*`

**Collect module (Form Forge):**
- Purpose: FOIA/public-records form fill, city tracker, coverage, email workflows
- Location: `modules/form-forge/` (Python Flask under `review_portal/`)
- Contains: City registry, request tracking, PDF fill, bridge dataset attach endpoints
- Depends on: Local data under `modules/form-forge/data/`
- Used by: Shell proxy at `/forge/*`; Bridge city lists and attach via Forge HTTP APIs

**Analyze module (Property Analyzer):**
- Purpose: Import lead lists, AI/vision distress scan, tier review, export
- Location: `modules/property-analyzer/`
- Contains: Session persistence, classification/tier engine, learned brain, bridge-import endpoint, imagery
- Depends on: Session JSON under analyzer data root; optional Gemini/Maps keys
- Used by: Shell proxy at `/analyzer/*`; Filter import-address index (and optional push) via analyzer HTTP

**Shared / platform libs:**
- Purpose: Multipart parse, auth token for analyzer, rewrite helpers, static cache policy
- Location: `lib/multipart.js`, `lib/analyzer-auth.js`, `lib/phuglee-user.js`, `lib/static-cache.js`, `lib/rewrite.js`, `lib/forge-client.js`
- Depends on: Config and (for user scope) analyzer `user-session` helpers
- Used by: Shell and Bridge layers

## Product Pipeline: Collect → Filter → Analyze

```
┌─────────────┐     city response files      ┌─────────────┐     download CSV/XLSX      ┌─────────────┐
│   Collect   │  (clerk portals / email)     │   Filter    │  (skip-trace / enrich)    │   Analyze   │
│ Form Forge  │ ──────────────────────────►  │ Data Bridge │ ─────────────────────────►│  Property   │
│  /collect   │                              │   /bridge   │     manual import          │  Analyzer   │
│  /forge/*   │◄── attach version + KPI ─────│ /api/bridge │◄── address index ─────────│ /analyzer/* │
└─────────────┘                              └─────────────┘                            └─────────────┘
```

| Stage | Page | Role |
|-------|------|------|
| Collect | `public/collect.html`, Forge UI | Request lists from cities; track submissions |
| Filter | `public/bridge.html` | Kill non-deals: generic violations, dups, already-in-Analyze |
| Analyze | `/analyzer/` | Scan, tier, review, export dial-ready leads |

**Important boundary:** Filter **does not auto-push** kept rows into Analyze. Process stages results in the UI; user saves lists and downloads for enrichment; Analyze receives data via manual import (or legacy `pushRowsToAnalyzer` if re-wired).

## Data Flow

### Filter process flow (upload → tag → filter → save)

Primary path: `public/js/bridge.js` → `POST /api/bridge/process` → `lib/bridge-api.js` `handleProcess` → `lib/bridge-engine` `processUpload`.

1. **UI collect inputs** (`public/js/bridge.js`)
   - Load states/cities: `GET /api/bridge/states`, `GET /api/bridge/cities?state=`
   - User picks city, upload type (`code_violation` | `water_shut_off`), file, response-received datetime
   - `processUpload()` builds `FormData` (`cityId`, `uploadType`, `file`) and POSTs `/api/bridge/process`

2. **API gate** (`lib/bridge-api.js` → `handleProcess`)
   - Require `multipart/form-data`; parse via `lib/multipart.js`
   - Validate `cityId`, `uploadType` (`validateUploadType`), accepted extension (`isAcceptedFile`), non-empty file
   - Resolve city from Form Forge summaries (`loadCitySummaries` → Forge `/api/portal/cities/summary`)
   - Read scope: `readPhugleeUser(req)`, `readPhugleePlan(req)`
   - Call `processUpload({ buffer, filename, city, uploadType, username, plan })`
   - **Do not push to Analyze** (explicit comment at process handler); return JSON payload only

3. **Parse** (`lib/bridge-engine/index.js` + parsers)
   - Tabular: `parsers/spreadsheet.js` (xlsx/xls/csv/tsv), `parsers/text.js`
   - Documents: `parsers/pdf.js`, `parsers/docx.js`, `parsers/image-ocr.js` (Tesseract)
   - Output: `{ rows, headers, parser, ...meta }`

4. **Normalize + tag** (`lib/bridge-engine/normalizer.js`)
   - Map headers via `lib/bridge-intake-schema.js` (`detectIntakeColumnMap`, field aliases)
   - Validate rows (`lib/bridge-engine/validator.js`) — discard blank / no address / non-property
   - Inject city/state from selected profile
   - **Distress tag per row:** `tagRow(mapped, uploadType, rawRow)` from `lib/bridge-distress-tagger.js`
     - `water_shut_off` → always high-value water tag (no keyword filter)
     - `code_violation` → regex indicator categories; strong tag or default “Standard”
   - Build normalized row (`buildNormalizedRow`) with confidence / needsReview

5. **Dedupe within upload** (`lib/bridge-dedup.js`)
   - Near-duplicate street addresses (similarity threshold); discards mapped to `DISCARD_REASONS.duplicate`

6. **Already-in-Analyze filter** (`lib/analyzer-import-index.js` + `lib/bridge-engine/import-filter.js`)
   - `loadImportAddressIndex({ username, plan, force: true })` builds address set from:
     1. Disk: scoped `distressAnalyzerSession_LATEST.json` under analyzer data root
     2. Fallback: `GET` analyzer `/api/import-address-index`
   - `filterAlreadyImported` drops matches (exact keys + similarity ≥ 0.92)
   - Stats: `alreadyImported`

7. **Distress-only filter** (`filterDistressOnly` in `lib/bridge-distress-tagger.js`)
   - Code violations: keep only `Strong Distressed Signal`; discard `no_distress_signal`
   - Water shut-off: pass-through
   - If zero kept → throw `NO_USABLE_ROWS` (API 422 with stats/discarded)

8. **Response to UI**
   - `{ ok, city, uploadType, sourceFile, processedAt, stats, rows, discarded, processingMeta }`
   - UI renders results panel (`renderResults`); rows stay client-side until save

9. **Save list (explicit)** (`POST /api/bridge/lists`)
   - UI `saveCurrentList()` → `handleListCreate` → `lib/bridge-list-store.js` `saveList`
   - Per-user directory: `FILTER_LISTS_ROOT/{storageKey}/`
     - `index.json` — list summaries
     - `{listId}/meta.json`, `{listId}/rows.json`
   - Download: `GET /api/bridge/lists/:id/download?format=csv|xlsx` (and download-all)
   - Rename/delete/clear-all via PATCH/DELETE on lists routes

10. **Optional attach to Collect** (`POST /api/bridge/attach`)
    - Persists versioned dataset on city profile via Forge `POST /api/portal/city/:id/bridge/attach`
    - Records `responseReceivedAt` for turnaround KPIs
    - Independent of Analyze import

### Filter → Analyze connection

| Mechanism | Direction | When used |
|-----------|-----------|-----------|
| Address import index | Analyze → Filter | **Every process** — strips rows already in session |
| Manual download + Analyzer upload | Filter → Analyze | **Primary product path** after skip-trace enrichment |
| `pushRowsToAnalyzer` (`lib/bridge-analyzer-push.js`) | Filter → Analyze | **Legacy / available library**; maps rows to analyzer records, POSTs `/api/bridge-import-records` or merges session on disk. **Not called from process handler** |
| Analyzer `appendRecordsToSession` | In Analyze | `modules/property-analyzer/lib/bridge-import-records.js` via `routes/bridge.js` |

**User scope** for index, lists, and push: `lib/phuglee-user.js` → analyzer `lib/user-session.js` (`resolveSessionScope`, `scopeSessionPath`).

### Collect (Forge) request flow

1. Browser hits `/forge/...` or Collect shell page
2. `server.js` → `isForgeRequest` → `proxyToForge` (ensure child running)
3. Form Forge Flask handles portal/API; city summaries feed Bridge state/city pickers

### Analyze request flow

1. Browser hits `/analyzer/...`
2. Local: proxy to Property Analyzer on `:3456`
3. Serverless/Vercel: `lib/embedded-analyzer.js` dispatches in-process
4. Session file + learned brain live under analyzer data root / user scopes

### Static shell request flow

1. Path matches `config.DISTRESS_ROUTES` (e.g. `/bridge` → `bridge.html`) or `/css|/js|/images|/videos|/data`
2. Serve from `public/` with cache policy from `lib/static-cache.js`

**State Management:**
- **Filter lists:** filesystem under `config.FILTER_LISTS_ROOT` (default `data/filter-lists` or volume-nested)
- **Analyzer session:** `distressAnalyzerSession_LATEST.json` (+ per-user dirs under `modules/property-analyzer/users/`)
- **Forge city data:** `modules/form-forge/data/` (portal registry, bridge datasets)
- **No central DB;** atomic JSON writes for list store (`writeJsonAtomic`)

## Key Abstractionsions

**processUpload pipeline:**
- Purpose: Single async function that turns a file buffer into kept/discarded rows + stats
- Examples: `lib/bridge-engine/index.js` `processUpload`
- Pattern: Parse → normalize/tag → dedupe → import-filter → distress-filter → stats

**Normalized intake row:**
- Purpose: Canonical Filter record shape for export and list storage
- Examples: `lib/bridge-intake-schema.js` `NORMALIZED_COLUMNS`, `buildNormalizedRow`
- Pattern: Schema + column alias map + discard reason constants

**Distress tagger:**
- Purpose: Classify code-violation text as strong distress vs generic
- Examples: `lib/bridge-distress-tagger.js` `INDICATOR_CATEGORIES`, `tagRow`, `filterDistressOnly`
- Pattern: Regex category library over concatenated mapped + raw cell text

**List store:**
- Purpose: User-scoped durable staging of filtered lists
- Examples: `lib/bridge-list-store.js` `saveList`, `listSummaries`, `buildDownload`
- Pattern: Directory-per-list + index.json repository

**Import address index:**
- Purpose: Cross-product dedupe against Analyze session
- Examples: `lib/analyzer-import-index.js` `loadImportAddressIndex`
- Pattern: Cached Set of normalized address keys (TTL 5 min; force refresh on process)

**Analyzer push adapter (optional):**
- Purpose: Convert Bridge rows → Analyzer lead records and merge session
- Examples: `lib/bridge-analyzer-push.js` `bridgeRowsToAnalyzerRecords`, `pushRowsToAnalyzer`
- Pattern: Prefer HTTP API; fall back to disk session merge

**Module proxy:**
- Purpose: Prefix-strip reverse proxy to child services
- Examples: `lib/module-proxy.js`, used by `forge-proxy.js` / `analyzer-proxy.js`
- Pattern: Factory with health check + request pipe

**Session scope:**
- Purpose: Isolate multi-user data by username/plan storage key
- Examples: `lib/phuglee-user.js`, `modules/property-analyzer/lib/user-session.js`
- Pattern: Header-derived scope object with `storageKey`

## Global training brain — plug-in points

Analyzer already has a **per-session learned brain** for review corrections:

- `modules/property-analyzer/lib/learned-brain.js` — caps/merge for `learnedRules`, `correctionEvents`, score/tier/category corrections
- Consumed during Analyze classification / review training (`learned-rules.js`, `review-training.js`, tier engine)

A **global training brain** that improves Filter *and* Analyze should plug in at these seams (not yet a shared service):

| Seam | File | Role for global brain |
|------|------|------------------------|
| Distress tagger categories | `lib/bridge-distress-tagger.js` `INDICATOR_CATEGORIES` / `collectMatches` | Load learned keep/kill phrases beyond static regex |
| Normalize step | `lib/bridge-engine/normalizer.js` after `tagRow` | Override tag/confidence from model scores |
| processUpload stats | `lib/bridge-engine/index.js` | Log outcomes for offline training; A/B keep rules |
| Import filter threshold | `lib/bridge-engine/import-filter.js` | Learned fuzzy-match policy per city |
| Analyzer classify | `modules/property-analyzer/lib/result-classify.js`, `tier-engine.js` | Shared rules with Filter strong-signal taxonomy |
| Learned brain store | `modules/property-analyzer/lib/learned-brain.js` | Promote session corrections → global rules file / service |
| Review training | `modules/property-analyzer/lib/review-training.js` | Feedback loop source for global brain |

**Recommended integration shape:** shared module (e.g. `lib/training-brain.js` or `modules/shared/`) read by tagger + analyzer classify; write path only from review training / admin promote. Keep Filter deterministic offline-first (regex + rules file) so process does not depend on Gemini.

## Entry Points

**Distress OS HTTP server:**
- Location: `server.js`
- Triggers: `npm start` / `node server.js` / `scripts/restart.ps1` (headless)
- Responsibilities: Bind port, `handleRequest`, boot Forge/Analyzer children (non-Vercel), export `handleRequest` for tests

**Bridge API handler:**
- Location: `lib/bridge-api.js` `handle(req, res, pathname, url)`
- Triggers: Any path starting `/api/bridge` from `server.js`
- Responsibilities: Route table for states, cities, process, attach, lists, history

**Filter UI:**
- Location: `public/bridge.html` + `public/js/bridge.js`
- Triggers: Navigate to `/bridge`
- Responsibilities: City/file UX, process, results, save lists, attach, history

**Form Forge process:**
- Location: `modules/form-forge/run_review_portal.py` (spawned via `lib/forge-process.js`)
- Triggers: Shell boot or first `/forge` proxy
- Responsibilities: Collect product server on `:8787`

**Property Analyzer process:**
- Location: `modules/property-analyzer/server.js` (spawned via `lib/analyzer-process.js`)
- Triggers: Shell boot or first `/analyzer` proxy
- Responsibilities: Analyze product server on `:3456`

**Vercel / serverless:**
- Location: `api/server.js` (if present), `lib/runtime.js` `isVercel` / `useEmbeddedAnalyzer`
- Triggers: Platform invoke
- Responsibilities: Skip child processes; embed analyzer; optional remote Forge URL

## Error Handling

**Strategy:** Handlers catch domain errors, map to HTTP status + `{ error, code }` JSON; uncaught errors bubble to `server.js` request catch → 500

**Patterns:**
- Bridge process: coded errors `UNSUPPORTED_FILE`, `NO_USABLE_ROWS` (422), `OCR_UNAVAILABLE` (503), `PARSER_NOT_READY` (501)
- List store: `LIST_NOT_FOUND`, `MISSING_ROWS`, `TOO_MANY_ROWS` → 4xx via `handleListError`
- Proxy modules: 502 when child unavailable
- Client: `public/js/bridge.js` `fetchJson` surfaces message; retry via `lastFailedAction`

## Cross-Cutting Concerns

**Logging:**
- `console.log` / `console.warn` / `console.error` with prefixes (`[Bridge API]`, `[Filter lists]`, `[Distress OS]`)
- No structured logging framework in shell

**Validation:**
- Bridge intake: `lib/bridge-intake-schema.js` + `lib/bridge-engine/validator.js`
- Upload type allowlist; accepted extensions list
- Multipart and JSON body checks in `bridge-api.js`

**Authentication:**
- Shell pages: client auth guard (`public/js/auth-guard.js`, `auth-session.js`); `config.AUTH_DISABLED` for local
- Analyzer: optional `X-PDA-Token` via `lib/analyzer-auth.js`
- User isolation: `X-Phuglee-User` / `X-Phuglee-Plan` (see `public/js/phuglee-session-headers.js`)

**Configuration:**
- `lib/config.js` — ports, paths, route map, `FILTER_LISTS_ROOT`, `ANALYZER_DATA_ROOT`
- Env: `DISTRESS_OS_PORT`, `FORM_FORGE_*`, `PROPERTY_ANALYZER_*`, `PDA_DATA_ROOT`, `MAPS_API_KEY`, `GEMINI_API_KEY`, auth flags

---

### Bridge API route map (reference)

| Method | Path | Handler purpose |
|--------|------|-----------------|
| GET | `/api/bridge/states` | Distinct states from Forge cities |
| GET | `/api/bridge/cities?state=` | Cities for state |
| POST | `/api/bridge/process` | Upload → `processUpload` (no Analyze push) |
| POST | `/api/bridge/attach` | Version dataset on city profile (Forge) |
| GET | `/api/bridge/history/:cityId` | Prior bridge datasets for city |
| GET | `/api/bridge/lists` | Saved list summaries |
| POST | `/api/bridge/lists` | Save processed rows as list |
| GET | `/api/bridge/lists/:id` | List meta (+ rows if `includeRows`) |
| PATCH | `/api/bridge/lists/:id` | Rename |
| DELETE | `/api/bridge/lists/:id` | Delete one |
| DELETE/POST | `/api/bridge/lists` or `/lists/clear` | Clear all |
| GET | `/api/bridge/lists/:id/download` | CSV/XLSX export |
| GET | `/api/bridge/lists/download-all` | Combined export |

### processUpload stage diagram

```
buffer + filename + city + uploadType + user scope
        │
        ▼
   [parse tabular | document/OCR]
        │
        ▼
   normalizeRawRows ── tagRow (distress) ── validate address
        │
        ▼
   dedupeRows (within file)
        │
        ▼
   loadImportAddressIndex (Analyze session)
        │
        ▼
   filterAlreadyImported
        │
        ▼
   filterDistressOnly (code violations only)
        │
        ▼
   buildStats → { rows, discarded, stats, processingMeta }
```

---

*Architecture analysis: 2026-07-09*
*Update when major patterns change*
