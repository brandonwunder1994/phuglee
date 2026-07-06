# Phase 22 Plan: Phuglee Design System

**Requirements:** BRAND-01–06  
**Repo:** `distress-os`  
**Date:** 2026-07-06

## Goal

Establish logo-ground-truth `--phuglee-*` tokens as the single source of truth, ship reusable component classes, and create the vanilla SVG logo injector + pattern tile. No page visual rebuilds in this phase — foundation only.

## Tasks

1. **tokens.css** — Add full `--phuglee-*` palette; alias `--ember`, `--flame`, `--heat-core`, `--cream`, `--stone`, `--logo-*` to phuglee values
2. **phuglee-components.css** — Buttons, panels, inputs, modals, eyebrows, pattern bg utility
3. **phuglee-logo.js** — Fetch-once SVG injector for `[data-phuglee-logo]` elements
4. **phuglee-pattern.svg** — Tileable deconstructed logo paths
5. **HTML** — Link `phuglee-components.css` after `premium-components.css` on all 4 shell pages
6. **Tests** — `npm test` must pass (16/16)

## Files touched

| File | Action |
|------|--------|
| `public/css/tokens.css` | Edit |
| `public/css/phuglee-components.css` | Create |
| `public/js/phuglee-logo.js` | Create |
| `public/images/phuglee-pattern.svg` | Create |
| `public/index.html` | Link CSS |
| `public/heat.html` | Link CSS |
| `public/collect.html` | Link CSS |
| `public/bridge.html` | Link CSS |

## Success criteria

- [ ] `--phuglee-orange` is `#E58435`; `--ember` resolves to it
- [ ] `.phuglee-btn-primary`, `.phuglee-panel`, `.phuglee-input` export correctly
- [ ] `PhugleeLogo.inject()` available globally
- [ ] Pattern tile loads at `/images/phuglee-pattern.svg`
- [ ] `npm test` green

## Out of scope (later phases)

- rewrite.js phuglee injection (Phase 23)
- Home page retokenize (Phase 24)
- Replacing premium-* class usage sitewide