# M8 — Filter Scrub Theater (v2.1)

> **Status:** `planned` — GSD pipeline complete (map → requirements → roadmap → research → plan-phase **checked**); **awaiting execute**  
> **Created:** 2026-07-10  
> **Plans:** 19 executable plans under `.planning/phases/61-*` … `68-*` (all plan-checker PASS)  
> **Roadmap:** `.planning/ROADMAP.md` (authoritative)  
> **Requirements:** `.planning/REQUIREMENTS.md`  
> **Depends on:** v2.0 Filter Independence & Learning (phases 55–60 — shipped)  
> **Design bible:** `.planning/v2.1-FILTER-SCRUB-THEATER.md`  
> **Style bar:** `.planning/v1.4-GRITTY-PREMIUM.md`  
> **Research map:** `.planning/codebase/filter-page-ui-map.md`  
> **Archive path (on complete):** `.planning/milestones/v2.1-ROADMAP.md` + `v2.1-REQUIREMENTS.md`  
> **Scope:** Filter `/bridge` UI theater only — no keep/kill engine rewrite, no Analyze re-coupling

---

## Goal

Make `/bridge` feel like a **gritty multi-city scrub desk** with live kill theater, kill-rate report, city dossiers, Train superpower climax, and shift inventory — matching Collect/Command quality bar.

If Filter still feels like a multi-step admin form after this milestone — **it fails**.

---

## Official phase list (GSD roadmapper)

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 61 | Scrub Desk Foundation | Asymmetric desk; kill proof rail; atmosphere; Anton H1; slim chrome; unified buttons | DESK-01–06 | ready (2 plans, check PASS) |
| 62 | City Dossier | Ops case file on city select; no-list path demoted | CITY-01–02 | ready (2 plans, check PASS) |
| 63 | Idle Proof & Process Climax | Live idle metrics; Process as fire climax | IDLE-01–02 | ready (2 plans, check PASS) |
| 64 | Live Scrub Feed | Activity feed during process; reduced-motion safe | FEED-01–02 | ready (2 plans, check PASS) |
| 65 | Kill-Rate Scrub Report | RAW→KILLED→KEPT hierarchy; proof chips; Save primary | KILL-01–03 | ready (3 plans, check PASS) |
| 66 | Superpower Train Theater | Train climax when open groups; brain secondary; admin gate | THTR-01–03 | ready (3 plans, check PASS) |
| 67 | Multi-City Shift & Staging | Sticky shift queue; inventory HUD; brand-heat success | SHIFT-01–03 | ready (3 plans, check PASS) |
| 68 | Regression QA Lock | v1.6–v2.0 locks + suite + verify-live + mobile/a11y | QA-01–03 | ready (2 plans, check PASS) |

### Phase dependency

```text
61 → 62 → 63 → 64 → 65 → 66 → 67 → 68
```

Matches design bible **D2:** Foundation desk → city dossier → idle/process climax → live feed → kill report → train theater → shift/staging → QA.

---

## Quality bar (per phase — observable)

| Phase | Pass condition |
|-------|----------------|
| 61 | First paint is asymmetric scrub desk; no equal 3-up proof rail; Collect-grade atmosphere; left Anton H1; unified `phuglee-btn` + ops voice |
| 62 | City select opens dossier (attaches / last scrub / staged lists); no-list outcomes in scrap/drawer |
| 63 | Idle shows live list/API proof metrics; Process is upload-step fire climax (date is tight meta) |
| 64 | Live scrub feed during process from real outcomes; reduced-motion path comprehensible without motion |
| 65 | Results open as kill-rate report (RAW→KILLED→KEPT + reasons + proof chips); Save/Stage primary |
| 66 | Admin open groups → Train theater pivot; brain secondary; non-admin never sees train/brain chrome |
| 67 | Multi-city shift with sticky inventory; lists read as staging HUD; post-save ember/gold success |
| 68 | `npm test` green on v1.6–v2.0 locks; verify-live exit 0; 390/1440 layout + 44px CTAs + reduced-motion verified |

---

## Locked decisions

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Scope** | Filter `/bridge` UI + supporting pure helpers only; no engine keep/kill rewrite |
| D2 | **Order** | Foundation desk → city dossier → idle/process climax → live feed → kill report → train theater → shift/staging → QA |
| D3 | **Stack** | Vanilla HTML/CSS/JS; existing `bridge.js` / `bridge.css` |
| D4 | **Feed data** | Prefer client-staged feed from process response rows/meta; SSE only if later deferred |
| D5 | **DOM hooks** | Preserve stable IDs used by tests unless plan migrates with tests |
| D6 | **Verify** | `npm test` + `scripts/verify-live.ps1` per phase (spirit); Phase 68 formal lock |
| D7 | **Execute** | One phase at a time after user says execute |
| D8 | **Independence** | Analyze boundary untouched (v2.0 IND locks) |
| D9 | **Admin gate** | Train/Brain non-admin hidden (v1.6 TRAIN-03) |
| D10 | **Data safety** | Never wipe filter-lists / bridge-brain as part of UI work |

---

## Requirement coverage

**24/24** v2.1 requirements mapped (see `.planning/REQUIREMENTS.md` Traceability).

| Category | IDs | Phase |
|----------|-----|-------|
| Scrub desk foundation | DESK-01–06 | 61 |
| City dossier & exception | CITY-01–02 | 62 |
| Idle proof & process climax | IDLE-01–02 | 63 |
| Live scrub feed | FEED-01–02 | 64 |
| Kill-rate scrub report | KILL-01–03 | 65 |
| Superpower Train theater | THTR-01–03 | 66 |
| Multi-city shift & staging | SHIFT-01–03 | 67 |
| Regression & quality | QA-01–03 | 68 |

---

## Milestone success criteria

1. `/bridge` first paint is a **work-first scrub desk**, not a form wizard with fake proof tiles  
2. City select opens a **dossier**; no-list path is demoted  
3. Idle desk shows **live inventory proof**; Process is the upload climax  
4. Process shows a **live scrub feed** (real outcomes; reduced-motion safe)  
5. Results open as **kill-rate cinematic report** with Save/Stage primary  
6. Admin open groups pivot into **Train theater**; brain secondary; non-admin hidden  
7. Operators run **multi-city shifts** with staging inventory HUD + brand-heat success  
8. Full `npm test` + `scripts/verify-live.ps1` green; mobile + reduced-motion verified  
9. Side-by-side with Collect desk: same grit world  

---

## Constraints

- Do not rewrite processUpload keep/kill engine  
- Do not re-couple Filter → Analyze  
- Do not introduce React/new framework  
- Do not wipe filter-lists or bridge-brain data  
- Do not expand scope beyond `/bridge` surface theater  

## GSD commands (when you execute)

```text
/gsd:execute-phase 61
# verify → then 62 → 63 → 64 → 65 → 66 → 67 → 68
/gsd:verify-work
/gsd:complete-milestone   # when all eight green + full Filter QA
```

**Agent execution:** one phase at a time. **Do not implement until user says execute.**

## Out of scope

- Server-streamed process events (SSE) — deferred unless client feed insufficient  

- Real-time multi-operator collaboration  
- File-first drop that auto-infers city/type  
- Territory map embedded in Filter  
- Analyze scan page changes  
- Filter product video autoplay on desk (optional later)

---

## GSD commands (when you execute)

```text
/gsd:plan-phase 61
/gsd:execute-phase 61
# verify → then 62 → 63 → 64 → 65 → 66 → 67 → 68
/gsd:verify-work
/gsd:complete-milestone   # archive → .planning/milestones/v2.1-*
```

**Agent execution:** one phase at a time. **Do not implement until user says execute.**
