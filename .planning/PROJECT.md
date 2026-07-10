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

### Validated (v1.7 — shipped 2026-07-10)

- [x] **MAP-01–03**: Category promotion for unmapped city type columns; no invent from free-text noise
- [x] **SHAPE-01–02**: Process-path `matchedIndicators` arrays; export join preserved
- [x] **GROUP-01–04**: Timestamp-stable group keys; singleton only when count === 1
- [x] **TEST-01–03**: processUpload e2e lock + full suite + verify-live

Full requirement text: `.planning/milestones/v1.7-REQUIREMENTS.md`

### Active (v1.8 — Type Column Intelligence)

- [ ] **COL-***: Score headers + cell value shapes → suggest best single Violation Type column (no multi-column blend)
- [ ] **COL-***: First-time (or format-changed) per city: admin confirms Type column before process continues; same sheet format reuses last confirmed mapping
- [ ] **LBL-***: Display-only short labels for long type/description text in Train/groups; full raw text kept for distress match + export
- [ ] **TEST-***: Regression lock for wrong-column maps, format reuse, short-label display

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

## Current Milestone: v1.8 Type Column Intelligence

**Goal:** Every city upload maps the true Violation Type column (with confirm-when-format-is-new) and Train shows short categorize-at-a-glance labels without losing full text for distress.

**Target features:**
- Score all columns by header aliases + value shapes; pick **one** best Type column (no blending)
- Per-city format fingerprint: first upload or format change → admin confirms Type column; same format reuses last mapping
- If no Type column can be identified → keep rows for review (no silent drop as “no category”)
- Display-only short labels for long type/description walls of text; full raw retained for matching + export

**Decisions (locked at milestone start):**
| Decision | Choice |
|----------|--------|
| Column blend | Never — single winner Type column |
| Confirm gate | First time per city **or** sheet format differs from last upload for that city |
| Same format | Reuse last confirmed Type column for that city |
| Short labels | Display-only; do not replace stored type used for distress/export |
| No type column | Keep/approve path for review — no silent discard |

## Current State

**Shipped:** v1.7 Filter Accuracy & Grouping (2026-07-10)  
**Prior:** v1.6 Filter Superpower Brain (2026-07-10)  
**Focus:** v1.8 Type Column Intelligence — defining requirements  
**Phase numbering:** continues from 51 (v1.7 ended at 50)

**Filter accuracy stack (v1.7):** `lib/bridge-category-promote.js`, `lib/bridge-stable-text.js`, normalizer + review-groups wiring; process rows keep indicator arrays; export joins.

**Gap this milestone closes:** `detectIntakeColumnMap` is alias-first / first-match; promote-when-empty only helps if Type is empty. Wrong column → wrong Train groups and manual review. No per-city format memory or display short-labels.

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-09 — started v1.8 Type Column Intelligence*
