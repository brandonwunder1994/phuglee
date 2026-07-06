# Phase 23 Plan: Global Chrome & Motion

**Requirements:** BRAND-07–10  
**Repo:** `distress-os`  
**Date:** 2026-07-06

## Goal

Floating Phuglee brand bar (nav + footer), orchestrated stagger motion, and proxy injection so Forge/Analyzer inherit the signature chrome.

## Tasks

1. Retokenize `shell-nav.css` — black glass, cream logo glow, orange active pill, underline
2. Create `phuglee-motion.js` + reveal CSS in `phuglee-components.css`
3. Extend `shell-nav.js` — mount global footer on shell + proxied pages
4. Update `lib/rewrite.js` — inject `phuglee-components.css`, `phuglee-motion.js`, footer mount
5. Link `phuglee-motion.js` on shell pages
6. Update `rewrite.test.js` for phuglee injection
7. `npm test` green

## Success criteria

- Nav active state uses `--phuglee-orange` pill
- `[data-phuglee-reveal]` staggers children on scroll
- `/forge/*` and `/analyzer/*` receive phuglee CSS + motion via rewrite
- Footer renders on all non-login pages