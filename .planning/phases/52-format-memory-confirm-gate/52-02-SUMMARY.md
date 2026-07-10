---
phase: 52-format-memory-confirm-gate
plan: 02
subsystem: database
tags: [bridge, format-memory, fingerprint, atomic-json, GATE-01, volume-safe]

# Dependency graph
requires:
  - phase: 52-format-memory-confirm-gate
    provides: "Wave 0 RED GATE-01 store suite (52-01)"
  - phase: 51-col-scoring-map-wire
    provides: "normalizeHeader, type scorer baseline"
provides:
  - "lib/bridge-city-format-store.js with computeFormatFingerprint + load/save"
  - "BRIDGE_CITY_FORMATS_ROOT volume-safe config root"
  - "gitignored data/bridge-city-formats/ runtime dir"
affects:
  - 52-03 engine gate + normalizer override
  - 52-04 API 409 + confirm UI

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "City-format store mirrors brain atomic temp+rename; reads config at call time"
    - "Fingerprint = sorted normalizeHeader join \\u0001 + sha1 (not file bytes)"
    - "typeHeader null is first-class confirmed no-type (key present)"

key-files:
  created:
    - lib/bridge-city-format-store.js
  modified:
    - lib/config.js
    - .gitignore
    - tests/bridge-city-format-store.test.js

key-decisions:
  - "Format memory fully separate from global-brain.json under BRIDGE_CITY_FORMATS_ROOT"
  - "Single city-formats.json index keyed cities[cityId][uploadType]"
  - "Zero new npm packages — crypto + fs only"

patterns-established:
  - "cityFormatsPath()/load/save read config.BRIDGE_CITY_FORMATS_ROOT at call time for temp override"
  - "corrupt/missing load → emptyCityFormats + console.warn, never throw"

requirements-completed: [GATE-01]

# Metrics
duration: 3min
completed: 2026-07-09
---

# Phase 52 Plan 02: City Format Store Summary

**Volume-safe per-city Type-column format memory with order-independent sha1 fingerprint and atomic JSON load/save, separate from global-brain.json**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-10T06:09:01Z
- **Completed:** 2026-07-10T06:12:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `BRIDGE_CITY_FORMATS_ROOT` mirrors brain nesting (env → PDA_DATA_ROOT → `data/bridge-city-formats`)
- `lib/bridge-city-format-store.js`: `computeFormatFingerprint`, `emptyCityFormats`, `cityFormatsPath`, `loadCityFormats`, `loadCityFormat`, `saveCityFormat` with atomic write and null typeHeader support
- GATE-01 unit suite 12/12 green (incl. dual uploadType isolation); pure scorer still green
- `data/bridge-city-formats/` gitignored; zero new npm packages; brain store untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Config root + city-format store module** - `01e603d` (feat)
2. **Task 2: Harden store edge cases** - `1ecffa3` (test)

**Plan metadata:** (docs commit after state update)

## Files Created/Modified

- `lib/bridge-city-format-store.js` — fingerprint + durable per-city format memory store
- `lib/config.js` — `BRIDGE_CITY_FORMATS_ROOT` volume-safe path
- `.gitignore` — ignore `data/bridge-city-formats/`
- `tests/bridge-city-format-store.test.js` — dual uploadType non-clobber assert

## Decisions Made

- Single index file `city-formats.json` under formats root (not per-city files)
- Read `config.BRIDGE_CITY_FORMATS_ROOT` at call time only (test override safe, brain pattern)
- `typeHeader: null` preserved with key present for confirmed “No type column”
- Did not wire processUpload gate (Plan 03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03: engine gate after parse+score, normalizer `typeColumnOverride`, typeResolution META, batch policy
- Store APIs ready: `computeFormatFingerprint`, `loadCityFormat`, `saveCityFormat`
- Do not wipe `data/filter-lists/`, `data/bridge-brain/`, or `data/bridge-city-formats/`

## Self-Check: PASSED

- FOUND: `lib/bridge-city-format-store.js`
- FOUND: `BRIDGE_CITY_FORMATS_ROOT` in `lib/config.js`
- FOUND: `bridge-city-formats` in `.gitignore`
- FOUND: commit `01e603d`
- FOUND: commit `1ecffa3`
- Verified GREEN: `node --test tests/bridge-city-format-store.test.js` 12/12 pass
- Verified GREEN: scorer suite still passes; no processUpload/engine wire
- GATE-01 already checked in REQUIREMENTS.md (implementation now green)

---
*Phase: 52-format-memory-confirm-gate*
*Completed: 2026-07-09*
