# Concerns

**Analysis date:** 2026-07-05

## Resolved (audit Phases 1–3)

- ~~Apology button logic split between pending queue and city tracker~~ → unified
- ~~Raw exception strings leaked to API clients~~ → `api_errors.py`
- ~~E2E hit stale live server on port 8787~~ → embedded test server

## Active / data

| Item | Severity | Notes |
|------|----------|-------|
| Ohio Sidney missing contact email | Medium | Last apology queued; blocked until email added in City Tracker |
| 6 stale log IDs (Alabama) | Low | Historical log entries not in manifest |
| Large untracked git state | Medium | Core modules/tests recently added; needs initial commit |

## Architecture limits

- **JSON-on-disk** — fine for 554 cities; will strain at 10k+ without SQLite migration
- **No API auth** — acceptable for localhost-only; add token if binding beyond 127.0.0.1
- **Circular import guards** — `apology_email` ↔ `submission_tracker` use inline imports by design
- **Playwright browser audit** — still requires separate live server (unlike `check_request_pdfs_page.py`)

## Tech debt (low priority)

- `ruff` not in dev deps — lint is syntax-only via compileall
- E2E tests not in pytest collection
- `audit_portal_browser_readonly.py` should adopt embedded server pattern

## Performance (healthy)

- Summary/cities payload ratio: **21.6%** (budget: <50%)
- 554 cities, 111 completed PDFs, integrity OK