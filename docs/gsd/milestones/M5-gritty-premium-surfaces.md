# M5 — Gritty Premium Surfaces (v1.4)

> **Status:** `in_progress` — phases 32–36 implemented 2026-07-09  
> **Created:** 2026-07-09  
> **Depends on:** M4 (v1.3 Phuglee Signature Brand — complete)  
> **Design bible:** `.planning/v1.4-GRITTY-PREMIUM.md`  
> **Audit source:** Live Railway audit 2026-07-09 — top 5 generic vs premium  
> **Scope:** Five surfaces that still read SaaS-generic after M3/M4 brand work

---

## Goal

Make the **post-hero product and mid/lower landing** feel as gritty and premium as the **Phuglee duck + distressed house hero**. Quality bar (revised): **proof-first · work-first · one story spine · live when possible** — not grain cosplay or rearranged card grids.

## Quality bar (2026-07-09 revision)

| Phase | Pass condition |
|-------|----------------|
| 32 Dashboard | Live ops desk; mission reacts to health/coverage |
| 33 Collect | Work-first desk; no peer tiles; H1 Hit the Clerk |
| 34 Home pipeline | Same-address story strip + proof hero tagline |
| 35 How It Works | Slim playbook; no wireframes; not a 2nd landing |
| 36 Coverage | Map always resolves; live-count close |

## Locked decisions (2026-07-09)

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Ground truth** | Landing hero: duck logo, house photo, grain, wear, cream/ember |
| D2 | **Vibe** | Gritty · Street · Ops dossier · Cinematic dark — not clean SaaS |
| D3 | **Layout bias** | Asymmetric mission layouts over equal card grids |
| D4 | **Copy voice** | Ops slang already used (“Hit the Clerk”) over corporate (“Request Your Data”) |
| D5 | **Mascot** | Full duck only at hero / peak empty states; text logo in chrome |
| D6 | **Stack** | Vanilla HTML/CSS/JS — no new framework |
| D7 | **Order** | Execute phases **32 → 36** one by one (plans ready before code) |
| D8 | **Tests** | Preserve DOM IDs / JS hooks unless plan migrates them; `npm test` after each phase |

## GSD phases

| Phase | Name | Plan | Status |
|-------|------|------|--------|
| 32 | Dashboard — Mission Board | [plan](../plans/2026-07-09-phase-32-dashboard-mission-board.md) | implemented |
| 33 | Collect — Clerk Desk | [plan](../plans/2026-07-09-phase-33-collect-clerk-desk.md) | implemented |
| 34 | Home — Pipeline Story Strip | [plan](../plans/2026-07-09-phase-34-home-pipeline-story.md) | implemented |
| 35 | How It Works — Playbook Film | [plan](../plans/2026-07-09-phase-35-how-it-works-playbook.md) | implemented |
| 36 | Home — Territory Map + Close | [plan](../plans/2026-07-09-phase-36-home-coverage-close.md) | implemented |

## GSD commands (per phase)

```text
/gsd:discuss-phase 32   # optional
/gsd:plan-phase 32      # already written — re-run only if scope changes
/gsd:execute-phase 32   # implement plan task-by-task
# … repeat 33–36 …
/gsd:complete-milestone # when all five ship + QA
```

**Agent execution (recommended):**  
Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` against the plan file for that phase only. Do not start the next phase until the current plan’s verification checklist is green.

## Success criteria (milestone)

1. Dashboard is a **mission board**, not a 3+4 card launcher
2. Collect lands on **action + territory**, not two tiles in a void
3. Homepage pipeline is a **story strip**, not three twin mockups
4. How It Works uses **real proof UI**, not wireframe bars
5. Coverage map **renders reliably** and close CTA feels earned
6. Side-by-side with hero: same grit world (screenshot QA)
7. All distress-os `npm test` green

## Constraints

- Do not regress hero logo/ember animation
- Do not break auth auto-login / `command-center.js` status fetch
- Coverage data paths (`home-coverage.js`, bootstrap JSON) stay valid
- Mobile: no horizontal overflow; CTAs ≥ 44px touch targets

## Out of scope

Filter step internals, Analyze scan engine, Vault billing, Forge PDF generation
