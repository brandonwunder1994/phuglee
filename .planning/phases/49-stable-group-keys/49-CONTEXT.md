# Phase 49: Stable Group Keys - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** PRD Express Path (REQUIREMENTS.md + debug diagnosis)

<domain>
## Phase Boundary

Change review grouping so empty/free-text types do not fragment into timestamp singletons. Stack same real-world category. Singleton only when stabilized count === 1. Depends on Phase 48 category promotion. Do not change Train CSS or phrase miner.

</domain>

<decisions>
## Implementation Decisions

### GROUP
- Empty type: key free-text after stripping incidental dates/times
- Type values with embedded timestamps: still stack on category phrase
- Clean typed High Grass continues to stack on normalized type key (no regression)
- `isSingleton` remains pure `count === 1` after stable keys

### Stack
- Primary file: `lib/bridge-review-groups.js` (+ pure helpers if needed)
- TDD: unit tests for grouping; engine contract if needed

### Claude's Discretion
- Timestamp strip regex (US dates, ISO, times)
- Whether to also normalize whitespace/punctuation on free-text keys

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — GROUP-01..04
- `.planning/debug/filter-singleton-no-category.md`
- `lib/bridge-review-groups.js`
- `lib/bridge-brain-store.js` (`violationTypeKey`)
- Phase 48 outputs (promoted type + array indicators)

</canonical_refs>

<deferred>
## Deferred Ideas

- Regression e2e lock suite → Phase 50
- MAP/SHAPE already phase 48

</deferred>

---
*Phase: 49-stable-group-keys*  
*Context gathered: 2026-07-10 via PRD Express Path*
