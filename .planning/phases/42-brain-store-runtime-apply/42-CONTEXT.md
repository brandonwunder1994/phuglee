# Phase 42: Brain store + runtime apply - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Source:** PRD Express Path (MILESTONE-CONTEXT.md + REQUIREMENTS.md)

<domain>
## Phase Boundary

Deliver a durable **global** Filter brain store and apply **active** type/phrase rules inside every `processUpload` so tagging improves for all users. No admin UI, no decisions API, no grouping UI in this phase.

</domain>

<decisions>
## Implementation Decisions

### Scope
- Global brain file only (not per-user)
- Filter/Bridge only — do not touch Analyzer learned-brain
- Water shut-off never type-suppressed

### Storage
- Volume-safe path pattern like `FILTER_LISTS_ROOT` (prefer under PDA_DATA_ROOT / dedicated BRIDGE_BRAIN_ROOT)
- Atomic write (tmp + rename) like `bridge-list-store.js`

### Apply order
- After base tagRow, before distress filter
- promote type → base/phrase promote → suppress phrase → suppress type (suppress wins on conflict)
- Empty brain = no-op process still works

### Claude's Discretion
- Exact JSON schema field names within brain document
- Whether apply lives in tagger module vs separate bridge-brain-apply.js (prefer separate pure module + wire from engine)

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — BRAIN-01, BRAIN-02, BRAIN-03

### Roadmap
- `.planning/ROADMAP.md` — Phase 42 section

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Filter process flow
- `.planning/codebase/STRUCTURE.md` — where to put new libs
- `.planning/codebase/CONVENTIONS.md` — atomic JSON patterns
- `.planning/codebase/TESTING.md` — node:test patterns
- `.planning/codebase/CONCERNS.md` — no brain today

### Implementation anchors
- `lib/bridge-distress-tagger.js`
- `lib/bridge-engine/index.js`
- `lib/bridge-list-store.js` (atomic write pattern)
- `lib/config.js`

### Product context
- `.planning/MILESTONE-CONTEXT.md`
- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` (reference only)

</canonical_refs>

<deferred>
## Deferred Ideas

Admin UI, review groups, decisions API, phrase mining UI — phases 43–47

</deferred>

---
*Phase: 42-brain-store-runtime-apply*  
*Context gathered: 2026-07-09 via PRD Express Path*
