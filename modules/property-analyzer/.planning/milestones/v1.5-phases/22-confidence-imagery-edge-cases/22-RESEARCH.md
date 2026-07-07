# Phase 22 Research — Confidence + Imagery Edge Cases

**Gathered:** 2026-06-30  
**Status:** Complete

## Problem

Phase 21 fixed street-first routing and prompt/tier bias. Remaining gaps (audit CF-04, CLASS-06–08):

1. Gemini `confidence` is stored but never gates review routing
2. `unavailable`, `blurred`, transient Gemini failures, and obstruction are conflated in `isBlurredImagery`
3. No dedicated low-confidence review lane

## Approach

### New module: `lib/classification-confidence.js`

- `inferImageryQuality(record)` → `ok | degraded | unusable | blurred | obstructed | unavailable | retry`
- `computeClassificationConfidence(record)` → composite 0–100 (street/sat blend, quality penalties)
- `REVIEW_THRESHOLD = 65` (documented constant)
- `isLowConfidenceReview`, `isBorderlineDistressReview` helpers
- `enrichClassificationFields(record)` — additive session fields

### Update `lib/result-classify.js`

- `isBlurredImagery` only true when `imageryQuality === 'blurred'`
- `computeNeedsReview` adds: retry path, low confidence, borderline distress
- Land/home uncertain unchanged

### Client wiring

- Load `/lib/classification-confidence.js` in index.html (allowlist in routes/static.js)
- Wire through config.js → session.js parity
- `attachTierRationale` calls `enrichClassificationFields`
- `buildNeedsReviewResult` distinguishes transient retry vs true blur
- New review filter `low_confidence` + sidebar button

### Tests

- `tests/classification-confidence.test.js` — quality split, confidence routing, review gates

## Validation Architecture

| Layer | Check |
|-------|-------|
| Unit | classification-confidence.test.js |
| Parity | tier-count-cases.json unchanged |
| Regression | full npm test suite |

## RESEARCH COMPLETE
