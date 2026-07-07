# Phase 21 Plan 02 Summary

**Completed:** 2026-06-30

## Delivered

- Removed "CONSERVATIVE / prefer well_maintained when uncertain" from `config.js` and `scan.js` prompts
- Replaced with SIGNAL RULE: report all visible indicators; tier engine decides
- `computeLeadTier` rescoped in `lib/tier-engine.js` and `review.js`:
  - Score ≥7 without manicured proof → distressed (not silent downgrade)
  - Single moderate indicator at score 6-7 → distressed
- New tier fixtures: `score8_no_sat_not_demoted`, `score7_moderate_single`

## Tests

91/91 passing (was 78; +13 imagery-routing + tier fixtures)