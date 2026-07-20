# Wave 1 Task 1.2 Report — Operator-visible OCR truncation warning

**Status:** DONE  
**Commit:** `c291a29` — `fix(filter): warn when OCR page cap truncates PDF`  
**Date:** 2026-07-19

## Goal

When `processingMeta.ocrTruncated === true` on a Filter process response, show a clear, high-visibility warning so operators never think the full PDF was OCR’d.

## What shipped

### Pure warning builder (`public/js/bridge.js`)

`buildOcrTruncationWarning(meta)` — pure, no DOM:

| Meta shape | Copy core |
|------------|-----------|
| not truncated / missing | `''` |
| N + M known | “This PDF was only read through page N of M (OCR limit).” |
| N known, M unknown, cap C | “first N pages (OCR limit of C)” |
| only cap C | “partially read (OCR page limit of C)” |
| truncated, no numbers | “partially read (OCR page limit)” |

Always appends: “Re-export as Excel from the city portal, or split the PDF and scrub again.”

### Render path

- Host: `#bridge-ocr-truncation-banner` in mission surface (`public/bridge.html`), between results meta and KPI grid.
- `setOcrTruncationBanner(meta)` sets text + unhides (`role="alert"`, non-dismissible).
- `renderResults` calls it with `data.processingMeta` (success with kept rows still shows banner).
- Post-save reset clears the banner.
- `NO_USABLE_ROWS` error path appends the same string when `data.processingMeta` is present (forward-compatible; API does not yet attach meta on 422).

### Styles

`.bridge-ocr-truncation-banner` in `public/css/bridge.css` — warning-tinted, high visibility, `[hidden]` forced off display.

### Cache bust

- `bridge.js?v=87`
- `bridge.css?v=84`

## Tests

```text
node --test tests/bridge-ocr-truncation-ui.test.js tests/bridge-ocr-meta.test.js
→ 16 pass, 0 fail
```

| ID | Coverage |
|----|----------|
| OCR-UI-01 | empty when not truncated |
| OCR-UI-02 | N of M + re-export |
| OCR-UI-03 | first N / limit of C |
| OCR-UI-04 | cap-only fallback |
| OCR-UI-05 | banner host in HTML |
| OCR-UI-06 | `renderResults` wires meta → banner |
| OCR-UI-07 | `NO_USABLE_ROWS` considers meta |
| OCR-UI-08 | CSS present |
| OCR-UI-09 | cache bust present |

Also: `bridge-contract-freeze` 12/12 green; `verify-live.ps1` health=200 home=200.

## Files committed (scoped)

- `public/js/bridge.js`
- `public/bridge.html`
- `public/css/bridge.css`
- `tests/bridge-ocr-truncation-ui.test.js`

No engine/API/Analyze changes. No data wipe.

## Concerns / follow-ups

1. **NO_USABLE_ROWS meta not on wire yet** — client appends truncation when `processingMeta` is on the 422 body, but `lib/bridge-api.js` currently does not include those fields. Zero-kept + truncated still relies on success-with-zero (code_violation FN path) or a future tiny API attach. Optional Task follow-up: pass OCR honesty onto `NO_USABLE_ROWS` details.
2. **Browser not exercised** — static/unit only; no Playwright process of a multi-page OCR fixture.
3. **Dirty tree** — unrelated WIP left uncommitted (shell-nav cache, leads-platform, etc.).

## Done criteria

- [x] Warning path exists and is tested  
- [x] Commit scoped to Filter UI/test only  
- [x] Message: `fix(filter): warn when OCR page cap truncates PDF`


---

## Follow-up — Surface OCR truncation on NO_USABLE_ROWS (review Important findings)

**Status:** DONE  
**Commit:** (see git log for `fix(filter): surface OCR truncation on NO_USABLE_ROWS`)  
**Date:** 2026-07-19

### Problems fixed

1. **API 422 omitted `processingMeta`** — `handleProcess` NO_USABLE path only sent `error/code/discarded/stats/fileFailures`. Client could not append OCR truncation when zero rows kept.
2. **Client skipped OCR suffix on Breakdown early path** — `if (/Breakdown:/) throw new Error(serverMsg)` ran before `buildOcrTruncationWarning`, so server-built breakdown messages never got the page-cap warning even when meta existed.

### What shipped

| Layer | Change |
|-------|--------|
| `lib/bridge-engine/index.js` | `partialProcessingMetaFromParsed(parsed, started)` — OCR honesty (+ parser basics) on both single-file `NO_USABLE_ROWS` throws; batch all-fail merges per-file meta; empty merge documents `processingMeta: null` (no parse ran). |
| `lib/bridge-api.js` | 422 body includes `processingMeta` from `err.details?.processingMeta` (null if engine had none). |
| `public/js/bridge.js` | Compute OCR suffix **before** Breakdown short-circuit; append to both paths; accept top-level or `details.processingMeta`. |
| `public/bridge.html` | `bridge.js?v=88` |

### Tests

```text
node --test tests/bridge-ocr-truncation-ui.test.js tests/bridge-ocr-meta.test.js
→ 20 pass, 0 fail
```

| ID | Coverage |
|----|----------|
| OCR-META-08 | processUpload NO_USABLE attaches ocrTruncated + page fields |
| OCR-UI-10 | Breakdown early path appends ocrSuffix |
| OCR-UI-11 | reads top-level or details.processingMeta |
| OCR-UI-12 | API 422 includes processingMeta |

### Documented edge

If engine throws `NO_USABLE_ROWS` **before** parse completes (e.g. `mergeProcessResults([])` with no successes), `processingMeta` is `null` — client leaves OCR warning off. That is correct: no OCR ran for that path.

### Scope

Filter-only: engine + bridge-api process handler + bridge.js/html + OCR tests. No data wipe, no Analyze push.
