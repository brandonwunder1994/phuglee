# React / Framer Motion Migration Spike (Deferred)

**Phase 30 optional spike — decision: defer**

## Current stack

- Vanilla HTML/CSS/JS across distress-os, Form Forge, Property Analyzer
- `phuglee-motion.js` (IntersectionObserver stagger) + CSS keyframes
- Proxy injection via `rewrite.js` — no bundler required

## Migration cost estimate

| Surface | Effort | Risk |
|---------|--------|------|
| Home + auth modals | 2–3 weeks | High — login is brand moment |
| Shell pages (3) | 1 week | Medium |
| Form Forge (7 pages) | 3–4 weeks | High — PDF.js, drag-drop |
| Analyzer app | 4–6 weeks | Very high — review mode, virtual scroll |

**Total:** ~10–14 weeks for full parity, plus ongoing dual-stack maintenance during transition.

## Framer Motion value

- Orchestrated page transitions and shared layout animations
- Not required for current brand spec — CSS stagger achieves 90% of perceived premium

## Recommendation

**Stay on vanilla** for M4 completion. Revisit post-M4 only if:

1. A dedicated component library (shadcn/React) is needed for new product surfaces
2. Team grows beyond solo maintainer
3. Design requires shared-element transitions between routes

## Perf note

Lighthouse 90+ achievable on shell pages via cache headers, `font-display: swap`, deferred scripts, and reserved logo dimensions — no React required.