# Data Bridge v2 — Comprehensive Test Plan

> Every test case the tool should pass. Mapped to automated tests where implemented.

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
| C-04 | Missing file | 400 MISSING_FILE | ✓ handlers |
| C-05 | Unsupported extension (.zip) | 400 UNSUPPORTED_FILE | ✓ handlers |
| C-06 | Legacy .doc file | 400 UNSUPPORTED_FILE | ✓ handlers |
| C-07 | Empty file (0 bytes) | 400 EMPTY_FILE | ✓ handlers |
| C-08 | Unknown cityId | 404 CITY_NOT_FOUND | ✓ handlers |
| C-09 | Valid CSV code_violation | 200, rows + stats (no analyzerPush) | ✓ engine |
| C-10 | Valid TXT water_shut_off | 200, water tags | ✓ engine |
| C-11 | Valid XLSX | 200, spreadsheet parser | ✓ engine |
| C-12 | Valid PDF (text extract) | 200, pdf parser | ✓ engine |
| C-13 | Valid DOCX | parser path | manual/fixture |
| C-14 | Valid JPG (OCR) | 200 or 503 OCR_UNAVAILABLE | ✓ engine (mock) |
| C-15 | All rows missing addresses | 422 NO_USABLE_ROWS | ✓ engine |
| C-16 | All rows already in Analyzer | 422, specific message | ✓ edge |
| C-17 | Empty spreadsheet | 400 PARSE_FAILED | ✓ edge |
| C-18 | Near-duplicate rows | deduplicated stat | ✓ engine |
| C-19 | OCR low confidence | needsReview flag | ✓ engine |
| C-20 | Process does not push to Analyze | analyzerPush absent | ✓ handlers |
| C-21 | Save / rename / download / delete lists | CRUD + CSV download | ✓ list-store + handlers |
| C-21 | Analyzer push fails | disk fallback, ok:false possible | manual |

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
| F-12 | Open AND closed violations kept | both in output | ✓ engine |

## G. Deduplication

| ID | Case | Expected | Auto |
|----|------|----------|------|
| G-01 | St vs Street abbreviation | duplicate removed | ✓ dedup + engine |
| G-02 | Same address, different issue | both kept | ✓ dedup |
| G-03 | Different addresses | both kept | ✓ dedup |
| G-04 | Levenshtein threshold 0.92 | boundary behavior | ✓ dedup |

## H. Property Analyzer cross-reference

| ID | Case | Expected | Auto |
|----|------|----------|------|
| H-01 | Empty index | all rows kept | ✓ import-filter |
| H-02 | Exact full-address match | already_imported | ✓ import-filter |
| H-03 | Abbreviation variant match | already_imported | ✓ import-filter |
| H-04 | Street-only index entry | already_imported | ✓ import-filter |
| H-05 | Unrelated address | kept | ✓ import-filter |
| H-06 | Index cache TTL (5 min) | reload on force | manual |

## I. Distressed signal tagging

| ID | Case | Expected | Auto |
|----|------|----------|------|
| I-01 | Overgrown weeds | Strong Distressed Signal | ✓ |
| I-02 | Trash accumulation | Strong Distressed Signal | ✓ |
| I-03 | Abandoned vehicle | Strong Distressed Signal | ✓ |
| I-04 | Dilapidated structure | Strong Distressed Signal | ✓ |
| I-05 | Fence deteriorated | Strong Distressed Signal | ✓ |
| I-06 | Fence permit (admin) | Standard Code Violation | ✓ |
| I-07 | Water shut off any text | Water Shut Off tag | ✓ |
| I-08 | Multiple categories in one row | multiple indicators | ✓ |
| ACC-01 | Gold keep/deny/water processUpload e2e | Strong kept / FN deny / water no type-suppress | ✓ `bridge-accuracy-gold.test.js` |
| ACC-02 | No-Type + banned silent-drop reasons | Inventory kept/FN; no no_type* | ✓ gold |
| ACC-03 | Type winner + COL/GATE/LBL/GROUP keep-green | Single Type; engine patterns | ✓ gold + engine |
| LRN-01 | Paired learning metrics (trend + gold P/R) | GET brain/metrics.learning | ✓ `bridge-learning-metrics` + brain-api |
| LRN-02 | Anti-game: coverage / no silent-drop win | pure unit + no groupsHidden | ✓ learning-metrics |
| LRN-03 | Type live; phrases proposed-only | apply + phrase miner | ✓ existing + phase 58 |

## J. Analyzer push

| ID | Case | Expected | Auto |
|----|------|----------|------|
| J-01 | Row → analyzer record shape | leadType, bridgeTag, address | ✓ |
| J-02 | Water shut off lead type | water_shut_off | ✓ |
| J-03 | Duplicate key skipped | skipped count | ✓ analyzer |
| J-04 | New records appended | added count | ✓ analyzer |
| J-05 | Record key format email\|phone\|address | matches session | ✓ |

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
| L-06 | KPI grid has no Pushed to Analyze | Already in Analyze only | manual |
| L-09 | Saved lists panel multi-upload | lists persist across process | manual |
| L-07 | History panel loads on city select | fetch history | manual |
| L-08 | CSV export download | client-side blob | manual |
| L-09 | Pagination 50 rows | page controls | manual |
| L-10 | Filter by tag/confidence/review | table filters | manual |

## M. Multipart parser

| ID | Case | Expected | Auto |
|----|------|----------|------|
| M-01 | Text fields + file field | fields + files | ✓ edge |
| M-02 | Missing boundary | throws | ✓ edge |
| M-03 | Binary file round-trip | bytes preserved | ✓ edge |

---

## Execution order (GSD verify loop)

1. `npm test` — distress-os (all bridge + regression)
2. `npm test` — property-distress-analyzer
3. `pytest tests/test_bridge_*.py` — Form Forge
4. `npm run verify` — full cross-app (server must be running)

Mark each case ✓ when green. Re-run after any bridge change.