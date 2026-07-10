# Data Bridge v2 — GSD Audit

**Date:** 2026-07-06  
**Scope:** Distress OS Data Bridge (`/bridge`) + cross-repo persistence (Form Forge) + Analyzer push  
**Audit type:** GSD-AUDIT-POST (requirements → implementation → tests → gaps)

---

## 1. Requirements traceability

| Requirement | Source | Implementation | Tests | Status |
|-------------|--------|----------------|-------|--------|
| State/city picker from Form Forge profiles only | API.md, DATA-STANDARDS | `bridge-api.js` → `loadCitySummaries()` | `bridge-api.test.js` | ✓ |
| Upload types: code_violation, water_shut_off | DATA-STANDARDS | `bridge-intake-schema.js` | `bridge-intake-schema.test.js` | ✓ |
| Parse xlsx/csv/tsv/txt/pdf/docx/jpg/png | API.md | `bridge-engine/` parsers | `bridge-engine.test.js` | ✓ |
| Normalize columns + city/state injection | DATA-STANDARDS | `normalizer.js`, `bridge-intake-schema.js` | `bridge-intake-schema.test.js`, `bridge-engine.test.js` | ✓ |
| Retain open + closed code violations | DATA-STANDARDS | No status filter in normalizer | `bridge-engine.test.js` | ✓ |
| Discard: no_address, blank, non_property | DATA-STANDARDS | `validator.js`, `classifyDiscardReason` | `bridge-intake-schema.test.js` | ✓ |
| Dedup within upload (≥0.92 similarity) | DATA-STANDARDS | `bridge-dedup.js` | `bridge-dedup.test.js`, `bridge-engine.test.js` | ✓ |
| Cross-ref Property Analyzer imports | DATA-STANDARDS | `analyzer-import-index.js`, `import-filter.js` | `bridge-import-filter.test.js`, `analyzer-import-index.test.js` | ✓ |
| Auto-push kept rows to Analyzer | DATA-STANDARDS | **Retired** — `lib/bridge-analyzer-push.js` **deleted** (v2.0 / IND-01–03); Filter never writes Analyze | `tests/bridge-independence.test.js` (static bans + process/save negatives). Analyzer `bridge-import-records` remains for **manual** import only | retired |
| Distressed signal tagging (5 categories) | TAGGING-RULES.md | `bridge-distress-tagger.js` | `bridge-distress-tagger.test.js` | ✓ |
| Attach with responseReceivedAt → turnaround KPI | DATA-STANDARDS, API.md | Forge `api_portal_bridge_attach` | Forge `test_bridge_dataset.py` | ✓ |
| Versioned append-only datasets | DATA-STANDARDS | `bridge_dataset.py` | `test_bridge_dataset.py` | ✓ |
| CSV/XLSX export on attach | API.md | `bridge-export.js`, Forge export | `bridge-export.test.js`, `test_bridge_export.py` | ✓ |
| UI workflow: state → city → type → upload → results → attach | SITE-AUDIT | `bridge.html`, `bridge.js` | Manual + a11y-seo | ✓ |

---

## 2. Component inventory

### Distress OS (shell + engine)

| Layer | Files |
|-------|-------|
| API routes | `lib/bridge-api.js` |
| Processing pipeline | `lib/bridge-engine/index.js` |
| Parsers | `spreadsheet.js`, `text.js`, `pdf.js`, `docx.js`, `image-ocr.js`, `row-extract.js` |
| Normalization | `normalizer.js`, `validator.js` |
| Dedup / import filter | `bridge-dedup.js`, `import-filter.js` |
| Tagging | `bridge-distress-tagger.js` |
| Schema | `bridge-intake-schema.js` |
| Analyzer soft-read (opt-in filter) | `analyzer-import-index.js`, `import-filter.js` — hard-drop only if `applyAlreadyImportedFilter === true` |
| Analyzer push (Filter) | **Deleted** — was `bridge-analyzer-push.js`; do not restore |
| Export | `bridge-export.js` |
| UI | `public/bridge.html`, `public/js/bridge.js`, `public/css/bridge.css` |
| Multipart | `lib/multipart.js` |

### Form Forge (persistence)

| Layer | Files |
|-------|-------|
| Dataset storage | `review_portal/bridge_dataset.py` |
| Attach API | `review_portal/app.py` → `api_portal_bridge_attach` |
| Export helpers | `review_portal/bridge_export.py` |

### Property Analyzer (session push)

| Layer | Files |
|-------|-------|
| Import endpoint | `routes/bridge.js` |
| Session merge | `lib/bridge-import-records.js` |

---

## 3. Test coverage matrix (pre-audit)

| Suite | Tests | Pass | Gaps |
|-------|-------|------|------|
| distress-os bridge unit | 40+ | 92/92 total repo | No HTTP handler integration tests |
| property-distress-analyzer | 1 bridge suite | 191/191 | Only `appendRecordsToSession` |
| city-list-requests | 5 bridge tests | 5/5 | No attach turnaround integration test |

---

## 4. Gaps found & fixes applied

### GAP-01: Legacy `.doc` accepted but processing rejects → 500 error
- **Root cause:** `ACCEPTED_EXTENSIONS` and frontend regex included `.doc`; `parseDocx` throws `UNSUPPORTED_FILE`; `handleProcess` did not catch that code.
- **Fix:** Remove `.doc` from accepted extensions; add `UNSUPPORTED_FILE` handler in `handleProcess` (400 response).
- **Tests added:** `bridge-intake-schema.test.js`, `bridge-api-handlers.test.js`

### GAP-02: API contract doc listed `responseReceivedAt` on `/process`
- **Root cause:** Doc drift — field is only required on `/attach` (matches UI flow).
- **Fix:** Corrected `docs/bridge/API.md`.

### GAP-03: No HTTP-level API handler tests
- **Fix:** Added `tests/bridge-api-handlers.test.js` with mock Form Forge server.

### GAP-04: Edge cases not explicitly tested
- **Fix:** Added `tests/bridge-edge-cases.test.js` (multipart, messages, non-property, TSV, pipe-delimited).

### GAP-05: `noUsableRowsMessage` "all already imported" path untested
- **Fix:** Covered in `bridge-edge-cases.test.js`.

---

## 5. Residual risks (accepted / monitor)

| Risk | Mitigation |
|------|------------|
| OCR dependency (tesseract.js) slow or unavailable | Returns 503 `OCR_UNAVAILABLE`; UI shows retry message |
| Binary PDF/DOCX corruption via multipart | latin1 round-trip preserves bytes; covered by fixture tests |
| Forge down during attach | 400 `ATTACH_FAILED`; user can retry |
| Manual Analyze import only (Filter does not push) | Independence tests + deleted push adapter; operators import prepared lists into Analyze after external enrich |
| Large files (>25 MB) on attach | Forge `MAX_DATASET_BYTES` rejects with clear error |

---

## 6. Verification commands

```powershell
cd C:\Users\brand\Projects\distress-os
npm test

cd C:\Users\brand\Projects\property-distress-analyzer
npm test

cd C:\Users\brand\Projects\city-list-requests
python -m pytest tests/test_bridge_dataset.py tests/test_bridge_export.py -v
```

Full cross-app regression:

```powershell
cd C:\Users\brand\Projects\distress-os
npm run verify
```

---

## 7. Audit verdict

| Check | Result |
|-------|--------|
| Requirements implemented | ✓ |
| Cross-repo contracts aligned | ✓ (after doc + .doc fix) |
| Unit tests green | ✓ |
| Critical bugs fixed | ✓ (GAP-01, GAP-02) |
| Handler + edge tests added | ✓ |
| Ready for production use | ✓ |

**Follow-up (optional):** E2E Playwright test for full `/bridge` UI workflow when server is running.