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

### Active (v1.1 Unified Heat Design)

- [ ] **HEAT-01–05**: Canonical Heat design system extracted from Command Hub
- [ ] **NAV-01–06**: Global navigation menu on every page (shell + Forge subpages + Analyzer)
- [ ] **FORGE-01–06**: Form Forge visual reskin to Heat palette
- [ ] **PA-01–07**: Property Analyzer visual reskin to Heat palette (replaces v1.8 Aerial Command look)
- [ ] **QA-01–03**: Cross-app visual audit + regression tests

### Future (post v1.1)

- [ ] Embedded bridge workflow (upload without leaving Analyzer)
- [ ] Single sign-on / session sharing between modules

### Out of Scope (v1.1)

| Feature | Reason |
|---------|--------|
| Backend/API changes in child apps | Visual + nav only |
| React/SPA migration | Unnecessary |
| Cloud hosting / multi-user auth | Local desktop stack |
| Replacing module business logic | Proxy preserves engines |

## Context

**Stack:** Node.js 20+ shell (`server.js`), vanilla HTML/CSS in `public/`, child apps via junction modules.

**Design reference:** `public/css/tokens.css`, `hub.css`, `shell.css` — Anton + Outfit, ember/flame heat palette.

**Child repos:**
- Form Forge: `C:\Users\brand\Projects\city-list-requests` (Python Flask, port 8787)
- Property Analyzer: `C:\Users\brand\Projects\property-distress-analyzer` (Node, port 3456)

**Tests:** `npm test` (distress-os), `python scripts/gsd.py verify` (Form Forge), `npm test` (Analyzer 190+)

---

## Current Milestone: v1.1 Unified Heat Design

**Goal:** Make Form Forge and Property Analyzer visually match the Command Hub Heat aesthetic, with a shared global nav menu across every page.

**Target features:**
- Shared Heat token system (colors, fonts, atmosphere, buttons)
- Global shell nav on all Distress OS pages + injected into proxied module pages
- Form Forge 7-page reskin (Records Desk through Portal Errors)
- Property Analyzer full-surface reskin (sidebar, review, modals, landing)
- Regression verification across all three repos

**Last updated:** 2026-07-06