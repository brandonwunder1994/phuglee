# Property Analyzer Accuracy Overhaul — Design Spec

**Date:** 2026-07-13  
**Priority:** Accuracy first (accept ~15% slower first scans; cache on rescans)

## Goal

Reduce manual relabeling by ~45–55% through always-on satellite fusion, safer uncertain/blur handling, and measurable before/after accuracy reporting.

## Data Safety (Non-Negotiable)

This milestone is **code + tests only**. No operator data may be deleted, truncated, reset, or migrated away.

### Protected paths (never wipe as part of deploy or scan)

| Path | Contents |
|------|----------|
| `PDA_DATA_ROOT` / `/app/pda-data` | Analyzer session, backups, audit |
| `property_imagery/` | Cached Street View + satellite JPEGs |
| `distressAnalyzerSession_*.json` | Scan results, review corrections |
| `gemini_audit/` | Append-only AI audit JSONL |
| `FILTER_LISTS_ROOT` | Filter saved lists |
| `BRIDGE_BRAIN_ROOT` | Filter Superpower Brain |
| Form Forge / analyzer user dirs | City tracker, submissions |

### Allowed operations

- Read session/corrections for **read-only** metrics scripts
- Restart/redeploy (data on Railway volume survives)
- New scans use updated classification logic; **existing records are not auto re-scanned or wiped**
- Operator may optionally run `retierWithoutVision` / `recalibratePropertyScores` (reads saved indicators; no data delete)

### Railway entrypoint protection

`scripts/docker-entrypoint.sh` only seeds `distressAnalyzerSession_LATEST.json` when live file is missing or stub-sized (<4096 bytes). Deploy must not overwrite real sessions.

## Architecture change

**Before:** Street View → Gemini → satellite ~25% (fallback only)  
**After:** Street View → Gemini → **cache-first satellite on every property/vacant scan** → fuse + reconcile → tier engine

`blurred` category skips satellite (privacy blur — aerial won't help).

## Phases

1. Always-on satellite fusion  
2. Split blur vs tree obstruction regexes  
3. Incomplete AI → Needs Review; unknown tier → unavailable  
4. Vacant lot + structure checks (via satellite gate)  
5. Client/server classify parity tests  
6. `blurred` in Gemini JSON schema  
7. Parallel Maps metadata lookups  
8. Extended classification metrics + baseline script  
9. Test, verify, commit, push Railway

## Success metrics

- Golden set passes  
- `npm run test:metrics` reports FN/FP rates on fixtures  
- `run-accuracy-baseline.js` can read session corrections read-only  
- Post-deploy: health 200; live session not overwritten
