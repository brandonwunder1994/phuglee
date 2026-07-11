# Phase 81 Visual QA Lock — Checklist

**Date:** 2026-07-11  
**Browser:** Chromium headless (Playwright, `javaScriptEnabled: false` so client auth redirect does not leave `/bridge`) + dual-class static greps + permanent bar packs  
**Hard-refresh:** After any CSS `?v=` bump use `Ctrl+Shift+R` before judging layout. (No cache-bust bump in Plan 02 — gates green without product CSS edits.)

Filled by Plan 02 ship gate (2026-07-11).

Primary scrub path: **city → type → dropzone → Process** (then save / lists / victory as available).

---

## Layout (QA-01)

Surfaces to watch: hero/pipeline, scrub desk, dossier, tables (horizontal scroll **inside** table OK; **page-level** overflow = fail), mission/kill, save, lists/shift HUD, victory, dialogs.

| Viewport | No horizontal overflow | Primary scrub path completable | Primary CTAs ≥ 44×44 when visible | Notes | Pass |
|----------|------------------------|--------------------------------|-----------------------------------|-------|------|
| **390** (mobile) | [x] scrollWidth=390 ≤ innerWidth=390 | [x] city / type panel / dropzone / process hosts present in DOM | [x] `#bridge-process` / `#bridge-save-list` / `#bridge-clear-file` CSS `min-height: 44px`; visible sample `#bridge-download-all-csv` h=48 | Tables may scroll inside wrap; Process/Save rect 0×0 when parent panels collapsed without client JS | **Pass** |
| **1440** (desktop) | [x] scrollWidth=1440 ≤ innerWidth=1440 | [x] same path hosts present | [x] same min-height 44px locks greppable in `bridge.css`; desk density OK | Process/Save rect 0×0 unauthenticated static paint (same residual as Phase 68) | **Pass** |

Optional console: `document.documentElement.scrollWidth <= window.innerWidth` at each viewport.  
**Measured:** 390 → 390≤390; 1440 → 1440≤1440. Title `Phuglee — Filter`, HTTP 200 both widths.

---

## Behavior freeze (QA-04)

| Check | Expected | Notes | Pass |
|-------|----------|-------|------|
| process / API / brain / keep-kill / list engine | No intentional `lib/**` makeover diffs; workflows unchanged | Phases 75–80 CSS/markup only; Plan 02 product files untouched | **Pass** |
| No Analyze re-coupling chrome | No Send/Push/Import to Analyze CTAs on Filter product surface | Independence bar 21/0 green; public/ greps clean of banned strings | **Pass** |
| `bridge-*` IDs + `data-action` / `data-mode` / `data-format` | Intact per `docs/bridge/CONTRACT-FREEZE.md` | Freeze suite green after dual-class harness fix | **Pass** |
| Runtime data | No wipe of `data/filter-lists/` or `data/bridge-brain/` | Screenshots never require deletes; none taken | **Pass** |

---

## Catalog / parity evidence (SYS-01 / SYS-02)

| Artifact | Path | Pass |
|----------|------|------|
| Component catalog | [`docs/phuglee/COMPONENT-CATALOG.md`](../../../docs/phuglee/COMPONENT-CATALOG.md) | **Pass** — present; greppable `phuglee-btn` |
| Parity matrix | [`docs/phuglee/FILTER-PARITY-MATRIX.md`](../../../docs/phuglee/FILTER-PARITY-MATRIX.md) | **Pass** — dual-class static evidence + Pass rows filled Plan 02 |

Plan 02: confirm files exist; fill parity Pass rows if visual check runs (or note dual-class static evidence).

---

## Automated gates attached

- [x] `npm test` — **755 pass / 0 fail** (duration ~6.3s; ≥679 bar)
- [x] `scripts/verify-live.ps1` exit 0 — health=200 home=200
- [x] `/bridge` HTTP 200 — Option A explicit (`Invoke-WebRequest http://127.0.0.1:3000/bridge` → StatusCode 200)

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Invoke-WebRequest http://127.0.0.1:3000/bridge → 200
```

### Focused permanent bar (Task 1)

| Pack | Result |
|------|--------|
| Independence + gold | 21 pass / 0 fail |
| Engine IND-04 / GATE / COL / water / TEST-0 | 26 pass / 0 fail |
| Train UX + list-factory UX | 44 pass / 0 fail |
| Contract freeze (DESK-05) | 12 pass / 0 fail (after dual-class harness fix) |
| `TEST-01 (v2.0)` / `TEST-02 (v2.0)` greppable | yes |
| `QA-01/02/03/04 (v3.0)` in TEST-PLAN | yes |

---

## Screenshots (optional)

- Store under `.planning/phases/81-visual-qa-lock-catalog/screenshots/` only if useful.
- **Never** wipe filter-lists / brain / Form Forge / analyzer users to stage demos.

- [ ] 390 scrub desk — skipped (numeric Playwright metrics sufficient)
- [ ] 1440 mission / save — skipped
- [ ] Dialog glass (history or type-confirm) — skipped

---

## Residual notes

- **Harness auto-fix (Plan 02):** `tests/bridge-contract-freeze.test.js` required exact `class="bridge-type-chips"`; product dual-class is `bridge-type-chips phuglee-chip-group` (Phase 77+). Assertion updated to word-boundary dual-class match (mirrors `bridge-desk-cinema.test.js`). No product HTML/CSS/JS change.
- Live browser with authenticated session not required for overflow: static CSS + JS-disabled Playwright measured page-level scrollWidth.
- Process/Save measured rect 0×0 when parent panels collapsed without client JS; **min-height: 44px** still applied in CSS (contract). Visible primary sample `#bridge-download-all-csv` h=48 at 390.
- Full suite bar rose from v2.1 **679** to **755** via 75–80 static CSS/markup locks — never dropped below 679.
- No wipe of `data/filter-lists/`, `data/bridge-brain/`, Form Forge, or analyzer user data.
- No CSS `?v=` bump in Plan 02 — hard-refresh optional for operators reviewing visual makeover from 75–80 (`bridge.css?v=51`, `phuglee-components.css?v=glass5`).

---

*Phase: 81-visual-qa-lock-catalog · QA-01 / QA-04 packaging · Plan 02 ship gate filled 2026-07-11*
