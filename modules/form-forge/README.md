# The Form Forge

Local Flask app for filling city FOIA PDF forms, tracking portal submissions, emailing completed requests, and managing coverage across 554+ cities.

## Quick start

```powershell
cd C:\Users\brand\Projects\city-list-requests
pip install -r requirements.txt
python run_review_portal.py
```

Open **http://127.0.0.1:8787**

## GSD verification (run before merging)

```powershell
python scripts/gsd.py test          # unit tests (89)
python scripts/gsd.py audit         # API + UI readonly audits
python scripts/gsd.py perf          # payload size budget check
python scripts/gsd.py verify-data   # PDF/manifest integrity
python scripts/gsd.py structure     # key paths exist
python scripts/gsd.py verify        # full sweep (all of the above)
```

## Project layout

| Path | Purpose |
|------|---------|
| `review_portal/` | Flask app, business logic, static UI |
| `data/` | Portal registry, submission log, queues, map bootstrap |
| `forms/` | Raw, user-filled, and preview PDFs |
| `config/` | Settings and signature image |
| `scripts/` | Import, audit, backup, and GSD wrapper |
| `tests/` | Pytest suite |
| `docs/gsd/` | Milestone plans and execution history |
| `.planning/codebase/` | Architecture reference (GSD map) |

## Main workflows

1. **Records Desk** (`/`) — Fill PDF forms per city
2. **City Tracker** (`/portal`) — Track submissions, responses, email status
3. **Request PDFs** (`/portal/request-pdfs`) — Monthly PDF email send queue
4. **Coverage Map** (`/map`) — Geographic portal/completed coverage

## Data sources

- **Portal registry:** `data/portal-registry.json` (imported from Excel)
- **Excel source:** `C:\Users\brand\Desktop\Online City Portal Forms.xlsx`
- **Gmail:** OAuth credentials in project config (see `gmail_client.py`)

## Dev dependencies

```powershell
pip install -r requirements-dev.txt
```

## More detail

See `.planning/codebase/` for stack, architecture, conventions, and known concerns.