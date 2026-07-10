# Phase 47: Hardening + metrics + docs - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Source:** PRD Express Path

<domain>
## Phase Boundary

Production hardening: undo, caps, version 409, metrics, train UX polish (search/pagination), TAGGING-RULES docs, full QA matrix, npm test + verify-live.

</domain>

<decisions>
## Implementation Decisions

- Client trainUndoStack for list restore; server undo reverts rule from last event
- Caps on events/rules; brain.version RMW
- Document brain layers in docs/bridge/TAGGING-RULES.md

</decisions>

<canonical_refs>
## Canonical References

- HARD-01–04 REQUIREMENTS.md
- Phases 42–46 artifacts
- AGENTS.md verify-live.ps1
- docs/bridge/TAGGING-RULES.md

</canonical_refs>
