# GSD — Property Distress Analyzer

Get Shit Done tracking for core functionality, reliability, and UI milestones.

## Workflow

1. **Milestone** — ranked work items with status, dependencies, and success criteria (`milestones/`)
2. **Plan** — bite-sized implementation plan per item (`plans/`)
3. **Execute** — implement plan task-by-task, verify, commit
4. **Close** — mark milestone item `done`, note any follow-ups

## Milestones

| ID | Name | Status |
|----|------|--------|
| [M1](./milestones/M1-core-bones.md) | Core Bones — Reliability & Classification Foundation | `complete` |
| [M2](./milestones/M2-calm-ui.md) | Calm Premium Interface (v1.3) | `complete` |
| [M3](./milestones/M3-cyber-premium.md) | Cyber Premium Interface (v1.4) | `complete` |
| [M4](./milestones/M4-classification-reliability.md) | Classification Reliability (v1.5) | `complete` |
| [M5](./milestones/M5-unified-heat-design.md) | Unified Heat Design (Distress OS v1.1) | `in_progress` |

**Active:** M5 — Heat reskin replaces v1.8 Aerial Command look (parent: `distress-os` v1.1)

**Audit:** `.planning/v1.5-CLASSIFICATION-AUDIT.md`

**Loading audit (v1.7):** `.planning/LOADING-IMAGERY-AUDIT.md` — review image cache-first + prefetch

## Plan naming

```
docs/gsd/plans/YYYY-MM-DD-<item-slug>.md
```

Example: `docs/gsd/plans/2026-06-30-cyber-dialog.md`