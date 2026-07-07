# M5 — Monorepo Merge (phuglee)

**Date:** 2026-07-06  
**Command:** `/gsd:plan-phase monorepo-merge`  
**Goal:** Single `phuglee` repo — shell + Form Forge + Property Analyzer under `modules/`. **No engine/logic changes.**

## Success criteria

| Check | Command |
|-------|---------|
| Shell structure | `modules/form-forge/run_review_portal.py` + `modules/property-analyzer/server.js` exist |
| Shell unit tests | `npm test` (distress-os root) |
| Form Forge | `python modules/form-forge/scripts/gsd.py structure` + `gsd.py test` |
| Property Analyzer | `npm test` in `modules/property-analyzer` |
| Full sweep | `npm run verify` (updated `scripts/verify.ps1`) |

## Tasks

1. **Baseline** — run verify on current junction-linked layout (record pass/fail counts)
2. **Copy** — remove junctions; copy `city-list-requests` → `modules/form-forge`, `property-distress-analyzer` → `modules/property-analyzer` (exclude `.git`, `node_modules`, runtime secrets)
3. **Config** — update `.gitignore`, `launch-distressos.bat`, `modules/README.md`, `scripts/verify.ps1`, `tests/brand-audit.test.js`
4. **Post-verify** — `npm run verify`; commit; push `main` to `brandonwunder1994/phuglee`

## Post-merge GSD results (2026-07-07)

| Suite | Result |
|-------|--------|
| `npm test` (shell) | 118/118 pass |
| `modules/form-forge/scripts/gsd.py structure` | pass |
| `modules/form-forge/scripts/gsd.py test` | 127 pass, 1 pre-existing fail (`texas-cedar-park`) |
| `modules/property-analyzer/npm test` | 191/191 pass |

## Out of scope

- Rewriting Flask/Node servers into one process
- Vercel deployment
- Deleting `phuglee-forge` / `phuglee-analyzer` GitHub repos (archive note only)