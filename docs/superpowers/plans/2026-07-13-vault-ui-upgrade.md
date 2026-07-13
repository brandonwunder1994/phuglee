# Plan — Vault UI Upgrade (Phases 1–3)

**Date:** 2026-07-13  
**Surface:** `/vault`  
**Goal:** PropStream-grade dial desk with property imagery, workflow actions, and power-user UX.

## Phase 1 — Imagery

- Drawer hero: `streetViewUrl` / `photos[0]` with skeleton + fallback
- Satellite toggle for land leads (`satelliteUrl` from analyzer sync)
- Table thumbnail column (48×36 cached imagery)
- Lightbox on hero click

## Phase 2 — Dial desk workflow

- Sticky action bar: Call, Maps, Copy, Open in Analyze, Favorite
- Prev/Next lead navigation in drawer (within current result set)
- Live signal chips from `/api/leads/meta.signals`
- City dropdown cascades from selected state
- Favorites-only + Has-phone filters
- Expanded KPIs (WM, Land, With phone, With imagery)
- Sticky bulk bar: export / favorite / clear selection
- Saved filter presets (per-user overlays)

## Phase 3 — Premium polish

- Card/grid view toggle (photo-forward browsing)
- Infinite scroll (append pages on scroll)
- Keyboard: `j`/`k` prev-next in drawer, `/` focus search, `Esc` close
- Distress tier badge (1–10 color scale)
- Comps section when data exists
- Sync status strip in hero
- Loading skeleton rows

## Backend

- `satelliteUrl` on LeadRecord + analyzer-sync
- Index fields: `thumbUrl`, `distressTier`, `hasPhone`, `hasImagery`
- Query: `favoritesOnly`, `hasPhone`
- Meta: `withPhone`, `withImagery`, `citiesByState`, sync stats
- `POST /api/leads/user/favorites/bulk`

## Files

| File | Changes |
|------|---------|
| `lib/leads-platform/schema.js` | satelliteUrl |
| `lib/leads-platform/analyzer-sync.js` | satellite mapping |
| `lib/leads-platform/store.js` | index + query + meta |
| `lib/leads-platform/api.js` | filters, bulk fav, meta sync |
| `public/vault.html` | bulk bar, lightbox, view toggle, filters |
| `public/css/vault.css` | drawer hero, cards, bulk bar, skeleton |
| `public/js/vault-app.js` | full desk UX |
| `modules/property-analyzer/public/js/app.js` | `?focusAddress=` deep link |

## Verify

```bash
node --test tests/leads-platform.test.js
powershell -File scripts/verify-live.ps1
```
