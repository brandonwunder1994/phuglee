# Phase 24 Plan: Home — Signature Rebuild

**Requirements:** BRAND-11–14  
**Repo:** `distress-os`  
**Date:** 2026-07-06

## Goal

`/` becomes the signature Phuglee brand moment — logo-ground-truth palette, pattern layer, SVG injector, motion stagger, premium CTA.

## Tasks

1. `index.html` — OG tags, pattern layer, `phuglee-logo.js`, motion reveal, `phuglee-btn-primary` CTA (keep `#btn-heat`)
2. `landing.css` — retokenize to `--phuglee-*`, earth vignette, orange atmosphere
3. Logo slot sizing — no CLS, hero scale preserved
4. `npm test` green

## Preserve

- `auth.js` hooks: `#btn-heat`, modal behavior unchanged