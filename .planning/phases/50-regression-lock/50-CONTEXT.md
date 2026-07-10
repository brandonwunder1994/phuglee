# Phase 50: Regression Lock - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** PRD Express Path

<domain>
## Phase Boundary

Lock accuracy fixes with automated tests (TEST-01..03). Ensure `npm test` and `scripts/verify-live.ps1` green. No new product features beyond tests/docs if needed for the lock.

</domain>

<decisions>
## Implementation Decisions

### TEST
- Description-only High Grass + timestamps → one distressed group count N
- Unmapped category column → type populated; labels use it
- Typed High Grass still stacks; full suite + verify-live green

### Claude's Discretion
- New test file vs extend existing engine/grouping tests
- Whether to document fix in TAGGING-RULES briefly

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — TEST-01, TEST-02, TEST-03
- Phases 48–49 implementations
- `scripts/verify-live.ps1`
- `AGENTS.md` live verify rules

</canonical_refs>

<deferred>
## Deferred Ideas

None within milestone

</deferred>

---
*Phase: 50-regression-lock*  
*Context gathered: 2026-07-10 via PRD Express Path*
