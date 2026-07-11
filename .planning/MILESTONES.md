# Project Milestones: Distress OS

## v2.1 Filter Scrub Theater (Shipped: 2026-07-11)

**Delivered:** Gritty multi-city scrub desk on `/bridge` — asymmetric foundation, city dossier, live idle proof + Process climax, client-staged scrub feed, cinematic kill-rate report, admin Train theater (brain as Rules armory), sticky shift queue + staging inventory HUD with brand-heat success — matching Collect/Command quality without rewriting the keep/kill engine or re-coupling Analyze.

**Phases completed:** 61–68 (8 phases, 20 plans)

**Design bible:** `.planning/v2.1-FILTER-SCRUB-THEATER.md`  
**GSD doc:** `docs/gsd/milestones/M8-filter-scrub-theater.md`  
**Archive:** `.planning/milestones/v2.1-ROADMAP.md`, `v2.1-REQUIREMENTS.md`

**Key accomplishments:**
- Asymmetric `bridge-desk` shell, Collect-grade heat atmosphere, cream Anton hero, unified `phuglee-btn` + ops slang (DESK)
- City case-file dossier from history/lists APIs; no-list outcomes demoted to scrap drawer (CITY)
- Live idle proof from `savedLists`; Process climax with demoted response-date meta (IDLE)
- Client-staged scrub feed from process payload; reduced-motion safe; no SSE (FEED)
- RAW → KILLED → KEPT kill report + proof chips; Save list / Stage elevated primary (KILL)
- Admin Train theater pivot when open groups; live mission HUD; Rules armory + non-admin fail-closed (THTR)
- Sticky session shift queue, inventory HUD, ember/gold post-save flash (SHIFT)
- **679** tests + `scripts/verify-live.ps1` green; `/bridge` 200; v1.6–v2.0 locks held (QA)

**Git range:** `78e44f0` → `5791223` (~87 commits, +9.5k / −815 across ~50 files)

**Note:** Formal `/gsd:audit-milestone` not run; all eight phase VERIFICATION.md reports **passed** (61 after gap-closure 61-03); suite + live gate green.

---

## v1.8 Type Column Intelligence (Shipped: 2026-07-10)

**Delivered:** Smart Violation Type column detection (headers + value shapes), per-city format memory with admin confirm gate, display-only short Train labels, and processUpload regression locks — so city exports no longer poison Train/brain with wrong columns or unreadable walls of text.

**Phases completed:** 51–54 (4 phases, 13 plans)

**Archive:** `.planning/milestones/v1.8-ROADMAP.md`, `v1.8-REQUIREMENTS.md`

**Key accomplishments:**
- Pure `bridge-type-column-score` ranks every column; process **forces** single Type into `columnMap` (alias-first traps lose)
- Per-city format fingerprint + `BRIDGE_CITY_FORMATS_ROOT`; first/changed format → admin confirm; same format → auto_reuse
- Confirm UI: ranked candidates, samples, No type column; non-admin clear 409 (no hang); mixed batch hard-fail
- Display-only `shortLabel` on Train (max 56); full type for distress/export/brain; DOM title scrape killed
- **460** tests + `scripts/verify-live.ps1` green; TEST-01/02/03 (v1.8) processUpload e2e locks

**Git range:** `62c5c21` → `9f0ea87` (~57 commits, +13.4k / −110 across ~70 files)

**Note:** Formal `/gsd:audit-milestone` not run; all four phase VERIFICATION.md reports **passed**; suite + live gate green.

---

## v1.7 Filter Accuracy & Grouping (Shipped: 2026-07-10)

**Delivered:** Train/Filter grouping accuracy — real city categories on labels, timestamp-stable stacks (no false singletons), process-path signal chips as arrays, processUpload regression lock.

**Phases completed:** 48–50 (3 phases, 4 plans)

**Diagnosis:** `.planning/debug/filter-singleton-no-category.md`  
**Archive:** `.planning/milestones/v1.7-ROADMAP.md`, `v1.7-REQUIREMENTS.md`

**Key accomplishments:**
- `matchedIndicators` stay string arrays on process/review rows; join `'; '` only at export (SHAPE)
- Pure `bridge-category-promote` promotes unmapped category-like columns into `violationIssueType` (MAP)
- `bridge-stable-text` + review-groups strip incidental dates/times so same category stacks (GROUP)
- processUpload e2e: description-only timestamps → 1 group; Vio Cat labels; typed High Grass stack
- **380** tests + `scripts/verify-live.ps1` green

**Git range:** `a5a10f5` → `5899e60` (16 commits, +1.5k / −121 across 21 files)

---

## v1.6 Filter Superpower Brain (Shipped: 2026-07-10)

**Delivered:** Admin-only global Filter brain — grouped Approve/Deny trains type + phrase rules so every future city upload improves for all customers.

**Phases completed:** 42–47 (6 phases, 12 plans)

**Design spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
**GSD doc:** `docs/gsd/milestones/M7-filter-superpower-brain.md`  
**Audit:** `.planning/milestones/v1.6-MILESTONE-AUDIT.md` (passed 24/24)  
**Archive:** `.planning/milestones/v1.6-ROADMAP.md`, `v1.6-REQUIREMENTS.md`

**Key accomplishments:**
- Durable global brain store (`BRIDGE_BRAIN_ROOT`) + pure apply on every `processUpload` (water-safe)
- Full false-negative pool + type-stacked review groups with signals/samples and stable `rowId`s
- Admin Train brain UX (two sections, group Approve/Deny; non-admin chrome hidden)
- Live type suppress/promote via `POST /api/bridge/brain/decisions` with list mutation + audit events
- Phrase mining → proposed-only rules; Filter brain panel activate/reject/disable
- Production harden: split undo, caps, 409 version conflicts, metrics, TAGGING-RULES; **345** tests + verify-live green

**Git range:** `23d8972` → `e6ae3ab` (~55 commits, +8.5k / −118 LOC across 45 files)

---

## v1.0 Shell & Integration (Shipped: 2026-07-01)

**Delivered:** Unified local shell with landing, Command Hub, reverse proxy for Form Forge and Property Analyzer, Data Bridge, and health orchestration.

**Phases completed:** 1–6

**Key accomplishments:**
- Landing page + Command Hub with Heat aesthetic
- Reverse proxy with URL rewrite for `/forge/` and `/analyzer/`
- Data Bridge XLSX converter (Form Forge → Analyzer format)
- Auto-start child processes via launch script
- Unit tests for rewrite, bridge schema, module proxy

---

## v1.1 Unified Heat Design (In progress)

**Goal:** Heat tokens + global nav + Form Forge / Analyzer reskin to unified palette.

**Phases:** 7–13

**Design spec:** `.planning/v1.1-HEAT-DESIGN.md`

**GSD doc:** `docs/gsd/milestones/M2-unified-heat-design.md`

> Note: v1.3 `--phuglee-*` tokens supersede Heat ember palette. Archive or complete v1.1 when Phase 22 lands.

---

## v1.2 Premium Brand Experience (Shipped: 2026-07-06)

**Goal:** Elevate every post-login page to match the Phuglee login page — distressed home atmosphere, grain panels, cream-and-ember palette. Login page was locked in M3.

**Phases:** 14–21

**Design spec:** `.planning/v1.2-PREMIUM-BRAND.md`

**GSD doc:** `docs/gsd/milestones/M3-premium-brand-experience.md`

**Shipped:**
- `premium-atmosphere.css` + `premium-components.css`
- Premium nav chrome + rewrite injection
- `/heat`, `/collect`, `/bridge` full pass
- Form Forge `premium-forge.css` (7 pages)
- Analyzer `premium-analyzer.css`

**Closed:** 2026-07-06 — `docs/gsd/plans/2026-07-06-m3-milestone-closure.md`

---

## v1.3 Phuglee Signature Brand (Shipped: 2026-07-06)

**Goal:** Complete signature brand rebuild — premium, edgy, artistic, dark immersive. Logo SVG palette is ground truth. **Full site including login.**

**Phases:** 22–31 (complete)

**Design spec:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`  
**Site audit:** `.planning/SITE-AUDIT.md`  
**GSD doc:** `docs/gsd/milestones/M4-phuglee-signature-brand.md`

**Shipped:**
- Phuglee design system + logo injector + pattern tiles
- Home `/` signature rebuild + auth flows
- Shell pages, Form Forge (7), Analyzer (all surfaces + landing)
- Branded loading/empty/error states + micro-interactions
- A11y, perf cache tiers, SEO/OG
- Cross-app QA — 14 surfaces, ember grep clean

**Closed:** 2026-07-06 — `docs/gsd/plans/2026-07-06-m4-milestone-closure.md`

---