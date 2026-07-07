# Phase 5 — Quality & Accessibility

> **Milestone:** M4 · **Status:** `complete`
> **Depends on:** Phases 1–4
> **Goal:** Keyboard navigation, shareable filter URLs, auto-dismiss toasts, expanded Playwright E2E.

## Tasks

| # | Task | Files | Done |
|---|------|-------|------|
| 5.1 | `showToast` in `portal-shared.js` + CSS | `portal-shared.js`, `portal.css`, `request-pdfs.css` | [x] |
| 5.2 | Portal uses toasts; keep `action-msg` as fallback | `portal.js` | [x] |
| 5.3 | Keyboard nav (↑↓ Home End) on city list | `portal.html`, `portal.js`, `portal.css` | [x] |
| 5.4 | URL-persisted filters (`q`, `state`, `pathway`, `cv`, `quick`, `city`) | `portal.js` | [x] |
| 5.5 | E2E: keyboard nav + URL filters + toast wiring | `scripts/audit_portal_browser_readonly.py`, `scripts/audit_portal_readonly.py` | [x] |
| 5.6 | Request PDFs uses shared toast | `request-pdfs.js` | [x] |

## URL params

| Param | Maps to |
|-------|---------|
| `city` | Selected city id (existing) |
| `q` | Search text |
| `state` | State filter |
| `pathway` | Pathway filter value |
| `cv` | CV response filter |
| `quick` | Comma-separated chips: `apology`, `wrong_email`, `cv_pending`, `pdf`, `online`, `email_only`, `no_contact` |

## Verification

```powershell
cd C:\Users\brand\Projects\city-list-requests
python scripts/audit_portal_readonly.py
python scripts/audit_portal_browser_readonly.py
python scripts/check_request_pdfs_page.py
```

**Exit:** Arrow keys move selection; `?quick=apology` filters list; toasts auto-dismiss; audits pass.