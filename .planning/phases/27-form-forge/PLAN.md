# Phase 27 Plan: Form Forge — Signature Pass

**Requirements:** BRAND-21–23  
**Repo:** `city-list-requests`  
**Date:** 2026-07-06

## Goal

All 7 Form Forge pages elevated to Phuglee signature brand via `phuglee-forge.css`.

## Tasks

1. Create `review_portal/static/phuglee-forge.css` — retokenize premium-forge layer
2. Copy `phuglee-pattern.svg` to forge static for standalone + proxied use
3. Link on all 7 HTML pages (replace `premium-forge.css`)
4. Per-page polish: Records Desk hero, City Tracker pills, Map controls, PDF preview, portals wizard, email composer, portal errors
5. `python scripts/gsd.py verify` — document lint-imports exception if pre-existing

## Success criteria

All 7 Forge pages feel like Distress OS brand family; no paper-grain remnants when embedded.