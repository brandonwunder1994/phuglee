# Roadmap: Distress OS

## Milestones

- ✅ **v1.0 Shell & Integration** — Phases 1–6 (shipped 2026-07-01)
- 🔄 **v1.1 Unified Heat Design** — Phases 7–13 (in progress — superseded by v1.3 tokens)
- ✅ **v1.2 Premium Brand Experience** — Phases 14–21 (shipped 2026-07-06)
- ✅ **v1.3 Phuglee Signature Brand** — Phases 22–31 (shipped 2026-07-06)
- ✅ **v1.4 Gritty Premium Surfaces** — Phases 32–36 (implemented)
- ✅ **v1.5 Territory Theater** — Phases 37–41 (implemented)
- 📋 **v1.6 Filter Superpower Brain** — Phases 42–47 (planned — GSD roadmap)

## Active Work

**Active milestone:** v1.6 Filter Superpower Brain (M7)

**Goal:** Admin-only global Filter brain — grouped Approve/Deny trains type + phrase rules so every future city upload improves for all customers.

**Execute only when user says go:** `/gsd:plan-phase 42` then execute 42→47

**Design spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
**Milestone doc:** `docs/gsd/milestones/M7-filter-superpower-brain.md`  
**Requirements:** `.planning/REQUIREMENTS.md`  
**Context:** `.planning/MILESTONE-CONTEXT.md`

**Constraints:**
- Filter / Bridge only (not Analyze vision review)
- Global brain, admin-only training
- Group by violation type; Deny removes; Approve FN promotes
- Phrase rules proposed-then-activate
- Do **not** share Analyzer learned-brain store

---

## Phases

### v1.6 Filter Superpower Brain (Phases 42–47)

- [x] **Phase 42: Brain store + runtime apply** — Global durable brain file applied on every process
- [ ] **Phase 43: Review payload + grouping** — Full FN rows, type groups, signals, stable rowIds
- [ ] **Phase 44: Admin Train brain UX** — Two train sections, group ✓/✗, admin-only chrome
- [ ] **Phase 45: Decisions + type rules + list mutation** — Mutate current list + live type learning
- [ ] **Phase 46: Phrase mining + brain panel** — Proposed phrases + admin rule management
- [ ] **Phase 47: Hardening + metrics + docs** — Undo, caps, metrics, docs, QA green

### Phase dependency

```text
42 → 43 → 44 → 45 → 46 → 47
```

**Agent rule:** One phase per plan/execute cycle. No implementation until user triggers execute.

---

## Phase Details

### Phase 42: Brain store + runtime apply

**Goal:** A durable global Filter brain exists and active type rules change tagging outcomes on every upload for all users — without suppressing water shut-off.

**Depends on:** Nothing (first v1.6 phase; builds on shipped Filter process pipeline)

**Requirements:** BRAIN-01, BRAIN-02, BRAIN-03

**Success Criteria** (what must be TRUE):
  1. System persists a global Filter brain file on a volume-safe path (same durability pattern as filter lists)
  2. When an active suppress_type rule exists for a violation type, a subsequent code-violation process drops/keeps rows accordingly for any user
  3. When an active promote_type rule exists, matching not-strong rows can be kept as distressed on subsequent process
  4. Water shut-off uploads are never type-suppressed by the brain (pass-through preserved)

**Plans:** 2 plans

Plans:
- [x] 42-01-PLAN.md - Durable global brain store (config path, atomic load/save, unit tests)
- [x] 42-02-PLAN.md - Pure apply module + processUpload wire + integration tests

---

### Phase 43: Review payload + grouping

**Goal:** After process, admins (and the API) have a reviewable false-negative pool and stacked violation-type groups with signals — not only thin discard previews.

**Depends on:** Phase 42

**Requirements:** REV-01, REV-02, REV-03, REV-04

**Success Criteria** (what must be TRUE):
  1. Process response includes full not-distressed row payloads (false-negative pool), not only discarded previews
  2. Review rows are grouped by normalized city Violation/Issue Type (identical types stack; empty type falls back to description)
  3. Each review group exposes matched distress signals and description samples that triggered or failed the flag
  4. Every process row carries a stable `rowId` usable for later decision targeting

**Plans:** 2 plans

Plans:
- [x] 43-01-PLAN.md - Pure review groups module (rowIds, type stacking, signals/samples)
- [ ] 43-02-PLAN.md - processUpload FN payload + groups wire + engine contract tests

---

### Phase 44: Admin Train brain UX

**Goal:** On Filter results, admin can open Train brain with distressed vs not-distressed sections, see signals, and Approve/Deny stacked groups; non-admins never see train controls.

**Depends on:** Phase 43

**Requirements:** TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04

**Success Criteria** (what must be TRUE):
  1. Admin can open Train brain on Filter results with two sections: marked distressed and not marked distressed
  2. Admin can Approve or Deny a stacked violation-type group with one action (UI ready to call decision API)
  3. Non-admin users never see train controls on the Filter results page
  4. Each group card shows matched signals and description samples

**Plans:** 2 plans

Plans:
- [ ] 44-01-PLAN.md - Train shell: tests, markup (two sections + mode tabs), bridge CSS
- [ ] 44-02-PLAN.md - Admin gate, reviewGroups render, Approve/Deny stubs, live verify

---

### Phase 45: Decisions + type rules + list mutation

**Goal:** Admin Approve/Deny mutates the current kept list immediately and writes live global type rules with audit trail; non-admin writes are rejected.

**Depends on:** Phase 44

**Requirements:** DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06

**Success Criteria** (what must be TRUE):
  1. Admin Deny on a distressed group removes those rows from the current kept list in the UI/session
  2. Admin Approve on a not-distressed group promotes those rows into the current kept list as distressed
  3. Deny writes an active global `suppress_type` rule; Approve writes an active global `promote_type` rule — next process for any user respects them
  4. Every decision appends an audit event (who, when, type, counts, samples)
  5. Non-admin callers of brain write APIs receive 403 `ADMIN_REQUIRED`

**Plans:** 3 plans

Plans:
- [ ] 45-01-PLAN.md — Pure applyDecision matrix + type rules + audit events (DEC-01–05 TDD)
- [ ] 45-02-PLAN.md — requireAdmin + POST /api/bridge/brain/decisions (DEC-06 + persist)
- [ ] 45-03-PLAN.md — Client Train Approve/Deny wire + lastResult re-render

---

### Phase 46: Phrase mining + brain panel

**Goal:** Free-text / singleton decisions produce proposed phrase rules only; admin can view, activate, reject, or disable type and phrase rules so phrases never auto-live.

**Depends on:** Phase 45

**Requirements:** PHRASE-01, PHRASE-02, PHRASE-03

**Success Criteria** (what must be TRUE):
  1. System mines phrase candidates from free-text / singleton decisions into proposed rules only
  2. Proposed phrase rules never change process outcomes until an admin activates them
  3. Admin can open a Filter brain panel to view, activate, reject, or disable type and phrase rules
  4. After admin activates a phrase rule, a subsequent process applies it for all users

**Plans:** 2 plans

Plans:
- [ ] 46-01-PLAN.md — Pure phrase miner + decisions hook; proposed never auto-live (PHRASE-01, PHRASE-02)
- [ ] 46-02-PLAN.md — Admin brain API + Filter brain panel activate/reject/disable (PHRASE-03)

---

### Phase 47: Hardening + metrics + docs

**Goal:** Training is reversible and bounded; metrics are visible; tagging docs explain base regex + brain layers; tests and live server verify green.

**Depends on:** Phase 46

**Requirements:** HARD-01, HARD-02, HARD-03, HARD-04

**Success Criteria** (what must be TRUE):
  1. Admin can undo the last training decision (client list snapshot restored + server rule revert)
  2. Brain file enforces caps on events and rules; concurrent/stale version writes return 409
  3. Admin can view brain metrics (decision counts, active/proposed rule counts)
  4. Tagging documentation describes base regex + brain layers; `npm test` and `scripts/verify-live.ps1` pass

**Plans:** 1 plan

Plans:
- [ ] 47-01-PLAN.md — Caps, version 409, split undo, metrics, train polish, TAGGING-RULES, phase gate (HARD-01–04)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 42. Brain store + runtime apply | v1.6 | 2/2 | Complete | 2026-07-10 |
| 43. Review payload + grouping | v1.6 | 0/2 | Not started | - |
| 44. Admin Train brain UX | v1.6 | 0/2 | Planned | - |
| 45. Decisions + type rules + list mutation | v1.6 | 0/3 | Planned | - |
| 46. Phrase mining + brain panel | v1.6 | 0/2 | Not started | - |
| 47. Hardening + metrics + docs | v1.6 | 0/1 | Not started | - |

**Coverage:** 24/24 v1.6 requirements mapped ✓

| Requirement | Phase |
|-------------|-------|
| BRAIN-01, BRAIN-02, BRAIN-03 | 42 |
| REV-01, REV-02, REV-03, REV-04 | 43 |
| TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04 | 44 |
| DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06 | 45 |
| PHRASE-01, PHRASE-02, PHRASE-03 | 46 |
| HARD-01, HARD-02, HARD-03, HARD-04 | 47 |

---

## Prior milestones (archived)

<details>
<summary>✅ v1.5 Territory Theater (Phases 37–41) — implemented</summary>

Phases 37–41 delivered territory/theater product surfaces. Closed before M7 planning.

</details>

<details>
<summary>✅ v1.4 Gritty Premium Surfaces (Phases 32–36) — implemented</summary>

Phases 32–36 delivered gritty premium surface polish after signature brand.

</details>

<details>
<summary>✅ v1.3 Phuglee Signature Brand (Phases 22–31) — shipped 2026-07-06</summary>

| Phase | Name | Status |
|-------|------|--------|
| 22 | Phuglee Design System | complete |
| 23 | Global Chrome & Motion | complete |
| 24 | Home — Signature Rebuild | complete |
| 25 | Auth Flows | complete |
| 26 | Shell Pages | complete |
| 27 | Form Forge — Signature Pass | complete |
| 28 | Analyzer — Signature Pass | complete |
| 29 | States & Micro-interactions | complete |
| 30 | A11y, Performance, SEO | complete |
| 31 | Cross-App Signature QA | complete |

**Design:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`  
**Milestone:** `docs/gsd/milestones/M4-phuglee-signature-brand.md`

</details>

<details>
<summary>✅ v1.2 Premium Brand Experience (Phases 14–21) — shipped 2026-07-06</summary>

Premium atmosphere + components on post-login surfaces; Form Forge and Analyzer premium CSS. Closed 2026-07-06.

</details>

<details>
<summary>🔄 v1.1 Unified Heat Design (Phases 7–13) — superseded by v1.3</summary>

Heat tokens + nav + reskin partially overtaken by `--phuglee-*` signature brand. Archive or complete when no longer needed.

</details>

<details>
<summary>✅ v1.0 Shell & Integration (Phases 1–6) — shipped 2026-07-01</summary>

Landing, Command Hub, reverse proxy, Data Bridge, health orchestration, unit tests.

</details>

---

*Roadmap updated: 2026-07-09 — v1.6 Filter Superpower Brain phases 42–47 (GSD roadmapper)*
