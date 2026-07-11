# Phase 75: Contract Freeze & Surface Inventory - Context

**Gathered:** 2026-07-11  
**Status:** Ready for planning  
**Source:** v3.0 milestone locked decisions (user continuous plan+execute)

## Phase Boundary

Deliver a frozen Filter contract (IDs, data-*, cinema structure, state matrix) and surface inventory mapped to design-system layers so later visual phases cannot rename contracts or invent CSS-only states.

**Requirement:** DESK-05

## Implementation Decisions

### Locked
- CSS/markup only for the whole milestone — this phase is docs + inventory + optional freeze tests; no process/engine changes
- Never rename `bridge-*` IDs, `data-action`, `data-mode`, `data-format`, `data-step`
- North star: login/home visual (for inventory layer targets only)
- Cinema structure from v2.1–v2.2 stays (kill report climax, Save primary, no Analyze push)
- Train wrap remains fail-closed via JS `hidden`, not CSS display hacks

### Agent Discretion
- How to extract ID list (grep bridge.html + bridge.js)
- Whether freeze tests are static greppable asserts or markdown-only checklist (prefer greppable static test if cheap)
- Exact inventory table format

## Canonical References

- `.planning/REQUIREMENTS.md` — DESK-05
- `.planning/research/PITFALLS.md` — ID freeze, hidden/disabled
- `.planning/research/SUMMARY.md` — phase structure
- `public/bridge.html`
- `public/js/bridge.js` (read-only for ID inventory)
- `AGENTS.md` — data preservation

## Out of Scope

- Any visual restyle paint (phases 76–80)
- JS behavior changes
