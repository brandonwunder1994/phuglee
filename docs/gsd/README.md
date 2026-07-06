# GSD — Distress OS

Get Shit Done tracking for shell integration, navigation, and cross-app design milestones.

## Workflow

1. **Milestone** — ranked work items with status, dependencies, and success criteria (`milestones/`)
2. **Plan** — bite-sized implementation plan per phase (`.planning/phases/` or `plans/`)
3. **Execute** — implement plan task-by-task, verify, commit
4. **Close** — mark milestone `done`, note follow-ups

## Milestones

| ID | Name | Status |
|----|------|--------|
| [M1](./milestones/M1-shell-integration.md) | Shell & Integration (v1.0) | `complete` |
| [M2](./milestones/M2-unified-heat-design.md) | Unified Heat Design (v1.1) | `in_progress` |

**Active milestone: v1.1** — Unified Heat Design (Phases 7–13)

**Design spec:** `.planning/v1.1-HEAT-DESIGN.md`

## Cross-repo coordination

| Repo | Linked milestone |
|------|------------------|
| Form Forge | `city-list-requests/docs/gsd/milestones/M6-unified-heat-design.md` |
| Property Analyzer | `property-distress-analyzer/docs/gsd/milestones/M5-unified-heat-design.md` |

## Plan naming

```
docs/gsd/plans/YYYY-MM-DD-<phase-slug>.md
```

Example: `docs/gsd/plans/2026-07-06-phase8-global-nav.md`