# Phase 62: City Dossier - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** Milestone locked decisions (SS4 + rec 6)

<domain>
## Phase Boundary

City select opens an ops dossier (attaches / last scrub / lists staged / status). “No usable list” outcomes demoted to secondary scrap/drawer. Depends on desk shell (61). Does not implement idle global metrics (63) or shift queue (67).

</domain>

<decisions>
## Implementation Decisions

### Dossier
- On city select: show case-file panel with prior attaches, last scrub signals, lists staged for that city, relevant status
- Data from existing APIs where possible (`/api/bridge/history/:cityId`, `/api/bridge/lists`, city outcome)

### Exception path
- Five city-reply outcomes move to secondary scrap/drawer — not primary 5-radio wall on happy path
- Happy path remains: pick city → (type) → drop file

### Claude's Discretion
- Dossier layout (inline panel vs side scrap)
- Empty dossier copy when no history

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v2.1-FILTER-SCRUB-THEATER.md`
- `.planning/codebase/filter-page-ui-map.md` — city step, outcomes, history modal
- `.planning/REQUIREMENTS.md` — CITY-01, CITY-02
- Territory dossier patterns: `public/index.html` home-territory-dossier (visual language only)
- `public/bridge.html` city section + history dialog
- `public/js/bridge.js` state/city load + outcome save

</canonical_refs>

<deferred>
## Deferred Ideas

Multi-city shift sticky queue (67); global idle KPIs not city-scoped (63)

</deferred>

---
*Phase: 62-city-dossier*
