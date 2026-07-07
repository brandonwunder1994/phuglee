# Technology Stack

**Analysis Date:** 2026-07-04

## Languages

**Primary:**
- JavaScript (ES modules via CommonJS `require`) — All server code in `server.js`, `routes/`, `lib/`, `imagery-cache.js`, and `scripts/`
- JavaScript (browser IIFE modules) — Frontend in `public/js/` and shared isomorphic logic mirrored in `lib/` (served to browser via `routes/static.js` allowlist)
- HTML — Single-page app shell in `public/index.html`

**Secondary:**
- CSS — Custom theme layers in `public/css/` (`app.css`, `cyber-*.css`, `tokens.css`) plus compiled Tailwind output
- PowerShell — Process supervision in `ensure-server.ps1`, `server-watchdog.ps1`, `start-watchdog.ps1`
- Batch/VBS — Windows launchers in `launch-analyzer.bat`, `start-server.bat`, `install-background-server.bat`, `server-watchdog.vbs`

## Runtime

**Environment:**
- Node.js — Local HTTP server (`server.js` uses built-in `http`/`https`/`fs`/`crypto`; no Express/Fastify)
- Browser — Chrome/Edge-style browser required for `localStorage`, `indexedDB`, `fetch`, and desktop `Notification` API (see `public/js/config.js`, `public/js/state.js`, `persistence.js`)
- Server binds `127.0.0.1:3456` (port constant in `lib/config.js`)

**Package Manager:**
- npm — Declared in `package.json`
- Lockfile: `package-lock.json` present (resolves `@aws-sdk/client-s3` to 3.1077.0; AWS SDK packages require Node `>=20.0.0`)

**Observed dev runtime:** Node v24.13.0 (no `engines` field or `.nvmrc` in repo; recommend Node 20+ for AWS SDK compatibility)

## Frameworks

**Core:**
- None on server — Vanilla Node.js HTTP with custom router (`lib/router.js`)
- None on client — Vanilla browser JS loaded via `<script>` tags in `public/index.html` (no React/Vue/Svelte, no bundler)

**Testing:**
- Node.js built-in test runner — `node --test` invoked from `package.json` scripts (`test`, `test:golden`, `test:metrics`, `test:backup`)
- 30 test files under `tests/*.test.js` plus `scripts/test-atomic-write.js`

**Build/Dev:**
- Tailwind CSS 3.4.17 — Utility CSS compiled from `public/css/input.css` → `public/css/tailwind.css` via `tailwind.config.js`
- No TypeScript, Babel, Vite, or Webpack in project

## Key Dependencies

**Critical (npm):**
- `@aws-sdk/client-s3` ^3.700.0 (optional) — Cloudflare R2 mirror uploads in `imagery-cache.js` when `R2_*` env vars are set; lazy-loaded, not required for local-only operation

**Critical (CDN, not in package.json):**
- SheetJS (`XLSX` 0.20.3) — Spreadsheet import/export in `public/js/render.js`; loaded from `https://cdn.sheetjs.com/` in `public/index.html`

**Infrastructure (Node built-ins):**
- `http` / `https` — Server and outbound API proxying (`server.js`, `routes/maps.js`, `routes/gemini.js`)
- `fs` / `path` / `crypto` — File-backed session store, backups, imagery cache, atomic writes (`lib/fs-atomic.js`)
- `fetch` (browser) — Client API calls via `public/js/config.js` `apiFetch()` wrapper

**Styling/fonts (external CDN):**
- Google Fonts — JetBrains Mono, Orbitron, Outfit loaded in `public/index.html`
- StateFace font — `public/css/stateface.css` for US state glyphs

## Configuration

**Environment:**
- `.env` — Loaded at startup by `config.loadEnvFile()` in `lib/config.js` (called from `server.js`); keys documented in `.env.example` and `.env.imagery.example`
- Key variables: `MAPS_API_KEY`, `GEMINI_API_KEY`, `PDA_AUTH_TOKEN`, `PDA_OFFSITE_ENABLED`, `PDA_OFFSITE_DIR`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- Fallback key file: `maps-api-key.txt` (read by `routes/maps.js` `loadServerMapsKey()`)
- Auth token fallback: `logs/pda-auth.token` (auto-generated in `server.js` if `PDA_AUTH_TOKEN` unset)

**Build:**
- `tailwind.config.js` — Scans `public/**/*.{html,js}` for class names; extends CSS variables from `public/css/tokens.css`
- `package.json` scripts:
  - `start` → `node server.js`
  - `css:build` / `css:watch` → Tailwind compile
  - `test` / `test:golden` / `test:metrics` / `test:backup` → Node test runner
  - `migrate-imagery` / `migrate-imagery:dry` → `scripts/migrate-imagery.js`

**Application constants:**
- `lib/config.js` — Paths (`PUBLIC_DIR`, backup dirs, `GEMINI_AUDIT_DIR`, `SCAN_RESULTS_DIR`), retention limits, debounce intervals, milestone save reasons
- `public/js/config.js` — Client scan/review tuning (batch size, concurrency caps, Gemini model list, virtual scroll settings)

## Platform Requirements

**Development:**
- Windows 10/11 primary target — Launch via `launch-analyzer.bat`; watchdog via `server-watchdog.ps1` + `server-watchdog.vbs`
- Node.js installed (`launch-analyzer.bat` checks `where node`)
- `curl.exe` used for readiness probe in `launch-analyzer.bat`
- Cross-platform possible for server/tests (Node + npm), but backup offsite defaults to OneDrive path in `lib/safety.js`

**Production:**
- Local desktop deployment only — No Docker, Vercel, or cloud hosting config in repo
- User runs server locally; opens `http://localhost:3456` in browser
- Background persistence: JSON files on disk (`distressAnalyzerSession_LATEST.json`), `backups/auto/`, `backups/milestones/`, `backups/manual/`, `property_imagery/`
- Optional offsite mirror to OneDrive or custom dir (`PDA_OFFSITE_DIR`)
- No `.github/workflows` or CI pipeline present

## Data & Storage (in-process, not external DB)

- **Session state:** JSON on disk + browser `localStorage` / `indexedDB` (`public/js/state.js`, `persistence.js`)
- **Imagery cache:** Local filesystem `property_imagery/` with index `property_imagery/index.json` (`imagery-cache.js`)
- **Audit logs:** JSONL in `gemini_audit/` (`routes/gemini.js`)
- **Server logs:** `logs/server.log`, `logs/imagery-cache.log`, `logs/watchdog.log`, `logs/server-stdout.log`, `logs/server-stderr.log`

---

*Stack analysis: 2026-07-04*
*Update after major dependency changes*