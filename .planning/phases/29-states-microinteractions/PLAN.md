# Phase 29 Plan: States & Micro-interactions

**Requirements:** BRAND-27–30  
**Repos:** distress-os, city-list-requests, property-distress-analyzer  
**Status:** complete

## Approach

1. **Shared state primitives** — Extend `phuglee-components.css` with loading bar, empty watermark, error inset, shell loading strip, and micro-interaction motion (CTA hover, panel hover, modal rise, nav underline).
2. **State enhancer** — Add `phuglee-states.js` to upgrade `.load-error` / `.list-error`, `.request-loading`, and empty panels at runtime; bind shell nav loading strip; observe dynamic DOM for injected errors.
3. **Shell** — Link `phuglee-states.js` on `/heat`, `/collect`, `/bridge`; inject via `rewrite.js` on proxied Forge/Analyzer pages.
4. **Form Forge** — Append state CSS to `phuglee-forge.css`; link `phuglee-states.js` on all 7 HTML pages; upgrade workflow loading markup on queue pages.
5. **Analyzer** — Append state CSS to `phuglee-analyzer.css`; link `phuglee-states.js` on `index.html`; pattern watermark on empty workspace.
6. **`prefers-reduced-motion`** — Disable pulse, hover transforms, modal rise, and stagger in state CSS.

## Deliverables

| Repo | Files |
|------|-------|
| distress-os | `phuglee-components.css`, `phuglee-states.js`, `shell-nav.js`, `rewrite.js`, shell HTML |
| city-list-requests | `phuglee-forge.css`, `phuglee-states.js`, 7 HTML pages |
| property-distress-analyzer | `phuglee-analyzer.css`, `phuglee-states.js`, `index.html` |

## Verification

- distress-os `npm test` — 16/16
- property-distress-analyzer `npm test` — 190/190
- city-list-requests `python scripts/gsd.py test` — 121/122 (pre-existing `texas-cedar-park` failure)