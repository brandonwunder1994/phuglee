# Plan: M5 Gritty Premium Surfaces — Milestone Init

**Date:** 2026-07-09  
**Milestone:** v1.4 / M5  
**Command:** `/gsd:new-milestone v1.4 Gritty Premium Surfaces`  
**Source:** Live Railway audit — top 5 generic vs premium (duck hero = ground truth)

## What was created

| Artifact | Path |
|----------|------|
| Milestone | `docs/gsd/milestones/M5-gritty-premium-surfaces.md` |
| Style bible | `.planning/v1.4-GRITTY-PREMIUM.md` |
| Design spec | `docs/superpowers/specs/2026-07-09-gritty-premium-surfaces-design.md` |
| Phase 32 plan | `docs/gsd/plans/2026-07-09-phase-32-dashboard-mission-board.md` |
| Phase 33 plan | `docs/gsd/plans/2026-07-09-phase-33-collect-clerk-desk.md` |
| Phase 34 plan | `docs/gsd/plans/2026-07-09-phase-34-home-pipeline-story.md` |
| Phase 35 plan | `docs/gsd/plans/2026-07-09-phase-35-how-it-works-playbook.md` |
| Phase 36 plan | `docs/gsd/plans/2026-07-09-phase-36-home-coverage-close.md` |

## Execution order (strict)

| Order | Phase | Surface | GSD execute |
|------:|-------|---------|-------------|
| 1 | 32 | Dashboard mission board | `/gsd:execute-phase 32` |
| 2 | 33 | Collect clerk desk | `/gsd:execute-phase 33` |
| 3 | 34 | Home pipeline story strip | `/gsd:execute-phase 34` |
| 4 | 35 | How It Works playbook | `/gsd:execute-phase 35` |
| 5 | 36 | Coverage map + close | `/gsd:execute-phase 36` |
| 6 | — | Close milestone | `/gsd:complete-milestone` |

## Per-phase workflow

```text
/gsd:discuss-phase N   # optional refine
/gsd:plan-phase N      # already written — only if scope changes
/gsd:execute-phase N   # implement plan, verify, commit
```

**Agent path:** Open the phase plan file → subagent-driven-development or executing-plans → do not start N+1 until N verification checklist is green.

## Style non-negotiables (all phases)

- Hero duck + house + grain = ground truth
- No equal 3-card SaaS grids
- No wireframe mockups
- Ops voice over corporate
- `--phuglee-*` tokens only
- `npm test` green after each phase
