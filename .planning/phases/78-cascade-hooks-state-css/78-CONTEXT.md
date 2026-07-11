# Phase 78: Cascade, Hooks & State CSS - Context

**Gathered:** 2026-07-11  
**Status:** Ready for planning  
**Source:** v3.0 locked decisions

## Phase Boundary

Fix CSS load order (components → bridge → a11y); dual-class wire forms/dropzone/dialogs; honor `hidden`/`disabled`; shared loading patterns.

**Requirements:** FORMS-01, FORMS-04, CARDS-02, STATES-02

## Implementation Decisions

### Locked
- Never `display:flex !important` on Train wrap to override `hidden`
- Keep native `<dialog>` elements for type confirm / history
- Dropzone visual states only — multi-file + accept list unchanged
- Scrub feed must not depend on `animationend` to populate

## Canonical References

- `public/bridge.html` (link order)
- `public/css/bridge.css`
- `.planning/research/PITFALLS.md`, `ARCHITECTURE.md`
