# Phase 43: Review payload + grouping - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Source:** PRD Express Path (MILESTONE-CONTEXT.md)

<domain>
## Phase Boundary

Extend process response with full not-distressed rows, stable rowIds, and review groups by violation type (signals + description samples). No admin UI, no decision writes.

</domain>

<decisions>
## Implementation Decisions

- Group by normalized city Violation/Issue Type (stack identical types)
- Empty type → group by exact description
- Cap FN rows (e.g. 5000) with truncated flag
- Non-review discards (dedupe, bad address) stay in discarded only
- Depends on phase 42 brain already applied before split

### Claude's Discretion
- groupId hashing scheme
- Exact ReviewGroup field names consistent with later DEC/TRAIN phases

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — REV-01–04
- `.planning/ROADMAP.md` — Phase 43
- `.planning/phases/42-brain-store-runtime-apply/` — prior phase
- `lib/bridge-distress-tagger.js` — filterDistressOnly
- `lib/bridge-engine/index.js`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/MILESTONE-CONTEXT.md`

</canonical_refs>

<deferred>
Admin UX (44), decisions (45)

</deferred>
