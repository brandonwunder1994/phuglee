# Phase 46: Phrase mining + brain panel - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Source:** PRD Express Path

<domain>
## Phase Boundary

Mine phrase candidates from decisions into **proposed** rules only; admin brain panel to activate/reject/disable; only active phrases apply via phase 42 apply path.

</domain>

<decisions>
## Implementation Decisions

- Never auto-activate mined phrases
- ≥2 same-direction evidence before propose (planner may refine threshold)
- Escape literals; no untrusted regex ReDoS
- Panel: type rules + proposed phrases + active phrases

</decisions>

<canonical_refs>
## Canonical References

- PHRASE-01–03 REQUIREMENTS.md
- Phase 42 apply, Phase 45 events
- Analyzer learned-brain is pattern reference only — separate store

</canonical_refs>
