# Plan: M4 Phuglee Signature Brand Milestone Initialization

**Date:** 2026-07-06  
**Milestone:** v1.3 / M4  
**Command:** `/gsd:new-milestone v1.3 Phuglee Signature Brand`  
**Source brief:** User premium edgy brand redesign spec (logo-ground-truth palette, full-site scope)

## What was created

| Artifact | Path |
|----------|------|
| Milestone doc | `docs/gsd/milestones/M4-phuglee-signature-brand.md` |
| Site audit | `.planning/SITE-AUDIT.md` |
| Brand design system + page plans | `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md` |
| Requirements | `.planning/REQUIREMENTS.md` (BRAND-01–37) |
| Roadmap | `.planning/ROADMAP.md` (Phases 22–31) |
| Phase checklists | `.planning/phases/22–31` |
| State | `.planning/STATE.md` |
| Project | `.planning/PROJECT.md` |
| Milestones index | `.planning/MILESTONES.md` |

## Execution order

1. **Phase 22** — `--phuglee-*` tokens, `phuglee-components.css`, `phuglee-logo.js`, pattern tile
2. **Phase 23** — Global nav/footer retokenize, `phuglee-motion.js`, rewrite injection
3. **Phase 24** — Home `/` signature rebuild (now in scope)
4. **Phase 25** — Auth modal + pricing tiers + success overlay
5. **Phase 26** — `/heat`, `/collect`, `/bridge` editorial premium pass
6. **Phase 27** — Form Forge 7 pages (`phuglee-forge.css`)
7. **Phase 28** — Analyzer all surfaces (`phuglee-analyzer.css`)
8. **Phase 29** — Loading/empty/error states + micro-interactions
9. **Phase 30** — WCAG, perf, SEO, reduced-motion audit
10. **Phase 31** — Cross-app QA + `/gsd:complete-milestone`

## GSD workflow per phase

```
/gsd:discuss-phase N   → refine goals (optional)
/gsd:plan-phase N      → write .planning/phases/N/PLAN.md
/gsd:execute-phase N   → implement + verify + commit
```

## Stack decisions (from brief)

| Brief request | M4 approach |
|---------------|-------------|
| React SVG component | `phuglee-logo.js` vanilla injector |
| Framer Motion | CSS + IntersectionObserver (Phase 29) |
| TypeScript | JSDoc in new modules; full TS deferred |
| E-commerce flows | Out of scope |

## Unlocked (vs M3)

- Login page `/` — full signature rebuild in Phase 24
- Logo-ground-truth palette replaces Heat ember dominance
- Orchestrated page motion and branded state moments