# Phase 81 Visual QA Lock — Checklist

**Date:** _______________  
**Browser:** _______________  
**Hard-refresh:** After any CSS `?v=` bump use `Ctrl+Shift+R` before judging layout.

Template from Plan 01 — **Pass columns blank until Plan 02** fills ship gate.

Primary scrub path: **city → type → dropzone → Process** (then save / lists / victory as available).

---

## Layout (QA-01)

Surfaces to watch: hero/pipeline, scrub desk, dossier, tables (horizontal scroll **inside** table OK; **page-level** overflow = fail), mission/kill, save, lists/shift HUD, victory, dialogs.

| Viewport | No horizontal overflow | Primary scrub path completable | Primary CTAs ≥ 44×44 when visible | Notes | Pass |
|----------|------------------------|--------------------------------|-----------------------------------|-------|------|
| **390** (mobile) | [ ] | [ ] city → type → dropzone → Process | [ ] Process / Save / victory download / clear when shown | Tables may scroll inside wrap | |
| **1440** (desktop) | [ ] | [ ] same path | [ ] same CTAs | Desk density OK if brand DNA holds | |

Optional console: `document.documentElement.scrollWidth <= window.innerWidth` at each viewport.

---

## Behavior freeze (QA-04)

| Check | Expected | Notes | Pass |
|-------|----------|-------|------|
| process / API / brain / keep-kill / list engine | No intentional `lib/**` makeover diffs; workflows unchanged | Phases 75–80 CSS/markup only | |
| No Analyze re-coupling chrome | No Send/Push/Import to Analyze CTAs on Filter product surface | Independence bar still green | |
| `bridge-*` IDs + `data-action` / `data-mode` / `data-format` | Intact per `docs/bridge/CONTRACT-FREEZE.md` | Freeze suite greppable | |
| Runtime data | No wipe of `data/filter-lists/` or `data/bridge-brain/` | Screenshots never require deletes | |

---

## Catalog / parity evidence (SYS-01 / SYS-02)

| Artifact | Path | Pass |
|----------|------|------|
| Component catalog | [`docs/phuglee/COMPONENT-CATALOG.md`](../../../docs/phuglee/COMPONENT-CATALOG.md) | |
| Parity matrix | [`docs/phuglee/FILTER-PARITY-MATRIX.md`](../../../docs/phuglee/FILTER-PARITY-MATRIX.md) | |

Plan 02: confirm files exist; fill parity Pass rows if visual check runs (or note dual-class static evidence).

---

## Automated gates attached

- [ ] `npm test` — **≥679 pass / 0 fail** (record exact: _____ / 0 fail)
- [ ] `scripts/verify-live.ps1` exit 0 — health + homepage HTTP 200
- [ ] `/bridge` HTTP 200 — Option A explicit (`Invoke-WebRequest http://127.0.0.1:3000/bridge`)

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Invoke-WebRequest http://127.0.0.1:3000/bridge → 200
```

---

## Screenshots (optional)

- Store under `.planning/phases/81-visual-qa-lock-catalog/screenshots/` only if useful.
- **Never** wipe filter-lists / brain / Form Forge / analyzer users to stage demos.

- [ ] 390 scrub desk
- [ ] 1440 mission / save
- [ ] Dialog glass (history or type-confirm)

---

## Residual notes

_Plan 02 fills residuals (overflow exceptions, CTA rect notes, suite counts)._

---

*Phase: 81-visual-qa-lock-catalog · QA-01 / QA-04 packaging · Plan 01 template*
