# Data Bridge v2 — Comprehensive Test Plan

> Every test case the tool should pass. Mapped to automated tests where implemented.  
> Filter Full Readiness Wave 5: seven upload types; retired Analyzer push failure path; OCR / already_imported / Strong-only cases aligned with product.

---

## A. API — `GET /api/bridge/states`

| ID | Case | Expected | Auto |
|----|------|----------|------|
| A-01 | Forge returns cities with states | 200, sorted states with cityCount | ✓ handlers |
| A-02 | Forge unreachable | 500 SERVER_ERROR | manual |
| A-03 | Cities with empty state skipped | Not in states list | ✓ `groupStates` |

## B. API — `GET /api/bridge/cities`

| ID | Case | Expected | Auto |
|----|------|----------|------|
| B-01 | Valid state query | 200, sorted cities | ✓ handlers |
| B-02 | Missing state param | 400 MISSING_STATE | ✓ handlers |
| B-03 | Unknown state (no profiles) | 400 UNKNOWN_STATE | ✓ handlers |

## C. API — `POST /api/bridge/process`

| ID | Case | Expected | Auto |
|----|------|----------|------|
| C-01 | Non-multipart content type | 400 INVALID_CONTENT_TYPE | ✓ handlers |
| C-02 | Missing cityId | 400 MISSING_CITY | ✓ handlers |
| C-03 | Invalid uploadType | 400 INVALID_UPLOAD_TYPE | ✓ handlers |
| C-03b | All seven valid upload types accepted | validateUploadType green for each | ✓ intake-schema / gov-list-types |
| C-04 | Missing file | 400 MISSING_FILE | ✓ handlers |
| C-05 | Unsupported extension (.zip) | 400 UNSUPPORTED_FILE | ✓ handlers |
| C-06 | Legacy .doc file | 400 UNSUPPORTED_FILE | ✓ handlers |
| C-07 | Empty file (0 bytes) | 400 EMPTY_FILE | ✓ handlers |
| C-08 | Unknown cityId | 404 CITY_NOT_FOUND | ✓ handlers |
| C-09 | Valid CSV code_violation | 200, rows + stats (no analyzerPush) | ✓ engine |
| C-10 | Valid TXT water_shut_off | 200, water tags; no Strong-only drop | ✓ engine |
| C-10b | Non-code types (pre_lien, tax, LP, probate, fire) | default tag; pass filterDistressOnly | ✓ gov-list-types |
| C-11 | Valid XLSX | 200, spreadsheet parser | ✓ engine |
| C-12 | Valid PDF (text extract) | 200, pdf parser | ✓ engine |
| C-13 | Valid DOCX | parser path | manual/fixture |
| C-14 | Valid JPG (OCR) | 200 or 503 OCR_UNAVAILABLE | ✓ engine (mock) |
| C-15 | All rows missing addresses | 422 NO_USABLE_ROWS | ✓ engine |
| C-16 | All rows already in Analyzer **with opt-in** | hard-drop / 422 possible when kept empty | ✓ IND-04 / import-filter |
| C-16b | Analyze-index match **default (opt-in off)** | rows kept; alreadyImported 0 | ✓ independence |
| C-17 | Empty spreadsheet | 400 PARSE_FAILED | ✓ edge |
| C-18 | Near-duplicate rows | deduplicated stat | ✓ engine |
| C-19 | OCR low confidence | needsReview flag | ✓ engine |
| C-20 | Process does not push to Analyze | analyzerPush absent; no session write | ✓ handlers + independence |
| C-21 | Save / rename / download / delete lists | CRUD + CSV download | ✓ list-store + handlers |
| C-22 | OCR truncation honesty | `processingMeta.ocrTruncated` + page fields when cap hit | ✓ `bridge-ocr-meta.test.js` |
| C-23 | OCR truncation UI banner | operator warning when meta truncated | ✓ `bridge-ocr-truncation-ui.test.js` |
| C-24 | `applyAlreadyImportedFilter` multipart | only when `true`/`1` | ✓ API + engine IND-04 |

> **Removed (obsolete):** former “C-21 Analyzer push fails / disk fallback” — Filter no longer auto-pushes to Analyze. Legacy `bridge-analyzer-push.js` is deleted. Independence is locked by section N / `tests/bridge-independence.test.js`. Manual Analyze import is out of band of process.

## D. API — `POST /api/bridge/attach`

| ID | Case | Expected | Auto |
|----|------|----------|------|
| D-01 | Invalid JSON body | 400 INVALID_JSON | ✓ handlers |
| D-02 | Missing cityId | 400 MISSING_CITY | ✓ handlers |
| D-03 | Invalid uploadType | 400 INVALID_UPLOAD_TYPE | ✓ handlers |
| D-04 | Missing originalFilename | 400 MISSING_FILENAME | ✓ handlers |
| D-05 | Empty rows array | 400 MISSING_ROWS | ✓ handlers |
| D-06 | Missing responseReceivedAt | 400 INVALID_RESPONSE_AT | ✓ handlers |
| D-07 | Invalid responseReceivedAt | 400 INVALID_RESPONSE_AT | ✓ export test |
| D-08 | Valid attach | 200, version + download URLs | ✓ handlers |
| D-09 | Forge attach failure | 400 ATTACH_FAILED | manual |
| D-10 | Turnaround days computed | turnaroundDays in response | integration |

## E. API — `GET /api/bridge/history/:cityId`

| ID | Case | Expected | Auto |
|----|------|----------|------|
| E-01 | City with datasets | 200, history sorted | ✓ handlers |
| E-02 | City not found | 404 CITY_NOT_FOUND | ✓ handlers |
| E-03 | Missing cityId | 400 MISSING_CITY | ✓ handlers |
| E-04 | Download URLs prefixed with /forge | forgeDownloadUrl | ✓ api test |

## F. Parsing & normalization

| ID | Case | Expected | Auto |
|----|------|----------|------|
| F-01 | Varied column headers (Property Address, etc.) | columnMap correct | ✓ |
| F-02 | Tab-delimited TXT | delimiter \t | ✓ |
| F-03 | Pipe-delimited TXT | delimiter \| | ✓ edge |
| F-04 | TSV file | csv parser | ✓ edge |
| F-05 | Space-delimited table in plain text | table mode | ✓ row-extract |
| F-06 | Address-only lines (no header) | address-lines mode | ✓ row-extract |
| F-07 | City/state from profile overrides file | row.city/state set | ✓ engine |
| F-08 | State column not mapped to street | no false mapping | ✓ schema test |
| F-09 | Blank row discarded | blank_row reason | ✓ |
| F-10 | City Hall / non-property | non_property reason | ✓ edge |
| F-11 | Address without street number | no_address unless lot/unit | ✓ schema |
| F-12 | Open AND closed violations kept | both eligible before Strong-only | ✓ engine |

## G. Deduplication

| ID | Case | Expected | Auto |
|----|------|----------|------|
| G-01 | St vs Street abbreviation | duplicate removed | ✓ dedup + engine |
| G-02 | Same address, different issue | both kept | ✓ dedup |
| G-03 | Different addresses | both kept | ✓ dedup |
| G-04 | Levenshtein threshold 0.92 | boundary behavior | ✓ dedup |

## H. Property Analyzer cross-reference (opt-in)

| ID | Case | Expected | Auto |
|----|------|----------|------|
| H-01 | Empty index (opt-in on) | all rows kept | ✓ import-filter |
| H-02 | Exact full-address match **with opt-in** | already_imported | ✓ import-filter |
| H-03 | Abbreviation variant match **with opt-in** | already_imported | ✓ import-filter |
| H-04 | Street-only index entry **with opt-in** | already_imported | ✓ import-filter |
| H-05 | Unrelated address | kept | ✓ import-filter |
| H-06 | Index cache TTL (5 min) | reload on force | manual |
| H-07 | Default process (opt-in off) | no loadImportAddressIndex; alreadyImported 0 | ✓ IND-04 / independence |

## I. Distressed signal tagging

| ID | Case | Expected | Auto |
|----|------|----------|------|
| I-01 | Overgrown weeds | Strong Distressed Signal | ✓ |
| I-02 | Trash accumulation | Strong Distressed Signal | ✓ |
| I-03 | Abandoned vehicle | Strong Distressed Signal | ✓ |
| I-04 | Dilapidated structure | Strong Distressed Signal | ✓ |
| I-05 | Fence deteriorated | Strong Distressed Signal | ✓ |
| I-06 | Fence permit (admin) | Standard Code Violation → **no_distress_signal** (not kept) | ✓ tagger + gold deny |
| I-07 | Water shut off any text | Water Shut Off tag; no phrase kill | ✓ |
| I-08 | Multiple categories in one row | multiple indicators | ✓ |
| I-09 | code_violation Strong-only keep | filterDistressOnly drops non-Strong | ✓ `bridge-distress-tagger` |
| I-10 | Non-code types pass filterDistressOnly | all usable rows kept | ✓ gov-list-types |
| ACC-01 | Gold keep/deny/water processUpload e2e | Strong kept / FN deny / water no type-suppress | ✓ `bridge-accuracy-gold.test.js` |
| ACC-02 | No-Type + banned silent-drop reasons | Inventory kept/FN; no no_type* | ✓ gold |
| ACC-03 | Type winner + COL/GATE/LBL/GROUP keep-green | Single Type; engine patterns | ✓ gold + engine |
| LRN-01 | Paired learning metrics (trend + gold P/R) | GET brain/metrics.learning | ✓ `bridge-learning-metrics` + brain-api |
| LRN-02 | Anti-game: coverage / no silent-drop win | pure unit + no groupsHidden | ✓ learning-metrics |
| LRN-03 | Type live; phrases proposed-only | apply + phrase miner | ✓ existing + phase 58 |

## J. Analyze handoff (no Filter auto-push)

> **Retired:** Filter auto-push to Analyze (`bridge-analyzer-push.js`, process-time push, “push fails → disk fallback”).  
> Product boundary: **Save list → Download for Analyze → manual Analyze import**.

| ID | Case | Expected | Auto |
|----|------|----------|------|
| J-01 | Process response has no analyzerPush / session write | independence static + runtime | ✓ independence |
| J-02 | Save list does not write Analyze session | independence | ✓ independence |
| J-03 | Download for Analyze CTA present; no “Push to Analyze” | UI contract | ✓ desk-cinema / contract-freeze |
| J-04 | Manual import shape (legacy analyzer helpers if still unit-tested) | record key / leadType when exercised outside Filter | optional / legacy |
| J-05 | Water list type maps to water_shut_off | Filter id stable | ✓ outcome-water-id |

## K. Export & persistence (Form Forge)

| ID | Case | Expected | Auto |
|----|------|----------|------|
| K-01 | rowsToCsv with commas/quotes | escaped CSV | ✓ export |
| K-02 | rowsToXlsxBuffer | non-empty buffer | ✓ export |
| K-03 | save_bridge_dataset files on disk | csv, xlsx, meta | ✓ forge |
| K-04 | Invalid upload_type rejected | BridgeDatasetError | ✓ forge |
| K-05 | city_bridge_datasets download URLs | /api/file/ prefix | ✓ forge |
| K-06 | response_received_at persisted | meta + entry | integration |
| K-07 | log_response updates turnaround | event.turnaround_days | integration |

## L. UI (`/bridge`)

| ID | Case | Expected | Auto |
|----|------|----------|------|
| L-01 | SEO meta present | title, OG | ✓ a11y-seo |
| L-02 | State change resets downstream | panels hidden | manual |
| L-03 | Unsupported file in dropzone | client error | manual |
| L-04 | 422 shows user message | error wrap | manual |
| L-05 | Attach requires response datetime | validation message | manual |
| L-06 | KPI grid has no Pushed to Analyze | Already in Analyze only when skip-imported on | manual |
| L-07 | History panel loads on city select | fetch history | manual |
| L-08 | CSV export download | client-side blob | manual |
| L-09 | Saved lists panel multi-upload | lists persist across process | manual |
| L-09b | Pagination 50 rows | page controls | manual |
| L-10 | Filter by tag/confidence/review | table filters | manual |
| L-11 | Seven list-type radios | all `bridge-upload-type` values present | ✓ contract-freeze |
| L-12 | Skip already-imported checkbox default off | `#bridge-skip-already-imported` unchecked | manual / static |
| L-13 | OCR cap hint + truncation banner | static hint; banner when truncated | ✓ ocr-truncation-ui |
| EFF-01/02 | Day-2 efficiency path (reuse UI, post-save download, Train keyboard guards, anti silent-drop/push/auto-save) | static + engine contracts | ✓ `bridge-efficiency-path.test.js` |

## M. Multipart parser

| ID | Case | Expected | Auto |
|----|------|----------|------|
| M-01 | Text fields + file field | fields + files | ✓ edge |
| M-02 | Missing boundary | throws | ✓ edge |
| M-03 | Binary file round-trip | bytes preserved | ✓ edge |

## N. v2.0 permanent regression bar (TEST-01..03)

> Milestone lock for Filter Independence & Learning. Packaging only — product already green at phases 55–59.
> Note: v1.7 bare `TEST-0N` and v1.8 `TEST-0N (v1.8)` titles in `tests/bridge-engine.test.js` mean different contracts (description-only / Vio Cat / scorer trap / FP change / shortLabel) — do not rename those engine tests.

| ID | Case | Expected | Auto |
|----|------|----------|------|
| TEST-01 (v2.0) | Independence: no Analyze push on Filter write paths + process/save invent no Analyzer sessions | Static bans + process/save negatives green | ✓ `tests/bridge-independence.test.js` |
| TEST-01 (v2.0) | `already_imported` hard-drop off by default (opt-in only) | Default process keeps Analyze-index matches; loadImportAddressIndex not called when off | ✓ independence TEST-01 (v2.0) + engine `IND-04` |
| TEST-02 (v2.0) | Gold ACC fixtures in CI | keep/deny/water/type/silent-drop processUpload green under `npm test` | ✓ `tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/*` |
| TEST-03 (v2.0) | processUpload Type / format / water e2e still covered | COL/GATE/water + v1.8 Type/format + gold water green | ✓ `tests/bridge-engine.test.js` patterns + gold water |
| TEST-03 (v2.0) | Live server after milestone work | health + homepage HTTP 200 | ✓ `scripts/verify-live.ps1` |

```bash
node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js
node --test --test-name-pattern="IND-04|GATE-|COL-|water|TEST-0" tests/bridge-engine.test.js
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

## O. v2.1 permanent regression bar (QA-01..03)

> Milestone lock for Filter Scrub Theater. Packaging + gates only — product theater ships in phases 61–67.  
> Note: v1.7 bare `TEST-0N`, v1.8 `TEST-0N (v1.8)`, and v2.0 `TEST-0N (v2.0)` titles mean different contracts — do not rename them. New packaging titles use `QA-0N (v2.1)`.

| ID | Case | Expected | Auto |
|----|------|----------|------|
| QA-01 (v2.1) | v1.6–v2.0 independence / gold / brain / processUpload locks | Full suite green | ✓ `npm test` (+ independence, gold, engine COL/GATE/water, brain, train, list, LRN, EFF) |
| QA-01 (v2.1) | Independence no-push + already_imported default-off | TEST-01 (v2.0) still greppable | ✓ `tests/bridge-independence.test.js` |
| QA-01 (v2.1) | Gold ACC keep/deny/water/type/silent-drop | TEST-02 (v2.0) fixtures intact | ✓ `tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/*` |
| QA-02 (v2.1) | Live server after milestone | health + homepage + `/bridge` HTTP 200 | ✓ `scripts/verify-live.ps1` + explicit `/bridge` check (Option A) |
| QA-03 (v2.1) | Theater FEED/KILL/THTR reduced-motion + surface contracts | Product dual-tags green (gates-only; no `bridge-scrub-theater.test.js`) | ✓ `tests/bridge-scrub-feed.test.js` + `tests/bridge-kill-rate-scrub.test.js` + `tests/bridge-train-theater.test.js` (+ list-factory Save primary + train-ux fail-closed) |
| QA-03 (v2.1) | Mobile 390 + desktop 1440 layout; CTAs ≥ 44px | No horizontal overflow; tap targets; motion reduce paths verified | ✓ phase `68-QA-CHECKLIST.md` (+ CSS asserts greppable in product suites) |

```bash
node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js
node --test --test-name-pattern="IND-04|GATE-|COL-|water|TEST-0" tests/bridge-engine.test.js
node --test tests/bridge-scrub-feed.test.js tests/bridge-kill-rate-scrub.test.js tests/bridge-train-theater.test.js
# (gates-only: product FEED/KILL/THTR dual-tags; no tests/bridge-scrub-theater.test.js)
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# QA-02 /bridge explicit (Option A)
# Invoke-WebRequest http://127.0.0.1:3000/bridge → 200
```

Human layout/motion gate: `.planning/phases/68-regression-qa-lock/68-QA-CHECKLIST.md` (filled in Plan 02).

---

## P. v3.0 DESK-05 contract freeze (Phase 75)

> Locks Filter DOM contracts so visual makeover phases cannot rename `bridge-*` IDs or churn `data-action` / `data-mode` / `data-format` / `data-step`.  
> Product HTML/JS is **not** changed by this suite — it freezes the shipped spine.  
> Complementary locks (still required): `tests/bridge-desk-cinema.test.js`, `tests/bridge-train-theater.test.js`.

| ID | Case | Expected | Auto |
|----|------|----------|------|
| DESK-05 | Critical scrub-path IDs + train fail-closed + data-mode/format/step + radios | Static greps green on `bridge.html` / `bridge.js` / `bridge-train.js` | ✓ `tests/bridge-contract-freeze.test.js` |
| DESK-05 | Written freeze checklist (full ID inventory + restyle bans) | Human bible present | ✓ `docs/bridge/CONTRACT-FREEZE.md` |
| DESK-05 | Cinema/theater structure remains complementary | Mission surface, victory slogans, no Analyze push CTAs | ✓ desk-cinema + train-theater (not reimplemented here) |
| DESK-05 | Seven upload-type radios | All values locked in freeze doc + HTML | ✓ contract-freeze + freeze.md |

```bash
node --test tests/bridge-contract-freeze.test.js
node --test tests/bridge-desk-cinema.test.js tests/bridge-train-theater.test.js
npm test
```

---

## Q. v3.0 Filter Visual Makeover ship bar (QA-01..04, SYS-01..02)

> Milestone lock for Filter Visual Makeover. Packaging + ship gates after phases 75–80 surface paint.  
> CSS/markup-only makeover; function freeze. New packaging titles use `QA-0N (v3.0)` / `SYS-0N (v3.0)`.  
> Do not rename v1.7 / v1.8 / v2.0 / v2.1 / DESK-05 bars. (§P remains DESK-05 contract freeze.)

| ID | Case | Expected | Auto |
|----|------|----------|------|
| QA-01 (v3.0) | 390 + 1440 primary scrub path layout | No broken layout / page-level overflow | ✓ phase `81-QA-CHECKLIST.md` |
| QA-02 (v3.0) | Full automated suite permanent bar | ≥679 pass / 0 fail (record exact) | ✓ `npm test` |
| QA-03 (v3.0) | Live server after visual changes | health + homepage HTTP 200 | ✓ `scripts/verify-live.ps1` |
| QA-03 (v3.0) | Filter route reachable | `/bridge` HTTP 200 | ✓ explicit Invoke-WebRequest (Option A) |
| QA-04 (v3.0) | Behavior freeze | No process/API/brain/keep-kill/list workflow change; no Analyze re-coupling | ✓ independence + gold still green + freeze checklist |
| SYS-01 (v3.0) | Component catalog note | tokens + classes + do/don't | ✓ `docs/phuglee/COMPONENT-CATALOG.md` |
| SYS-02 (v3.0) | Screenshot parity matrix | login/home vs Filter pairs | ✓ `docs/phuglee/FILTER-PARITY-MATRIX.md` |

```bash
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# QA-03 /bridge explicit (Option A)
# Invoke-WebRequest http://127.0.0.1:3000/bridge → 200
```

Human layout gate: `.planning/phases/81-visual-qa-lock-catalog/81-QA-CHECKLIST.md`  
Catalog: `docs/phuglee/COMPONENT-CATALOG.md`  
Parity: `docs/phuglee/FILTER-PARITY-MATRIX.md`

---

## R. Filter Full Readiness — Wave 1–2 fixtures already landed

> Wave 5 docs only; do not re-add these fixtures. Prove-it remains Wave 6.

| Area | Artifact | Wave |
|------|----------|------|
| OCR meta honesty | `tests/bridge-ocr-meta.test.js` | 1.1 |
| OCR truncation UI | `tests/bridge-ocr-truncation-ui.test.js` | 1.2 |
| Gold ACC | `tests/fixtures/bridge/gold/*` | prior + permanent bar |
| Intake / water id / recovery / scrub CTA | Wave 2 suites under `tests/bridge-*.test.js` | 2.x |
| PDF family text fixtures | `tests/fixtures/bridge/*enforcement*`, `*code-cases*` | parsers |

---

## Execution order (GSD verify loop)

1. `npm test` — distress-os (all bridge + regression)
2. `npm test` — property-distress-analyzer
3. `pytest tests/test_bridge_*.py` — Form Forge
4. `npm run verify` — full cross-app (server must be running)

Mark each case ✓ when green. Re-run after any bridge change.
