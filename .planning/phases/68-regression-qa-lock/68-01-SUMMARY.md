---
phase: 68-regression-qa-lock
plan: 01
subsystem: testing
tags: [qa, regression, permanent-bar, reduced-motion, verify-live, bridge, FEED, KILL, THTR]

# Dependency graph
requires:
  - phase: 64-live-scrub-feed
    provides: FEED-01/02 static + unit contracts (scrub feed mount, reduced-motion play)
  - phase: 65-kill-rate-scrub-report
    provides: KILL-01/02/03 hierarchy + Save primary + Stage voice locks
  - phase: 66-superpower-train-theater
    provides: THTR-01/02/03 mission HUD + Rules armory + fail-closed train wrap
  - phase: 60 (v2.0)
    provides: TEST-01 (v2.0) independence + TEST-02 (v2.0) gold ACC permanent bars
provides:
  - TEST-PLAN §O v2.1 QA-01..03 permanent bar map
  - 68-QA-CHECKLIST.md template for 390/1440 + reduced-motion human gate
  - Gates-only theater packaging (product dual-tags; no new scrub-theater suite)
affects: [68-02 ship gate, milestone close, future Filter regressions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gates-only permanent-bar packaging when product dual-tags already green"
    - "QA-0N (v2.1) packaging titles never overwrite v1.7/v1.8/v2.0 TEST titles"
    - "QA-02 Option A: verify-live + explicit /bridge 200 (Plan 02 executes)"

key-files:
  created:
    - .planning/phases/68-regression-qa-lock/68-QA-CHECKLIST.md
  modified:
    - docs/bridge/TEST-PLAN.md

key-decisions:
  - "Gates-only for QA-03 theater: product FEED/KILL/THTR suites already lock reduced-motion, Save primary, train fail-closed — no tests/bridge-scrub-theater.test.js"
  - "QA-02 uses Option A (Plan-only /bridge check); verify-live.ps1 not extended"
  - "Full npm test + verify-live + filled checklist deferred to Plan 02"

patterns-established:
  - "Wave 0 inventory first: if FEED-|KILL-|THTR- + prefers-reduced-motion greppable → skip new packaging suite"
  - "TEST-PLAN §O maps QA IDs to real files; human overflow stays in phase checklist"

requirements-completed: [QA-01, QA-02, QA-03]

# Metrics
duration: 12min
completed: 2026-07-11
---

# Phase 68 Plan 01: Regression QA Lock packaging Summary

**v2.1 permanent bar packaged as TEST-PLAN §O + 68-QA-CHECKLIST; theater FEED/KILL/THTR gates-only via existing product dual-tags (no new scrub-theater suite)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-11T00:44:44Z
- **Completed:** 2026-07-11T00:56:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Inventoried post-61–67 theater hooks: `#bridge-scrub-feed`, kill RAW/KILLED/KEPT, train theater, `prefers-reduced-motion`, `min-height: 44px` all greppable in product code + tests
- Confirmed gates-only path — product suites green (44 theater tests; independence + gold + train-ux + list-factory permanent bar green)
- Appended `docs/bridge/TEST-PLAN.md` **§O** mapping QA-01..03 (v2.1) to real files/commands without rewriting §N (v2.0)
- Shipped blank `68-QA-CHECKLIST.md` for Plan 02 human 390/1440 + reduced-motion gate

## Task Commits

Each task was committed atomically:

1. **Task 1: Inventory theater hooks + QA-03 surface contracts (gates-only)** — no code commit (gates-only confirmation; product dual-tags already green)
2. **Task 2: TEST-PLAN §O v2.1 map + QA-03 checklist template** - `83975af` (docs)

**Plan metadata:** (final docs commit after SUMMARY)

_Note: Task 1 produced no file delta by design (prefer gates-only when already green)._

## Files Created/Modified

- `docs/bridge/TEST-PLAN.md` — §O v2.1 permanent regression bar (QA-01..03) + command block; §N untouched
- `.planning/phases/68-regression-qa-lock/68-QA-CHECKLIST.md` — layout 390/1440, reduced-motion FEED/KILL/THTR, admin smoke, automated gate checkboxes

## Gates-only inventory (Task 1)

Product-phase titles covering theater a11y/layout bar (all green at inventory):

| Surface | File | Greppable titles / contracts |
|---------|------|------------------------------|
| FEED | `tests/bridge-scrub-feed.test.js` | FEED-01 mount `#bridge-scrub-feed`; FEED-02 `prefers-reduced-motion: reduce` JS + CSS |
| KILL | `tests/bridge-kill-rate-scrub.test.js` | KILL-01 RAW→KILLED→KEPT; KILL-03 Save list primary + no Analyze push CTAs |
| THTR | `tests/bridge-train-theater.test.js` | THTR-03 train wrap hidden by default; non-admin clears train |
| Save primary | `tests/bridge-list-factory-ux.test.js` | LIST-01 `id="bridge-save-list"` + BANNED_CTAS |
| Train fail-closed | `tests/bridge-train-ux.test.js` | wrap hidden by default + isBridgeAdmin gate |
| Independence | `tests/bridge-independence.test.js` | `TEST-01 (v2.0)` still greppable |
| Gold ACC | `tests/bridge-accuracy-gold.test.js` | `TEST-02 (v2.0)` still greppable |

**Not created:** `tests/bridge-scrub-theater.test.js` (no missing greppable locks after inventory).

## Decisions Made

- **Gates-only theater packaging** — product dual-tags already cover FEED/KILL/THTR reduced-motion + Save primary + train fail-closed; adding a thin dual-tag file would only restate green contracts
- **QA-02 Option A** — document `verify-live.ps1` + explicit `/bridge` 200 for Plan 02; do not extend verify-live.ps1
- **Requirements packaging only** — full suite + live + filled checklist remain Plan 02 ship gate (REQ checkboxes closed when 68-02 proves green)

## Deviations from Plan

None - plan executed exactly as written (gates-only branch of Task 1 decision tree).

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can run full `npm test`, `scripts/verify-live.ps1`, explicit `/bridge` 200, and fill `68-QA-CHECKLIST.md` Pass columns
- No product feature work remaining for packaging; zero risk to filter-lists / bridge-brain from this plan

---

## Self-Check: PASSED

- FOUND: `docs/bridge/TEST-PLAN.md` §O with QA-01/02/03 (v2.1)
- FOUND: `.planning/phases/68-regression-qa-lock/68-QA-CHECKLIST.md` (390, 1440, reduced-motion, FEED/KILL/THTR)
- FOUND: commit `83975af` Task 2 packaging
- FOUND: `TEST-01 (v2.0)` / `TEST-02 (v2.0)` still greppable; independence + gold quick bar exit 0
- SKIPPED (by design): `tests/bridge-scrub-theater.test.js` — gates-only

---
*Phase: 68-regression-qa-lock*
*Completed: 2026-07-11*
