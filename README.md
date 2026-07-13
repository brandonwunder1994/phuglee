# Distress OS

Unified shell for **Form Forge** (public-records form filling & tracking) and **Property Distress Analyzer** (AI lead screening). Both tools run on their original engines — Phuglee adds a Logo Page, command hub, reverse proxy, and an optional data bridge.

## Requirements

- **Node.js** 20+ (24 recommended)
- **Python** 3.12+ with Form Forge dependencies (`pip install -r requirements.txt`)
- **Windows** (launch scripts are `.bat`; server runs on any OS with Node)
- Form Forge: `modules/form-forge` (included in this repo)
- Property Analyzer: `modules/property-analyzer` (included in this repo)

## Quick start (local)

```powershell
cd C:\Users\brand\Projects\distress-os
```

**Option A — double-click**

```
launch-distressos.bat
```

**Option B — terminal**

```powershell
npm start
```

Opens the **Command Hub** at http://127.0.0.1:3000/heat

Distress OS auto-starts Form Forge (`:8787`) and Property Analyzer (`:3456`) if they are not already running.

## URLs

| Page | URL |
|------|-----|
| Logo Page | http://127.0.0.1:3000/ |
| Command Hub | http://127.0.0.1:3000/heat |
| Form Forge (proxied) | http://127.0.0.1:3000/forge/ |
| Property Analyzer (proxied) | http://127.0.0.1:3000/analyzer/ |
| Data Bridge (optional) | http://127.0.0.1:3000/bridge |
| Health check | http://127.0.0.1:3000/api/health |

**Direct access (still works, unchanged):**

- Form Forge: http://127.0.0.1:8787
- Property Analyzer: http://distressos.local:3456 (run `setup-distressos-url.bat` in the analyzer repo once)

## Module setup (first-time)

Everything is in one repo. Install dependencies once:

```powershell
npm install
pip install -r modules/form-forge/requirements.txt
cd modules/property-analyzer && npm install && cd ../..
```

See `modules/README.md` for path overrides (`FORM_FORGE_PATH`, `PROPERTY_ANALYZER_PATH`).

## User guide

### 1. Start Distress OS

Run `launch-distressos.bat`. The hub opens with live status pills for Forge and Analyzer (green = running).

### 2. Collect property data — Form Forge

1. From the hub, click **Launch Form Forge** (or nav → Form Forge)
2. Use **Records Desk** to fill FOIA PDF forms
3. Use **City Tracker** to log submissions and upload city response lists (Excel/CSV)
4. Use **Coverage Map** for geographic coverage

Form Forge behaves exactly as it did before integration.

### 3. Analyze leads — Property Analyzer

1. From the hub, click **Launch Property Analyzer**
2. Upload an Excel lead list (First Name, Last Name, Phone, Email, Street Address, City, State, Postal Code)
3. Run AI scan, review tiers, export dial-ready Excel

Property Analyzer behaves exactly as it did before integration.

### 4. Optional shortcut — Data Bridge

If you uploaded a city response spreadsheet in Form Forge City Tracker:

1. Open **Data Bridge** from the hub or nav
2. Select the **city** and **spreadsheet file**
3. Confirm **column mapping** (auto-detected; adjust if headers differ)
4. **Download Analyzer Excel**
5. Open Property Analyzer and upload the downloaded file as usual

Manual copy/paste or export between tools still works — the bridge is optional.

### Typical workflow

```
Form Forge (FOIA requests)
    → City responds with property list (Excel)
    → Upload in City Tracker
    → [Optional] Data Bridge → download Analyzer-ready Excel
    → Property Analyzer → scan, classify, export dial-ready leads
```

## Verification

**Distress OS unit tests:**

```powershell
npm test
```

**Full regression sweep (all three projects):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

**Individual module tests:**

```powershell
# Form Forge
cd modules\form-forge
python scripts\gsd.py verify

# Property Analyzer
cd modules\property-analyzer
npm test
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `DISTRESS_OS_PORT` | `3000` | Shell server port |
| `DISTRESS_OS_HOST` | `127.0.0.1` | Bind address |
| `FORM_FORGE_PORT` | `8787` | Form Forge upstream |
| `PROPERTY_ANALYZER_PORT` | `3456` | Analyzer upstream |
| `FORM_FORGE_PATH` | `modules/form-forge` | Form Forge root |
| `PROPERTY_ANALYZER_PATH` | `modules/property-analyzer` | Analyzer root |
| `PHUGLEE_AUTH_DISABLED` | off (local: set `1` to skip login) | Skip shell login locally. Production always requires login unless `PHUGLEE_AUTH_OPEN=1`. |
| `PHUGLEE_AUTH_OPEN` | `0` | Temporary open staging (production only escape hatch). |
| `PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD` | _(empty)_ | Bootstrap `admin` password injected via `/js/auth-config.js`. |
| `PHUGLEE_SESSION_SECRET` | derived / local fallback | HMAC secret for HttpOnly `phuglee_session` cookie (`POST /api/auth/login`). Set explicitly in production. |

**Auth session (interim):** Successful login also calls `POST /api/auth/login`, which sets an HttpOnly signed cookie. Bridge scope prefers that cookie over spoofable `X-Phuglee-User` when present. Local `PHUGLEE_AUTH_DISABLED=1` keeps header-only behavior.

**Health:** `GET /api/health` always returns 200 (Railway shallow check). `GET /api/health/deep` returns non-200 if Form Forge or Property Analyzer are down. Optional: `scripts\verify-live.ps1 -Deep` (or `VERIFY_DEEP=1`).

**Docker OCR:** Production image installs `tesseract-ocr` for scanned PDF OCR. Dockerfile defaults `PHUGLEE_AUTH_DISABLED=0`; for local docker without login use `-e NODE_ENV=development -e PHUGLEE_AUTH_DISABLED=1`.

Login on the site: set `PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD` in your environment (injected via `/js/auth-config.js`). Username: `admin`.

Locally, `npm start` already launches everything as **one command** (shell auto-starts Forge + Analyzer on internal ports; browser only uses `:3000`).

## Share with someone (public URL)

**Vercel cannot run Phuglee.** The app needs Python (Form Forge), long-running Node (Analyzer), file uploads, and persistent disk — Vercel only supports short serverless functions and static files. A Vercel link would show shell pages but **Form Forge, Analyzer, and Bridge would break.**

Use **Railway** (or Render) instead — one deploy, one URL, full app:

1. Push repo: https://github.com/brandonwunder1994/phuglee
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub → select `phuglee`
3. Railway detects `Dockerfile` automatically
4. Add environment variables in Railway → **Variables** (required for full functionality):
   - `MAPS_API_KEY` — Google Maps (Analyzer Street View + satellite imagery)
   - `GEMINI_API_KEY` — Gemini (AI distress scan)
   - `PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD` — admin login
   - `PHUGLEE_SESSION_SECRET` — HMAC cookie secret (recommended)
   Without Maps/Gemini keys, Property Analyzer loads but cannot scan leads.
5. Deploy → open the generated URL (e.g. `https://phuglee-production.up.railway.app`)
6. After deploy, confirm shallow health `/api/health` (always 200 for Railway) and optionally `/api/health/deep` for module status.

## Deployment (local production)

Distress OS is designed as a **local desktop operator stack**, with optional single-container cloud deploy via Docker.

### Daily use

1. Pin `launch-distressos.bat` to desktop or Taskbar
2. Ensure Property Analyzer `.env` has `MAPS_API_KEY` and `GEMINI_API_KEY`
3. Ensure Form Forge `pip install -r requirements.txt` is current
4. Run `launch-distressos.bat` — all three services start together

### Auto-start on login (optional)

1. Press `Win+R` → `shell:startup`
2. Create a shortcut to `C:\Users\brand\Projects\distress-os\launch-distressos.bat`
3. Shortcut → Properties → Run: **Minimized** (optional)

### Hostname (optional, for Analyzer direct URL)

In the Property Analyzer repo, run once as Administrator:

```
setup-distressos-url.bat
```

This adds `distressos.local` → `127.0.0.1` to the Windows hosts file.

### Selling / packaging later

- Module boundaries are clean: `modules/form-forge` and `modules/property-analyzer` are self-contained subtrees in one repo
- Distress OS shell is MIT-ready standalone code under `lib/`, `public/`, `server.js`
- No modifications were made to tool business logic — safe to version and license separately
- Cloud deployment would require auth, HTTPS reverse proxy, and removing localhost-only assumptions (out of current scope)

## Architecture

```
distress-os/          Port 3000 — logo page, hub, proxy, bridge
├── modules/
│   ├── form-forge/         → Form Forge Python app (:8787)
│   └── property-analyzer/  → Property Analyzer Node app (:3456)
├── lib/                    Proxy, rewrite, bridge schema
└── public/                 Shell UI (logo page, hub, bridge)
```

Proxied paths rewrite HTML/JS/CSS root URLs so `/api/*` and `/static/*` resolve under `/forge/` or `/analyzer/` without modifying either tool's source code.

## Known pre-existing issues (logged, not fixed)

- Form Forge: `tests/test_email_only_audit_sync.py` — 1 failing test (`texas-cedar-park` pending queue). Unrelated to Distress OS.

## Version

Distress OS **1.0.0** — Phases 1–6 complete.