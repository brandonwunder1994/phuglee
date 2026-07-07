---
phase: 21-street-first-routing-decision-fix
status: passed
verified: 2026-06-30
---

# Phase 21 Verification

## Must-haves

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| 1 | Street View default path | pass | `processAddress` → `finalizeStreetAnalysis` unchanged entry |
| 2 | Satellite only on triggers | pass | `streetAnalysisNeedsSatellite()` + 8 routing tests |
| 3 | reconcileSatellite wired | pass | `finalizeStreetAnalysis` calls `reconcileSatelliteWithStreetView` |
| 4 | Prompt de-bias | pass | No "prefer well_maintained when uncertain" in config/scan |
| 5 | Tier rescope | pass | `score8_no_sat_not_demoted`, `score7_moderate_single` fixtures |
| 6 | Tests pass | pass | `npm test` 91/91 |

## Automated

```bash
npm test  # 91 pass, 0 fail
```

## Human verification (recommended)

1. Scan an address with good Street View — confirm no satellite Gemini call in logs (only street `scanType`)
2. Scan an address where SV is blocked — confirm "Street view unclear — checking satellite…" preview message
3. Spot-check a known distressed home previously marked well-maintained — confirm tier change after re-scan