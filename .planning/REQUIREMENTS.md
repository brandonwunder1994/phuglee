# v1.1 Unified Heat Design — Requirements

> **Milestone:** v1.1  
> **Created:** 2026-07-06  
> **Research:** Skipped (visual reskin — no new capabilities)

---

## Design System

- [ ] **HEAT-01**: Canonical token file in `public/css/tokens.css` documented as single source of truth
- [ ] **HEAT-02**: Shared typography — Anton (display), Outfit (body); JetBrains Mono retained in Analyzer for metrics/HUD only
- [ ] **HEAT-03**: Shared atmosphere — deep brown bg (`#080605`), ember radial glow, 48px grid, hub-rise motion
- [ ] **HEAT-04**: Shared component primitives — hub buttons, cards, eyebrows, status pills, elevated panels
- [ ] **HEAT-05**: Design spec at `.planning/v1.1-HEAT-DESIGN.md` with token table + per-app surface inventory

## Global Navigation

- [ ] **NAV-01**: Unified `shell-nav` on every Distress OS page (Home, Hub, Bridge, Landing)
- [ ] **NAV-02**: Form Forge subpages accessible from nav — Records Desk, City Tracker, Coverage Map, Request PDFs, Submit Portals, Email-only, Portal Errors
- [ ] **NAV-03**: Property Analyzer entry in nav; active state highlights current section
- [ ] **NAV-04**: Nav injected into proxied module HTML via `rewrite.js` (works at `/forge/*` and `/analyzer/*`)
- [ ] **NAV-05**: Nav works when modules accessed directly (`:8787`, `:3456`) — optional lightweight strip or full strip with absolute URLs to `:3000`
- [ ] **NAV-06**: Forge/Analyzer status pills (green/red) poll `/api/health` on shell pages; degrade gracefully on standalone module ports

## Form Forge Reskin

- [ ] **FORGE-01**: Replace gold/serif tokens in `style.css` with Heat token mapping
- [ ] **FORGE-02**: Reskin all 7 HTML pages to Heat palette + atmosphere
- [ ] **FORGE-03**: Module topbar harmonized with shell-nav (remove duplicate brand conflict when nav injected)
- [ ] **FORGE-04**: Retire paper-grain / stamp aesthetic; adopt hub glow + grid
- [ ] **FORGE-05**: `portal.css`, `map.css`, `request-pdfs.css`, and related modules updated
- [ ] **FORGE-06**: Semantic colors remapped (ok/warn/danger) to heat-compatible values

## Property Analyzer Reskin

- [ ] **PA-01**: Replace Aerial Command tokens in `tokens.css` with Heat palette
- [ ] **PA-02**: Swap fonts — Fraunces/DM Sans → Anton/Outfit (keep JetBrains Mono for data)
- [ ] **PA-03**: New `heat-theme.css` layer replacing `premium-aerial.css` overrides
- [ ] **PA-04**: Reskin sidebar, command bar, KPIs, property cards, scan progress
- [ ] **PA-05**: Review overlay + modals match Heat chrome
- [ ] **PA-06**: Landing page aligned to Command Hub hero style
- [ ] **PA-07**: Remove dead cyber/aerial CSS references where superseded by heat-theme

## Quality Assurance

- [ ] **QA-01**: Visual audit — all pages side-by-side at `http://127.0.0.1:3000`
- [ ] **QA-02**: Distress OS `npm test` passing
- [ ] **QA-03**: Form Forge `python scripts/gsd.py verify` — 0 issues; Analyzer `npm test` — 190+ passing

---

## Future Requirements (deferred)

- **NAV-07**: Mobile hamburger collapse for 10+ nav items
- **THEME-01**: Light mode toggle
- **BRIDGE-02**: In-app bridge upload without leaving Analyzer

## Out of Scope

| Item | Reason |
|------|--------|
| Form Forge / Analyzer API changes | Visual + nav only |
| New features in child apps | Separate milestones |
| Removing standalone direct-port access | Must keep working |
| MapLibre style overhaul | Keep map data layers; reskin chrome only |

---

## Traceability

| Requirement | Phase |
|-------------|-------|
| HEAT-01–05 | 7 |
| NAV-01–06 | 8 |
| FORGE-01, FORGE-03, FORGE-04 | 9 |
| FORGE-02, FORGE-05, FORGE-06 | 10 |
| PA-01–03, PA-07 | 11 |
| PA-04–06 | 12 |
| QA-01–03 | 13 |
| NAV-02–03 (polish) | 8, 10, 12 |