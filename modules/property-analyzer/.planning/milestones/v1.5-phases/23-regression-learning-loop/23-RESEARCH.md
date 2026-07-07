# Phase 23 Research — Regression + Learning Loop

**Gathered:** 2026-06-30  
**Status:** Complete

## Problem

M4-07 and M4-08 remain open after Phases 21–22:

1. No golden-set replay — rule changes are validated only by hope + full `npm test`
2. Learned-brain distress promotion is asymmetric — `applyLearnedTierRules` blocks `well_maintained → distressed` when `looksVisuallyDistressed` is false (the exact FN case users correct)
3. Tier-count fixtures broke because missing `confidence` defaulted to 50 and routed records to review

## Approach

### Golden-set regression (`lib/golden-replay.js`)

- `tests/fixtures/golden-cases.json` — 50 records from tier-cases + review-correction baselines
- `replayGoldenSet()` runs `computeLeadTier` / `resultLeadTier` and reports pass/fail + baseline drift
- `npm run test:golden` — test harness + CLI (`scripts/run-golden-set.js`)
- Audit JSONL hook (`loadAuditRecords`) reserved for future parsed-record export

### Learned rules symmetry (`lib/learned-rules.js`)

- Extract `recordMatchesLearnedWhen`, `shouldBlockDistressPromotion`, `applyLearnedTierRules`
- Skip `looksVisuallyDistressed` gate when promoting `well_maintained → distressed` (never_when + HARD_NEVER still protect)
- Mirror fix in `public/js/scan.js` for runtime parity

### Confidence routing fix

- `isLowConfidenceReview` only fires when Gemini reported explicit confidence — prevents synthetic default-50 from flooding review lane

## Validation Architecture

| Layer | Check |
|-------|-------|
| Golden | `tests/golden-set.test.js` — 50/50 pass |
| Learned rules | `tests/learned-rules.test.js` — promotion symmetry |
| Regression | `npm test` — 111 pass |

## RESEARCH COMPLETE