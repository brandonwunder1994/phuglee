---
phase: 62-city-dossier
plan: 02
subsystem: ui
tags: [city-dossier, bridge, city-outcome, case-file, scrap-drawer, CITY-01, CITY-02]

# Dependency graph
requires:
  - phase: 62-city-dossier
    provides: Wave 0 static contracts (bridge-city-dossier.test.js) + city-outcome handler locks
  - phase: 61-scrub-desk-foundation
    provides: Desk shell + city step surface for dossier composition
provides:
  - CITY-01 city ops dossier composed client-side from history + lists
  - CITY-02 demoted no-list outcomes in secondary scrap drawer
  - Eager history on city select without blocking type panel
  - Preserved saveCityOutcome POST payload
affects: [63-idle-proof, 67-multi-city-shift, bridge city step UX]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-compose dossier from GET /api/bridge/history/:cityId + in-memory savedLists — no dossier route"
    - "Type panel reveal before await history; race guard on selectedCity.id"
    - "Collapsed scrap drawer for tracker outcomes; radios expand on toggle only"

key-files:
  created: []
  modified:
    - public/bridge.html
    - public/css/bridge.css
    - public/js/bridge.js

key-decisions:
  - "Hybrid layout: dossier inline under city selects; outcomes in button+panel drawer (not details)"
  - "Named loadCityDossierHistory (not only loadHistory from onCityChange)"
  - "Empty ops copy: No attaches yet for this city. Drop a file or log a tracker reply."
  - "No GET /api/bridge/dossier — compose from existing APIs only"

patterns-established:
  - "buildDossierModel(city, history, lists) → lastScrub by newest attached_at + stagedLists filter cityId"
  - "hideCityDossierUi on state reset / empty city / resetImportAreaAfterSave"
  - "refreshDossierListsFacet when renderSavedLists updates inventory"

requirements-completed: [CITY-01, CITY-02]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 62 Plan 02: City Dossier UI Summary

**City select opens case-file dossier (last scrub / attaches / staged lists) with no-list outcomes demoted to a collapsed scrap drawer — type panel never waits on history**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T23:49:22Z
- **Completed:** 2026-07-10T23:58:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Shipped CITY-01 ops dossier shell on `/bridge` city step with last scrub, prior attaches, and staged-list status
- Demoted CITY-02 five-radio wall into secondary `#bridge-outcome-drawer` (collapsed by default)
- Eager `loadCityDossierHistory` with race guard; type cards reveal immediately on city select
- Locked `saveCityOutcome` payload unchanged; full suite + dossier contracts green

## Task Commits

Each task was committed atomically:

1. **Task 1: Dossier shell + demote outcome wall (HTML)** - `1ee235e` (feat)
2. **Task 2: Case-file dossier + collapsed scrap styles (CSS)** - `14f643e` (feat)
3. **Task 3: Compose dossier; drawer; preserve outcome save** - `e5f02f5` (feat)

**Plan metadata:** (docs commit with this SUMMARY)

## Files Created/Modified

- `public/bridge.html` — `#bridge-city-dossier` facets + `#bridge-outcome-drawer` wrapping preserved tracker controls
- `public/css/bridge.css` — case-file dossier + secondary scrap drawer styles; collapsed hides radiogroup
- `public/js/bridge.js` — `buildDossierModel`, `renderCityDossier`, `loadCityDossierHistory`, drawer toggle, resets, list facet refresh

## Decisions Made

- Button+panel drawer (not `<details>`) for aria-expanded control and CSS `is-open` class
- Prefer named `loadCityDossierHistory` while `loadHistory` still refreshes dossier after attach/dialog
- Empty state copy from CONTEXT: ops voice for zero attaches + zero lists
- History fetch soft-fails in dossier only — type panel stays usable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CITY-01 / CITY-02 product requirements delivered; phase 62 complete after metadata commit
- Ready for phase 63 Idle Proof & Process Climax (global idle KPIs deferred from dossier)
- Manual smoke: open `/bridge` → pick city → dossier + type cards; open scrap → log tracker status

## Self-Check: PASSED

- FOUND: `public/bridge.html`
- FOUND: `public/css/bridge.css`
- FOUND: `public/js/bridge.js`
- FOUND: `.planning/phases/62-city-dossier/62-02-SUMMARY.md`
- FOUND commit: `1ee235e`
- FOUND commit: `14f643e`
- FOUND commit: `e5f02f5`
- verify-live.ps1: LIVE health=200 home=200
- npm test: 604 pass

---
*Phase: 62-city-dossier*
*Completed: 2026-07-10*
