# Wave 1 Task 1.3 Report — Honest OCR failure for image-like PDFs

## Status

**DONE**

## Goal

When a PDF has no extractable text and OCR cannot run or fails, operators get a clear `OCR_UNAVAILABLE` / `OCR_FAILED` message — not a silent weak empty parse or a generic “no usable records” that blames the city file alone.

## Commits

| Hash | Message |
|------|---------|
| c2ab2ed | `fix(filter): fail clearly when scanned PDF OCR cannot run` |

## Files changed (staged scope only)

| File | Change |
|------|--------|
| `lib/bridge-engine/parsers/pdf.js` | Call OCR via `pdfOcr.ocrPdfBuffer` (mockable); hard-fail image-like PDFs with no usable embedded streets when OCR null/empty/throws; `buildOcrHardFailure` helper |
| `lib/bridge-api.js` | Map `OCR_FAILED` with `OCR_UNAVAILABLE` → 400 vs 503 + max page note |
| `public/js/bridge.js` | One-line: treat `OCR_FAILED` like `OCR_UNAVAILABLE` in client errors |
| `public/bridge.html` | Cache-bust `bridge.js?v=88` → `v=89` |
| `tests/bridge-ocr-failure.test.js` | **New** — 7 tests (mock OCR failure on image-like path) |

No vault/leads/data stores. No gold fixtures weakened. No Analyze push.

## Behavior

### Hard fail (image-like / pure scan)

When `needsPdfOcr(text, tableAoa)` **and** embedded parse has **no** usable streets:

| OCR outcome | Code | HTTP (API) |
|-------------|------|------------|
| Returns `null` / unavailable | `OCR_UNAVAILABLE` | 503 |
| Returns empty text | `OCR_FAILED` | 400 |
| Throws tesseract/worker/wasm | `OCR_UNAVAILABLE` | 503 |
| Throws other | `OCR_FAILED` | 400 |

Messages steer operator to Excel/CSV or fixing Tesseract — not silent junk rows.

### Soft fail (optional enhancement)

If embedded text already has usable streets, OCR failure is swallowed and the text path continues (OCR remains enhancement).

## Tests

```text
node --test tests/bridge-ocr-failure.test.js tests/bridge-ocr-meta.test.js tests/bridge-ocr-truncation-ui.test.js
```

| Suite | Result |
|-------|--------|
| `tests/bridge-ocr-failure.test.js` | **7/7 pass** |
| `tests/bridge-ocr-meta.test.js` | **8/8 pass** |
| `tests/bridge-ocr-truncation-ui.test.js` | **12/12 pass** |

### New cases

| ID | Assertion |
|----|-----------|
| OCR-FAIL-01 | Image-like PDF + `ocrPdfBuffer` → null → `OCR_UNAVAILABLE` |
| OCR-FAIL-02 | Image-like + OCR throw → `OCR_FAILED` \| `OCR_UNAVAILABLE` |
| OCR-FAIL-03 | Image-like + empty OCR text → hard fail code |
| OCR-FAIL-04 | `processUpload` surfaces OCR_* (not silent success) |
| OCR-FAIL-05 | API maps UNAVAILABLE→503, FAILED→400 |
| OCR-FAIL-06 | Client handles OCR_UNAVAILABLE (+ FAILED) |
| OCR-FAIL-07 | `buildOcrHardFailure` classification unit |

## Verify (local site)

```text
scripts\verify-live.ps1 → health=200 home=200
```

## Data safety

- No filter-lists / bridge-brain / forge / analyzer user data touched
- No gold ACC weakened

## Concerns / follow-ups

1. Soft path (usable embedded streets + OCR fail) is coded but not fixture-tested with a real multi-street text PDF — unit coverage is the hard path + helper classification.
2. `ocrPdfBuffer` still returns `null` for both “OCR not available” and “screenshot failed”; both map to `OCR_UNAVAILABLE` for image-like — acceptable honesty, but not distinguished.
3. Generic pre-OCR empty PDF message (`PDF contains no extractable text…`) remains for edge cases where `shouldOcr` is false; pure image-like always sets `shouldOcr` via `needsPdfOcr`.
4. Cache-bust only on Filter `bridge.html`; hard refresh if another shell embeds `bridge.js` without `?v=`.
