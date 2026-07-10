# M7 — Filter Superpower Brain (v1.6)

> **Status:** `planned` — GSD-produced roadmap phases 42–47; **awaiting plan/execute**  
> **Created:** 2026-07-09  
> **Roadmap:** `.planning/ROADMAP.md` (authoritative)  
> **Requirements:** `.planning/REQUIREMENTS.md`  
> **Depends on:** Filter process pipeline (shipped), auth admin bootstrap (shipped)  
> **Design bible:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
> **Scope:** Filter / Bridge only — human feedback → global shared tagger brain

---

## Goal

Turn Filter from a **static regex tagger** into a **superpower brain that learns from admin Approve/Deny** so every future city file is cleaner for all customers — without letting non-admins corrupt quality.

## Official phase list (GSD roadmapper)

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 42 | Brain store + runtime apply | Global durable brain + apply on every process; water never type-suppressed | BRAIN-01, BRAIN-02, BRAIN-03 | planned |
| 43 | Review payload + grouping | Full FN rows, type groups, signals, stable rowIds | REV-01, REV-02, REV-03, REV-04 | planned |
| 44 | Admin Train brain UX | Two train sections, group ✓/✗, signals on cards; non-admin hidden | TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04 | planned |
| 45 | Decisions + type rules + list mutation | Deny remove / Approve promote + live type rules + audit + 403 | DEC-01–DEC-06 | planned |
| 46 | Phrase mining + brain panel | Proposed phrases only until activate; admin rule panel | PHRASE-01, PHRASE-02, PHRASE-03 | planned |
| 47 | Hardening + metrics + docs | Undo, caps/409, metrics, tagging docs, npm test + verify-live | HARD-01, HARD-02, HARD-03, HARD-04 | planned |

### Phase dependency

```text
42 → 43 → 44 → 45 → 46 → 47
```

## Quality bar

| Phase | Pass condition (observable) |
|-------|-----------------------------|
| 42 | Seeded suppress/promote changes next process for all users; water shut-off unaffected |
| 43 | Process returns full not-distressed rows + grouped review payload with signals + rowIds |
| 44 | Admin sees two train sections + ✓/✗ + signals; non-admin does not see train chrome |
| 45 | Deny removes rows + writes suppress; Approve promotes + writes promote; next process respects; non-admin 403 |
| 46 | Proposed phrase rules never auto-live; admin activate changes next process; brain panel manages rules |
| 47 | Undo/metrics/caps/docs; `npm test` + verify-live green |

## Locked decisions

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Order** | Execute **42 → 47** only; never skip ahead |
| D2 | **Surface** | Filter / Bridge only |
| D3 | **Brain scope** | Global shared file |
| D4 | **Trainer** | Admin username only (server-enforced) |
| D5 | **Grouping** | City Violation/Issue Type (normalized) |
| D6 | **List mutation** | Deny removes kept; Approve FN promotes |
| D7 | **Learning** | Type rules live immediately; phrases proposed → admin OK |
| D8 | **Stack** | Node + vanilla JS + atomic JSON |
| D9 | **Tests** | `npm test` + `scripts/verify-live.ps1` after each phase |
| D10 | **Analyzer brain** | Do **not** share Analyze learned-brain store |

## Requirement coverage

**24/24** v1.6 requirements mapped (see `.planning/REQUIREMENTS.md` Traceability).

| Category | IDs | Phase |
|----------|-----|-------|
| Runtime brain | BRAIN-01–03 | 42 |
| Review payload | REV-01–04 | 43 |
| Admin train UX | TRAIN-01–04 | 44 |
| Decisions + mutation | DEC-01–06 | 45 |
| Phrase learning | PHRASE-01–03 | 46 |
| Hardening | HARD-01–04 | 47 |

## GSD commands (when you execute)

```text
/gsd:plan-phase 42
/gsd:execute-phase 42
# verify → then 43 → 44 → 45 → 46 → 47
/gsd:verify-work
/gsd:complete-milestone   # when all six green + full Filter QA
```

**Agent execution:** one phase at a time. **Do not implement until user says execute.**

## Success criteria (milestone)

1. Admin grades a stacked violation type once → **next upload** for any user respects suppress/promote  
2. Admin can review **not marked distressed** groups and promote false negatives  
3. Results train mode shows **matched signals + descriptions**  
4. Non-admin **cannot** write brain (403) and **does not** see train controls  
5. Phrase rules improve free-text learning only after admin activates  
6. Audit log + undo/disable for quality control  
7. All distress-os `npm test` green; live verify exit 0  
8. Docs: `docs/bridge/TAGGING-RULES.md` includes brain layers  

## Constraints

- Do not change Analyze vision review / learned-brain  
- Do not let non-admin train  
- Do not auto-activate mined phrase rules  
- Do not regress list save/export/attach  
- Prefer volume path for brain file (Railway-safe like filter lists)  

## Out of scope

ML fine-tunes, per-user brains, Collect/Command UI, Analyze Keep/Change redesign

---

*GSD-produced: 2026-07-09 via gsd-roadmapper — matches `.planning/ROADMAP.md`*
