# M2 — Calm Premium Interface (v1.3)

> **Status:** `complete`  
> **Shipped:** 2026-06-30  
> **Base:** `b51da2f` (v1.2 Core Bones complete, 78 tests)  
> **Scope:** UI/UX transformation — calm, minimalist, premium. Backend superpowers hidden until needed. Free stack only.  
> **Note:** Aesthetic superseded by v1.4 cyber pivot; shell structure and workflow patterns retained.

---

## Goal

Transform Property Distress Analyzer from a cyber-HUD "Intelligence Suite" into a calm, polished, Linear/Notion-style tool. Strip visible clutter; preserve 10k+ sessions, learned brain, backups, tier engine, and review mode behind progressive disclosure (⌘K, overflow menus).

---

## Five high-impact changes

| # | Change | Phase |
|---|--------|-------|
| 1 | Calm token foundation (retire cyber-HUD palette) | 11 |
| 2 | Collapse shell chrome (HUD bar + sidebar demotion) | 12 |
| 3 | Tailwind + shadcn-token build pipeline | 11 |
| 4 | Primary workflow simplification (empty/scan/summary) | 13 |
| 5 | Results toolbar → calm data view | 14 |

Full brief: `.planning/phases/11-calm-design-foundation/11-DESIGN-BRIEF.md`

---

## GSD phases (continues from M1 phase 10)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 11 | Calm Design Foundation | DS-01–05 | complete ✓ |
| 12 | Shell Simplification | SHELL-01–05 | complete ✓ |
| 13 | Workflow Surfaces | FLOW-01–05 | complete ✓ |
| 14 | Results & Data Views | DATA-01–05 | complete ✓ |
| 15 | Modals & Review Polish | MODAL-01–04 | complete ✓ |

---

## Constraints

- Do NOT change save/tier/backup behavior unless UI needs small hook
- `npm test` must pass after every phase
- Free stack: Tailwind, shadcn tokens, native dialog — no paid kits, no React migration

---

## Next step

**M2 closed.** See [M3 — Cyber Premium Interface](./M3-cyber-premium.md) for v1.4.