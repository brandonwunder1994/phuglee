# Phase 30 Plan: A11y, Performance, SEO

**Requirements:** BRAND-31–34  
**Repos:** distress-os, city-list-requests, property-distress-analyzer  
**Status:** complete

## Approach

1. **A11y** — `phuglee-a11y.css` with WCAG AA meta text token, global `:focus-visible` orange rings, skip links, logo CLS reservation, global reduced-motion audit.
2. **Performance** — Tiered `Cache-Control` in distress-os `server.js` (immutable for images/SVG, day cache for CSS/JS); analyzer static routes aligned.
3. **SEO** — OG + Twitter meta on `/`, `/heat`, `/collect`, `/bridge`, Analyzer `/landing`.
4. **Verification** — `static-cache.test.js`, `a11y-seo.test.js`, all repo test suites.

## Optional spike

See `REACT-MIGRATION-SPIKE.md` — React/Framer migration deferred; vanilla stack retained.