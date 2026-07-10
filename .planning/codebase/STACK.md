# Technology Stack

**Analysis Date:** 2026-07-09

## Languages

**Primary:**
- JavaScript (Node.js CommonJS) — Shell server (`server.js`), shell libraries (`lib/`), Filter/Bridge pipeline (`lib/bridge-*.js`, `lib/bridge-engine/`), Property Analyzer (`modules/property-analyzer/`)
- Vanilla browser JavaScript — All Phuglee UI pages under `public/` (`public/js/bridge.js`, `public/js/shell-nav.js`, etc.)

**Secondary:**
- Python 3.12+ — Form Forge Flask app (`modules/form-forge/review_portal/`)
- HTML5 + CSS3 — Static pages and design system (`public/*.html`, `public/css/`)
- PowerShell — Local ops scripts (`scripts/restart.ps1`, `scripts/verify-live.ps1`, `scripts/ensure-server.ps1`)
- Shell — Docker entrypoint (`scripts/docker-entrypoint.sh`)
- TypeScript — Present in Property Analyzer tooling/deps; runtime app code is JS

## Runtime

**Environment:**
- Node.js 20+ required (README); 24 recommended; Docker image `node:20-bookworm-slim`
- Python 3 with `pip` for Form Forge (`python3` / `python-is-python3` in Docker)
- Browser runtime for shell UI (no SPA framework)

**Package Manager:**
- npm (lockfileVersion 3)
- Root lockfile: `package-lock.json` present
- Analyzer lockfile: `modules/property-analyzer/package-lock.json` present
- Form Forge: `pip` + `modules/form-forge/requirements.txt`

## Frameworks

**Core:**
- Node.js built-in `http` — Shell reverse proxy and static server (`server.js`); no Express/Fastify
- Flask 3.x + Waitress — Form Forge review portal (`modules/form-forge/review_portal/app.py`, production serve via Waitress)
- Vanilla HTML/CSS/JS — Phuglee shell pages (`public/index.html`, `public/bridge.html`, `public/heat.html`, etc.)

**Testing:**
- Node.js built-in test runner (`node --test`) — Shell + Bridge tests (`tests/**/*.test.js`, `package.json` script `"test"`)
- pytest 8+ — Form Forge unit tests (`modules/form-forge/tests/`, `requirements-dev.txt`)
- Playwright (Python, Form Forge dev) + Playwright package may exist under root `node_modules` for audits/scripts
- Property Analyzer: `node --test` for module tests (`modules/property-analyzer/package.json`)

**Build/Dev:**
- No bundler for shell UI — static files served directly from `public/`
- Tailwind CSS 3.4.17 — Property Analyzer CSS build only (`modules/property-analyzer` scripts `css:build` / `css:watch`)
- Docker multi-runtime image — `Dockerfile` installs Node deps + Form Forge Python deps
- Ruff — Form Forge Python lint (`modules/form-forge/ruff.toml`)

## Key Dependencies

**Critical (shell / Filter-Bridge):**
- `xlsx` 0.18.5 — Spreadsheet parse/export for Bridge (`lib/bridge-engine/parsers/spreadsheet.js`, `lib/bridge-export.js`, `lib/bridge-list-store.js`)
- `mammoth` 1.12.0 — DOCX parse (`lib/bridge-engine/parsers/docx.js`)
- `pdf-parse` 2.4.5 — PDF text extract (`lib/bridge-engine/parsers/pdf.js`)
- `tesseract.js` 7.0.0 — Image OCR for jpg/png uploads (`lib/bridge-engine/parsers/image-ocr.js`)

**Critical (child modules):**
- Form Forge: `flask`, `pandas`, `openpyxl`, `pypdf`, `pymupdf`, `google-api-python-client`, `google-auth`, `waitress` (`modules/form-forge/requirements.txt`)
- Property Analyzer optional: `@aws-sdk/client-s3` ^3.700 — Cloudflare R2 imagery mirror (`modules/property-analyzer/imagery-cache.js`)

**Infrastructure:**
- Node built-ins only for shell HTTP, filesystem, and child_process orchestration (`lib/forge-process.js`, `lib/analyzer-process.js`)
- No ORM, no Redis client, no Express middleware stack

## Filter / Bridge Stack (focus)

Filter (UI brand: “Filter”, route `/bridge`) is a first-class pipeline inside the shell:

| Layer | Path | Role |
|-------|------|------|
| Page | `public/bridge.html` | Filter UI shell |
| Client | `public/js/bridge.js` | Upload wizard, KPIs, saved lists, attach flow |
| API | `lib/bridge-api.js` | `/api/bridge/*` handlers |
| Engine | `lib/bridge-engine/index.js` | Parse → normalize → dedupe → import-filter → distress filter |
| Parsers | `lib/bridge-engine/parsers/*` | spreadsheet, text, pdf, docx, image-ocr, row-extract |
| Schema/tags | `lib/bridge-intake-schema.js`, `lib/bridge-distress-tagger.js` | Row shape + distress tags |
| Lists store | `lib/bridge-list-store.js` | User-scoped JSON lists under `FILTER_LISTS_ROOT` |
| Export | `lib/bridge-export.js` | CSV/XLSX buffers |
| Analyze index | `lib/analyzer-import-index.js` | Cross-check addresses already in Analyze |
| Optional push | `lib/bridge-analyzer-push.js` | Analyzer session append (not auto on process) |
| Tests | `tests/bridge-*.test.js` | Engine, API, lists, stress, edge cases |

Accepted upload types (client + engine): `.xlsx`, `.xls`, `.xlsm`, `.csv`, `.tsv`, `.txt`, `.pdf`, `.docx`, `.jpg`, `.jpeg`, `.png`.

## Configuration

**Environment:**
- Shell config centralizes ports/paths/auth flags in `lib/config.js`
- Runtime mode (Vercel/embedded/remote forge) in `lib/runtime.js`
- Property Analyzer secrets: `modules/property-analyzer/.env` (template: `.env.example`, R2: `.env.imagery.example`)
- Docker/Railway injects vars via `Dockerfile`, `railway.toml`, `scripts/docker-entrypoint.sh`

**Key configs required (full product):**
- `MAPS_API_KEY` — Google Maps (geocode, Street View, satellite)
- `GEMINI_API_KEY` — Gemini AI scan in Property Analyzer
- Optional: `R2_*` for imagery mirror; `FORM_FORGE_URL` for remote Forge on serverless; `PDA_DATA_ROOT` / `FILTER_LISTS_ROOT` for durable volumes

**Build:**
- Root: `package.json`, `package-lock.json` — no compile step
- `vercel.json` — rewrites + serverless function entry `api/server.js`
- `railway.toml` — Dockerfile builder, healthcheck `/api/health`
- `Dockerfile` — production multi-service container
- Analyzer Tailwind: `modules/property-analyzer/tailwind.config.js`

## Platform Requirements

**Development:**
- Windows primary (launch scripts `.bat` / `.ps1`); Node server runs on any OS
- Node 20+, Python 3.12+, npm, pip
- Local ports: shell `3000`, Form Forge `8787`, Property Analyzer `3456`
- Start: `npm start` / `launch-distressos.bat` / `scripts/restart.ps1` (headless)

**Production:**
- **Primary:** Railway (or Render) via Docker — one public port `:3000`, children on internal ports
- **Not full-stack on Vercel:** `api/server.js` embeds Analyzer for partial serverless; Form Forge/Bridge need durable process + disk (README documents Vercel limitations)
- Durable volume for Analyze session + Filter lists (`PDA_DATA_ROOT`, default `/app/pda-data` in Docker)

## Process Topology

```
Browser → :3000 Distress OS (server.js)
            ├─ static public/*  (Logo, Command, Heat, Bridge/Filter, Collect, Vault)
            ├─ /api/bridge/*    (Filter pipeline in-process)
            ├─ /forge/*         → proxy/spawn Form Forge :8787 (Python)
            └─ /analyzer/*      → proxy/spawn Property Analyzer :3456 (Node)
                                  or embedded in-process (Vercel)
```

---

*Stack analysis: 2026-07-09*
*Update after major dependency changes*
