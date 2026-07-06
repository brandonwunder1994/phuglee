# Phase 23: Global Chrome & Motion

**Requirements:** BRAND-07–10  
**Repo:** `distress-os`  
**Status:** complete

## Checklist

- [x] Retokenize `shell-nav.css` — black glass, cream logo, orange active pill
- [x] Create `public/js/phuglee-motion.js` — stagger fade-up via IntersectionObserver
- [x] Update `lib/rewrite.js` — inject phuglee CSS + motion on `/forge/*` and `/analyzer/*`
- [x] Add global footer brand bar (earth-tone vignette, taupe meta, orange link hover)
- [x] `prefers-reduced-motion` disables stagger in motion.js
- [x] Update `tests/rewrite.test.js` for phuglee injection
- [x] `npm test` passing

## Success criteria

Nav and proxy injection feel like one floating brand bar across all three apps.