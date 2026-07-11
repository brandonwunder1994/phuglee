# Phase 67: Multi-City Shift & Staging - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** Showstopper 2 + rec 9

<domain>
## Phase Boundary

Sticky multi-city shift queue/inventory; after save, next city one-click without re-teaching chrome. Saved lists as staging inventory HUD. Brand-heat (ember/gold) post-save success, not green SaaS. Preserve list APIs (rename/download/delete/download-all).

</domain>

<decisions>
## Implementation Decisions

### Shift desk
- Sticky queue of staged cities/lists during a session
- Post-save: inventory updates; operator can start next city without full wizard re-onboarding

### Inventory HUD
- Counts, type heat, ready/download language while keeping table actions

### Success
- Ember/gold heat flash; keep optional Download this list (CSV) path from v2.0 EFF

### Claude's Discretion
- Queue placement (left rail vs top strip)
- Session-only queue vs derived purely from lists API

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — SHIFT-01–03
- `public/js/bridge.js` — save list, resetImportAreaAfterSave, lists flash
- List store APIs — do not wipe data

</canonical_refs>

<deferred>
## Deferred Ideas

Multi-operator collaboration; auto-delete after download

</deferred>

---
*Phase: 67-multi-city-shift-staging*
