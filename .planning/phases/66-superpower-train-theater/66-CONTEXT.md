# Phase 66: Superpower Train Theater - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** Showstopper 5; v1.6 admin gate

<domain>
## Phase Boundary

When admin has open train groups after process, UI pivots into Train theater (mission header, live kept-count on decisions). Brain panel secondary (rules armory). Non-admin never sees train/brain. No decision API rewrites beyond presentation; preserve existing train/decision behavior.

</domain>

<decisions>
## Implementation Decisions

### Theater pivot
- Open groups > 0 → Train theater default (not peer Kept | Train | Brain equal tabs)
- Mission header with open-group count
- Live kept-count feedback on Approve/Deny (existing mutation)

### Brain
- Secondary armory access (not third equal peer tab)

### Admin gate
- THTR-03: non-admin never sees train/brain chrome (preserve isBridgeAdmin)

### Claude's Discretion
- How Kept list is still reachable during theater
- Exact tab vs full-page pivot chrome

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — THTR-01–03
- `public/js/bridge-train.js`, `public/js/bridge.js` train modes
- v1.6 TRAIN/DEC locks — do not regress admin-only writes

</canonical_refs>

<deferred>
## Deferred Ideas

New ML; non-admin train; phrase auto-activate

</deferred>

---
*Phase: 66-superpower-train-theater*
