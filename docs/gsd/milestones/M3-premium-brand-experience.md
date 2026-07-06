# M3 — Premium Brand Experience (v1.2)

> **Status:** `closed`  
> **Created:** 2026-07-06  
> **Closed:** 2026-07-06
> **Depends on:** M2 (v1.1 Unified Heat Design — phases 7–13)  
> **Design spec:** `.planning/v1.2-PREMIUM-BRAND.md`  
> **Scope:** Post-login surfaces only — login page (`/`) is locked and out of scope

---

## Goal

Elevate every post-login page to match the **Phuglee logo page** and **auth modal** — distressed home atmosphere, film grain, cinematic vignette, cream-and-ember palette, Anton punch, and premium grunge texture. Make the logged-in product feel as badass as the front door.

## Locked decisions (2026-07-06)

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Brand reference** | Login page (`index.html`, `landing.css`, `auth.css`) + `phuglee-logo.svg` palette |
| D2 | **Login page** | Do not touch — already shipped and approved |
| D3 | **Atmosphere** | Distressed home photo layer (subtle on app pages, stronger on hero sections) + grain + wear |
| D4 | **Logo usage** | Full mascot reserved for hero moments; nav keeps `phuglee-text-logo.svg` with premium chrome |
| D5 | **Research** | Skipped — visual elevation only |
| D6 | **Scope** | CSS/HTML only — no backend, no JS behavior changes |
| D7 | **Build order** | Shared system → shell pages → Forge → Analyzer → QA |

## GSD phases (continues from v1.1 phase 13)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 14 | Premium Design System | PREM-01–06 | complete |
| 15 | Shell & Navigation Polish | PREM-07–10 | complete |
| 16 | Command Hub — How It Works | PREM-11–13 | complete |
| 17 | Collect Records | PREM-14–16 | complete |
| 18 | Data Bridge | PREM-17–19 | complete |
| 19 | Form Forge — Premium Pass | PREM-20–22 | complete |
| 20 | Analyzer — Premium Pass | PREM-23–25 | complete |
| 21 | Cross-App Premium QA | PREM-26–28 | complete |

## Cross-repo touch points

| Repo | Phases |
|------|--------|
| `distress-os` | 14–18, 21 |
| `city-list-requests` | 19 |
| `property-distress-analyzer` | 20 |

## Constraints

- Preserve all DOM IDs and JS hooks
- `npm test` / `gsd.py verify` after every phase
- Distressed photo must not reduce text contrast below WCAG AA on body copy
- `prefers-reduced-motion`: static backdrops, no logo hover pulse

## Shipped

2026-07-06 — All phases executed. Login page untouched.

## Closed

2026-07-06 — `/gsd:complete-milestone` executed. Follow-ups moved to M4 (v1.3).

**Closure doc:** `docs/gsd/plans/2026-07-06-m3-milestone-closure.md`