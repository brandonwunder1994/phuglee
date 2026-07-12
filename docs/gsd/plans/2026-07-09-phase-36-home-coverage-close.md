# Phase 36 — Territory Proof + Close (REVISED)

> **GSD:** `/gsd:execute-phase 36`

**Goal:** Coverage map is a **reliable territory proof object**. Close uses **live city/state counts**. Never end the homepage on a black loading void + lonely button.

**Architecture:** Harden `home-coverage.js` + territory CSS; close section bound to counts; loading/error/ready states.

---

## Quality bar

| Pass | Fail |
|------|------|
| Map ready or branded error on cold load 3/3 | Stuck “Loading map…” |
| Explicit min-height bezel | Collapsed 0-height map |
| Close proof uses live counts when ready | Generic static only, or empty |
| Retry on error | Silent fail |
| Peak-end feels earned | Lonely CTA under void |

---

## States

| State | UI |
|-------|-----|
| loading | Branded loading in bezel (not infinite black void) |
| ready | Map + chips + summary |
| error | Gritty message + Retry |

Close line example: **`{N} cities across {S} states. Same-day lists.`**

---

## Files
- `public/index.html`
- `public/js/home-coverage.js`
- `public/js/home-coverage-explorer.js` (if needed)
- `public/css/home-chronicle.css`, `home-premium.css`, `coverage/*.css`
- bootstrap JSON path verification

---

## Tasks
- [ ] Diagnose + fix root cause of load failure
- [ ] loading / ready / error states
- [ ] Gritty bezel + dock polish
- [ ] Close proof + `#btn-heat-footer` still enters platform
- [ ] Full-page scroll QA (hero → close)
- [ ] `npm test` + screenshots
- [ ] Commit: `feat(home): territory reliability + live proof close`
- [ ] Mark M5 phases complete when all green

## Done when
Map proves territory; close **stamps the case file**.
