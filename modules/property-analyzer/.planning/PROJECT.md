# Property Distress Analyzer

## What This Is

A local-first web tool for real estate investors who upload lead spreadsheets, scan property imagery with AI, rank distressed homes for outreach, review classifications, and export dial-ready lead databases. Backend reliability (v1.2), cyber intelligence UI (v1.4), classification accuracy (v1.5), review training (v1.6), and lead export (v1.7) are all shipped.

## Core Value

Upload a list → scan properties → trust tier classifications → **export or review** distressed leads for dialing.

## Requirements

### Validated (prior milestones)

- [x] Atomic canonical file writes, tier engine, persistence, tier parity, learned brain (v1.2)
- [x] 10k+ session save/hydration (v1.2)
- [x] Shell simplification — sidebar, overflow, ⌘K, command bar (v1.3)
- [x] Workflow surfaces — empty/scan/summary (v1.3)
- [x] Results — segmented filters, search-first, virtual scroll (v1.3)
- [x] Modals + review — functional overlay, shortcuts preserved (v1.3)
- [x] Cyber design system + all 22 surfaces reskinned (v1.4)
- [x] CLASS-01–10: Street-first routing, prompt de-bias, confidence, golden-set (v1.5)
- [x] REV-01–05, QA-06: Review training reliability (v1.6)

### Validated (v1.7)

- [x] **EXPORT-01–14**: Full-database dial-ready Excel export with 13 fixed columns
- [x] **QA-07**: Export integrity tests — 188/188 `npm test` passing

### In progress (v1.8 Premium Shell)

- [ ] **SHELL-01–06**: Aerial Command theme, hero surfaces, KPI motion, landing page (phases 8.1–8.6)

### Future (post v1.8)

- [ ] **EXPORT-15–18**: Manually Reviewed column, Distress Score, Satellite URL, CRM formats
- [ ] **THEME-01**: Light/dark mode toggle
- [ ] **A11Y-01**: Full WCAG audit pass
- [ ] **MOB-01**: Mobile-optimized review mode

### Out of Scope

| Feature | Reason |
|---------|--------|
| CRM API push | Spreadsheet export only (v1.7) |
| Column picker UI | Fixed dial-ready schema per user spec |
| Server-side export endpoint | 10k client scale sufficient |
| Satellite on every property | API cost constraint |
| Replace Gemini vision | Build on existing strength |
| React/SPA migration | Unrelated |

## Context

**Stack:** Node.js server, vanilla `public/index.html` + `public/css/` + modular `public/js/*.js`. Tailwind 3.4 CLI (`npm run css:build`).

**UI:** Cyber theme via `body.cyber-theme`, `tokens.css`, `cyber-theme.css`, `cyber-ultra.css`, legacy `app.css`.

**Export:** `Export Database (Excel)` → `profile: 'dial_ready'` (13 cols). Filter-scoped exports use `profile: 'full'` (28 cols). Modules: `lib/export-schema.js`, `lib/export-profiles.js`.

**Tests:** 188 passing (`npm test`).

**Prior milestones:** v1.2–v1.7 shipped (see `.planning/MILESTONES.md`).

## Constraints

- **Tech**: Free stack only — Tailwind CLI, CSS variables, Google Fonts
- **Compatibility**: Preserve DOM IDs and JS hooks unless migration plan included
- **Performance**: Virtual scroll + progressive render must not regress for 10k leads
- **Tests**: `npm test` must pass after every change
- **Motion**: Respect `prefers-reduced-motion`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cyber over calm | User direction | v1.4 shipped ✓ |
| Vanilla shell, not React | 10k-line JS runtime works | ✓ Good |
| `profile: 'dial_ready'` vs `'full'` | User wants dial-ready DB export; power users keep detailed export | v1.7 ✓ |
| Dual Street View URL columns | Cached image (local server) + Maps pano (works anywhere) | v1.7 ✓ |
| Phase numbering continues | Never restart at 01 | v1.7 = phases 27–28 |

## Current Focus

**v1.7 shipped.** Planning next milestone: `/gsd:new-milestone`

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-07-01 — after v1.7 Lead Export milestone*