# M2 — Unified Heat Design (v1.1)

> **Status:** `in_progress`  
> **Created:** 2026-07-06  
> **Depends on:** M1 (shell + proxy)  
> **Design spec:** `.planning/v1.1-HEAT-DESIGN.md`

---

## Goal

Make Form Forge and Property Analyzer visually match the Command Hub Heat aesthetic, with a **global navigation menu on every page** linking to all Distress OS, Form Forge, and Property Analyzer surfaces.

## Locked decisions (2026-07-06)

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Design reference** | Command Hub (`heat.html`, `tokens.css`, `hub.css`) |
| D2 | **Replace Analyzer v1.8** | Aerial Command (Fraunces/amber) → Heat (Anton/ember) |
| D3 | **Replace Forge stamp-theme** | Gold/serif → Heat palette |
| D4 | **Global nav** | Full menu on all pages including Forge subpages + Analyzer |
| D5 | **Research** | Skipped — visual reskin only |
| D6 | **Scope** | CSS/HTML/nav injection only — no backend changes |

## GSD phases (continues from v1.0 phase 6)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 7 | Heat Design System | HEAT-01–05 | pending |
| 8 | Global Navigation Shell | NAV-01–06 | pending |
| 9 | Form Forge — Tokens & Atmosphere | FORGE-01, 03, 04 | pending |
| 10 | Form Forge — All Surfaces | FORGE-02, 05, 06 | pending |
| 11 | Analyzer — Tokens & Theme Layer | PA-01–03, 07 | pending |
| 12 | Analyzer — All Surfaces | PA-04–06 | pending |
| 13 | Cross-App QA & Polish | QA-01–03 | pending |

## Cross-repo touch points

| Repo | Phases |
|------|--------|
| `distress-os` | 7, 8, 13 |
| `city-list-requests` | 9, 10 |
| `property-distress-analyzer` | 11, 12 |

## Constraints

- All DOM IDs and JS hooks preserved
- `npm test` / `gsd.py verify` after every phase
- Standalone ports `:8787` and `:3456` still work

## Next step

`/gsd:plan-phase 7` — Heat Design System