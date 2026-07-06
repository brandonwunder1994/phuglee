# Phase 25 Plan: Auth Flows

**Requirements:** BRAND-15–17  
**Repo:** `distress-os`  
**Date:** 2026-07-06

## Goal

Auth modal matches Phuglee signature brand — phuglee panels, orange CTAs, gold success pulse. All `auth.js` hooks preserved.

## Tasks

1. Retokenize `auth.css` to `--phuglee-*` palette
2. Pricing cards compose `phuglee-panel-featured` / `phuglee-panel-exclusive`
3. Success overlay logo-gold pulse
4. WCAG AA on labels/errors; `prefers-reduced-motion`
5. `npm test` green