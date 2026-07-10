# External Integrations

**Analysis Date:** 2026-07-09

## APIs & External Services

**AI / Vision (Property Analyzer):**
- Google Gemini (Generative Language API) — Distress classification from property imagery
  - Integration method: HTTPS POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  - Implementation: `modules/property-analyzer/routes/gemini.js`
  - Models tried in order: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-1.5-flash`
  - Auth: `GEMINI_API_KEY` env (or key file via analyzer key management)
  - Concurrency: max 8 concurrent calls (`GEMINI_MAX_CONCURRENT`)

**Maps / Imagery (Property Analyzer):**
- Google Maps Platform — Geocode, Street View metadata/images, Static Maps satellite
  - Endpoints used from `modules/property-analyzer/routes/maps.js`:
    - Geocode: `maps.googleapis.com/maps/api/geocode/json`
    - Street View: `maps.googleapis.com/maps/api/streetview` + metadata
    - Static map: `maps.googleapis.com/maps/api/staticmap`
  - Auth: `MAPS_API_KEY` env or local key file (`maps-api-key.txt` path managed by analyzer)
  - Local disk cache: `modules/property-analyzer/imagery-cache.js` (+ optional R2 mirror)

**Email (Form Forge):**
- Gmail API — Send FOIA / portal request emails with PDF attachments
  - SDK/Client: `google-api-python-client` + `google-auth` (`modules/form-forge/review_portal/gmail_client.py`)
  - Auth: OAuth user token at `~/.gmail-mcp/token.json` (scope `https://mail.google.com/`)
  - Not used by Filter/Bridge processing path

**CDN / Front-end third parties:**
- Google Fonts — Anton, Outfit, JetBrains Mono (linked from `public/*.html` including `public/bridge.html`)
- MapLibre GL 4.7.1 (unpkg) — Coverage map explorer only (`public/js/home-coverage-explorer.js`)
  - Not part of Filter/Bridge pipeline

**Payment Processing:**
- Not detected (pricing UI is client-side plan catalog in `public/js/auth.js`; no Stripe/PayPal SDK)

## Data Storage

**Databases:**
- None (no PostgreSQL/MySQL/Mongo/Redis)

**File Storage (primary persistence model):**
- Filter saved lists — JSON files under `FILTER_LISTS_ROOT`
  - Implementation: `lib/bridge-list-store.js`
  - Default local: `data/filter-lists/{userKey}/`
  - Docker/Railway: `${PDA_DATA_ROOT}/filter-lists` (see `scripts/docker-entrypoint.sh`, `lib/config.js`)
  - Structure: `index.json`, `{listId}/meta.json`, `{listId}/rows.json`
- Property Analyzer session — `distressAnalyzerSession_LATEST.json` under `PDA_DATA_ROOT` / analyzer data root
  - Bridge reads this for already-imported address filtering (`lib/analyzer-import-index.js`)
- Form Forge portal registry & city profiles — JSON under `modules/form-forge/data/` (e.g. `portal-registry.json`)
  - Bridge attaches datasets via Forge API → versioned bridge datasets on city profile
- Imagery cache — local files under analyzer imagery root (`PDA_IMAGERY_ROOT` optional)
- Auth users/plans — browser `localStorage` key `phuglee_users` (not server DB)

**Object storage (optional):**
- Cloudflare R2 (S3-compatible) — Optional mirror of property imagery
  - SDK: `@aws-sdk/client-s3` (optionalDependency of property-analyzer)
  - Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_PUBLIC_URL`
  - Code: `modules/property-analyzer/imagery-cache.js`
  - Template: `modules/property-analyzer/.env.imagery.example`

**Caching:**
- In-process Maps geocode/image caches in `modules/property-analyzer/routes/maps.js`
- Static asset cache headers via `lib/static-cache.js`
- No Redis/Memcached

## Authentication & Identity

**Auth Provider:**
- Custom client-side Phuglee auth (no Auth0/Supabase/Clerk)
  - Session: `sessionStorage` key `phuglee_session` (`public/js/auth-session.js`)
  - User registry: `localStorage` key `phuglee_users` (`public/js/auth.js`)
  - Bootstrap admin documented in README / client bootstrap (username/password client-side)
  - Guard scripts: `public/js/auth-guard.js`, dynamic ` /js/auth-config.js` served by `server.js`
  - Flags: `PHUGLEE_AUTH_DISABLED`, `PHUGLEE_AUTH_OPEN`, production forces login unless open staging (`lib/config.js`)

**Request identity headers (Filter + Analyze scoping):**
- Browser injects `X-Phuglee-User` and `X-Phuglee-Plan` (`public/js/phuglee-session-headers.js`)
- Server reads via `lib/phuglee-user.js` → scopes Filter lists and analyzer sessions

**Property Analyzer internal auth:**
- Optional `PDA_AUTH_TOKEN` / file under analyzer logs for service-to-service calls (`lib/analyzer-auth.js`, `modules/property-analyzer/server.js`)

**OAuth Integrations:**
- Gmail OAuth only (Form Forge) — token file `~/.gmail-mcp/token.json`
- No Google sign-in for Phuglee shell login

## Child Modules (in-process / reverse-proxy integrations)

These are not third-party SaaS, but are the critical integration boundaries for Filter/Bridge:

**Form Forge (`modules/form-forge`):**
- Protocol: HTTP reverse proxy at `/forge` (`lib/forge-proxy.js`, `lib/forge-client.js`)
- Process management: `lib/forge-process.js` (spawn Python) or external boot (`FORGE_EXTERNAL_BOOT=1` in Docker)
- Bridge uses Forge for:
  - City catalog: `GET /api/portal/cities/summary`
  - Attach dataset: `POST /api/portal/city/{cityId}/bridge/attach`
  - History: city detail with `bridge_datasets`
- Bundled fallback: reads `modules/form-forge/data/portal-registry.json` when Forge is down (`lib/forge-client.js`, `FORGE_BUNDLED_FALLBACK`)
- Remote option: `FORM_FORGE_URL` for serverless shell pointing at a full Forge deploy

**Property Analyzer (`modules/property-analyzer`):**
- Protocol: HTTP reverse proxy at `/analyzer` (`lib/analyzer-proxy.js`) or embedded dispatch (`lib/embedded-analyzer.js` when `ANALYZER_EMBEDDED=1` / Vercel)
- Process management: `lib/analyzer-process.js`
- Bridge uses Analyzer for:
  - Import address index (dedupe against existing Analyze records) via disk session + optional HTTP (`lib/analyzer-import-index.js`)
  - Optional push path (`lib/bridge-analyzer-push.js`) — **Filter process does not auto-push**; enrichment/import is manual per product flow (`docs/bridge/API.md`)

**Filter/Bridge API surface (shell-owned):**
| Method | Path | Integrates with |
|--------|------|-----------------|
| GET | `/api/bridge/states` | Form Forge city summary |
| GET | `/api/bridge/cities` | Form Forge city summary |
| POST | `/api/bridge/process` | Local engine + Analyze import index |
| POST | `/api/bridge/lists` (+ GET/PATCH/DELETE/download) | Filesystem list store |
| POST | `/api/bridge/attach` | Form Forge bridge attach API |
| GET | `/api/bridge/history/:cityId` | Form Forge city detail |

Contract docs: `docs/bridge/API.md`.

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Datadog SDK)

**Analytics:**
- None detected

**Logs:**
- stdout/stderr console logging on shell and child processes
- Forge boot log: `FORGE_BOOT_LOG` (default `/tmp/forge-boot.log` in Docker)
- Diagnostics endpoint: `GET /api/forge-diagnostics` (`server.js`)
- Health: `GET /api/health` — reports Form Forge + Property Analyzer up/down
- Railway healthcheck: `railway.toml` → `/api/health` (timeout 300s)

## CI/CD & Deployment

**Hosting:**
- Railway — primary full-stack deploy (`Dockerfile`, `railway.toml`, start `scripts/docker-entrypoint.sh`)
- Vercel — partial shell/static + serverless `api/server.js` (Analyzer embedded; Forge requires `FORM_FORGE_URL`; not full production path per README)
- Local desktop operator stack — default development/production-local mode

**CI Pipeline:**
- Not detected as GitHub Actions workflows in repo root (verify via `npm test` / `scripts/verify.ps1` locally)
- Module verify: Form Forge `python scripts/gsd.py verify`; Analyzer `npm test`

**Container boot sequence (`scripts/docker-entrypoint.sh`):**
1. Ensure `PDA_DATA_ROOT` + `FILTER_LISTS_ROOT`
2. Seed Analyze session if volume empty/stub
3. Start Form Forge (Python) + Property Analyzer (Node) as background children
4. Exec shell `node server.js` on public `PORT`

## Environment Configuration

**Required env vars (full Analyze + maps):**
- `MAPS_API_KEY`
- `GEMINI_API_KEY`

**Shell / topology:**
- `DISTRESS_OS_PORT` / `PORT` (default 3000)
- `DISTRESS_OS_HOST` (empty dual-stack local; `0.0.0.0` production)
- `FORM_FORGE_PORT` (8787), `FORM_FORGE_HOST`, `FORM_FORGE_PATH`, `FORM_FORGE_URL`
- `PROPERTY_ANALYZER_PORT` (3456), `PROPERTY_ANALYZER_HOST`, `PROPERTY_ANALYZER_PATH`
- `PDA_DATA_ROOT` — durable Analyze + (by default) Filter lists parent
- `FILTER_LISTS_ROOT` — override Filter list storage root
- `NODE_ENV=production` — enables production auth posture

**Auth flags:**
- `PHUGLEE_AUTH_DISABLED` — skip login (local convenience; forced off in production entry unless open)
- `PHUGLEE_AUTH_OPEN` — temporary open staging in production

**Optional / advanced:**
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- `PDA_IMAGERY_ROOT`, `PDA_AUTH_TOKEN`, `PDA_OFFSITE_ENABLED`, `PDA_OFFSITE_DIR`
- `FORGE_EXTERNAL_BOOT`, `FORGE_BUNDLED_FALLBACK`, `FORGE_LOG_INHERIT`, `FORGE_BOOT_LOG`
- `ANALYZER_EMBEDDED`, `VERCEL` — serverless mode switches (`lib/runtime.js`, `api/server.js`)
- `PYTHON` — override Python executable for Forge spawn

**Secrets location:**
- Local: `modules/property-analyzer/.env` (gitignored); Gmail token under user home `~/.gmail-mcp/`
- Production: Railway Variables (or host secret store) — never commit values
- Templates only: `modules/property-analyzer/.env.example`, `.env.imagery.example`

## Webhooks & Callbacks

**Incoming:**
- None detected (no Stripe/GitHub/webhook route handlers)

**Outgoing:**
- None as product webhooks
- Outbound HTTPS only for Google Maps, Gemini, and optional R2 S3 API
- Outbound Gmail API sends from Form Forge when operator emails requests

## Integration Notes for Filter/Bridge Work

When adding Filter features:
1. Prefer shell-owned endpoints under `/api/bridge/*` in `lib/bridge-api.js`
2. City identity always comes from Form Forge registry (or bundled fallback) — no free-text city creation
3. Persist operator lists via `lib/bridge-list-store.js` + `FILTER_LISTS_ROOT` (volume-safe)
4. Cross-check Analyze via `lib/analyzer-import-index.js`; do not assume auto-push to Analyze
5. File parsers stay in `lib/bridge-engine/parsers/` with dependencies declared in root `package.json`
6. Client calls must send `X-Phuglee-User` / `X-Phuglee-Plan` headers for multi-user list isolation

---

*Integration audit: 2026-07-09*
*Update when adding/removing external services*
