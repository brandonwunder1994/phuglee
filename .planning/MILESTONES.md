# Project Milestones: Distress OS

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