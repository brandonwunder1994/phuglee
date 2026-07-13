# Distress OS Full Site Audit — Remediation Design

**Date:** 2026-07-13  
**Status:** Approved for planning (user: do all phases; fill any canvas gaps)  
**Constraint:** Never wipe filter lists, bridge brain, Form Forge data, or analyzer user sessions.

## Goal

Ship every improvement from the full-site audit canvas across Speed, Ease of use, Accuracy, UX, Errors, Add-ons, and Cleanup — without hurting Collect → Filter → Analyze functionality.

## What was missing from the original phase blurbs

The canvas findings listed **47 items**. The original Phase 0–6 one-liners omitted several. Those are now **in-scope** below (marked **WAS GAP**).

## Coverage matrix (every canvas finding → phase)

### Phase 0 — Errors & trust (ship first)

| # | Finding | Notes |
|---|---------|-------|
| 0.1 | Analyze UTF-8 mojibake + `<main id="main">` landmark | |
| 0.2 | Mask Geocodio `apiKey` in usage API | |
| 0.3 | Gate list delete/clear/delete-many behind auth (or session) | Interim until Phase 5 full auth |
| 0.4 | Fix `collect-city-count` ID mismatch | |
| 0.5 | Fix analyzer `purge-import-source` over-match | |
| 0.6 | Remove hardcoded admin password from source (env/config) | |
| 0.7 | **WAS GAP** Fix or remove `shell.js` polling of missing `#status-forge` / `#status-analyzer` | |
| 0.8 | **WAS GAP** Fix analyzer `landing.html` links (`/` → `/analyzer/`) | |
| 0.9 | **WAS GAP** Video asset 404 handling (graceful fallback if `/videos/*.mp4` missing) | |

### Phase 1 — Speed

| # | Finding | Notes |
|---|---------|-------|
| 1.1 | Add `defer` to all app-page scripts (match homepage) | |
| 1.2 | Lazy-load homepage pipeline videos | |
| 1.3 | Consolidate shell CSS per page archetype (reduce round trips) | |
| 1.4 | Cap `POST /api/bridge/process` body size | **WAS GAP** |
| 1.5 | Stream or chunk proxy responses (stop full buffer) | **WAS GAP** |
| 1.6 | Self-host Google Fonts (or `font-display` + preload) | **WAS GAP** |
| 1.7 | Lazy-gate below-fold homepage work (carousel / map already partial) | **WAS GAP** |
| 1.8 | Document OCR CPU cost; queue/worker only if needed after caps | **WAS GAP** (light; full worker = Phase 5 if still hot) |

### Phase 2 — Ease of use

| # | Finding | Notes |
|---|---------|-------|
| 2.1 | Align naming: Filter UI ↔ `/filter` route (keep `/bridge` redirect) | |
| 2.2 | One canonical How It Works (dedupe `/heat`, homepage, `home-guide.js`) | |
| 2.3 | Collect wizard: confirmation step + breadcrumb back from Forge | |
| 2.4 | Remove emoji from Collect workflow choices (match rest of UI) | |
| 2.5 | Clarify Home (`/`) vs Dashboard (`/command`) for returning users | **WAS GAP** |
| 2.6 | Surface City Tracker / Form Forge in nav (not only palette) | **WAS GAP** |
| 2.7 | Demote Vault in nav until real product exists | **WAS GAP** |
| 2.8 | Filter desk: show why upload is locked until city+type | **WAS GAP** (steps clickable → Phase 4) |

### Phase 3 — Accuracy defaults

| # | Finding | Notes |
|---|---------|-------|
| 3.1 | Make already-imported / duplicate filter clear in UI (default or loud opt-in) | |
| 3.2 | Operator-facing docs for type-column confirm + fingerprint clear | |
| 3.3 | Type-column wrong-confirm recovery (admin clear / warning) | **WAS GAP** |
| 3.4 | Review fuzzy import threshold (0.92) — reduce false drops | **WAS GAP** |
| 3.5 | Re-validate `/attach` rows (or re-tag server-side) | **WAS GAP** |
| 3.6 | Surface Forge bundled-registry fallback when live Forge down | **WAS GAP** |
| 3.7 | Document OCR 12-page cap in UI/errors | **WAS GAP** |
| 3.8 | Keep gold fixtures green; add fixture when new city layout fails | ongoing |

### Phase 4 — UX polish

| # | Finding | Notes |
|---|---------|-------|
| 4.1 | Clickable Filter pipeline steps (back-navigation) | |
| 4.2 | Fix unexplained “Step 02 A” labeling | |
| 4.3 | Soften victory-strip tone (“DELETE THE JUNK”) | |
| 4.4 | Mobile nav (hamburger or clearer wrap) + command-palette mobile trigger | |
| 4.5 | Filter table mobile scroll affordance | |
| 4.6 | Homepage → app shell transition less jarring | **WAS GAP** |
| 4.7 | Analyze dual chrome: consistent embedded vs standalone | **WAS GAP** |
| 4.8 | Consolidate button classes toward phuglee tokens | **WAS GAP** |
| 4.9 | Better Geocodio job error surfacing (not console-only) | **WAS GAP** |
| 4.10 | Improve auth redirect UX on app pages | **WAS GAP** |

### Phase 5 — Add-ons / upgrades

| # | Finding | Notes |
|---|---------|-------|
| 5.1 | Server-side auth session (JWT/cookie); bind user server-side | |
| 5.2 | Docker/Railway OCR (Tesseract) if production needs scanned PDFs | |
| 5.3 | Deep health `/api/health/deep` + Railway + `verify-live.ps1` | **WAS GAP** in blurbs |
| 5.4 | Filter scrub cancel + rough ETA | **WAS GAP** in blurbs |
| 5.5 | Operator first-run checklist on `/command` | **WAS GAP** in blurbs |
| 5.6 | Real Vault product (or keep demoted until Max plan) | gated by product decision |
| 5.7 | Hash passwords; stop plaintext localStorage passwords | with 5.1 |
| 5.8 | Dockerfile default `PHUGLEE_AUTH_DISABLED` aligned with prod | with 5.1 |

### Phase 6 — Cleanup & tech debt

| # | Finding | Notes |
|---|---------|-------|
| 6.1 | Remove duplicate `public/js/coverage/*.css` | |
| 6.2 | Delete or wire dead CSS (`home-premium.css`, unused `heat.css`) | |
| 6.3 | Split `bridge.js` / touch-points in `bridge-api.js` when safe | |
| 6.4 | Sync `package.json` version with health `1.1.0` | **WAS GAP** |
| 6.5 | Video asset existence test (or document gitignore) | **WAS GAP** |
| 6.6 | Fix Form Forge `texas-cedar-park` failing test | **WAS GAP** |
| 6.7 | Add minimal E2E smoke + optional perf budget later | **WAS GAP** |
| 6.8 | Structured bridge logs (`requestId`, city, duration) | **WAS GAP** from backend audit |

## Non-goals

- Do not redesign the Filter engine algorithm from scratch.
- Do not wipe or migrate runtime data stores.
- Do not force-push or change git config.
- Do not build Vault inventory unless product copy/plan is confirmed in Phase 5.

## Success criteria

- Every row in the coverage matrix has a done checkbox in the implementation plan.
- Site stays live (`scripts/verify-live.ps1` green) after each phase.
- Gold accuracy tests still pass after Phase 3.
- No plaintext Geocodio keys or hardcoded admin password in client-facing responses/source after Phase 0 / 5.

## Execution order

0 → 1 → 2 → 3 → 4 → 5 → 6 (recommended). Phases 2–4 can overlap after Phase 0–1 if needed; Phase 5 depends on Phase 0 interim auth gates.
