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
- 🚧 **v1.8 Type Column Intelligence** — Phases 51–54 (active)

## Active Work

**Milestone:** v1.8 Type Column Intelligence  
**Goal:** Every city upload maps the true Violation Type column (with confirm-when-format-is-new) and Train shows short categorize-at-a-glance labels without losing full text for distress/export.

**Status:** Phase 54 planned (2 plans) — ready to execute lock-and-ship

---

## Phases

- [x] **Phase 51: COL Scoring + Map Wire** — Score all columns; force single Type winner into columnMap
- [x] **Phase 52: Format Memory + Confirm Gate** — Per-city fingerprint, admin confirm, reuse, process meta
- [x] **Phase 53: Display-Only Short Labels** — Short Train titles; full raw for match/export/decisions
- [ ] **Phase 54: Regression Lock** — processUpload e2e locks + npm test + verify-live green

## Phase Details

### Phase 51: COL Scoring + Map Wire
**Goal**: Process maps exactly one best Violation Type column using header aliases and value shapes — never alias-first first-match, never multi-column blend
**Depends on**: Nothing (v1.7 shipped — promote + groups baseline)
**Requirements**: COL-01, COL-02, COL-03, COL-04
**Success Criteria** (what must be TRUE):
  1. On process, a sheet whose narrative/date/status column would win under alias-first instead maps the true category-like Type column into `columnMap.violationIssueType`
  2. When no column meets Type candidacy, Type stays empty and distressed rows remain available for review (no silent drop solely for “no type column”)
  3. v1.7 `promoteCategoryFromRaw` still fills empty Type cells only — it never overrides a scorer-chosen Type column
  4. Scorer choice is the forced map winner; alias table is a scoring feature only, not a parallel first-match path that can undercut the scorer
**Plans**: 3/3 plans complete

Plans:
- [x] 51-01-PLAN.md - Wave 0 RED tests (pure trap matrix + process wire contracts)
- [x] 51-02-PLAN.md - Pure lib/bridge-type-column-score.js until unit green
- [x] 51-03-PLAN.md - Force Type in normalizeRawRows + full suite green

### Phase 52: Format Memory + Confirm Gate
**Goal**: First-time or format-changed city uploads pause for admin Type-column confirmation; same fingerprint reuses last confirmed mapping with no modal
**Depends on**: Phase 51
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-06, META-01
**Success Criteria** (what must be TRUE):
  1. First upload for a city format (or fingerprint differs from last confirmed) pauses process before normalize/tag/brain and shows admin confirm UI with ranked candidates, suggested winner, samples, alternate pick, and “No type column”
  2. Matching fingerprint reuses last confirmed Type header with no confirm modal and continues process automatically
  3. Confirm persist is admin-only; non-admin uploads on new/changed format get a clear pending/confirm-required state (no infinite hang)
  4. Multi-file batch (up to 5) applies fingerprint/confirm per file or explicit same-city batch policy — mixed formats never silently apply one file’s Type column to another
  5. Process/review meta exposes Type resolution (winner header, score or null, optional runner-up, source: `auto_reuse` | `admin_confirm` | `scorer` | `unresolved`)
**Plans**: 4/4 plans complete

Plans:
- [x] 52-01-PLAN.md — Wave 0 RED tests (store fingerprint + engine GATE/META contracts)
- [x] 52-02-PLAN.md — Pure city-format store + BRIDGE_CITY_FORMATS_ROOT + gitignore
- [x] 52-03-PLAN.md — processUpload gate + normalizer override + batch + META
- [x] 52-04-PLAN.md — API 409/403 + admin confirm UI + verify-live

### Phase 53: Display-Only Short Labels
**Goal**: Train/group titles are scannable short labels while full type/description text stays authoritative for distress, export, brain keys, and decisions
**Depends on**: Phase 51 (correct type text on groups; Phase 52 preferred for real city maps)
**Requirements**: LBL-01, LBL-02, LBL-03
**Success Criteria** (what must be TRUE):
  1. Train / review group titles show a deterministic short label when type or description is a long wall of text (~48–64 chars / first clause / before em-dash)
  2. Full raw type/description remains on the row for distress matching, export, brain keys, and decision payloads — short label never replaces stored `violationIssueType` or becomes the group key
  3. Decision POST and undo paths use full type labels from group metadata, not scraped truncated DOM titles
**Plans**: 4/4 plans complete

Plans:
- [x] 53-01-PLAN.md — Wave 0 RED tests (pure short-label + groups + train LBL-03 contracts)
- [x] 53-02-PLAN.md — Pure lib/bridge-short-label.js until unit green
- [x] 53-03-PLAN.md — Attach shortLabel on review groups; keys/full/export unchanged
- [x] 53-04-PLAN.md — Train UI prefer shortLabel + kill DOM scrape + verify-live

### Phase 54: Regression Lock
**Goal**: Automated locks prove scorer, format reuse/confirm, and display-only labels stay correct on the process path — suite and live server green
**Depends on**: Phases 51–53
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Automated fixture: sheet where alias-first would map a narrative/date/status column → scorer maps the true category Type column on processUpload
  2. Automated fixture: same city same fingerprint reuses confirmed header without confirm; fingerprint change requires confirm again
  3. Automated fixture: short label shortens display; stored type + export + group keys unchanged
  4. `npm test` and `scripts/verify-live.ps1` are green
**Plans**: 2 plans

Plans:
- [ ] 54-01-PLAN.md — v1.8 processUpload e2e locks (TEST-01/02/03 gaps)
- [ ] 54-02-PLAN.md — Full suite + verify-live milestone gate

---

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

## Progress

**Execution Order:** 51 → 52 → 53 → 54

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 51. COL Scoring + Map Wire | 3/3 | Complete    | 2026-07-10 | - |
| 52. Format Memory + Confirm Gate | 4/4 | Complete    | 2026-07-10 | - |
| 53. Display-Only Short Labels | 4/4 | Complete    | 2026-07-10 | - |
| 54. Regression Lock | v1.8 | 0/2 | Planned | - |
| 48–50. Filter Accuracy & Grouping | v1.7 | 4/4 | Complete | 2026-07-10 |
| 42–47. Filter Superpower Brain | v1.6 | 12/12 | Complete | 2026-07-10 |

## Coverage

| Requirement | Phase |
|-------------|-------|
| COL-01 | 51 |
| COL-02 | 51 |
| COL-03 | 51 |
| COL-04 | 51 |
| GATE-01 | 52 |
| GATE-02 | 52 |
| GATE-03 | 52 |
| GATE-04 | 52 |
| GATE-05 | 52 |
| GATE-06 | 52 |
| META-01 | 52 |
| LBL-01 | 53 |
| LBL-02 | 53 |
| LBL-03 | 53 |
| TEST-01 | 54 |
| TEST-02 | 54 |
| TEST-03 | 54 |

**Coverage:** 17/17 v1.8 requirements mapped ✓
