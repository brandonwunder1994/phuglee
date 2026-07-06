# Phase 27: Form Forge — Signature Pass

**Requirements:** BRAND-21–23  
**Repo:** `city-list-requests`  
**Status:** complete

## Checklist

- [x] Create `review_portal/static/phuglee-forge.css` (replaces `premium-forge.css`)
- [x] Copy `phuglee-pattern.svg` to forge static
- [x] Link on all 7 HTML pages
- [x] Records Desk — hero strip + pattern, orange save CTA
- [x] City Tracker — taupe row hover, logo-palette status pills
- [x] Coverage Map — dark glass controls, orange active layer
- [x] Request PDFs — wear-bordered preview, phuglee send CTA
- [x] Submit Portals — step wizard phuglee-panels
- [x] Email-only — premium composer inset
- [x] Portal Errors — danger rows + mascot empty state watermark
- [x] `python scripts/gsd.py test` — 121/122 pass (pre-existing `texas-cedar-park` audit sync failure)
- [x] `python scripts/gsd.py verify` — lint-imports pre-existing exception documented below

## Pre-existing verify exceptions (unchanged by Phase 27)

| Step | Issue |
|------|-------|
| `lint-imports` | `tests/test_email_only.py` unused `patch` import; `tests/test_email_only_audit_sync.py` unused `city` variable |
| `test` | `test_pending_queue_includes_audit_cities` — `texas-cedar-park` not in pending queue |

## Success criteria

All 7 Forge pages feel like Distress OS brand family; no paper-grain remnants when embedded.