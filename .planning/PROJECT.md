# Distress OS

## What This Is

A unified local shell for **Form Forge** (FOIA/public-records workflows) and **Property Distress Analyzer** (AI lead screening). Distress OS provides the landing page, Command Hub, reverse proxy, optional Data Bridge, and shared navigation — while each module runs on its original engine unchanged.

## Core Value

One operating system feel: collect public records → analyze distressed leads → export dial-ready lists, with seamless navigation between every tool surface.

## Requirements

### Validated (v1.0 — shipped 2026-07-01)

- [x] Landing page with heat aesthetic (`/`)
- [x] Command Hub dashboard (`/heat`)
- [x] Reverse proxy for Form Forge (`/forge/`) and Property Analyzer (`/analyzer/`)
- [x] Data Bridge spreadsheet converter (`/bridge`)
- [x] Health API with module status pills
- [x] Auto-start child processes via `launch-distressos.bat`
- [x] Unit tests for rewrite, bridge schema, proxy

### Validated (v1.2 — shipped 2026-07-06)

- [x] **PREM-01–28**: Premium brand pass on post-login surfaces (M3)

### In progress (v1.1 Unified Heat Design)

- [ ] **HEAT-01–05**: Canonical Heat design system (superseded by v1.3 `--phuglee-*` tokens)
- [ ] **NAV-01–06**: Global navigation menu
- [ ] **FORGE-01–06**: Form Forge Heat reskin
- [ ] **PA-01–07**: Property Analyzer Heat reskin
- [ ] **QA-01–03**: Cross-app visual audit

### Active (v1.3 Phuglee Signature Brand)

- [ ] **BRAND-01–37**: Full-site signature brand rebuild — logo-ground-truth palette, design system, all pages, states, a11y

### Active (v1.6 Filter Superpower Brain — M7)

- [ ] **BRAIN-***, **REV-***, **TRAIN-***, **DEC-***, **PHRASE-***, **HARD-*** — see `.planning/REQUIREMENTS.md`
- [ ] Global admin-trained Filter brain; next-upload learning for all customers

### Future (post v1.6)

- [ ] React/Framer Motion migration (optional)
- [ ] Embedded bridge workflow (upload without leaving Analyzer)
- [ ] Single sign-on / session sharing between modules
- [ ] Per-market custom distressed photography
- [ ] Server-side auth sessions (replace header-only admin)

### Out of Scope (v1.6)

| Feature | Reason |
|---------|--------|
| Analyze vision review redesign | Separate learned-brain domain |
| Per-user / per-city brains | Global shared quality product |
| Non-admin training | Quality control |
| ML fine-tunes without admin gate | Controllability |

## Context

**Stack:** Node.js 20+ shell (`server.js`), vanilla HTML/CSS/JS in `public/`, child apps via junction modules.

**Brand reference (v1.3):** `phuglee-logo.svg` palette — `#0D0D0D` bg, `#E58435` CTA, taupes, creams. Premium · Edgy · Artistic · High-end streetwear.

**Design spec:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`  
**Site audit:** `.planning/SITE-AUDIT.md`

**Child repos:**
- Form Forge: `C:\Users\brand\Projects\city-list-requests` (Python Flask, port 8787)
- Property Analyzer: `C:\Users\brand\Projects\property-distress-analyzer` (Node, port 3456)

**Tests:** `npm test` (distress-os), `python scripts/gsd.py verify` (Form Forge), `npm test` (Analyzer 190+)

---

## Current Milestone: v1.6 Filter Superpower Brain

**Goal:** Admin-only global Filter brain — grouped Approve/Deny trains type + phrase rules so every future city upload improves for all customers.

**Target features:**
- Global durable brain store applied on every `processUpload`
- Reviewable not-distressed rows + violation-type grouping
- Admin Train brain UX (distressed + not distressed, signals + descriptions, ✓/✗)
- List mutation (deny remove / approve promote) + type suppress/promote
- Phrase mining → proposed rules → admin activate
- Undo, metrics, caps, docs, production QA

**Phases:** Assigned by gsd-roadmapper (continue after last shipped phase numbering)  
**Requirements:** `.planning/REQUIREMENTS.md`  
**Codebase map:** `.planning/codebase/`  
**Context:** `.planning/MILESTONE-CONTEXT.md`

**Last updated:** 2026-07-09

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