# Phase 4 — Performance & Architecture

> **Milestone:** M4 · **Status:** `complete`
> **Depends on:** Phases 1–3
> **Goal:** Smaller initial payload, detail on demand, shared JS utilities.

## Tasks

| # | Task | Files | Done |
|---|------|-------|------|
| 4.1 | `portal_city_summary_payload` + `/api/portal/cities/summary` | `submission_tracker.py`, `app.py` | [x] |
| 4.2 | Portal loads summary list; fetches `/api/portal/city/{id}` on select | `portal.js`, `portal.html` | [x] |
| 4.3 | Detail cache; refresh/actions merge full city back | `portal.js` | [x] |
| 4.4 | Extract `portal-shared.js` (utils + postJson) | `portal-shared.js`, `portal.js`, `request-pdfs.js`, HTML | [x] |
| 4.5 | Audit summary endpoint + detail fetch | `scripts/audit_portal_readonly.py` | [x] |

## Verification

```powershell
cd C:\Users\brand\Projects\city-list-requests
python scripts/audit_portal_readonly.py
python scripts/audit_portal_browser_readonly.py
python scripts/check_request_pdfs_page.py
```

**Exit:** Summary API < full cities payload size; detail loads on click; audits pass.