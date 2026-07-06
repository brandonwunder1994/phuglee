# Phase 23: Global Chrome & Motion

**Requirements:** BRAND-07–10  
**Repo:** `distress-os`  
**Status:** pending

## Checklist

- [ ] Retokenize `shell-nav.css` — black glass, cream logo, orange active pill
- [ ] Create `public/js/phuglee-motion.js` — stagger fade-up via IntersectionObserver
- [ ] Update `lib/rewrite.js` — inject phuglee CSS + motion on `/forge/*` and `/analyzer/*`
- [ ] Add global footer brand bar (earth-tone vignette, taupe meta, orange link hover)
- [ ] `prefers-reduced-motion` disables stagger in motion.js
- [ ] Update `tests/rewrite.test.js` for phuglee injection
- [ ] `npm test` passing

## Success criteria

Nav and proxy injection feel like one floating brand bar across all three apps.