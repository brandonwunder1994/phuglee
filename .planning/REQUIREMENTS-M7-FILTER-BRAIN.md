# Requirements — M7 Filter Superpower Brain (v1.6)

**Date:** 2026-07-09  
**Status:** Planned (not implemented until user execute)  
**Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
**Audit:** `docs/gsd/plans/2026-07-09-m7-audit-filter-brain.md`

## Requirements

| ID | Requirement | Phase | Priority |
|----|-------------|-------|----------|
| BRAIN-01 | Global durable brain file (volume-safe path) | 42 | P0 |
| BRAIN-02 | Apply brain on every `processUpload` | 42 | P0 |
| BRAIN-03 | Full not-distressed rows for admin review | 43 | P0 |
| BRAIN-04 | Group by city Violation type (normalized) | 43 | P0 |
| BRAIN-05 | Show matchedIndicators + descriptions | 44 | P0 |
| BRAIN-06 | Admin-only ✓/✗ train UI | 44 | P0 |
| BRAIN-07 | Deny removes from current kept list | 45 | P0 |
| BRAIN-08 | Approve FN promotes into kept list | 45 | P0 |
| BRAIN-09 | Type suppress/promote affect **next** upload | 45 | P0 |
| BRAIN-10 | Audit events for every decision | 45 | P0 |
| BRAIN-11 | Phrase mine → proposed only (never auto-live) | 46 | P0 |
| BRAIN-12 | Admin activate/reject phrase rules | 46 | P0 |
| BRAIN-13 | Non-admin brain writes → 403 | 45 | P0 |
| BRAIN-14 | Undo + disable rules | 47 | P1 |
| BRAIN-15 | Metrics for brain health | 47 | P1 |
| BRAIN-16 | Docs + verify-live production QA | 47 | P0 |

## Non-goals

- Analyze vision AI review redesign  
- Per-user / per-city brains  
- ML fine-tuning  
- Non-admin training  

## Traceability

Each BRAIN-ID maps to a GSD phase plan under `docs/gsd/plans/2026-07-09-phase-4*.md`.
