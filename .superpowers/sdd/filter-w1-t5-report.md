# Wave 1 Task 1.5 — Report

**Status:** done  
**Commit:** `fix(filter): surface FN and redaction review limits` (see `git log --grep="surface FN and redaction"`)  
**Date:** 2026-07-19

## Goal

Operators and Train UI see when FN (not-distressed) review is truncated at 5000 and when redacted rows were skipped.

## What shipped

### Pure builders (`public/js/bridge.js`)

| Function | Behavior |
|----------|----------|
| `buildFnTruncationWarning(brainMeta)` | Empty unless `notDistressedTruncated`; uses `notDistressedTotal` / `notDistressedReturned` when present |
| `buildRedactionSkippedNote(processingMeta)` | Empty unless `redactedSkipped > 0`; singular/plural copy |
| `setFnTruncationNote` / `setRedactionBanner` | Fill/hide dedicated hosts |

### UI surfaces

1. **Scrub report meta** (`#bridge-results-meta`): appends `· FN review capped (5,000 of N)` and/or `· N redacted skipped` when applicable.
2. **Redaction banner** (`#bridge-redaction-banner`): under OCR truncation banner when `redactedSkipped > 0`.
3. **FN note** (`#bridge-fn-truncation-note`): in Train "Not marked distressed" section when truncated.
4. **Train status** (`#bridge-train-status`): idle path shows FN truncation warning instead of empty status.

### Styles

- `public/css/bridge.css` — `.bridge-review-limit-banner`, `.bridge-fn-truncation-note`
- Cache bust: `bridge.js?v=90`, `bridge.css?v=85`

### Tests

`tests/bridge-fn-redaction-ui.test.js` — 13 static tests (pure builders + DOM/wire contracts).

## Files touched (commit scope)

- `public/js/bridge.js`
- `public/bridge.html`
- `public/css/bridge.css`
- `tests/bridge-fn-redaction-ui.test.js`
- `.superpowers/sdd/filter-w1-t5-report.md`

## Verification

```text
node --test tests/bridge-fn-redaction-ui.test.js   → 13 pass
node --test tests/bridge-ocr-truncation-ui.test.js → 12 pass (no regression)
scripts\verify-live.ps1 → health=200 home=200
GET /bridge → 200
scripts\verify-mobile.ps1 -Pages "/bridge" → PASS 375px/320px
```

## Constraints honored

- No Analyze push
- No data wipe
- Filter UI files only (meta already present from 1.1 / engine)

## Concerns / follow-ups

1. **Admin-only Train chrome:** FN section note only appears when Train wrap is shown (admin). Results-meta tip still visible to all operators when meta is present.
2. **No live e2e fixture with >5000 FN rows** in this task — static contract only. Engine already sets `brainMeta.notDistressedTruncated` when total > 5000.
3. **Redaction counts** depend on parser families that set `redactedSkipped` (e.g. enforcement-detail OCR rebuild). Zero on non-redacted uploads is correct.
