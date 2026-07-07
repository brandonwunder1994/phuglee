# Stack

**Analysis date:** 2026-07-05

## Runtime

- Python 3.12
- Flask 3.x (local server, port 8787, localhost only)

## Core libraries

| Library | Use |
|---------|-----|
| pymupdf (fitz) | PDF rendering, field detection, save |
| pypdf | PDF reading (raw upload validation) |
| pandas + openpyxl | Excel portal registry import/export |
| google-api-python-client | Gmail send with attachments |

## Frontend

- Vanilla HTML/CSS/JS (no bundler)
- MapLibre GL (vendored in `static/vendor/`)
- Shared utilities: `portal-shared.js`

## Data storage

- JSON files (`portal-registry.json`, queues, manifests)
- JSONL append-only log (`submission-log.jsonl`)
- PDF files on disk under `forms/`
- Atomic writes via `data_guard.py`

## Tooling

- pytest (89 tests)
- Playwright (readonly UI audits)
- GSD wrapper: `scripts/gsd.py`