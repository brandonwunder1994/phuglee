# Roadmap: Distress OS

> **Archive-ready path (on complete-milestone):** `.planning/milestones/v2.1-ROADMAP.md` + `v2.1-REQUIREMENTS.md`  
> **Active roadmap:** this file (v2.1 Filter Scrub Theater)  
> **GSD tracking:** `docs/gsd/milestones/M8-filter-scrub-theater.md`  
> **Design bible:** `.planning/v2.1-FILTER-SCRUB-THEATER.md`  
> **UI map:** `.planning/codebase/filter-page-ui-map.md`

## Milestones

- ✅ **v1.0 Shell & Integration** — Phases 1–6 (shipped 2026-07-01)
- 🔄 **v1.1 Unified Heat Design** — Phases 7–13 (in progress — superseded by v1.3 tokens)
- ✅ **v1.2 Premium Brand Experience** — Phases 14–21 (shipped 2026-07-06)
- ✅ **v1.3 Phuglee Signature Brand** — Phases 22–31 (shipped 2026-07-06)
- ✅ **v1.4 Gritty Premium Surfaces** — Phases 32–36 (implemented)
- ✅ **v1.5 Territory Theater** — Phases 37–41 (implemented)
- ✅ **v1.6 Filter Superpower Brain** — Phases 42–47 (shipped 2026-07-10) — [archive](./milestones/v1.6-ROADMAP.md)
- ✅ **v1.7 Filter Accuracy & Grouping** — Phases 48–50 (shipped 2026-07-10) — [archive](./milestones/v1.7-ROADMAP.md)
- ✅ **v1.8 Type Column Intelligence** — Phases 51–54 (shipped 2026-07-10) — [archive](./milestones/v1.8-ROADMAP.md)
- ✅ **v2.0 Filter Independence & Learning** — Phases 55–60 (shipped 2026-07-10)
- 🚧 **v2.1 Filter Scrub Theater** — Phases 61–68 (planning → execute)

## Overview

v2.1 makes `/bridge` feel like a **gritty multi-city scrub desk**: asymmetric foundation, city dossier, live idle proof + Process climax, live kill feed during process, cinematic kill-rate report, admin Train superpower theater, multi-city shift inventory — matching Collect/Command quality bar without rewriting the keep/kill engine or re-coupling Analyze.

**Granularity:** standard (8 phases)  
**Coverage:** 24/24 v2.1 requirements mapped  
**Surface:** Filter `/bridge` UI only (vanilla HTML/CSS/JS)  
**Dependency order (design bible D2):** Foundation desk → city dossier → idle/process climax → live feed → kill report → train theater → shift/staging → QA

## Active Work

**Milestone:** v2.1 Filter Scrub Theater  
**Status:** GSD pipeline complete (map → requirements → roadmap → research → plan-phase **checked**) — awaiting user **execute**  

**Phase numbering:** 61–68 (continues from v2.0 phase 60)  
**Plans:** **20** executable plans (all plan-checker **PASS**)

---

## Phases

- [ ] **Phase 61: Scrub Desk Foundation** — Asymmetric desk shell; kill proof rail; atmosphere + Anton H1; slim chrome; unified buttons/voice
- [x] **Phase 62: City Dossier** — Ops case-file on city select; no-list path demoted to scrap/drawer
- [x] **Phase 63: Idle Proof & Process Climax** — Live idle metrics; Process as upload-step fire climax
- [x] **Phase 64: Live Scrub Feed** — Address/type activity feed during process; reduced-motion safe
- [ ] **Phase 65: Kill-Rate Scrub Report** — RAW → KILLED → KEPT hierarchy; proof chips; Save/Stage primary
- [ ] **Phase 66: Superpower Train Theater** — Admin Train climax when open groups; brain secondary; non-admin gate
- [ ] **Phase 67: Multi-City Shift & Staging** — Sticky shift queue; inventory HUD; brand-heat success
- [ ] **Phase 68: Regression QA Lock** — v1.6–v2.0 locks + suite + verify-live + mobile/a11y motion

## Phase Details

### Phase 61: Scrub Desk Foundation
**Goal**: First paint is an asymmetric scrub desk in the same grit world as Collect/Command — not a centered multi-step form wizard with fake proof tiles
**Depends on**: Nothing (v2.0 shipped — independence + list factory + accuracy bar)
**Requirements**: DESK-01, DESK-02, DESK-03, DESK-04, DESK-05, DESK-06
**Success Criteria** (what must be TRUE):
  1. Operator opens `/bridge` and sees a **dominant work surface + supporting scrap**, not a 920px centered essay wizard
  2. Equal 3-up decorative “proof rail” (icon + step-title metrics) is **gone or replaced** — first paint never ships an M5-forbidden equal feature grid
  3. Atmosphere reads Collect-grade intensity (`premium-bg--strong` and/or heat field), not subtle admin wash only
  4. Teaching chrome is slim for veterans (no triple stack of tutorial rail + pipeline essay + long H1 lead); step orthography remains usable
  5. Hero is **left-aligned solid cream Anton** “Scrub the Mess” with a short ops lead — not centered gradient marketing H1
  6. Buttons use unified `phuglee-btn` vocabulary and ops slang throughout (no dual `bridge-btn` + `phuglee-btn` systems as the default)
**Plans**: 3/3 plans complete · gap closure DESK-06 · status: ready for re-verification
- [x] 61-01-PLAN.md — Atmosphere + kill proof rail + asymmetric desk shell (DESK-01–05)
- [x] 61-02-PLAN.md — Ops voice + `phuglee-btn` unify + suite/live gate (DESK-06)
- [x] 61-03-PLAN.md — Gap: live BridgeTrain approve/deny to phuglee-btn (DESK-06)

### Phase 62: City Dossier
**Goal**: City selection opens an ops case file; “city said no list” is a secondary scrap — happy path is file scrub, not a radio wall
**Depends on**: Phase 61
**Requirements**: CITY-01, CITY-02
**Success Criteria** (what must be TRUE):
  1. After selecting a city, operator sees a **city dossier** (prior attaches / last scrub / lists staged / relevant status) — not only dual selects in a void
  2. “City replied, no usable list” outcomes live in a **secondary scrap/drawer** on the dossier — not a 5-radio wall competing with step-1 happy path
**Plans**: 2/2 plans complete · plan-check **PASS** · status: Complete
- [x] 62-01-PLAN.md — Wave 0 TDD: dossier/drawer static contracts + city-outcome handler soft gap
- [x] 62-02-PLAN.md — Client dossier compose (history + lists) + demote outcomes to scrap/drawer; preserve outcome POST payload

### Phase 63: Idle Proof & Process Climax
**Goal**: Desk proves inventory before process; upload step makes Process the one fire climax
**Depends on**: Phase 62 (dossier context available; desk shell stable)
**Requirements**: IDLE-01, IDLE-02
**Success Criteria** (what must be TRUE):
  1. At idle (before process), operator sees **live proof metrics** from existing list/API data (e.g. lists staged, total records ready, last save) — not only post-process KPIs
  2. Upload step presents **Process** as the visual climax (dropzone stage + one fire CTA); response date is tight meta, not a peer form block
**Plans**: 2/2 plans complete · plan-check **PASS** · status: complete
- [x] 63-01-PLAN.md — Live idle proof strip from `savedLists` (IDLE-01)
- [x] 63-02-PLAN.md — Process climax + demoted date meta + static locks (IDLE-02)

### Phase 64: Live Scrub Feed
**Goal**: While process runs, the operator watches real scrub activity — kept / no-distress / discarded — not only a passive bar and rotating slogans
**Depends on**: Phase 63 (process path is the desk climax; feed mounts on that beat)
**Requirements**: FEED-01, FEED-02
**Success Criteria** (what must be TRUE):
  1. During process, operator sees a **live scrub activity feed** (addresses and/or types with kept / no-distress / discarded / already-in-Analyze language) derived from real process outcomes (client-staged from response preferred)
  2. Feed respects `prefers-reduced-motion` (static summary / crossfade allowed; motion never required for comprehension)
**Plans**: 2/2 plans complete · plan-check **PASS** · status: Complete
- [x] 64-01-PLAN.md — Pure `bridge-scrub-feed.js` + Wave 0 unit tests (FEED-01/02)
- [x] 64-02-PLAN.md — DOM/CSS feed theater + process play + live gate

### Phase 65: Kill-Rate Scrub Report
**Goal**: Results open as a cinematic kill-rate mission readout — RAW → KILLED → KEPT — with proof chips and Save/Stage still the operator primary
**Depends on**: Phase 64 (process theater completes into results)
**Requirements**: KILL-01, KILL-02, KILL-03
**Success Criteria** (what must be TRUE):
  1. After process, results open with a **kill-rate scrub report**: display-scale RAW → KILLED → KEPT hierarchy, kill-reason breakdown, optional sample kept dossiers — not only equal KPI tiles
  2. Process meta already computed (duration, format reuse, discard story) surfaces as **proof chips/HUD**, not a single buried meta sentence
  3. Primary post-scrub CTA remains **Save list / Stage**; Preview CSV stays secondary; Analyze boundary language preserved
**Plans**: 1/3 plans complete · plan-check **PASS** · status: In Progress
- [x] 65-01-PLAN.md — Wave 0 TDD: kill-rate contracts (KILL-01–03)
- [ ] 65-02-PLAN.md — Kill-rate HUD: reforge `renderKpis` RAW→KILLED→KEPT + proof chips
- [ ] 65-03-PLAN.md — Elevate Save/Stage; Preview secondary; suite + verify-live

### Phase 66: Superpower Train Theater
**Goal**: When admin has open train groups after process, UI pivots into Train theater; Filter brain is armory, not a peer tab; non-admins never see train/brain chrome
**Depends on**: Phase 65 (results/report shell exists for theater pivot)
**Requirements**: THTR-01, THTR-02, THTR-03
**Success Criteria** (what must be TRUE):
  1. Admin with open train groups after process sees **Train theater** (mission header with open-group count; Distressed / Not Distressed with live kept-count feedback) — not equal peer tabs with Kept / Brain by default
  2. Filter brain panel is **secondary** (rules armory), not a third equal-weight peer competing with the scrub win
  3. Non-admin never sees train/brain chrome (v1.6 TRAIN-03 / admin gate preserved)
**Plans**: 3 plans · plan-check **PASS**
- [ ] 66-01-PLAN.md — Open-count helper + process→train theater pivot + mission header (THTR-01)
- [ ] 66-02-PLAN.md — Live kept HUD + theater chrome / demoted Kept (THTR-01)
- [ ] 66-03-PLAN.md — Rules armory demotion + admin gate + suite/live (THTR-02, THTR-03)

### Phase 67: Multi-City Shift & Staging
**Goal**: Operators run a multi-city shift with sticky inventory, brand-heat success, and one-click next city without re-teaching chrome
**Depends on**: Phase 66 (post-process/train path stable; save still primary)
**Requirements**: SHIFT-01, SHIFT-02, SHIFT-03
**Success Criteria** (what must be TRUE):
  1. Operator can run a **multi-city shift**: sticky queue/inventory of staged cities/lists; after save, next city is one-click without full wizard restart / re-teaching chrome
  2. Saved lists read as **staging inventory** (counts, type heat, ready/download language) while rename / download / delete / download-all APIs still work
  3. Post-save success uses **brand heat** (ember/gold), not green SaaS flash; optional “Download this list” path remains
**Plans**: 3 plans · plan-check **PASS**
- [ ] 67-01-PLAN.md — Brand-heat post-save flash (SHIFT-03)
- [ ] 67-02-PLAN.md — Staging inventory HUD over lists table (SHIFT-02)
- [ ] 67-03-PLAN.md — Sticky client shift queue + next-city posture (SHIFT-01)

### Phase 68: Regression QA Lock
**Goal**: Milestone bar is permanent — independence/accuracy/brain/processUpload locks green, live server healthy, mobile + reduced-motion paths verified for theater
**Depends on**: Phases 61–67
**Requirements**: QA-01, QA-02, QA-03
**Success Criteria** (what must be TRUE):
  1. All Filter independence / accuracy / brain / processUpload locks from v1.6–v2.0 stay green (`npm test`)
  2. `scripts/verify-live.ps1` exits 0 after milestone work; `/bridge` health + homepage HTTP 200
  3. Mobile 390 + desktop 1440: no horizontal overflow; primary CTAs ≥ 44px; reduced-motion paths verified for FEED/KILL/THTR motion
**Plans**: 2 plans · plan-check **PASS**
- [ ] 68-01-PLAN.md — Theater contracts packaging + TEST-PLAN §O + QA checklist
- [ ] 68-02-PLAN.md — Ship gate: full suite + verify-live + `/bridge` 200 + checklist evidence

---

## Progress

**Execution Order:** 61 → 62 → 63 → 64 → 65 → 66 → 67 → 68

| Phase | Plans | Status | Plan-check | Completed |
|-------|-------|--------|------------|-----------|
| 61. Scrub Desk Foundation | 3/3 | Complete (re-verify) | PASS | 2026-07-10 |
| 62. City Dossier | 2/2 | Complete | PASS | 2026-07-10 |
| 63. Idle Proof & Process Climax | 2/2 | Complete | PASS | 2026-07-10 |
| 64. Live Scrub Feed | 2/2 | Complete | PASS | 2026-07-11 |
| 65. Kill-Rate Scrub Report | 1/3 | In Progress | PASS | — |
| 66. Superpower Train Theater | 0/3 | Ready to execute | PASS | — |
| 67. Multi-City Shift & Staging | 0/3 | Ready to execute | PASS | — |
| 68. Regression QA Lock | 0/2 | Ready to execute | PASS | — |

### Coverage Map

| Requirement | Phase |
|-------------|-------|
| DESK-01 | 61 |
| DESK-02 | 61 |
| DESK-03 | 61 |
| DESK-04 | 61 |
| DESK-05 | 61 |
| DESK-06 | 61 |
| CITY-01 | 62 |
| CITY-02 | 62 |
| IDLE-01 | 63 |
| IDLE-02 | 63 |
| FEED-01 | 64 |
| FEED-02 | 64 |
| KILL-01 | 65 |
| KILL-02 | 65 |
| KILL-03 | 65 |
| THTR-01 | 66 |
| THTR-02 | 66 |
| THTR-03 | 66 |
| SHIFT-01 | 67 |
| SHIFT-02 | 67 |
| SHIFT-03 | 67 |
| QA-01 | 68 |
| QA-02 | 68 |
| QA-03 | 68 |

**Mapped:** 24/24 ✓

### Per-phase verification spirit

Every phase: observable success criteria + `npm test` green + `scripts/verify-live.ps1` exit 0 in spirit.  
**Phase 68 owns formal lock** of the full suite, live gate, and mobile/a11y motion bar.

### Constraints (all phases)

- Filter `/bridge` UI only
- No processUpload keep/kill engine rewrite
- Preserve Analyze independence (v2.0)
- Vanilla stack (no React)
- Never wipe filter-lists / bridge-brain data
- Preserve stable DOM IDs used by tests unless plan migrates with tests

---

<details>
<summary>✅ v2.0 Filter Independence & Learning (Phases 55–60) — SHIPPED 2026-07-10</summary>

- [x] Phase 55: Independence Lock (3/3 plans) — completed 2026-07-10
- [x] Phase 56: List Factory UX (3/3 plans) — completed 2026-07-10
- [x] Phase 57: Accuracy Structure Pass (3/3 plans) — completed 2026-07-10
- [x] Phase 58: Learning Loop Strength (3/3 plans) — completed 2026-07-10
- [x] Phase 59: Efficiency Operator Path (3/3 plans) — completed 2026-07-10
- [x] Phase 60: Regression QA Lock (2/2 plans) — completed 2026-07-10

**Mapped:** IND · LIST · ACC · LRN · EFF · TEST (18/18)

</details>

<details>
<summary>✅ v1.8 Type Column Intelligence (Phases 51–54) — SHIPPED 2026-07-10</summary>

- [x] Phase 51: COL Scoring + Map Wire (3/3 plans) — completed 2026-07-10
- [x] Phase 52: Format Memory + Confirm Gate (4/4 plans) — completed 2026-07-10
- [x] Phase 53: Display-Only Short Labels (4/4 plans) — completed 2026-07-10
- [x] Phase 54: Regression Lock (2/2 plans) — completed 2026-07-10

**Full archive:** [milestones/v1.8-ROADMAP.md](./milestones/v1.8-ROADMAP.md) · [milestones/v1.8-REQUIREMENTS.md](./milestones/v1.8-REQUIREMENTS.md)

</details>

<details>
<summary>✅ v1.7 Filter Accuracy & Grouping (Phases 48–50) — SHIPPED 2026-07-10</summary>

- [x] Phase 48: Category Promotion & Signal Shape (2/2 plans) — completed 2026-07-10
- [x] Phase 49: Stable Group Keys (1/1 plan) — completed 2026-07-10
- [x] Phase 50: Regression Lock (1/1 plan) — completed 2026-07-10

**Full archive:** [milestones/v1.7-ROADMAP.md](./milestones/v1.7-ROADMAP.md) · [milestones/v1.7-REQUIREMENTS.md](./milestones/v1.7-REQUIREMENTS.md)

</details>

<details>
<summary>✅ v1.6 Filter Superpower Brain (Phases 42–47) — SHIPPED 2026-07-10</summary>

- [x] Phase 42: Brain store + runtime apply (2/2 plans) — completed 2026-07-10
- [x] Phase 43: Review payload + grouping (2/2 plans) — completed 2026-07-10
- [x] Phase 44: Admin Train brain UX (2/2 plans) — completed 2026-07-10
- [x] Phase 45: Decisions + type rules + list mutation (3/3 plans) — completed 2026-07-10
- [x] Phase 46: Phrase mining + brain panel (2/2 plans) — completed 2026-07-10
- [x] Phase 47: Hardening + metrics + docs (1/1 plan) — completed 2026-07-10

**Full archive:** [milestones/v1.6-ROADMAP.md](./milestones/v1.6-ROADMAP.md) · [milestones/v1.6-REQUIREMENTS.md](./milestones/v1.6-REQUIREMENTS.md) · [milestones/v1.6-MILESTONE-AUDIT.md](./milestones/v1.6-MILESTONE-AUDIT.md)

</details>

<details>
<summary>✅ v1.5 Territory Theater (Phases 37–41) — implemented</summary>

Phases 37–41 delivered territory/theater product surfaces.

</details>

<details>
<summary>✅ v1.4 Gritty Premium Surfaces (Phases 32–36) — implemented</summary>

Phases 32–36 delivered gritty premium surface polish after signature brand.

</details>

<details>
<summary>✅ v1.3 Phuglee Signature Brand (Phases 22–31) — shipped 2026-07-06</summary>

| Phase | Name | Status |
|-------|------|--------|
| 22–31 | Design system through cross-app QA | complete |

**Design:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`

</details>

<details>
<summary>✅ v1.2 Premium Brand Experience (Phases 14–21) — shipped 2026-07-06</summary>

Premium atmosphere + components on post-login surfaces; Form Forge and Analyzer premium CSS.

</details>

<details>
<summary>🔄 v1.1 Unified Heat Design (Phases 7–13) — superseded by v1.3</summary>

Heat tokens + nav + reskin partially overtaken by `--phuglee-*` signature brand.

</details>
