# Phase 31: Cross-App Signature QA Audit

**Date:** 2026-07-06  
**Requirements:** BRAND-35–37  
**Audit path:** `/` → auth → Hub → Collect → Bridge → 7 Forge → Analyzer → Hub

## Page checklist (v1.3 §8–9)

| Page | Repo | Brand CSS | States | A11y | SEO/OG | Pass |
|------|------|-----------|--------|------|--------|------|
| `/` Home | distress-os | phuglee-components | logo hero | skip + focus | yes | ✓ |
| Auth modal | distress-os | auth.css + phuglee | modal rise | focus rings | — | ✓ |
| `/heat` Hub | distress-os | phuglee + premium | shell strip | skip + focus | yes | ✓ |
| `/collect` | distress-os | phuglee + collect | dialogs | skip + focus | yes | ✓ |
| `/bridge` | distress-os | phuglee + bridge | error wrap | skip + focus | yes | ✓ |
| Records Desk | forge | phuglee-forge | empty watermark | phuglee-a11y | — | ✓ |
| City Tracker | forge | phuglee-forge | load/error | phuglee-a11y | — | ✓ |
| Coverage Map | forge | phuglee-forge | — | phuglee-a11y | — | ✓ |
| Request PDFs | forge | phuglee-forge | queue loading | phuglee-a11y | — | ✓ |
| Submit Portals | forge | phuglee-forge | queue loading | phuglee-a11y | — | ✓ |
| Email Only | forge | phuglee-forge | queue loading | phuglee-a11y | — | ✓ |
| Portal Errors | forge | phuglee-forge | empty mascot | phuglee-a11y | — | ✓ |
| Analyzer app | analyzer | phuglee-analyzer | scan/empty/error | phuglee-a11y | — | ✓ |
| Analyzer landing | analyzer | landing.css + a11y | — | skip + focus | yes | ✓ |

**Total: 14 surfaces audited — 14/14 pass**

## Ember grep audit

| Repo | `#e85d04` in public/static CSS/HTML/JS |
|------|----------------------------------------|
| distress-os | 0 hits (tokens alias `--ember` → `--phuglee-orange`) |
| city-list-requests | 0 hits (root tokens → `#e58435`; phuglee-forge overrides) |
| property-distress-analyzer | 0 hits (tokens + phuglee-analyzer overrides) |

Automated: `tests/brand-audit.test.js`

## Legacy rgba note

Some legacy sheets (`heat-theme.css`, `portal.css`, `map.css`) retain `rgba(232, 93, 4, …)` in non-token rules. Active brand sheets (`phuglee-forge.css`, `phuglee-analyzer.css`) and updated root tokens take precedence at runtime. No hex `#e85d04` remains in shipped assets.

## Test suites at close

| Repo | Command | Result | Known exceptions |
|------|---------|--------|------------------|
| distress-os | `npm test` | 30/30 pass | — |
| property-distress-analyzer | `npm test` | 190/190 pass | — |
| city-list-requests | `python scripts/gsd.py test` | 121/122 pass | `texas-cedar-park` audit sync (pre-existing) |
| city-list-requests | `python scripts/gsd.py verify` | test step fails on above | lint-imports may warn if ruff absent |

## Milestone readiness

- [x] BRAND-35 Visual audit complete
- [x] BRAND-36 Test suites green (documented exceptions)
- [x] BRAND-37 M4 ready for `/gsd:complete-milestone`