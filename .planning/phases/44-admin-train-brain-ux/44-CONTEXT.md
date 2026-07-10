# Phase 44: Admin Train brain UX - Context

**Gathered:** 2026-07-09  
**Status:** Ready for planning  
**Source:** PRD Express Path

<domain>
## Phase Boundary

Admin-only Train brain UI on Filter results: two sections (marked distressed / not marked), group cards with signals + descriptions, ✓ Approve / ✗ Deny controls. Wire to API stub or ready for phase 45; non-admin never sees chrome.

</domain>

<decisions>
## Implementation Decisions

- Admin = session username `admin` (client hide + later server enforce in 45)
- Group by violation type as returned in reviewGroups
- Match existing bridge design system (no new visual language)
- Vanilla HTML/CSS/JS in public/bridge.*

### Claude's Discretion
- Tab vs panel layout details; toast copy

</decisions>

<canonical_refs>
## Canonical References

- TRAIN-01–04 in REQUIREMENTS.md
- `public/bridge.html`, `public/js/bridge.js`, bridge CSS
- `public/js/auth.js`, `public/js/auth-session.js`, `public/js/phuglee-session-headers.js`
- Phase 43 response shape
- `.planning/codebase/CONVENTIONS.md`

</canonical_refs>

<deferred>
Real decision persistence (45), phrase panel (46)

</deferred>
