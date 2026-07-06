# Distress OS

## What This Is

A unified local shell for **Form Forge** (FOIA/public-records workflows) and **Property Distress Analyzer** (AI lead screening). Distress OS provides the landing page, Command Hub, reverse proxy, optional Data Bridge, and shared navigation — while each module runs on its original engine unchanged.

## Core Value

One operating system feel: collect public records → analyze distressed leads → export dial-ready lists, with seamless navigation between every tool surface.

## Requirements

### Validated (v1.0 — shipped)

- [x] Landing page with heat aesthetic (`/`)
- [x] Command Hub dashboard (`/heat`)
- [x] Reverse proxy for Form Forge (`/forge/`) and Property Analyzer (`/analyzer/`)
- [x] Data Bridge spreadsheet converter (`/bridge`)
- [x] Health API with module status pills
- [x] Auto-start child processes via `launch-distressos.bat`
- [x] Unit tests for rewrite, bridge schema, proxy

### In progress (v1.1 Unified Heat Design)

- [ ] **HEAT-01–05**: Canonical Heat design system extracted from Command Hub
- [ ] **NAV-01–06**: Global navigation menu on every page (shell + Forge subpages + Analyzer)
- [ ] **FORGE-01–06**: Form Forge visual reskin to Heat palette
- [ ] **PA-01–07**: Property Analyzer visual reskin to Heat palette
- [ ] **QA-01–03**: Cross-app visual audit + regression tests

### Active (v1.2 Premium Brand Experience)

- [ ] **PREM-01–06**: Premium design system — distressed atmosphere + grain panels (from login page)
- [ ] **PREM-07–10**: Shell nav premium chrome + CSS injection
- [ ] **PREM-11–13**: Command Hub (`/heat`) premium pass
- [ ] **PREM-14–16**: Collect Records (`/collect`) premium pass
- [ ] **PREM-17–19**: Data Bridge (`/bridge`) premium pass
- [ ] **PREM-20–22**: Form Forge 7-page premium pass
- [ ] **PREM-23–25**: Property Analyzer premium pass
- [ ] **PREM-26–28**: Cross-app premium QA + login page regression check

### Future (post v1.2)

- [ ] Embedded bridge workflow (upload without leaving Analyzer)
- [ ] Single sign-on / session sharing between modules
- [ ] Animated mascot watermark, per-market photography

### Out of Scope (v1.2)

| Feature | Reason |
|---------|--------|
| Login page (`/`) changes | User locked — already awesome |
| Backend/API changes | Visual only |
| New product features | Separate milestones |

## Context

**Stack:** Node.js 20+ shell (`server.js`), vanilla HTML/CSS in `public/`, child apps via junction modules.

**Brand reference (v1.2):** Login page distressed home + Phuglee logo palette + auth modal panels.

**Design reference (v1.1):** `public/css/tokens.css`, `hub.css`, `shell.css` — Anton + Outfit, ember/flame heat palette.

**Child repos:**
- Form Forge: `C:\Users\brand\Projects\city-list-requests` (Python Flask, port 8787)
- Property Analyzer: `C:\Users\brand\Projects\property-distress-analyzer` (Node, port 3456)

**Tests:** `npm test` (distress-os), `python scripts/gsd.py verify` (Form Forge), `npm test` (Analyzer 190+)

---

## Current Milestone: v1.2 Premium Brand Experience

**Goal:** Make every post-login page match the login page's premium, badass Phuglee branding — distressed home atmosphere, grain texture, cream-and-ember palette, auth-style panels.

**Target features:**
- Shared `premium-atmosphere.css` + `premium-components.css` extracted from login page
- Page-by-page upgrades: Hub, Collect, Bridge, 7 Forge pages, Analyzer surfaces
- Premium nav chrome; login page untouched
- Full visual audit after sign-in

**Design spec:** `.planning/v1.2-PREMIUM-BRAND.md`

**Last updated:** 2026-07-06

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state