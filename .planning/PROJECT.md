# Distress OS

## What This Is

A unified local shell for **Form Forge** (FOIA/public-records workflows) and **Property Distress Analyzer** (AI lead screening). Distress OS provides the landing page, Command Hub, reverse proxy, optional Data Bridge / Filter pipeline, shared navigation, and an **admin-trained global Filter brain** that improves tagging quality for every customer on subsequent city uploads.

## Core Value

One operating system feel: collect public records → **filter non-deals (with admin learning)** → analyze distressed leads → export dial-ready lists, with seamless navigation between every tool surface.

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

### Validated (v1.3 — shipped 2026-07-06)

- [x] **BRAND-***: Phuglee signature brand system and full-site surfaces (M4)

### Validated (v1.6 — shipped 2026-07-10)

- [x] **BRAIN-01–03**: Global durable Filter brain + runtime apply; water shut-off never type-suppressed
- [x] **REV-01–04**: Full FN pool, type stacking, signals/samples, stable rowIds
- [x] **TRAIN-01–04**: Admin Train brain UX; non-admin chrome hidden
- [x] **DEC-01–06**: List mutation + live type rules + audit + admin-only writes
- [x] **PHRASE-01–03**: Proposed phrase mining + Filter brain panel lifecycle
- [x] **HARD-01–04**: Undo, caps, 409 conflicts, metrics, docs, QA green

Full requirement text: `.planning/milestones/v1.6-REQUIREMENTS.md`

### In progress (v1.1 Unified Heat Design)

- [ ] **HEAT-01–05**: Canonical Heat design system (superseded by v1.3 `--phuglee-*` tokens)
- [ ] **NAV-01–06**: Global navigation menu
- [ ] **FORGE-01–06**: Form Forge Heat reskin
- [ ] **PA-01–07**: Property Analyzer Heat reskin
- [ ] **QA-01–03**: Cross-app visual audit

### Active (v1.7 — Filter Accuracy & Grouping)

**Goal:** Fix Train/Filter grouping so same-category rows stack, timestamps do not create false singletons, FN rows show real city categories, and signal chips stay visible.

**Target features:**
- Stable group keys (strip timestamps; stack on category / phrase / indicator)
- Promote real category columns into `violationIssueType` (MAP)
- Keep `matchedIndicators` as arrays for Train chips; join only on export (SHAPE)
- Regression tests for singleton flood + unmapped category + typed stacking

### Backlog (later)

- Server-side authenticated sessions (replace spoofable `X-Phuglee-User` for multi-tenant)
- Embedded bridge workflow (upload without leaving Analyzer)
- Single sign-on / session sharing between modules
- React/Framer Motion migration (optional)

### Out of Scope

| Feature | Reason |
|---------|--------|
| Analyze vision review redesign | Separate learned-brain domain |
| Shared store with Analyzer learned-brain | Different domain (vision tiers vs text tags) |
| Per-user / per-city brains | Global shared quality product |
| Non-admin training | Quality control |
| ML fine-tunes without admin gate | Controllability |

## Context

**Stack:** Node.js 20+ shell (`server.js`), vanilla HTML/CSS/JS in `public/`, child apps via junction modules.

**Filter Superpower Brain (v1.6):** `lib/bridge-brain-*` modules, process path in `lib/bridge-engine`, Train + Filter brain UI in `public/js/bridge.js` / `bridge-train.js`, durable file at `BRIDGE_BRAIN_ROOT` / `global-brain.json`.

**Brand reference (v1.3):** `phuglee-logo.svg` palette — `#0D0D0D` bg, `#E58435` CTA, taupes, creams.

**Child repos:**
- Form Forge: `C:\Users\brand\Projects\city-list-requests` (Python Flask, port 8787)
- Property Analyzer: `C:\Users\brand\Projects\property-distress-analyzer` (Node, port 3456)

**Tests:** `npm test` (distress-os **345** after v1.6), `scripts/verify-live.ps1`, Form Forge / Analyzer suites separately

**Known soft debt (accepted at v1.6 ship):**
- Dedicated `GET /api/bridge/brain/metrics` unused by UI (metrics via `GET /brain`)
- Decision POST ships full row arrays (15MB cap)
- Header-based admin is acceptable for single-tenant local; multi-tenant needs server sessions

## Key Decisions (v1.6)

| Decision | Outcome |
|----------|---------|
| Global brain file, not Analyzer learned-brain store | ✓ Good — separate domains |
| Suppress applied last (wins over promote) | ✓ Good — conflicts demote to Standard |
| Water early-return skips all brain apply | ✓ Good — BRAIN-03 |
| Phrases proposed-only until admin activate | ✓ Good — controllability |
| Split undo (client list snapshot + server rule revert) | ✓ Good — HARD-01 |
| Volume-safe `BRIDGE_BRAIN_ROOT` mirrors filter lists | ✓ Good — durability |

## Current Milestone: v1.7 Filter Accuracy & Grouping

**Goal:** Train brain shows accurate stacked categories and real FN labels after every upload.

**Diagnosis:** `.planning/debug/filter-singleton-no-category.md` (gsd-debugger, root cause confirmed)

## Current State

**Shipped:** v1.6 Filter Superpower Brain (2026-07-10)  
**Focus:** v1.7 Filter Accuracy & Grouping  
**Phase artifacts:** v1.6 remains under `.planning/phases/42-*` … `47-*`; v1.7 continues numbering from 48

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-10 after starting v1.7 Filter Accuracy*
