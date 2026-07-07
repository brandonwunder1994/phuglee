# Phase 24 Research — Scale + Metrics

**Gathered:** 2026-06-30  
**Status:** Complete

## Problem

M4-09 and M4-10 close the v1.5 milestone:

1. No documented 100k-scale cache-first policy or cost model
2. `recalibratePropertyScores` works but lacks explicit vision-free markers and classification refresh
3. Rescans re-call Gemini satellite even when imagery is cached and classification exists on record
4. No FN/FP metrics from `tierCorrections` for milestone reporting
5. QA-04 smoke log incomplete (routing matrix tested in pieces, not as documented scenarios)

## Approach

### Scale policy (`lib/scale-policy.js`)

- Export `SCALE_POLICY` constants (cache-first, street-first, retier without vision)
- `shouldReuseSatelliteClassification(priorRecord, satData)` gate
- `estimateApiCallsPer1kLeads()` cost model with tunable assumptions

### Vision-free retier (`lib/retier-without-vision.js`)

- Server-testable retier from saved score/indicators/satellite metadata
- `recalibratePropertyScores` sets `retieredWithoutVision` + calls `enrichClassificationFields`

### Satellite classification reuse (`public/js/app.js`)

- `processAddress` / `finalizeStreetAnalysis` accept `priorRecord`
- On cache-hit satellite imagery + prior classification → skip `classifyWithSatellite`

### Metrics (`lib/classification-metrics.js`)

- `computeCorrectionMetrics(tierCorrections)` → FN (WM→D), FP (D→WM), rates
- `npm run test:metrics` + `scripts/run-classification-metrics.js`

### Smoke log (`tests/classification-smoke.test.js`)

- Three scenarios: street OK → tier, street bad → satellite, both bad → review

## RESEARCH COMPLETE