# M4 — Phuglee Signature Brand (v1.3)

> **Status:** `in_progress`  
> **Created:** 2026-07-06  
> **Depends on:** M3 (v1.2 Premium Brand Experience — complete)  
> **Design spec:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`  
> **Site audit:** `.planning/SITE-AUDIT.md`  
> **Scope:** **Full site** — including login (`/`), all shell pages, Form Forge, Property Analyzer

---

## Goal

Completely redesign and rebuild every pixel, interaction, page, component, and function so the entire Phuglee / Distress OS experience feels like a **premium, edgy, artistic high-end brand** — dark, immersive, tactile, and cohesive. Ground truth is the logo SVG palette and wordmark energy, not generic Heat ember or SaaS dashboard chrome.

## Supersedes M3 constraints

| M3 decision | M4 change |
|-------------|-----------|
| Login page (`/`) locked | **In scope** — signature brand moment |
| Heat ember `#e85d04` dominant | Logo orange `#E58435` + taupe/cream/charcoal system |
| CSS-only, no motion orchestration | CSS + vanilla `phuglee-motion.js` stagger system |
| Static `<img>` logo | Reusable `phuglee-logo.js` SVG injector + pattern tiles |
| Post-login only | **13+ pages**, **20+ UI surfaces** |

## Locked decisions (2026-07-06)

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Brand reference** | `phuglee-logo.svg` palette + heavy condensed wordmark energy |
| D2 | **Vibe** | Premium · Edgy · Artistic · Dark immersive · High-end streetwear |
| D3 | **Color ground truth** | `#0D0D0D` bg, `#E58435` CTA, taupes `#AEA38F`–`#AAA18F`, creams `#F5F2E4` |
| D4 | **Typography** | Anton display + Outfit body (retained; tuned to logo weight) |
| D5 | **Logo integration** | Vanilla `phuglee-logo.js` + `phuglee-pattern.svg` — no React required |
| D6 | **Motion** | CSS keyframes + `IntersectionObserver` stagger — Framer Motion deferred |
| D7 | **Stack** | Vanilla HTML/CSS/JS — TypeScript/React migration optional spike in Phase 30 |
| D8 | **E-commerce** | Out of scope — no shop exists |
| D9 | **Build order** | Design system → global chrome → Home → auth → shell pages → Forge → Analyzer → states → a11y → QA |

## GSD phases (continues from v1.2 phase 21)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 22 | Phuglee Design System | BRAND-01–06 | complete |
| 23 | Global Chrome & Motion | BRAND-07–10 | complete |
| 24 | Home — Signature Rebuild | BRAND-11–14 | pending |
| 25 | Auth Flows | BRAND-15–17 | pending |
| 26 | Shell Pages — Hub, Collect, Bridge | BRAND-18–20 | pending |
| 27 | Form Forge — Signature Pass | BRAND-21–23 | pending |
| 28 | Analyzer — Signature Pass | BRAND-24–26 | pending |
| 29 | States & Micro-interactions | BRAND-27–30 | pending |
| 30 | A11y, Performance, SEO | BRAND-31–34 | pending |
| 31 | Cross-App Signature QA | BRAND-35–37 | pending |

## Cross-repo touch points

| Repo | Phases |
|------|--------|
| `distress-os` | 22–26, 29–31 |
| `city-list-requests` | 27 |
| `property-distress-analyzer` | 28 |

## Constraints

- Preserve all DOM IDs and JS hooks unless explicitly migrated
- `npm test` / `gsd.py verify` / Analyzer tests after every phase
- WCAG AA on `--phuglee-cream` on `--phuglee-black`
- `prefers-reduced-motion`: disable float, stagger, shine loops
- Logo SVG single-fetch with explicit dimensions (no CLS)

## Success criteria (milestone)

1. Every page reads as one premium edgy brand — no leftover Heat/SaaS generic elements
2. Logo palette is authoritative across all three repos
3. Logo SVG integrated intelligently (hero, patterns, empty states) without perf regression
4. Branded loading/empty/error states on all major surfaces
5. All test suites green (known Forge lint-imports pre-existing exception documented)

## Next step

`/gsd:discuss-phase 24` or `/gsd:plan-phase 24`