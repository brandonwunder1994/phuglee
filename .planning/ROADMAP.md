# Roadmap: Distress OS

## Milestones

- âœ… **v1.0 Shell & Integration** â€” Phases 1â€“6 (shipped 2026-07-01)
- ðŸ”„ **v1.1 Unified Heat Design** â€” Phases 7â€“13 (in progress â€” superseded by v1.3 tokens)
- âœ… **v1.2 Premium Brand Experience** â€” Phases 14â€“21 (shipped 2026-07-06)
- âœ… **v1.3 Phuglee Signature Brand** â€” Phases 22â€“31 (shipped 2026-07-06)
- âœ… **v1.4 Gritty Premium Surfaces** â€” Phases 32â€“36 (implemented)
- âœ… **v1.5 Territory Theater** â€” Phases 37â€“41 (implemented)
- âœ… **v1.6 Filter Superpower Brain** â€” Phases 42â€“47 (shipped 2026-07-10) â€” [archive](./milestones/v1.6-ROADMAP.md)
- ðŸš§ **v1.7 Filter Accuracy & Grouping** â€” Phases 48â€“50 (in progress)

## Active Work

**Milestone:** v1.7 Filter Accuracy & Grouping  
**Status:** Phase 49 complete — next Phase 50 regression lock  
**Goal:** Train/Filter grouping stacks real categories; timestamps do not create false singletons; FN rows show city categories; signal chips stay visible.

**Diagnosis:** [debug/filter-singleton-no-category.md](./debug/filter-singleton-no-category.md)

---

## Phases

### ðŸš§ v1.7 Filter Accuracy & Grouping (Phases 48â€“50)

- [x] **Phase 48: Category Promotion & Signal Shape** - Promote real categories into type; keep indicator arrays on process path
- [x] **Phase 49: Stable Group Keys** - Strip incidental timestamps; stack same category; singleton only when count === 1
- [ ] **Phase 50: Regression Lock** - Automated accuracy tests; `npm test` + verify-live green

---

## Phase Details

### Phase 48: Category Promotion & Signal Shape
**Goal**: Process path yields real city categories on rows and array-shaped signals so Train can label FN/distressed groups and render chips
**Depends on**: Nothing (v1.6 foundation shipped)
**Requirements**: MAP-01, MAP-02, MAP-03, SHAPE-01, SHAPE-02
**Success Criteria** (what must be TRUE):
  1. When a source category/issue-type column is present but unmapped (or only in raw cells), process promotes a real category into `violationIssueType` for Train labels
  2. Not-distressed (false-negative) groups show the real city category when the spreadsheet had one â€” not only notes or `(no type)`
  3. Promotion does not invent fake types from pure free-text noise when no category signal exists; prefers category-like headers/cells over timestamp-only notes
  4. Process/review rows keep `matchedIndicators` as string arrays so Train chips can render matches
  5. Spreadsheet/export path still joins indicators to a single cell string (export contract unchanged for Analyzer)
**Plans**: 2 plans

Plans:
- [x] 48-01-PLAN.md â€” SHAPE: keep matchedIndicators as arrays on process rows; join only on export
- [x] 48-02-PLAN.md â€” MAP: pure category promote helper + normalizer wire for unmapped city categories

### Phase 49: Stable Group Keys
**Goal**: Same real-world category stacks into one group; incidental timestamps no longer flood Train with false singletons
**Depends on**: Phase 48
**Requirements**: GROUP-01, GROUP-02, GROUP-03, GROUP-04
**Success Criteria** (what must be TRUE):
  1. When `violationIssueType` is empty, review groups key free-text descriptions after stripping incidental dates/times so rows that differ only by timestamp stack into one group
  2. When type values themselves embed per-row timestamps/dates, grouping still stacks rows that share the same category phrase
  3. Rows that already have a clean shared `violationIssueType` (e.g. typed High Grass) continue to stack on the normalized type key (no regression)
  4. Singleton (`isSingleton` / badge) is true only when the stabilized group has count === 1
**Plans**: 1 plan

Plans:
- [x] 49-01-PLAN.md — TDD: strip/stable helpers + wire buildReviewGroups (GROUP-01..04)

### Phase 50: Regression Lock
**Goal**: Accuracy fixes stay locked by automated tests; full suite and live server remain green
**Depends on**: Phase 49
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Automated test: Description-only High Grass rows with differing timestamps â†’ one distressed group with count N
  2. Automated test: Unmapped category column â†’ `violationIssueType` populated and FN/distressed labels use it
  3. Automated test: Typed clean High Grass still stacks; `npm test` and `scripts/verify-live.ps1` green
**Plans**: TBD

---

<details>
<summary>âœ… v1.6 Filter Superpower Brain (Phases 42â€“47) â€” SHIPPED 2026-07-10</summary>

- [x] Phase 42: Brain store + runtime apply (2/2 plans) â€” completed 2026-07-10
- [x] Phase 43: Review payload + grouping (2/2 plans) â€” completed 2026-07-10
- [x] Phase 44: Admin Train brain UX (2/2 plans) â€” completed 2026-07-10
- [x] Phase 45: Decisions + type rules + list mutation (3/3 plans) â€” completed 2026-07-10
- [x] Phase 46: Phrase mining + brain panel (2/2 plans) â€” completed 2026-07-10
- [x] Phase 47: Hardening + metrics + docs (1/1 plan) â€” completed 2026-07-10

**Full archive:** [milestones/v1.6-ROADMAP.md](./milestones/v1.6-ROADMAP.md) Â· [milestones/v1.6-REQUIREMENTS.md](./milestones/v1.6-REQUIREMENTS.md) Â· [milestones/v1.6-MILESTONE-AUDIT.md](./milestones/v1.6-MILESTONE-AUDIT.md)

</details>

<details>
<summary>âœ… v1.5 Territory Theater (Phases 37â€“41) â€” implemented</summary>

Phases 37â€“41 delivered territory/theater product surfaces.

</details>

<details>
<summary>âœ… v1.4 Gritty Premium Surfaces (Phases 32â€“36) â€” implemented</summary>

Phases 32â€“36 delivered gritty premium surface polish after signature brand.

</details>

<details>
<summary>âœ… v1.3 Phuglee Signature Brand (Phases 22â€“31) â€” shipped 2026-07-06</summary>

| Phase | Name | Status |
|-------|------|--------|
| 22â€“31 | Design system through cross-app QA | complete |

**Design:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`

</details>

<details>
<summary>âœ… v1.2 Premium Brand Experience (Phases 14â€“21) â€” shipped 2026-07-06</summary>

Premium atmosphere + components on post-login surfaces; Form Forge and Analyzer premium CSS.

</details>

<details>
<summary>ðŸ”„ v1.1 Unified Heat Design (Phases 7â€“13) â€” superseded by v1.3</summary>

Heat tokens + nav + reskin partially overtaken by `--phuglee-*` signature brand.

</details>

<details>
<summary>âœ… v1.0 Shell & Integration (Phases 1â€“6) â€” shipped 2026-07-01</summary>

Landing, Command Hub, reverse proxy, Data Bridge, health orchestration, unit tests.

</details>

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 42â€“47 | v1.6 | 12/12 | Complete | 2026-07-10 |
| 48. Category Promotion & Signal Shape | v1.7 | 2/2 | Complete | 2026-07-10 |
| 49. Stable Group Keys | v1.7 | 1/1 | Complete | 2026-07-10 |
| 50. Regression Lock | v1.7 | 0/TBD | Not started | - |

---

*Roadmap updated: 2026-07-10 — Phase 49 complete (stable group keys GROUP-01..04)*
