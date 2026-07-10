# Phase 42 — Plan Check

**Checked:** 2026-07-09 (initial)  
**Re-checked:** 2026-07-09 (post-remediation)  
**Phase:** 42-brain-store-runtime-apply  
**Plans verified:** 2 (`42-01-PLAN.md`, `42-02-PLAN.md`)  
**Status:** PLAN CHECK PASSED  
**Goal:** A durable global Filter brain exists and active type rules change tagging outcomes on every upload for all users — without suppressing water shut-off.

---

## Remediation delta (vs prior ISSUES FOUND)

| Prior issue | Severity | Resolution |
|-------------|----------|------------|
| Missing `42-VALIDATION.md` (Nyquist 8e gate) | blocker | `42-VALIDATION.md` present; `nyquist_compliant: true`; per-task automated map |
| BRAIN-03 processUpload seed+water not planned | warning | 42-02 Task 3 Test C: water fixture + seeded `suppress_type`; assert tags/kept unchanged |

No remaining blockers or warnings.

---

## Goal-backward truths (what must be TRUE)

| # | Success criterion / truth | Source | Plan coverage | Status |
|---|---------------------------|--------|---------------|--------|
| 1 | Global brain persists on volume-safe path (list-store durability pattern) | ROADMAP SC1, BRAIN-01 | 42-01 Tasks 1–2: `BRIDGE_BRAIN_ROOT`, atomic `saveBrain`/`loadBrain`, store tests | COVERED |
| 2 | Active `suppress_type` changes process drop/keep for any user | ROADMAP SC2, BRAIN-02 | 42-02 Task 2 apply + Task 3 Test A engine seed suppress | COVERED |
| 3 | Active `promote_type` can keep matching not-strong rows as distressed | ROADMAP SC3, BRAIN-02 | 42-02 Task 2 promote unit + Task 3 Test B promote integration | COVERED |
| 4 | Water shut-off never type-suppressed (pass-through) | ROADMAP SC4, BRAIN-03 | 42-02 Task 1–2 unit early-return + Task 3 Test C processUpload seed+water | COVERED |
| 5 | Empty/missing brain is no-op; process still works | CONTEXT | 42-01 soft load; 42-02 empty brain unit + existing engine suite | COVERED |
| 6 | Apply after base tagRow / import-filter, before `filterDistressOnly` | CONTEXT + RESEARCH | 42-02 Task 3 wire order explicit | COVERED |
| 7 | Suppress wins conflicts (last in order) | CONTEXT | 42-02 locked order + conflict unit test | COVERED |
| 8 | No admin UI / decisions API / Analyzer learned-brain | CONTEXT deferred | Explicitly excluded in both plans | COVERED |

---

## Dimension 1: Requirement Coverage

| Requirement | Description | Plans frontmatter | Covering tasks | Status |
|-------------|-------------|-------------------|----------------|--------|
| BRAIN-01 | Durable global brain file, volume-safe path | 42-01 | 01-T1 (RED store tests), 01-T2 (config+store+gitignore) | COVERED |
| BRAIN-02 | Apply active rules every Filter process (all users) | 42-02 | 02-T1/T2 (pure apply), 02-T3 (`processUpload` wire + A/B integration) | COVERED |
| BRAIN-03 | Water never type-suppressed | 42-02 | 02-T1/T2 water early-return; T3 Test C water+seeded suppress | COVERED |

All roadmap requirement IDs appear in plan frontmatter. PROJECT.md / REQUIREMENTS.md phase mapping matches.

**Overall:** ✅ PASS

---

## Dimension 2: Task Completeness

| Plan | Tasks | Files | Action | Verify | Done | Structure tool |
|------|-------|-------|--------|--------|------|----------------|
| 42-01 | 2 TDD (RED→GREEN) | ✅ | ✅ specific | ✅ `node --test …` | ✅ | valid, 0 errors |
| 42-02 | 3 TDD (RED→GREEN→wire) | ✅ | ✅ specific | ✅ automated per task | ✅ | valid, 0 errors |

Actions name exact exports, apply order, config block, engine insert point, Test A/B/C isolation. Not vague.

**Overall:** ✅ PASS

---

## Dimension 3: Dependency Correctness

```
42-01  wave 1  depends_on: []
42-02  wave 2  depends_on: ["42-01"]
```

- Acyclic, single edge 01 → 02  
- Wave numbers consistent (max(deps)+1)  
- 02 consumes store exports defined in 01 interfaces  
- No forward references  

**Overall:** ✅ PASS

---

## Dimension 4: Key Links Planned

| Link | Planned in task action? |
|------|-------------------------|
| store → `config.BRIDGE_BRAIN_ROOT` at call time | 01-T2 |
| store → `global-brain.json` via `brainPath` | 01 interfaces + T2 |
| store tests → temp root override | 01-T1 |
| engine → `loadBrain()` once per processUpload | 02-T3 |
| engine → `applyBrainToRows` after import-filter, before `filterDistressOnly` | 02-T3 |
| apply → `STRONG_DISTRESSED_TAG` + `buildSearchText` | 02-T2 |
| apply → `violationTypeKey` from store | 02-T2 |
| `processingMeta.brainVersion` + `brainAppliedRuleIds` | 02-T3 |

Artifacts are not orphaned; pipeline wiring is explicit.

**Overall:** ✅ PASS

---

## Dimension 5: Scope Sanity

| Plan | Tasks | files_modified | Assessment |
|------|-------|----------------|------------|
| 42-01 | 2 | 4 | Within target (2–3 tasks, ≤8 files) |
| 42-02 | 3 | 4 | Within target (upper bound OK) |
| Phase total | 5 | 8 unique | Healthy split: store wave → apply+wire wave |

No plan ≥5 tasks. No dependency bloat.

**Overall:** ✅ PASS

---

## Dimension 6: Verification Derivation

**42-01 truths** are observable/testable (missing load, round-trip, path, atomic write).  
**42-02 truths** are user/process-observable (promote/suppress outcomes, conflict, empty no-op, water, pipeline stage).  
Artifacts map to truths; key_links specify via/patterns.  
Not implementation-noise-only.

**Overall:** ✅ PASS

---

## Dimension 7: Context Compliance

### Locked decisions → tasks

| Decision | Honored? |
|----------|----------|
| Global brain only (not per-user) | Yes — single `global-brain.json` |
| Filter/Bridge only; no Analyzer learned-brain | Yes — both plans forbid touch |
| Water never type-suppressed | Yes — skip all apply for water + Test C e2e |
| Volume-safe path like FILTER_LISTS_ROOT | Yes — identical env/PDA/local cascade |
| Atomic write tmp+rename | Yes — private `writeJsonAtomic` copy |
| After base tagRow, before distress filter | Yes — after import-filter, before `filterDistressOnly` |
| Order: promote_type → phrase promote → suppress phrase → suppress_type | Yes — locked in 02 interfaces |
| Empty brain = no-op | Yes |

### Claude's Discretion (OK as chosen)

- Schema field names (`version`, `typeRules`, `phraseRules`, `metrics`, …) — aligned with research/design  
- Separate pure `bridge-brain-apply.js` — preferred and planned  

### Deferred Ideas (must NOT appear)

Admin UI, review groups, decisions API, phrase mining UI — **excluded**. No bridge-api / public JS / phase 45 write path from process.

**No contradictions. No scope creep.**

**Overall:** ✅ PASS

---

## Dimension 8: Nyquist Compliance

`workflow.nyquist_validation`: **true** (`.planning/config.json`)  
`42-RESEARCH.md` has **Validation Architecture** section.

### Check 8e — VALIDATION.md Existence (Gate)

```
.planning/phases/42-brain-store-runtime-apply/42-VALIDATION.md → FOUND
nyquist_compliant: true
```

**PASS** — gate satisfied.

### Checks 8a–8d

| Task | Plan | Wave | Automated Command | Status |
|------|------|------|-------------------|--------|
| 01-T1 | 01 | 1 | `node --test tests/bridge-brain-store.test.js` | ✅ |
| 01-T2 | 01 | 1 | `node --test tests/bridge-brain-store.test.js` | ✅ |
| 02-T1 | 02 | 2 | `node --test tests/bridge-brain-apply.test.js` | ✅ |
| 02-T2 | 02 | 2 | `node --test tests/bridge-brain-apply.test.js` | ✅ |
| 02-T3 | 02 | 2 | `node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js tests/bridge-engine.test.js` | ✅ |

- **8a Automated verify:** every task has `<automated>` — ✅  
- **8b Feedback latency:** unit/integration `node --test` (seconds); full suite ~15–40s; no watch-mode — ✅  
- **8c Sampling continuity:** Wave 1: 2/2; Wave 2: 3/3 verified — no 3-consecutive gap — ✅  
- **8d Wave 0:** RED tasks create missing test files in-plan; VALIDATION.md documents Wave 0 as those files + engine extensions — ✅  

**Overall:** ✅ PASS

---

## Goal achievement assessment (substance)

The two plans **will achieve the phase goal** if executed as written:

1. **BRAIN-01** — durable store foundation with isolation tests and gitignore.  
2. **BRAIN-02** — pure apply + mandatory `processUpload` hook so every upload for every user sees active rules; Tests A/B seed suppress/promote and assert process outcomes.  
3. **BRAIN-03** — water early-return at pure apply + Test C proves processUpload water fixture with seeded suppress does not demote water tags.  
4. Context deferred items stay out of scope.

---

## Structured Issues

```yaml
issues: []
```

---

## Coverage Summary

| Requirement | Plans | Status |
|-------------|-------|--------|
| BRAIN-01 | 01 | Covered |
| BRAIN-02 | 02 | Covered |
| BRAIN-03 | 02 | Covered (unit + processUpload Test C) |

## Plan Summary

| Plan | Tasks | Files | Wave | Deps | Status |
|------|-------|-------|------|------|--------|
| 42-01 | 2 | 4 | 1 | — | Valid; goal-ready |
| 42-02 | 3 | 4 | 2 | 42-01 | Valid; goal-ready |

---

## Recommendation

All dimensions PASS. Prior blocker (VALIDATION.md) and warning (water processUpload seed) are remediated.

Plans verified. Run `/gsd:execute-phase 42` to proceed.
