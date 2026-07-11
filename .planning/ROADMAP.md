# Roadmap: Distress OS

> **Active roadmap:** this file  
> **Shipped archives:** `.planning/milestones/v*-ROADMAP.md`

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
- ✅ **v2.0 Filter Independence & Learning** — Phases 55–60 (shipped 2026-07-10) — [archive](./milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Filter Scrub Theater** — Phases 61–68 (shipped 2026-07-11) — [archive](./milestones/v2.1-ROADMAP.md)
- ✅ **v2.2 Filter Desk Cinema** — Phases 69–74 (shipped 2026-07-10) — [doc](./v2.2-FILTER-DESK-CINEMA.md)
- 🚧 **v3.0 Filter Visual Makeover** — Phases 75–81 (in progress)

## Active Work

**Milestone:** v3.0 Filter Visual Makeover  
**Status:** In progress — Phase 75 (1/2 plans)  
**Next:** Execute `75-02-PLAN.md`

**Goal:** Full visual redesign of Filter (`/bridge`) so it matches the login/home “badass” look — every control upgraded — plus a reusable Phuglee design system for later site-wide rollout, with **zero functional change**.

**Hard constraints (every phase):**
- CSS + presentational markup only — freeze `bridge-*` IDs, `data-action` / `data-mode` / `data-format` / `data-step`
- North star: login modal + home page (glass, grain, Anton/Outfit, raised CTAs)
- No process / brain / keep-kill / list engine / `public/js/bridge*.js` / `lib/**` behavior changes
- Final ship bar (Phase 81): full suite green (679+) + `scripts/verify-live.ps1` exit 0

## Phases

- [ ] **Phase 75: Contract Freeze & Surface Inventory** — Lock ID/`data-*` contracts and inventory every Filter surface for restyle targets
- [ ] **Phase 76: Tokens & Layer Audit** — Align Filter with home/login tokens; map z-index and ban hex islands
- [ ] **Phase 77: Shared Components Expansion** — Grow `phuglee-*` buttons, chips, panels, empty/error patterns to home grade
- [ ] **Phase 78: Cascade, Hooks & State CSS** — Fix load order; dual-class wire forms/dropzone/dialogs; honor `hidden`/`disabled`
- [ ] **Phase 79: Desk Core Restyle** — Restyle high-frequency chrome (hero, pipeline, scrub, tables, elevation)
- [ ] **Phase 80: Theater, Gates & Motion** — Full surface paint including kill/Train/victory; reduced-motion twins
- [ ] **Phase 81: Visual QA Lock & Catalog** — 390/1440 QA, suite + verify-live, parity matrix + component catalog

## Phase Details

### Phase 75: Contract Freeze & Surface Inventory
**Goal**: Operators and implementers have a frozen Filter contract so every later visual edit cannot rename IDs or break cinema structure  
**Depends on**: Nothing (first v3.0 phase; builds on shipped v2.2 desk)  
**Requirements**: DESK-05  
**Success Criteria** (what must be TRUE):
  1. A written freeze checklist lists every critical `bridge-*` ID, `data-action` / `data-mode` / `data-format` value, and cinema structure-order lock used by JS/tests
  2. A surface inventory maps each `/bridge` visual region (hero → dialogs) to a component/target layer (tokens / phuglee / bridge layout)
  3. A state matrix documents JS-toggled states (`hidden`, `disabled`, `is-theater`, `has-file`, etc.) that CSS may style but must not invent
  4. Operator workflows still boot with all locked contracts intact (no renames, no `data-action` churn)
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual  
**Plans:** 2 plans (1/2 complete)

Plans:
- [x] 75-01-PLAN.md — DESK-05 contract freeze checklist + greppable freeze test
- [ ] 75-02-PLAN.md — Surface inventory + JS state matrix for restyle phases

### Phase 76: Tokens & Layer Audit
**Goal**: Filter reads the same Phuglee token DNA as login/home — color, glass, type, status — before any mass paint  
**Depends on**: Phase 75  
**Requirements**: TOKENS-01, TOKENS-02, TOKENS-03, TOKENS-04  
**Success Criteria** (what must be TRUE):
  1. Operator sees Filter chrome using shared Phuglee color/glass/shadow tokens (no one-off hex islands in desk chrome)
  2. Operator reads hierarchy via Anton display / Outfit body / mono data on Filter headings, labels, and dense cells
  3. Operator experiences glass + grain atmosphere on Filter panels in the same brand family as login/home (desk density allowed)
  4. Operator sees success / warn / danger only via canonical semantic status tokens
  5. Maintainer has a documented z-index scale (bg → main → sticky HUD → typeahead → dialog → toast) with no competing ad-hoc stacks
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual; extend `tokens.css` only when a gap is proven  
**Plans:** 2 plans

Plans:
- [ ] 76-01-PLAN.md — Extend tokens.css: z-index scale + desk density/chip/row/status tokens
- [ ] 76-02-PLAN.md — Wire bridge.css to tokens (hex islands, z-index, type); cache-bust ?v=

### Phase 77: Shared Components Expansion
**Goal**: Filter consumes a home-grade shared control system instead of inventing one-off CTAs and panels  
**Depends on**: Phase 76  
**Requirements**: BUTTONS-01, BUTTONS-02, BUTTONS-03, FORMS-02, FORMS-03, CARDS-01, STATES-01, STATES-03  
**Success Criteria** (what must be TRUE):
  1. Operator can use primary / secondary / ghost / danger system buttons for actionable controls (classes ready for full desk wire)
  2. Operator sees consistent hover, focus, active, and disabled states on system buttons
  3. Operator sees contained primary CTA energy (subtle shimmer/gem) matching home, capped for all-day desk use
  4. Operator can select list type via system chip components (code / water) with radio semantics preserved; selected chips show auth-tab gold/orange energy, unselected stay calm
  5. Operator sees shared glass panel/card language and shared empty + error/success status patterns available for desk use
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual; expand `phuglee-components.css` — no parallel theme sheet; kill-report theater stays out of shared  
**Plans:** 2 plans

Plans:
- [ ] 77-01-PLAN.md -- Button system + capped primary CTA shimmer (BUTTONS-01..03)
- [ ] 77-02-PLAN.md -- Chips (auth-tab energy), panels, empty/error/success (FORMS-02/03, CARDS-01, STATES-01/03)

### Phase 78: Cascade, Hooks & State CSS
**Goal**: Correct cascade + dual-class hooks so system components win on Filter, and state CSS honors real `hidden`/`disabled` semantics  
**Depends on**: Phase 77  
**Requirements**: FORMS-01, FORMS-04, CARDS-02, STATES-02  
**Success Criteria** (what must be TRUE):
  1. Operator uses text inputs, selects, textareas, and search fields that share the system form language (city search, save name, Train search, filters)
  2. Operator uses the file dropzone with clear idle / dragover / has-file / error visual states (multi-file + accept list unchanged)
  3. Operator opens history and type-column confirm dialogs that match system modal glass/grain treatment (confirm logic frozen; still native `<dialog>`)
  4. Operator sees loading / scrub-in-progress feedback via shared loading patterns; scrub feed remains legible and populates without relying on `animationend`
  5. CSS load order is components → bridge → a11y; dual-class hooks applied without renaming IDs; no `display` hacks that fail-open Train for non-admins
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual; never force `display:flex !important` on Train wrap  
**Plans**: TBD

### Phase 79: Desk Core Restyle
**Goal**: High-frequency operator chrome (hero, pipeline, scrub stage, dossier, import, tables) matches Phuglee density and elevation  
**Depends on**: Phase 78  
**Requirements**: CARDS-03, DESK-03  
**Success Criteria** (what must be TRUE):
  1. Operator can scan elevation hierarchy — primary scrub stage elevated, scrap/secondary quieter, victory ready to be featured
  2. Operator can read kept + inventory tables on dark glass (sticky header, hover/zebra, usable horizontal scroll at 390 width)
  3. Operator sees hero/type hierarchy, pipeline chips, scrub desk forms, dropzone, Process CTA energy, and dossier/outcome scrap hierarchy restyled without layout rewrite
  4. Operator still completes city → type → dropzone → process path with unchanged structure and contracts
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual; desk density ≠ auth-modal roominess on tables; no 4th unscoped `!important` strata  
**Plans**: 2 plans

Plans:
- [ ] 79-01-PLAN.md - Elevation hierarchy + hero/pipeline/scrub/dossier/import shells (CARDS-03)
- [ ] 79-02-PLAN.md - Kept + inventory dark-glass tables sticky/zebra/hover/390 scroll (DESK-03)

### Phase 80: Theater, Gates & Motion
**Goal**: Full Filter surface paint including cinema climax, Train gates, and reduced-motion-safe motion — no orphan pre-system chrome  
**Depends on**: Phase 79  
**Requirements**: DESK-01, DESK-02, DESK-04, STATES-04  
**Success Criteria** (what must be TRUE):
  1. Operator sees a full visual pass on every `/bridge` surface (hero, pipeline, scrub, dossier, outcome, import, feed, mission/kill, save, train/armory, kept table, lists, shift HUD, victory, dialogs) with no orphan pre-system chrome
  2. Operator still experiences kill report + mission board as climax-first (RAW → KILLED → KEPT order and Save elevation preserved; visual only)
  3. Operator (admin) experiences Train theater + Rules armory as distinct visual modes; non-admin Train remains fail-closed/hidden
  4. Operator with `prefers-reduced-motion: reduce` gets reduced/disabled motion twins for every new animation (feed, shimmer, reveal, flash); feed still completes
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual; admin fail-closed is never CSS-only; cinema copy locks intact  
**Plans**: 2 plans

Plans:
- [ ] 80-01-PLAN.md — Kill climax + mission/victory/lists/feed/dialog surface paint (DESK-01, DESK-02)
- [ ] 80-02-PLAN.md — Train theater/armory modes + reduced-motion twins (DESK-04, STATES-04)

### Phase 81: Visual QA Lock & Catalog
**Goal**: Makeover is shippable — layout QA, permanent bars, behavior freeze, and reusable system docs for later pages  
**Depends on**: Phase 80  
**Requirements**: QA-01, QA-02, QA-03, QA-04, SYS-01, SYS-02  
**Success Criteria** (what must be TRUE):
  1. Operator on 390px and 1440px widths can complete the primary scrub path without broken layout
  2. Full automated suite remains green at or above the pre-milestone bar (679+ tests; no intentional behavior regressions)
  3. `scripts/verify-live.ps1` exits 0 (health + homepage HTTP 200) after Filter visual changes
  4. Behavior freeze holds — no process/API/brain/keep-kill/list workflow changes; no Analyze re-coupling chrome
  5. Maintainer has a short component catalog note (tokens + class names + do/don't) and a screenshot parity matrix checklist (login/home vs Filter pairs)
**Hard constraints**: CSS/markup only; freeze bridge IDs and data-action; north star login/home visual; **verify-live + suite bar mandatory**; bump CSS `?v=` / hard-refresh note; never wipe `data/filter-lists` or brain for screenshots  
**Plans:** 2 plans

Plans:
- [ ] 81-01-PLAN.md — Component catalog, parity matrix, 390/1440 checklist template, TEST-PLAN §P
- [ ] 81-02-PLAN.md — Suite ≥679 + verify-live + fill checklist / freeze / parity Pass

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 75. Contract Freeze & Surface Inventory | v3.0 | 0/2 | Planned | - |
| 76. Tokens & Layer Audit | v3.0 | 0/2 | Planned | - |
| 77. Shared Components Expansion | v3.0 | 0/2 | Planned | - |
| 78. Cascade, Hooks & State CSS | v3.0 | 0/TBD | Not started | - |
| 79. Desk Core Restyle | v3.0 | 0/2 | Planned | - |
| 80. Theater, Gates & Motion | v3.0 | 0/TBD | Not started | - |
| 81. Visual QA Lock & Catalog | v3.0 | 0/2 | Planned | - |
| 69–74 | v2.2 | 6/6 | Complete | 2026-07-10 |
| 61–68 | v2.1 | 20/20 | Complete | 2026-07-11 |

<details>
<summary>✅ v2.2 Filter Desk Cinema (Phases 69–74) — SHIPPED 2026-07-10</summary>

- [x] Phase 69: One Scrub Desk — collapse wizard into city+type+dropzone stage
- [x] Phase 70: Idle Mission Board — live staged/records/cities HUD
- [x] Phase 71: Type chips — kill peer essay cards
- [x] Phase 72: Post-scrub mission surface — kill report + Save elevated; table collapsible
- [x] Phase 73: War-room victory end — download + scrub next strip after save
- [x] Phase 74: Regression lock — `tests/bridge-desk-cinema.test.js`

Plan: [docs/superpowers/plans/2026-07-10-filter-desk-cinema.md](../docs/superpowers/plans/2026-07-10-filter-desk-cinema.md)

</details>

<details>
<summary>✅ v2.1 Filter Scrub Theater (Phases 61–68) — SHIPPED 2026-07-11</summary>

- [x] Phase 61: Scrub Desk Foundation (3/3 plans) — completed 2026-07-10
- [x] Phase 62: City Dossier (2/2 plans) — completed 2026-07-10
- [x] Phase 63: Idle Proof & Process Climax (2/2 plans) — completed 2026-07-11
- [x] Phase 64: Live Scrub Feed (2/2 plans) — completed 2026-07-11
- [x] Phase 65: Kill-Rate Scrub Report (3/3 plans) — completed 2026-07-11
- [x] Phase 66: Superpower Train Theater (3/3 plans) — completed 2026-07-11
- [x] Phase 67: Multi-City Shift & Staging (3/3 plans) — completed 2026-07-11
- [x] Phase 68: Regression QA Lock (2/2 plans) — completed 2026-07-11

Full phase detail: [v2.1-ROADMAP.md](./milestones/v2.1-ROADMAP.md)  
Requirements: [v2.1-REQUIREMENTS.md](./milestones/v2.1-REQUIREMENTS.md)

</details>

---
*Roadmap updated 2026-07-11 — v3.0 Filter Visual Makeover phases 75–81*
