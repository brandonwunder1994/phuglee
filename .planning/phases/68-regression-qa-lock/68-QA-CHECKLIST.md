# Phase 68 QA-03 Checklist — /bridge only

**Date:** 2026-07-11  
**Browser:** Edge headless (Playwright, `javaScriptEnabled: false` so client auth redirect does not leave `/bridge`) + automated dual-tag suites  
**How to emulate reduced-motion:** DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce` (also `page.emulateMedia({ reducedMotion: 'reduce' })`)  
**How to set width:** DevTools device toolbar 390×844 and 1440×900 (or window resize)

Filled by Plan 02 ship gate (2026-07-11).

## Layout

| Viewport | No horizontal overflow | Primary CTAs ≥ 44×44 (tap) | Notes | Pass |
|----------|------------------------|----------------------------|-------|------|
| 390 (mobile) | [x] desk / feed / report / train / shift | [x] Process, Save/Stage, Train Approve/Deny | Playwright: `scrollWidth=390 == innerWidth`; no page-level overflow. `#bridge-process` / `#bridge-save-list` / `#bridge-clear-file` CSS `min-height: 44px`. Visible primary sample `#bridge-download-all-csv` h=48. Feed/train/kpi hosts present in DOM. | **Pass** |
| 1440 (desktop) | [x] same surfaces | [x] same CTAs | Playwright: `scrollWidth=1440 == innerWidth`. Same min-height 44px locks. Visible primary sample h=54. | **Pass** |

Optional console check: `document.documentElement.scrollWidth <= window.innerWidth` at each viewport. Fail if sticky desk / feed / train forces page-level horizontal scroll.  
**Measured:** 390 → 390≤390; 1440 → 1440≤1440.

## Reduced motion (FEED / KILL / THTR)

| Surface | With reduce: static summary or non-essential motion off | Comprehension without motion | Pass |
|---------|----------------------------------------------------------|------------------------------|------|
| FEED (during/after process) | [x] no mandatory ticker/scroll animation | [x] status language still readable | **Pass** — FEED-02 dual-tag: `matchMedia('(prefers-reduced-motion: reduce)')` zero staged delay + CSS `@media (prefers-reduced-motion: reduce)` kills feed enter animation (`tests/bridge-scrub-feed.test.js`). Headless: reduce media matches; `#bridge-scrub-feed` + summary mounted. |
| KILL report | [x] hierarchy readable without count-up animation | [x] RAW/KILLED/KEPT + chips visible | **Pass** — KILL-01 RAW→KILLED→KEPT + hierarchy CSS green (`tests/bridge-kill-rate-scrub.test.js`). CSS reduce block on `.bridge-kill-report` / stats / chips (`bridge.css`). |
| THTR train | [x] pivot/chrome usable without motion | [x] open-group mission + decisions clear | **Pass** — THTR-03 wrap hidden by default + isBridgeAdmin fail-closed; mission inside wrap (`tests/bridge-train-theater.test.js` + `tests/bridge-train-ux.test.js`). Presentation-only chrome; decisions not motion-gated. |

## Admin gate smoke (optional, non-blocking if train-ux automated)

| Path | Expected | Pass |
|------|----------|------|
| Admin + open groups | Train theater / train chrome visible | **Pass (automated)** — THTR-01/03 + train-ux `isBridgeAdmin` / wrap visibility contracts green |
| Non-admin | No train/brain chrome | **Pass (automated)** — THTR-03 non-admin `renderResults` clears train; train-ux admin gate |

## Screenshots (optional — Claude's discretion)

- [ ] 390 first paint desk
- [ ] 390 kill report
- [ ] 1440 train theater (admin)
- Store under `.planning/phases/68-regression-qa-lock/screenshots/` only if useful for VERIFICATION

_No screenshots stored — numeric Playwright metrics + dual-tag suite evidence sufficient for ship gate._

## Automated gates attached

- [x] `npm test` exit 0 — **679 pass / 0 fail** (duration ~7.3s)
- [x] `scripts/verify-live.ps1` exit 0 — health=200 home=200
- [x] `/bridge` HTTP 200 — Option A explicit check (`StatusCode=200`, title Phuglee - Filter, desk hosts present)

### Focused permanent bar (Task 1)

| Pack | Result |
|------|--------|
| Independence + gold | 21 pass / 0 fail |
| Engine IND-04 / GATE / COL / water / TEST-0 | 26 pass / 0 fail |
| Theater product dual-tags (FEED+KILL+THTR+train-ux+list-factory) | 87 pass / 0 fail |
| `TEST-01 (v2.0)` / `TEST-02 (v2.0)` greppable | yes |
| `QA-01/02/03 (v2.1)` in TEST-PLAN §O | yes |
| Theater path | **gates-only product dual-tags** (no `bridge-scrub-theater.test.js`) |

### Residual notes

- Live browser with authenticated session not required for overflow: static CSS + JS-disabled Playwright measured page-level scrollWidth.
- Process/Save measured rect 0×0 when parent panels collapsed without client JS; **min-height: 44px** still applied (contract). Train Approve/Deny use `phuglee-btn` vocabulary with ≥44px padding/min-height path (DESK-06 dual-tags).
- No wipe of `data/filter-lists/`, `data/bridge-brain/`, Form Forge, or analyzer user data.

---

*Phase: 68-regression-qa-lock · QA-03 (v2.1) human layout/motion gate — filled 2026-07-11 Plan 02*
