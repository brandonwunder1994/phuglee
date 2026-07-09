# M6 — Territory Theater (v1.5)

> **Status:** `implemented` — phases 37–41 executed 2026-07-09  
> **Created:** 2026-07-09  
> **Depends on:** M5 Phase 36 (territory reliability — implemented)  
> **Design bible:** `docs/superpowers/specs/2026-07-09-territory-theater-design.md`  
> **Scope:** Homepage Live coverage section only — make it as awesome as the rest of the front page

---

## Goal

Turn **Live coverage** from a bland choropleth widget into a **war-room territory proof** that matches the duck hero and pipeline story: heat palette, HUD hierarchy, live pulse, interactive spotlight, and a fused close.

## Quality bar

| Phase | Pass condition |
|-------|----------------|
| 37 Heat palette | Covered = ember→gold; no SaaS green on home map or legend |
| 38 War-room HUD | Display-scale city/state counts; map feels command display |
| 39 Live ticker | Real coverage rows animate; reduced-motion safe |
| 40 State spotlight | Select state → dossier card; search demoted |
| 41 Entrance + close | Cascade on scroll-in; CTA fused under map proof |

## Locked decisions

| # | Decision | Locked choice |
|---|----------|---------------|
| D1 | **Order** | Execute **37 → 41** only; never skip ahead |
| D2 | **Stack** | Vanilla HTML/CSS/JS + existing MapLibre path |
| D3 | **Data honesty** | Ticker/spotlight use real coverage API/bootstrap only |
| D4 | **Colors** | Heat tokens in `tokens.css`; JS mirrors hex constants |
| D5 | **Reliability** | Phase 36 ready/error/retry never regresses |
| D6 | **Motion** | All animation respects `prefers-reduced-motion` |
| D7 | **Tests** | `npm test` + `scripts/verify-live.ps1` after each phase |
| D8 | **Commits** | One feat commit per phase (or task commits inside phase) |

## GSD phases

| Phase | Name | Plan | Status |
|-------|------|------|--------|
| 37 | Territory heat palette | [plan](../plans/2026-07-09-phase-37-territory-heat-palette.md) | implemented |
| 38 | War-room HUD | [plan](../plans/2026-07-09-phase-38-territory-war-room-hud.md) | implemented |
| 39 | Live territory ticker | [plan](../plans/2026-07-09-phase-39-territory-live-ticker.md) | implemented |
| 40 | State spotlight dossier | [plan](../plans/2026-07-09-phase-40-territory-state-spotlight.md) | implemented |
| 41 | Entrance cascade + fused close | [plan](../plans/2026-07-09-phase-41-territory-entrance-close.md) | implemented |

## GSD commands

```text
/gsd:execute-phase 37
# verify → then 38 → 39 → 40 → 41
/gsd:complete-milestone   # when all five green + full-page QA
```

**Agent execution:** one phase at a time via `subagent-driven-development` or `executing-plans` against that phase file only.

## Success criteria (milestone)

1. Side-by-side with hero: same grit world (no green SaaS island)
2. Visitor understands coverage in **under 3 seconds** (big counts + heat map)
3. Interaction path: click state → spotlight → city profile still works
4. Close feels earned on the map, not orphaned
5. Mobile usable; a11y: map `role`/labels preserved; reduced motion OK
6. All distress-os `npm test` green; live verify exit 0

## Constraints

- Do not regress hero logo/ember animation
- Do not break MapLibre explorer load or SVG fallback
- Do not invent fake cities/states in UI copy
- Keep coverage fetch URLs and bootstrap fallbacks

## Out of scope

`/forge/map` full redesign, Collect hub map, Command board coverage chip styling (except shared count IDs if already bound)
