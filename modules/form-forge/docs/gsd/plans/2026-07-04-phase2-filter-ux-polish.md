# Phase 2 — Filter UX Polish

> **Milestone:** M4 · **Status:** `complete`
> **Depends on:** Phase 1
> **Goal:** Make filtering fast, obvious, and easy to reset.

## Tasks

| # | Task | Files | Done |
|---|------|-------|------|
| 2.1 | Result count `"N of 556 cities"` in toolbar | `portal.html`, `portal.js`, `portal.css` | [x] |
| 2.2 | Debounce search input (200ms) | `portal.js` | [x] |
| 2.3 | Clear filters button + empty-state link | `portal.html`, `portal.js`, `portal.css` | [x] |
| 2.4 | Active filter count badge on Filter button | `portal.js`, `portal.css` | [x] |
| 2.5 | Quick filter chips: Apology · CV Pending · PDF · Online | `portal.html`, `portal.js`, `portal.css` | [x] |
| 2.6 | Browser audit checks for count + clear | `scripts/audit_portal_browser_readonly.py` | [x] |

## Verification

```powershell
cd C:\Users\brand\Projects\city-list-requests
python scripts/audit_portal_readonly.py
python scripts/audit_portal_browser_readonly.py
```

**Exit:** Count updates on search; clear resets all; chips toggle; audits pass.