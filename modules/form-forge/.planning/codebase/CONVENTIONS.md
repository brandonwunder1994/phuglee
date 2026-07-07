# Conventions

**Analysis date:** 2026-07-05

## Python

- `from __future__ import annotations` on all modules
- Domain errors as `ValueError` subclasses (`ApologyEmailError`, `EmailWorkflowError`, etc.)
- User-facing error strings defined as constants in `portal_registry.py` (`WRONG_CONTACT_EMAIL_MESSAGE`, etc.)
- JSON writes go through `data_guard.atomic_write_text` / `write_json_atomic`
- City IDs: `{state-slug}-{city-slug}` via `slugify()`

## API

- JSON responses: `{"ok": true, ...}` on success, `{"error": "..."}` on failure
- Intentional 400s expose business messages; unexpected 500s sanitized via `api_errors.py`
- File serving via `/api/file/<path>` with `_safe_path()` traversal guard

## Frontend

- Cache-bust static assets with `?v=N` query params in HTML
- Shared POST helper: `PortalShared.postJson()`
- City Tracker: summary list → detail fetch on select → merge back into cache

## Testing

- unittest + pytest compatible (`tests/test_*.py`)
- Temp files for queue/registry isolation in tests
- `unittest.mock.patch` for Gmail and registry I/O

## Verification

Always use GSD wrapper, not raw commands:

```powershell
python scripts/gsd.py test
python scripts/gsd.py audit
```