# Phase 81: Visual QA Lock & Catalog - Context

**Gathered:** 2026-07-11  
**Status:** Ready for planning  
**Source:** v3.0 locked decisions

## Phase Boundary

Ship bar: 390/1440 layout QA checklist, suite ≥679 green, verify-live exit 0, behavior freeze, component catalog note + screenshot parity matrix for later site-wide.

**Requirements:** QA-01, QA-02, QA-03, QA-04, SYS-01, SYS-02

## Implementation Decisions

### Locked
- `scripts/verify-live.ps1` must exit 0
- No data wipes of filter-lists or brain
- Catalog is short markdown (not Storybook)
- Permanent test bar must stay green

## Canonical References

- `scripts/verify-live.ps1`
- `docs/bridge/TEST-PLAN.md`
- `AGENTS.md`
- `.planning/REQUIREMENTS.md`
