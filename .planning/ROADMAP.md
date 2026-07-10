# Roadmap: Distress OS

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
- 🚧 **v2.0 Filter Independence & Learning** — Phases 55–60 (in progress)

## Overview

v2.0 makes Filter a **standalone list factory**: process city files → admin Train when needed → save multi-city lists → download for external enrich/skip-trace → **manual** Analyze import. Independence locks first so later work cannot re-couple; list UX elevates Save/Download; accuracy gold fixtures protect the brain; learning metrics prove Approve/Deny falls for the right reason; efficiency shortens day-2 paths without silent drops; regression QA freezes the whole bar.

**Granularity:** standard (6 phases)  
**Coverage:** 18/18 v2.0 requirements mapped

## Active Work

**Milestone:** v2.0 Filter Independence & Learning  
**Status:** Phase 56 complete — next: Phase 57 Accuracy Structure Pass  
**Phase numbering:** 55–60 (continues from v1.8 phase 54)

---

## Phases

- [x] **Phase 55: Independence Lock** — Process/save/Train never write Analyze; push adapter gone; `already_imported` off by default
- [x] **Phase 56: List Factory UX** — Save → Download is the hero path; multi-city lists persist until operator deletes
- [ ] **Phase 57: Accuracy Structure Pass** — Gold fixtures lock keep/kill + Type/format; no silent drops; v1.7–v1.8 locks preserved
- [ ] **Phase 58: Learning Loop Strength** — Paired learning metrics; real rule coverage; phrases stay proposed-only
- [ ] **Phase 59: Efficiency Operator Path** — Shorter day-2 path to saved list without accuracy or Analyze re-coupling tradeoffs
- [ ] **Phase 60: Regression QA Lock** — Independence + gold + processUpload e2e + suite + verify-live green

## Phase Details

### Phase 55: Independence Lock
**Goal**: Filter is write-isolated from Analyze — process, save, Train, and list APIs never push leads into Analyze; residual push surfaces cannot resurrect; re-work lists stay full because `already_imported` filtering is off by default
**Depends on**: Nothing (v1.8 shipped — Type column + format gate baseline)
**Requirements**: IND-01, IND-02, IND-03, IND-04
**Success Criteria** (what must be TRUE):
  1. Operator can process a city file, Train (if admin), and save/download a list without any Analyze session write or `bridge-import-records` side effect
  2. Legacy Analyze-push adapter (`bridge-analyzer-push` and call sites/UI) is deleted or quarantined so re-wiring it fails automated tests
  3. Automated negative tests prove process + save paths never require Analyze push and never invent Analyze session writes
  4. Re-filtering or purging a city keeps the full kept list by default — `already_imported` Analyze-index filtering does not hard-drop rows unless an explicit future opt-in is enabled
**Plans**: 3 plans

Plans:
- [x] 55-01-PLAN.md — Default-off already_imported in processUpload (IND-04)
- [x] 55-02-PLAN.md — Delete push adapter + independence negative tests (IND-01/02/03)
- [x] 55-03-PLAN.md — Docs + light UI copy for independence messaging

### Phase 56: List Factory UX
**Goal**: Operators treat Filter as a multi-city list factory — primary path is Save list then Download (one or all) for external enrich, with copy that teaches Process → (Train) → Save → Download → manual Analyze import
**Depends on**: Phase 55
**Requirements**: LIST-01, LIST-02, LIST-03
**Success Criteria** (what must be TRUE):
  1. After process (and optional Train), the primary CTAs are **Save list** and **Download** (one or all) — not “send to Analyze”
  2. Operator can save multiple city lists and they remain after process, restart, and deploy until the operator deletes them
  3. UI workflow and copy clearly teach Process → (Train) → Save → Download for external enrich → manual Analyze import
**Plans:** 3 plans

Plans:
- [x] 56-01-PLAN.md — LIST-03 teaching pack + LIST-01 CTA hierarchy (Save primary, Preview CSV, workflow strip)
- [x] 56-02-PLAN.md — Dirty-guard + soft Train-before-Save + save flash download path
- [x] 56-03-PLAN.md — factory-ux tests + list-store accumulate + docs light + suite gate

### Phase 57: Accuracy Structure Pass
**Goal**: Residual heterogeneous-city keep/kill and Type/format failures are fixed with gold fixtures — real distress stays kept, junk is denied, water is never type-suppressed, and accuracy changes never silent-drop inventory
**Depends on**: Phase 56 (operators can stage lists while accuracy hardens; independence already locked)
**Requirements**: ACC-01, ACC-02, ACC-03
**Success Criteria** (what must be TRUE):
  1. Gold city fixtures pass: real distress kept, junk denied, water shut-off never type-suppressed — fixes land in code, not audit-only notes
  2. Process never silent-drops leads solely for “no Type,” unresolved map, or cleaner kept counts — rows remain for review / FN pool / explicit reasons
  3. v1.7–v1.8 locks still hold: single Type winner (no blend), empty-only category promote, stable group keys, display-only short labels, format confirm on first/changed fingerprint
**Plans:** 3 plans

Plans:
- [ ] 57-01-PLAN.md — Wave 0 gold fixtures + ACC-01/02 processUpload contracts
- [ ] 57-02-PLAN.md — Fix only gold reds (tagger/engine) until ACC-01 green
- [ ] 57-03-PLAN.md — ACC-02 silent-drop bans + ACC-03 v1.7–v1.8 regression lock

### Phase 58: Learning Loop Strength
**Goal**: Admin can see the brain getting smarter for the right reason — paired metrics (decision volume trend + gold precision/recall) with real rule apply coverage; type rules live, phrases stay proposed-only
**Depends on**: Phase 57 (good groups/types before strengthening learning)
**Requirements**: LRN-01, LRN-02, LRN-03
**Success Criteria** (what must be TRUE):
  1. Admin can view paired learning metrics: Approve/Deny (or decisions-per-comparable-process) trend **and** gold-set precision/recall not degrading
  2. Metrics cannot be “won” by hiding Train groups, auto-activating phrases, or silent-dropping rows — success requires real rule apply coverage
  3. Type suppress/promote still apply on process from admin decisions; phrase rules remain proposed-only until admin activate (no unsupervised live ML)
**Plans**: TBD

### Phase 59: Efficiency Operator Path
**Goal**: Day-2 / known-format operators reach a saved downloadable list faster via format reuse, stacked Train, and bulk download — without trading accuracy or re-coupling Filter to Analyze
**Depends on**: Phases 57–58 (accuracy frozen; learning path trustworthy)
**Requirements**: EFF-01, EFF-02
**Success Criteria** (what must be TRUE):
  1. For known formats / day-2 cities, operator path to a saved list is shorter: format auto-reuse, stacked Train where applicable, bulk download — without measurable accuracy regression on gold fixtures
  2. No efficiency change increases silent drops, skips Train when needed, or re-introduces Filter → Analyze push/write coupling
**Plans**: TBD

### Phase 60: Regression QA Lock
**Goal**: Independence, gold accuracy, processUpload e2e, full suite, and live server stay permanently green for the milestone bar
**Depends on**: Phases 55–59
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Independence regression suite locks no-push + `already_imported` default-off behavior in CI
  2. Gold accuracy fixtures from ACC run in `npm test` and stay green
  3. `scripts/verify-live.ps1` is green after milestone work; processUpload e2e still covers Type/format/water paths
**Plans**: TBD

---

## Progress

**Execution Order:** 55 → 56 → 57 → 58 → 59 → 60

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 55. Independence Lock | 0/3 | Planned | - |
| 56. List Factory UX | 0/3 | Planned | - |
| 57. Accuracy Structure Pass | 0/3 | Planned | - |
| 58. Learning Loop Strength | 0/TBD | Not started | - |
| 59. Efficiency Operator Path | 0/TBD | Not started | - |
| 60. Regression QA Lock | 0/TBD | Not started | - |

### Coverage Map

| Requirement | Phase |
|-------------|-------|
| IND-01 | 55 |
| IND-02 | 55 |
| IND-03 | 55 |
| IND-04 | 55 |
| LIST-01 | 56 |
| LIST-02 | 56 |
| LIST-03 | 56 |
| ACC-01 | 57 |
| ACC-02 | 57 |
| ACC-03 | 57 |
| LRN-01 | 58 |
| LRN-02 | 58 |
| LRN-03 | 58 |
| EFF-01 | 59 |
| EFF-02 | 59 |
| TEST-01 | 60 |
| TEST-02 | 60 |
| TEST-03 | 60 |

**Mapped:** 18/18 ✓

---

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

<details>
<summary>✅ v1.0 Shell & Integration (Phases 1–6) — shipped 2026-07-01</summary>

Landing, Command Hub, reverse proxy, Data Bridge, health orchestration.

</details>

---
*Roadmap created: 2026-07-10 for v2.0 Filter Independence & Learning*  
*Phases 55–60 · 18/18 requirements mapped*
