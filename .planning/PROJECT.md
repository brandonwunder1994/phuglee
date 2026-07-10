# Distress OS

## What This Is

A unified local shell for **Form Forge** (FOIA/public-records workflows) and **Property Distress Analyzer** (AI lead screening). Distress OS provides the landing page, Command Hub, reverse proxy, optional Data Bridge / Filter pipeline, shared navigation, and an **admin-trained global Filter brain** that improves tagging quality for every customer on subsequent city uploads.

## Core Value

Collect public records → **filter non-deals with a brain that learns from admin Approve/Deny** → save clean lists for external enrichment → **manually import** into Analyze → export dial-ready lists. Filter and Analyze stay independent modules.

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

### Validated (v1.8 — shipped 2026-07-10)

- [x] **COL-01–04**: Score headers + value shapes; force single Type column; no silent drop; promote empty-only
- [x] **GATE-01–06**: Per-city format fingerprint, admin confirm, reuse, batch mixed hard-fail, admin-only persist
- [x] **META-01**: `processingMeta.typeResolution` source enum
- [x] **LBL-01–03**: Display-only short Train labels; full type for match/export/decisions; no DOM scrape
- [x] **TEST-01–03 (v1.8)**: processUpload e2e locks + suite + verify-live

Full requirement text: `.planning/milestones/v1.8-REQUIREMENTS.md`

### Active (v2.0 Filter Independence & Learning)

Milestone goals (requirements REQ-IDs defined next in this workflow):

- [ ] **Independence:** Remove automatic Filter → Analyze push; Filter only stages/saves lists for download and external enrichment before manual Analyze import
- [ ] **Saved lists:** Multi-city list store + UI (save, name, download, delete) so sequential city uploads persist until the operator removes them
- [ ] **Accuracy pass:** Full Filter structure review + implement keep/kill, Type/format, Train grouping, and brain-learning improvements so Approve/Deny volume falls over time
- [ ] **Efficiency:** Operator time, process runtime, and cross-city reuse all improve (no single-dimension tradeoff)
- [ ] **Learning bar:** Code-violation Approve/Deny becomes less frequent as the brain absorbs admin decisions and auto-filtering gets trustworthy

### Backlog (later)

- Server-side authenticated sessions (replace spoofable `X-Phuglee-User` for multi-tenant)
- Embedded bridge workflow (upload without leaving Analyzer)
- Single sign-on / session sharing between modules
- React/Framer Motion migration (optional)

### Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-push Filter → Analyze | Product decision: external enrich/skip-trace, then manual Analyze import |
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

**Tests:** `npm test` (distress-os **460** after v1.8), `scripts/verify-live.ps1`, Form Forge / Analyzer suites separately

**Known soft debt (accepted):**
- Dedicated `GET /api/bridge/brain/metrics` unused by UI (metrics via `GET /brain`)
- Decision POST ships full row arrays (15MB cap)
- Header-based admin is acceptable for single-tenant local; multi-tenant needs server sessions
- Formal `/gsd:audit-milestone` for v1.8 not run (phase VERIFICATION.md all passed)

## Key Decisions (v1.6)

| Decision | Outcome |
|----------|---------|
| Global brain file, not Analyzer learned-brain store | ✓ Good — separate domains |
| Suppress applied last (wins over promote) | ✓ Good — conflicts demote to Standard |
| Water early-return skips all brain apply | ✓ Good — BRAIN-03 |
| Phrases proposed-only until admin activate | ✓ Good — controllability |
| Split undo (client list snapshot + server rule revert) | ✓ Good — HARD-01 |
| Volume-safe `BRIDGE_BRAIN_ROOT` mirrors filter lists | ✓ Good — durability |

## Key Decisions (v1.8)

| Decision | Outcome |
|----------|---------|
| Score headers + value shapes; force single Type (never blend) | ✓ Good — COL-01/04 traps green |
| Format memory separate from brain (`BRIDGE_CITY_FORMATS_ROOT`) | ✓ Good — no brain file bloat |
| Confirm first time / format change; same FP auto_reuse | ✓ Good — GATE-02/03 |
| Short labels display-only; never stored type / group keys | ✓ Good — LBL-02/03; scrape kill |
| Water shut-off skips Type confirm gate | ✓ Good — water path unblocked |
| Deterministic short labels (no LLM paraphrase) | ✓ Good — testable, zero new deps |

## Current Milestone: v2.0 Filter Independence & Learning

**Goal:** Make Filter a standalone list factory — no Analyze push — with a full accuracy/efficiency pass so admin Train work drops as the brain learns from real Approve/Deny decisions.

**Target features:**
- Decouple Filter from Analyze (remove auto-push; keep manual import path only)
- Saved multi-city filtered lists (save / download / delete; external enrichment outside the tool)
- Structural accuracy pass across process, Type/format, keep/kill tagging, Train grouping, brain apply
- Efficiency: less operator grind, faster process, better reuse across heterogeneous city files
- Success bar: Approve/Deny of code violations becomes less frequent over time because the bot already filtered correctly

**In scope:** Upload/process, column map, format memory, distress tagging, Train brain, phrase rules, Filter lists/save/download, admin + customer Filter UX.  
**Explicitly out:** Pushing lists into Analyze from Filter.

**Phase numbering:** continues from **55**  
**Approach:** Audit what matters + implement improvements in this same major milestone (not audit-only).

## Current State

**Active:** v2.0 Filter Independence & Learning (defining requirements)  
**Shipped:** v1.8 Type Column Intelligence (2026-07-10)  
**Prior:** v1.7 Filter Accuracy & Grouping; v1.6 Filter Superpower Brain  

**Type column stack (v1.8):** `lib/bridge-type-column-score.js`, `lib/bridge-city-format-store.js`, processUpload confirm gate, `lib/bridge-short-label.js` + Train UI; processUpload e2e TEST-01/02/03 (v1.8).

**Known product direction (pre-v2.0 decisions):** Filter stages filtered lead lists only; enrichment + skip-trace happen outside; Analyze receives data via manual import of fully prepared lists.

## Key Decisions (v2.0 — provisional)

| Decision | Outcome |
|----------|---------|
| No Filter → Analyze auto-push | — Pending implement — external workflow + manual import |
| Multi-list staging on Filter (not single lastResult) | — Pending implement |
| Accuracy + efficiency + learning bar in one major milestone | — Pending — all peer priorities |
| Global brain remains single shared quality product | ✓ Carry forward from v1.6 |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-10 after starting v2.0 Filter Independence & Learning*
