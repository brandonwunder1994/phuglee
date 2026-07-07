# External Integrations

**Analysis Date:** 2026-07-04

## APIs & External Services

**Google Maps Platform — Geocoding, Street View, Static Maps:**
- Purpose: Geocode property addresses, fetch Street View and satellite imagery for AI analysis and UI thumbnails
- Integration: Server-side HTTPS GET proxy in `routes/maps.js` (no official Google npm SDK)
- Auth: `MAPS_API_KEY` in `.env` (preferred) or legacy `maps-api-key.txt` at project root
- Endpoints used:
  - `https://maps.googleapis.com/maps/api/geocode/json` — Address → lat/lng (`geocodeUrl()`)
  - `https://maps.googleapis.com/maps/api/streetview/metadata` — Panorama lookup (`streetViewMetaUrl()`)
  - `https://maps.googleapis.com/maps/api/streetview` — Street View image bytes (`buildStreetViewImageUrl()`)
  - `https://maps.googleapis.com/maps/api/staticmap` — Satellite imagery (`buildSatelliteImageUrl()`)
- App routes exposing Maps proxy: `/api/sv-image`, `/api/satellite-image`, `/api/sv-base64`, `/api/satellite-base64`, `/api/property-imagery`, `/api/test-streetview` (all in `routes/maps.js`)
- Rate limiting: In-process queue — max 12 concurrent Maps calls (`MAPS_MAX_CONCURRENT` in `routes/maps.js`); retries on 429/503
- Client access: Browser calls local server only when `USE_PROXY` is true (`public/js/config.js`); keys never sent to browser when server key is configured

**Google Gemini API — Vision / text generation:**
- Purpose: Property distress classification from Street View + satellite images; review training metadata
- Integration: Server-side HTTPS POST in `routes/gemini.js` (no `@google/generative-ai` SDK)
- Auth: `GEMINI_API_KEY` in `.env`; supports `AIza…` (query param) and `AQ.…` (AI Studio, `x-goog-api-key` header) via `geminiAuthForKey()`
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Models tried in order: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-1.5-flash` (`GEMINI_MODELS` in `routes/gemini.js` and `public/js/config.js`)
- App routes: `POST /api/gemini-vision`, `POST /api/test-gemini`, `GET /api/gemini-audit/stats`, `GET /api/gemini-audit/export`
- Rate limiting: In-process queue — max 8 concurrent calls (`GEMINI_MAX_CONCURRENT`); retries on 429/503/500
- Audit trail: Append-only JSONL in `gemini_audit/gemini_audit_YYYY-MM-DD.jsonl` (`routes/gemini.js`)

**Google Fonts (CDN):**
- Purpose: UI typography (JetBrains Mono, Orbitron, Outfit)
- Integration: `<link>` tags in `public/index.html` → `fonts.googleapis.com` / `fonts.gstatic.com`
- Auth: None (public CDN)

**SheetJS / XLSX (CDN):**
- Purpose: Parse uploaded `.xlsx`/`.csv` lead files; export results to Excel/CSV
- Integration: Global `XLSX` from CDN script in `public/index.html`; used in `public/js/render.js`
- Auth: None (client-side library load)
- Version: 0.20.3 (`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`)

**Google Maps deep links (export only, no API call):**
- Purpose: Clickable pano/search URLs in dial-ready export schema
- Integration: URL builders in `lib/export-schema.js` (`https://www.google.com/maps/@?api=1&…`, `https://www.google.com/maps/search/?api=1&query=…`)

## Data Storage

**Databases:**
- None — No PostgreSQL, SQLite, MongoDB, or ORM in codebase

**File Storage (local primary):**
- Project filesystem — Authoritative session and backup store
  - Canonical session: `distressAnalyzerSession_LATEST.json` (project root)
  - Rolling/ephemeral: `backups/auto/` (`lib/backups.js`, `lib/safety.js`)
  - Milestone snapshots: `backups/milestones/`
  - Manual downloads: `backups/manual/`
  - Scan incrementals: `scan_results/` (referenced in `lib/config.js`)
  - Rejected archive: `backups/archive/rejected/`
- Imagery cache: `property_imagery/` with manifest `property_imagery/index.json` (`imagery-cache.js`)
- Client-side mirrors: `localStorage` (`distressAnalyzerSession`, version history keys), `indexedDB` database `distressAnalyzerDB` (`public/js/state.js`, `persistence.js`)

**File Storage (optional cloud mirror):**
- Cloudflare R2 — S3-compatible optional mirror for cached property images
  - SDK: `@aws-sdk/client-s3` (optional dependency in `package.json`)
  - Implementation: `imagery-cache.js` (`uploadToR2IfConfigured()`, `isR2Configured()`)
  - Auth: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in `.env` (see `.env.imagery.example`)
  - Endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  - Object prefix: `property-imagery/{streetview|satellite}/{hash}.{ext}`
  - Public URL: Optional `R2_PUBLIC_URL` custom domain stored as `r2Url` on index entries
  - Note: Local disk remains primary serve path via `/api/cached-imagery/` (`routes/imagery.js`)

**Offsite backup (filesystem sync, not cloud API):**
- OneDrive / custom directory — Session JSON copied off-machine
  - Implementation: `lib/safety.js` `copySessionOffsite()`
  - Auth: Filesystem path only — `PDA_OFFSITE_DIR` or default `%USERPROFILE%\OneDrive\PropertyDistressAnalyzer-backups`
  - Toggle: `PDA_OFFSITE_ENABLED=0` disables
  - Throttle: 5-minute minimum interval (`OFFSITE_MIN_INTERVAL_MS` in `lib/config.js`)
  - Manifest: `backups/offsite/OFFSITE_MANIFEST.json`

**Caching:**
- In-memory only on server — Geocode cache (50k entries, 24h TTL), image response cache (4000 entries, 6h TTL) in `routes/maps.js`; hot file cache (800 entries) in `imagery-cache.js`
- No Redis or Memcached

## Authentication & Identity

**Auth Provider:**
- Custom local bearer token — Not OAuth, not JWT standard library
- Implementation: `server.js` `readOrCreateAuthToken()`, `requireAuth()` on all `POST /api/*` routes
- Token sources (priority): `PDA_AUTH_TOKEN` env var → `logs/pda-auth.token` file → auto-generated 32-byte hex
- Client delivery: Injected into HTML as `window.__PDA_AUTH_TOKEN__` by `routes/static.js` `serveHtmlWithAuthToken()`
- Client usage: `X-PDA-Token` header or `Authorization: Bearer` via `public/js/config.js` `apiFetch()`
- Session management: Stateless per-request token check; no user accounts or roles

**OAuth Integrations:**
- None

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Analytics:**
- None (no Mixpanel, GA, etc.)

**Logs:**
- Local file logging only
  - `logs/server.log` — Uncaught errors, shutdown events (`server.js`)
  - `logs/imagery-cache.log` — Imagery cache operations (`imagery-cache.js`)
  - `logs/watchdog.log` — Watchdog health checks (`ensure-server.ps1`)
  - `logs/server-stdout.log` / `logs/server-stderr.log` — Server process output
- API health: `GET /api/status` returns queue stats for Gemini and Maps (`server.js` `getApiStatus()`)
- Safety state: `GET /api/safety-status` (`routes/session.js`)

**Browser notifications:**
- Web Notifications API — Optional desktop alerts for scan issues (`public/js/config.js` `maybeBrowserNotify()`); permission gated, no external push service

## CI/CD & Deployment

**Hosting:**
- Local Windows desktop — User-launched via `launch-analyzer.bat`
- Server process: `node server.js` (started by `ensure-server.ps1`, supervised by `server-watchdog.ps1`)
- Health check: `http://127.0.0.1:3456/api/status`
- PID files: `logs/server.pid`, `logs/watchdog.pid`

**CI Pipeline:**
- None — No `.github/workflows/`, GitLab CI, or similar in repository
- Tests run manually via `npm test`

## Environment Configuration

**Development:**
- Required env vars for full functionality: `MAPS_API_KEY`, `GEMINI_API_KEY` (documented in `.env.example`)
- Recommended: `PDA_AUTH_TOKEN` (otherwise auto-generated and persisted to `logs/pda-auth.token`)
- Secrets location: `.env` at project root (gitignored; template in `.env.example`)
- Optional imagery mirror: `.env.imagery.example` → copy R2 vars into `.env`
- Mock/stub services: Not provided — uses live Google APIs when keys configured; imagery can be served from local cache without refetch

**Staging:**
- Not applicable — Single-user local tool; no separate staging environment config

**Production:**
- Same as development — Local install on operator PC
- Secrets management: Manual `.env` file edit; restart server after changes
- Failover: Watchdog auto-restarts server (`ensure-server.ps1`); offsite backup to OneDrive for disaster recovery
- Data redundancy: Multi-tier backup system in `lib/backups.js` + `lib/safety.js` (auto, milestone, manual, offsite)

## Webhooks & Callbacks

**Incoming:**
- None — No Stripe, GitHub, or third-party webhook handlers

**Outgoing:**
- None — No outbound webhook posts on events; all external communication is pull-based HTTPS to Google APIs and optional R2 PUT

## Internal API Surface (localhost integration boundary)

All authenticated POST routes require `X-PDA-Token` or `Authorization: Bearer`. Key route modules:

| Module | File | Responsibility |
|--------|------|----------------|
| Session/backup | `routes/session.js` | `/api/session-*`, `/api/scan-result`, `/api/manual-backup`, `/api/safety-status` |
| Maps proxy | `routes/maps.js` | Street View / satellite fetch + cache |
| Gemini proxy | `routes/gemini.js` | Vision inference + audit |
| Imagery cache | `routes/imagery.js` | `/api/cached-imagery/`, `/api/imagery/*` |
| Static/UI | `routes/static.js` | SPA, shared `lib/` modules, `persistence.js` |
| Core server | `server.js` | `/api/status`, `/api/config`, auth gate |

CORS: `Access-Control-Allow-Origin: *` on JSON and image responses (`lib/http.js`, `routes/maps.js`)

---

*Integration audit: 2026-07-04*
*Update when adding/removing external services*