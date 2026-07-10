# Requirements: Distress OS — v2.1 Filter Scrub Theater

**Defined:** 2026-07-10  
**Core Value:** Collect → **scrub the mess on a gritty ops desk** (live feed + kill-rate proof) → optional admin Train theater → stage multi-city lists → download for enrich → manual Analyze import.  
**Source:** GSD map `.planning/codebase/filter-page-ui-map.md` + Impeccable critique of `/bridge` + locked user scope (10 composition upgrades + 5 showstoppers).  
**Style bible:** `.planning/v1.4-GRITTY-PREMIUM.md` · peer patterns Collect/Command/Territory  
**Design bible:** `.planning/v2.1-FILTER-SCRUB-THEATER.md`

## v2.1 Requirements

Requirements for this milestone only. Each maps to exactly one roadmap phase.

### Scrub desk foundation (DESK)

- [x] **DESK-01**: Filter opens as an **asymmetric scrub desk** (dominant work surface + supporting scrap), not a centered multi-step form wizard in a 920px essay stack
- [x] **DESK-02**: Equal 3-up decorative “proof rail” (icon + step-title “metrics”) is **removed or replaced** so first paint never ships M5-forbidden equal feature grids
- [x] **DESK-03**: Atmosphere matches product-step peers: Collect-grade intensity (`premium-bg--strong` and/or heat field language), not subtle admin-tool wash only
- [x] **DESK-04**: Teaching chrome is slim for veterans — no triple stack of tutorial rail + full pipeline essay + long H1 lead on every visit; progress orthography remains usable
- [x] **DESK-05**: Hero treatment matches Command/Collect: **left-aligned solid cream Anton** “Scrub the Mess,” short ops lead; no centered gradient marketing H1
- [x] **DESK-06**: Button systems and labels are unified — prefer `phuglee-btn` vocabulary; ops slang throughout (not “Select city profile” / mixed `bridge-btn` + `phuglee-btn` dual systems)

### City dossier & exception path (CITY)

- [x] **CITY-01**: Selecting a city opens a **city dossier** (ops case file): prior attaches / last scrub / lists staged for that city / relevant status — not a void dual-select only
- [x] **CITY-02**: “City replied, no usable list” outcomes live as a **secondary scrap / drawer** on the dossier — not a 5-radio wall competing with the happy path on step 1

### Idle proof & process climax (IDLE)

- [ ] **IDLE-01**: At idle (before process), operator sees **live proof metrics** from existing list/API data (e.g. lists staged, total records ready, last save) — not only post-process KPIs
- [ ] **IDLE-02**: Upload step makes **Process** the visual climax (dropzone stage + one fire CTA); response date is tight meta, not a peer form block

### Live scrub feed (FEED)

- [ ] **FEED-01**: While process runs, operator sees a **live scrub activity feed** (addresses and/or types with kept / no-distress / discarded / already-in-Analyze status language) — not only rotating copy + passive bar
- [ ] **FEED-02**: Feed respects `prefers-reduced-motion` (static summary / crossfade allowed; no mandatory motion for comprehension)

### Kill-rate scrub report (KILL)

- [ ] **KILL-01**: After process, results open with a **kill-rate scrub report**: display-scale RAW → KILLED → KEPT hierarchy, kill-reason breakdown, and optional sample kept dossiers — not only equal KPI tiles
- [ ] **KILL-02**: Process meta already computed (duration, format reuse, discard story) surfaces as **proof chips/HUD**, not a single buried meta sentence
- [ ] **KILL-03**: Primary post-scrub CTA for operators remains **Save list / Stage** (Analyze boundary preserved); Preview CSV stays secondary

### Superpower Train theater (THTR)

- [ ] **THTR-01**: When admin has open train groups after process, UI **pivots into Train theater** (mission header with open-group count; Distressed / Not Distressed decisions with live kept-count feedback) — not peer equal tabs with Kept / Brain by default
- [ ] **THTR-02**: Filter brain panel is **secondary** (rules armory), not a third equal-weight peer tab competing with the scrub win
- [ ] **THTR-03**: Non-admin never sees train/brain chrome (v1.6 TRAIN-03 / admin gate preserved)

### Multi-city shift desk & staging (SHIFT)

- [ ] **SHIFT-01**: Operators can run a **multi-city shift**: sticky queue/inventory of staged cities/lists; after save, next city is one-click without re-teaching chrome / full wizard restart feel
- [ ] **SHIFT-02**: Saved lists read as **staging inventory** (counts, type heat, ready/download language) while preserving rename / download / delete / download-all APIs
- [ ] **SHIFT-03**: Post-save success uses **brand heat** (ember/gold), not green SaaS flash; optional “Download this list” path remains

### Regression & quality (QA)

- [ ] **QA-01**: All Filter independence / accuracy / brain / processUpload locks from v1.6–v2.0 stay green (`npm test`)
- [ ] **QA-02**: `scripts/verify-live.ps1` exit 0 after milestone work; `/bridge` health + homepage 200
- [ ] **QA-03**: Mobile 390 + desktop 1440: no horizontal overflow; primary CTAs ≥ 44px; reduced-motion paths verified for FEED/KILL/THTR motion

## Future Requirements (deferred)

- Server-streamed process events (SSE) if client-side staged feed is insufficient for large files
- Real-time multi-operator shift collaboration
- File-first drop that auto-infers city/type without dossier
- Full duck empty-state illustration pack beyond peak empty
- Shared Filter/Analyze design system extraction beyond page-local CSS
- Filter product video autoplay on desk (optional marketing reuse of `filter.mp4`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-push Filter → Analyze | v2.0 independence locked |
| Skip-trace / enrichment inside Filter | Wrong product boundary |
| Non-admin Train / brain writes | Global quality control |
| Auto-activate phrase rules | Controllability |
| Rewrite processUpload keep/kill engine | Accuracy locked in v2.0; this milestone is **surface + theater** |
| Wipe filter-lists / bridge-brain data | AGENTS.md hard rule |
| New framework (React) | M5 D6 / site vanilla stack |
| Territory map embedded in Filter | Territory is home/coverage surface |
| Changing Analyze scan page | Separate product |

## Source mapping (research → requirements)

| Source item | REQ-IDs |
|-------------|---------|
| Rec 1 Kill proof rail | DESK-02 |
| Rec 2 Asymmetric desk | DESK-01 |
| Rec 3 Live idle metrics | IDLE-01 |
| Rec 4 Atmosphere | DESK-03 |
| Rec 5 Slim teaching chrome | DESK-04 |
| Rec 6 Demote no-list path | CITY-02 |
| Rec 7 Process climax | IDLE-02 |
| Rec 8 Results mission readout | KILL-01, KILL-02 |
| Rec 9 Saved lists inventory + heat success | SHIFT-02, SHIFT-03 |
| Rec 10 Unify chrome + voice | DESK-05, DESK-06 |
| SS1 Live scrub feed | FEED-01, FEED-02 |
| SS2 Multi-city shift desk | SHIFT-01 |
| SS3 Kill-rate cinematic results | KILL-01–03 |
| SS4 City dossier | CITY-01 |
| SS5 Train theater | THTR-01–03 |

## Traceability

Every requirement maps to exactly one phase (roadmapper 2026-07-10).

| Requirement | Phase | Status |
|-------------|-------|--------|
| DESK-01 | 61 | Complete |
| DESK-02 | 61 | Complete |
| DESK-03 | 61 | Complete |
| DESK-04 | 61 | Complete |
| DESK-05 | 61 | Complete |
| DESK-06 | 61 | Complete |
| CITY-01 | 62 | Complete |
| CITY-02 | 62 | Complete |
| IDLE-01 | 63 | Pending |
| IDLE-02 | 63 | Pending |
| FEED-01 | 64 | Pending |
| FEED-02 | 64 | Pending |
| KILL-01 | 65 | Pending |
| KILL-02 | 65 | Pending |
| KILL-03 | 65 | Pending |
| THTR-01 | 66 | Pending |
| THTR-02 | 66 | Pending |
| THTR-03 | 66 | Pending |
| SHIFT-01 | 67 | Pending |
| SHIFT-02 | 67 | Pending |
| SHIFT-03 | 67 | Pending |
| QA-01 | 68 | Pending |
| QA-02 | 68 | Pending |
| QA-03 | 68 | Pending |

**Coverage:**
- v2.1 requirements: **24** total
- Mapped to phases: **24/24** ✓
- Unmapped: 0

| Phase | Name | REQ count |
|-------|------|-----------|
| 61 | Scrub Desk Foundation | 6 (DESK) |
| 62 | City Dossier | 2 (CITY) |
| 63 | Idle Proof & Process Climax | 2 (IDLE) |
| 64 | Live Scrub Feed | 2 (FEED) |
| 65 | Kill-Rate Scrub Report | 3 (KILL) |
| 66 | Superpower Train Theater | 3 (THTR) |
| 67 | Multi-City Shift & Staging | 3 (SHIFT) |
| 68 | Regression QA Lock | 3 (QA) |

---
*Requirements defined: 2026-07-10*  
*Last updated: 2026-07-10 — roadmapper mapped DESK→QA to phases 61–68*
