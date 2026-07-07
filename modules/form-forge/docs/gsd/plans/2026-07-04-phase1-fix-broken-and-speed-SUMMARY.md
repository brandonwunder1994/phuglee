# Phase 1 Summary — Fix Broken + Speed

> **Status:** `complete` · **Closed:** 2026-07-04

## Shipped

| Task | Result |
|------|--------|
| 1.1 Batch apology queue | `load_apology_queue()` once per `/api/portal/cities` |
| 1.2 Turnaround index | `build_events_by_city()` — one log scan for all cities |
| 1.3 Filter desync | Auto-select first match or clear detail when filtered out |
| 1.4 Request PDFs skip/progress | Skipped cities stay in sidebar as done; month-aware progress bar |
| 1.5 Polish | `escHtml` in list, `PDFs` label, CSS v16 sync |
| 1.6 Audit scripts | Dynamic apology fixture from queue |

## Verification

```
audit_portal_readonly.py     → 0 issues
audit_portal_browser_readonly.py → passed (holbrook + avondale)
check_request_pdfs_page.py   → PASS
/api/portal/cities           → ~40ms (was ~1083ms)
```

## Files changed

- `review_portal/apology_email.py`
- `review_portal/submission_tracker.py`
- `review_portal/app.py`
- `review_portal/static/portal.js`, `portal.html`
- `review_portal/static/request-pdfs.js`, `request-pdfs.html`
- `scripts/audit_portal_readonly.py`
- `scripts/audit_portal_browser_readonly.py`
- `scripts/check_request_pdfs_page.py`

## Next

**Phase 2:** Filter UX polish — result count, clear filters, quick chips