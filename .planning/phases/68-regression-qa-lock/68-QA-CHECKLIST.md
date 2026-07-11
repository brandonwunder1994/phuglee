# Phase 68 QA-03 Checklist — /bridge only

**Date:** YYYY-MM-DD  
**Browser:** (Chrome/Edge)  
**How to emulate reduced-motion:** DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`  
**How to set width:** DevTools device toolbar 390×844 and 1440×900 (or window resize)

Template only after Plan 01 — Plan 02 fills Pass columns / records evidence.

## Layout

| Viewport | No horizontal overflow | Primary CTAs ≥ 44×44 (tap) | Notes | Pass |
|----------|------------------------|----------------------------|-------|------|
| 390 (mobile) | [ ] desk / feed / report / train / shift | [ ] Process, Save/Stage, Train Approve/Deny | | |
| 1440 (desktop) | [ ] same surfaces | [ ] same CTAs | | |

Optional console check: `document.documentElement.scrollWidth <= window.innerWidth` at each viewport. Fail if sticky desk / feed / train forces page-level horizontal scroll.

## Reduced motion (FEED / KILL / THTR)

| Surface | With reduce: static summary or non-essential motion off | Comprehension without motion | Pass |
|---------|----------------------------------------------------------|------------------------------|------|
| FEED (during/after process) | [ ] no mandatory ticker/scroll animation | [ ] status language still readable | |
| KILL report | [ ] hierarchy readable without count-up animation | [ ] RAW/KILLED/KEPT + chips visible | |
| THTR train | [ ] pivot/chrome usable without motion | [ ] open-group mission + decisions clear | |

## Admin gate smoke (optional, non-blocking if train-ux automated)

| Path | Expected | Pass |
|------|----------|------|
| Admin + open groups | Train theater / train chrome visible | |
| Non-admin | No train/brain chrome | |

## Screenshots (optional — Claude's discretion)

- [ ] 390 first paint desk
- [ ] 390 kill report
- [ ] 1440 train theater (admin)
- Store under `.planning/phases/68-regression-qa-lock/screenshots/` only if useful for VERIFICATION

## Automated gates attached

- [ ] `npm test` exit 0
- [ ] `scripts/verify-live.ps1` exit 0
- [ ] `/bridge` HTTP 200

---

*Phase: 68-regression-qa-lock · QA-03 (v2.1) human layout/motion gate*
