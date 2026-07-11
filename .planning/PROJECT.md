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

### Validated (v2.0 — shipped 2026-07-10)

- [x] **IND-01–04**: Filter write-isolated from Analyze; push adapter gone; `already_imported` default-off
- [x] **LIST-01–03**: List factory Save → Download path + multi-city persistence + teaching
- [x] **ACC-01–03**: Gold accuracy + silent-drop bans + v1.7–v1.8 locks
- [x] **LRN-01–03**: Paired learning metrics + anti-game + type live / phrases proposed
- [x] **EFF-01–02**: Day-2 efficiency without accuracy or Analyze re-coupling tradeoffs
- [x] **TEST-01–03 (v2.0)**: Independence + gold + verify-live permanent bar

Full requirement text: `.planning/milestones/v2.0-REQUIREMENTS.md`

### Validated (v2.1 — shipped 2026-07-11)

- [x] **DESK-01–06**: Asymmetric scrub desk, no proof rail, Collect-grade heat, slim chrome, cream Anton, phuglee-btn + ops slang
- [x] **CITY-01–02**: City dossier case file; no-list path demoted to scrap drawer
- [x] **IDLE-01–02**: Live idle proof from lists; Process climax + demoted date meta
- [x] **FEED-01–02**: Client-staged live scrub feed; reduced-motion safe
- [x] **KILL-01–03**: RAW → KILLED → KEPT report, proof chips, Save/Stage primary
- [x] **THTR-01–03**: Admin Train theater, Rules armory, non-admin gate
- [x] **SHIFT-01–03**: Sticky shift queue, inventory HUD, brand-heat success
- [x] **QA-01–03**: v1.6–v2.0 locks + suite + verify-live + mobile/a11y motion

Full requirement text: `.planning/milestones/v2.1-REQUIREMENTS.md`  
Design bible: `.planning/v2.1-FILTER-SCRUB-THEATER.md`

## Current Milestone

**None active** — v2.1 Filter Scrub Theater shipped 2026-07-11. Define next with `/gsd:new-milestone`.

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

**Tests:** `npm test` (distress-os **679** after v2.1), `scripts/verify-live.ps1`, Form Forge / Analyzer suites separately

**Filter Scrub Theater (v2.1):** `/bridge` desk shell + dossier + idle/process climax + scrub feed (`bridge-scrub-feed.js`) + kill-rate report + Train theater + shift queue/inventory HUD — surface only; process engine unchanged.

**Known soft debt (accepted):**
- Dedicated `GET /api/bridge/brain/metrics` unused by UI (metrics via `GET /brain`)
- Decision POST ships full row arrays (15MB cap)
- Header-based admin is acceptable for single-tenant local; multi-tenant needs server sessions
- Formal `/gsd:audit-milestone` for v1.8 / v2.1 not run (phase VERIFICATION.md all passed)
- Residual green on some save/attach/train status helpers (outside SHIFT-03 lists flash scope)

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

## Current State

**Active:** none (awaiting next milestone)  
**Shipped:** v2.1 Filter Scrub Theater (2026-07-11)  
**Prior:** v2.0 Independence & Learning; v1.8 Type Column; v1.7 Accuracy; v1.6 Superpower Brain  

**Known product direction:** Filter stages filtered lead lists only; enrichment + skip-trace happen outside; Analyze receives data via manual import of fully prepared lists. Analyze independence and keep/kill engine remain locked.

## Key Decisions (v2.0 — shipped)

| Decision | Outcome |
|----------|---------|
| No Filter → Analyze auto-push | ✓ Good — external workflow + manual import |
| Multi-list staging on Filter (not single lastResult) | ✓ Good — list factory |
| Accuracy + efficiency + learning bar in one major milestone | ✓ Good |
| Global brain remains single shared quality product | ✓ Carry forward from v1.6 |

## Key Decisions (v2.1)

| Decision | Outcome |
|----------|---------|
| Surface-only theater; no process engine rewrite | ✓ Good — 679 tests held accuracy bar |
| Client-staged feed (no SSE v1) | ✓ Good — FEED from process payload |
| Live train path = `bridge-train.js` (not bridge.js fallback) | ✓ Good — gap 61-03 closed DESK-06 |
| Session shift queue (sessionStorage), not server API | ✓ Good — SHIFT-01 without new routes |
| Brain demoted to Rules armory under Train theater | ✓ Good — THTR-02 |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-11 after v2.1 Filter Scrub Theater*
