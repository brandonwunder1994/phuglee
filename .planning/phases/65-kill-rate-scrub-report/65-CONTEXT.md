# Phase 65: Kill-Rate Scrub Report - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** Showstopper 3 + rec 8

<domain>
## Phase Boundary

After process, results open as kill-rate scrub report: display-scale RAW → KILLED → KEPT, kill-reason breakdown, proof chips from existing meta, optional sample kept dossiers. Save/Stage primary; Preview CSV secondary. Analyze boundary preserved. Train theater pivot is phase 66.

</domain>

<decisions>
## Implementation Decisions

### Report hierarchy
- Display-scale RAW → KILLED → KEPT (not equal KPI tile grid as primary)
- Kill-reason breakdown from existing process stats
- Meta (duration, format reuse, discard story) as proof chips/HUD

### CTA
- Primary: Save list / Stage
- Secondary: Preview CSV
- No Analyze push

### Claude's Discretion
- Optional 3–5 sample kept address dossiers visual treatment
- How existing KPI grid is replaced vs demoted

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — KILL-01–03
- `public/js/bridge.js` — renderKpis, processingMeta, renderResults
- Territory/Command HUD count language
- Home filter raw→kept tally vocabulary

</canonical_refs>

<deferred>
## Deferred Ideas

Train theater (66); shift inventory (67)

</deferred>

---
*Phase: 65-kill-rate-scrub-report*
