---
quick: 260710-k9c
status: complete
completed: 2026-07-10
---

# Quick 260710-k9c: Confident Category Stacking — Summary

**Confident municipal-code group keys so Train stacks HGW-class variants without fuzzy over-merge**

## Result

- `stripIncidentalNoise` — case IDs, month dates, `*meta*`, glued/spaced `xN` multipliers (+ existing timestamps)
- `extractLeadingTypeCodes` — leading code runs only (`HGW`, `HGW/TD`, `O/S`); English denylist; no bare-space multi-word code grabs
- `stableTypeKey` / `stableDescriptionKey` use codes when confident, else noise-stripped free-text
- Labels use noise strip; `isSingleton` still pure `count === 1`
- Irving TX sample: ~317 groups / 283 singletons → **~96 groups / ~59 singletons** on typed Name||Description rows; pure HGW → one stack of 262+

## Verification

- Focused grouping/stable tests: green
- Full `npm test`: **570 pass / 0 fail**
- `scripts/verify-live.ps1`: health + home **200**

## Files

- `lib/bridge-stable-text.js`
- `lib/bridge-review-groups.js`
- `tests/bridge-stable-text.test.js`
- `tests/bridge-review-groups.test.js`
- `.planning/quick/260710-k9c-…/{CONTEXT,RESEARCH,PLAN,SUMMARY}.md`
