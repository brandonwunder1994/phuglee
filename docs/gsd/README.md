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
| [M3](./milestones/M3-premium-brand-experience.md) | Premium Brand Experience (v1.2) | `closed` |
| [M4](./milestones/M4-phuglee-signature-brand.md) | Phuglee Signature Brand (v1.3) | `complete` |
| [M5](./milestones/M5-gritty-premium-surfaces.md) | Gritty Premium Surfaces (v1.4) | `implemented` |
| [M6](./milestones/M6-territory-theater.md) | Territory Theater (v1.5) | `implemented` |

**Active milestone:** M6 — Territory Theater (v1.5) — phases 37–41 implemented  
**Preview:** `http://127.0.0.1:3000/` → scroll to Live coverage

**Style bible:** `.planning/v1.4-GRITTY-PREMIUM.md`  
**Design spec (M5):** `docs/superpowers/specs/2026-07-09-gritty-premium-surfaces-design.md`  
**Design spec (M6):** `docs/superpowers/specs/2026-07-09-territory-theater-design.md`  
**Milestone init (M6):** `docs/gsd/plans/2026-07-09-m6-territory-theater.md`  
**v1.3 spec (reference):** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`  
**v1.2 spec (reference):** `.planning/v1.2-PREMIUM-BRAND.md`  

### M5 phase plans (32 → 36 — done)

| Phase | Plan |
|-------|------|
| 32 Dashboard mission board | [plan](./plans/2026-07-09-phase-32-dashboard-mission-board.md) |
| 33 Collect clerk desk | [plan](./plans/2026-07-09-phase-33-collect-clerk-desk.md) |
| 34 Home pipeline story | [plan](./plans/2026-07-09-phase-34-home-pipeline-story.md) |
| 35 How It Works playbook | [plan](./plans/2026-07-09-phase-35-how-it-works-playbook.md) |
| 36 Territory map + close | [plan](./plans/2026-07-09-phase-36-home-coverage-close.md) |

### M6 phase plans (execute 37 → 41)

| Phase | Plan |
|-------|------|
| 37 Territory heat palette | [plan](./plans/2026-07-09-phase-37-territory-heat-palette.md) |
| 38 War-room HUD | [plan](./plans/2026-07-09-phase-38-territory-war-room-hud.md) |
| 39 Live territory ticker | [plan](./plans/2026-07-09-phase-39-territory-live-ticker.md) |
| 40 State spotlight dossier | [plan](./plans/2026-07-09-phase-40-territory-state-spotlight.md) |
| 41 Entrance + fused close | [plan](./plans/2026-07-09-phase-41-territory-entrance-close.md) |

## Cross-repo coordination

| Repo | Linked milestone |
|------|------------------|
| Form Forge | `city-list-requests/docs/gsd/milestones/M6-unified-heat-design.md` |
| Property Analyzer | `property-distress-analyzer/docs/gsd/milestones/M5-unified-heat-design.md` |

## Plan naming

```
docs/gsd/plans/YYYY-MM-DD-<phase-slug>.md
```

Examples:
- `docs/gsd/plans/2026-07-06-m3-premium-brand-milestone.md`
- `docs/gsd/plans/2026-07-06-m4-phuglee-signature-brand.md`