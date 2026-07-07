# M6 — Unified Heat Design (Distress OS v1.1)

> **Status:** `in_progress`  
> **Created:** 2026-07-06  
> **Parent milestone:** `distress-os` M2 / v1.1  
> **Depends on:** M1–M5 (all Form Forge features shipped)

---

## Goal

Reskin Form Forge from stamp-theme (gold/Instrument Serif) to Distress OS Command Hub Heat aesthetic. Adopt global Distress OS navigation injected via proxy.

## Form Forge phases (in parent roadmap)

| Phase | Name | Status |
|-------|------|--------|
| 9 | Tokens & Atmosphere | pending |
| 10 | All Surfaces (7 pages) | pending |

## Pages in scope

- Records Desk (`index.html`)
- City Tracker (`portal.html`)
- Coverage Map (`map.html`)
- Request PDFs (`request-pdfs.html`)
- Submit Portals (`submit-portals.html`)
- Email-only Requests (`email-only-requests.html`)
- Portal Errors (`portal-errors.html`)

## CSS files

- `style.css` — foundation tokens + layout
- `portal.css`, `map.css`, `request-pdfs.css`, `submit-portals.css`, `email-only-requests.css`, `portal-errors.css`
- `settings-menu.css` — harmonize with Heat

## Verification

```bash
python scripts/gsd.py verify
```

## Next step

Wait for distress-os Phase 8 (global nav), then `/gsd:plan-phase 9` in parent project