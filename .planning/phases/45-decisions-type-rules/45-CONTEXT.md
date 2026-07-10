# Phase 45: Decisions + type rules + list mutation - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Source:** PRD Express Path

<domain>
## Phase Boundary

Admin Approve/Deny persists: mutates current kept/FN lists, writes type suppress/promote rules live for next process, audit events, server 403 for non-admin.

</domain>

<decisions>
## Implementation Decisions

| Section | Action | List | Brain |
|---------|--------|------|-------|
| distressed | deny | remove from kept | suppress_type active |
| distressed | approve | keep | affirmation; clear suppress for type if present |
| not_distressed | approve | promote to kept strong | promote_type active |
| not_distressed | deny | stay out | affirmation only |

- Stateless: client may send current rows arrays; or document size limits
- Server requireAdmin via x-phuglee-user === admin

</decisions>

<canonical_refs>
## Canonical References

- DEC-01–06 REQUIREMENTS.md
- Phase 42 store/apply, Phase 43 groups, Phase 44 UI
- `lib/bridge-api.js`, brain store modules from 42

</canonical_refs>
