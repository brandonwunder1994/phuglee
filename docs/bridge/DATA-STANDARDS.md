# Data Bridge v2 — Data Standards

> Phase 1 foundation document. Defines normalized columns, retention rules, and confidence scoring.  
> Filter Full Readiness Wave 5: aligned with engine retention (`filterDistressOnly`), IND-04 opt-in import filter, OCR page-cap honesty, and all seven list types.

## Upload Types

Registry: `UPLOAD_TYPES` in `lib/bridge-intake-schema.js` (also Filter radios `name="bridge-upload-type"`).

| ID | Label | Default Tag | Distress phrase filter | Notes |
|----|-------|-------------|------------------------|-------|
| `code_violation` | Code Violation | Standard Code Violation | **Yes** | Strong-only keep (see Retention). Open **and** closed records when address is usable |
| `pre_lien` | Pre-lien | Pre-lien – Civil / Small Claims Complaint | No | List type is the signal; all usable addresses kept |
| `tax_delinquent` | Tax Delinquent | Tax Delinquent – High Value Distress Signal | No | List type is the signal |
| `lis_pendens` | Pre-foreclosure (LP / NOD) | Pre-foreclosure – LP / NOD / NOS | No | List type is the signal |
| `probate` | Probate / Estate | Probate – Estate Filing | No | List type is the signal |
| `fire` | Fire-damaged | Fire Damage – High Value Distress Signal | No | List type is the signal |
| `water_shut_off` | Water Shut Off | Water Shut Off – High Value Distress Signal | No | All usable-address records are high-value distress signals |

Only `code_violation` runs Superpower Brain phrase/type keep-kill **and** Strong Distressed Signal filtering. All other types tag with their default tag and pass through `filterDistressOnly` unchanged.

**Canonical id:** `water_shut_off` (underscore). Form Forge request logs may still store legacy `water_shutoff` — Filter maps at the API boundary.

## Normalized Columns

Every kept record is mapped to these fields (see `lib/bridge-intake-schema.js`):

| Field | Required | Source |
|-------|----------|--------|
| Street Address | Yes (for retention) | Parsed column or OCR |
| City | Yes | City profile selection (overrides file when missing) |
| State | Yes | City profile selection (overrides file when missing) |
| Zip | No | Parsed when available |
| Violation/Issue Type | No | Parsed column or inferred |
| Violation Date | No | Parsed when available |
| Description/Notes | No | Parsed free text |
| Distressed Signal Tag | Yes | Tagging engine |
| Matched Indicators | No | Semicolon-separated list when strong signals match |
| Confidence Level | Yes | `high`, `medium`, or `low` |
| Source File | Yes | Original upload filename |
| Upload Type | Yes | One of the seven IDs above |
| Processed At | Yes | ISO-8601 UTC timestamp |

## Retention Rules

Pipeline order after parse/normalize (simplified):

1. Drop unusable addresses / blank / non-property (`no_address`, `blank_row`, `non_property`, `parse_error`)
2. Within-upload near-duplicate drop (`duplicate`)
3. **Optional** Analyze-index hard-drop (`already_imported`) — see below
4. Superpower Brain apply (active type/phrase rules; primarily `code_violation`)
5. **Strong-only keep** for `code_violation` via `filterDistressOnly` — see below

### Keep a row when

- It has a usable street address after parsing/normalization
- For **Code Violation** uploads: status (open/closed) is **not** a filter — both are eligible; **and** the row must carry tag **`Strong Distressed Signal`** after tagging + brain apply
- For **all other upload types** (water, pre-lien, tax, lis pendens, probate, fire): any record with a usable address is retained (list type is the distress signal)

### Discard a row when

| Reason | Description |
|--------|-------------|
| `no_address` | No usable street address after parsing |
| `blank_row` | Entirely empty or whitespace-only |
| `non_property` | Clearly non-property / non-house (e.g. City Hall, parking lot, apartment complex, commercial building, highway ROW). Vacant lots still keep. |
| `duplicate` | Near-duplicate of another kept row in the same upload |
| `already_imported` | Address already exists in the user's Property Analyzer import index — **only when opt-in is on** |
| `no_distress_signal` | **Code Violation only.** Row is not tagged `Strong Distressed Signal` after phrase/brain tagging (generic / admin / permit / weak code lines). Counted in `stats.noDistress` / `stats.discardReasons.no_distress_signal`. Full rows for Train FN review live in `notDistressedRows` (not the thin discard sample). |
| `parse_error` | Row could not be parsed from source |

### Code Violation — Strong-only keep (`no_distress_signal`)

Product rule: Filter's job on code lists is to **kill non-deals** (weak violation types, admin permits, fence-permit noise) and keep clerk-true distress (weeds, trash, blight, junk vehicles, dilapidated structure, etc.).

- Implemented by `filterDistressOnly` in `lib/bridge-distress-tagger.js`, called from `processUpload` in `lib/bridge-engine/index.js`
- **Keep:** `distressedSignalTag === "Strong Distressed Signal"`
- **Remove (FN / not-distressed path):** everything else on `code_violation`, reason `no_distress_signal`
- Gold ACC fixtures under `tests/fixtures/bridge/gold/` lock keep vs deny
- Other upload types **do not** apply this filter

## Usable Address Heuristic

An address is usable when:

1. Non-empty after trim
2. At least 4 characters
3. Contains a street number, or a parcel/unit indicator (`lot`, `parcel`, `unit`, `apt`, `suite`, `#`)
4. Matches basic street pattern (e.g. `123 Main`) or contains a numeric component

## Confidence Levels

| Level | When Applied |
|-------|--------------|
| `high` | Tabular parse with matched address column; OCR word confidence ≥ 85% |
| `medium` | Partial column match; OCR confidence 60–84%; inferred fields |
| `low` | OCR confidence < 60%; address inferred from weak text; flagged `needs_review` |

Low-confidence rows are **kept** when the address is usable, but flagged for user review in the results table.

## OCR Page Cap + Operator Warning

Scanned / image PDFs use Tesseract OCR (`lib/bridge-engine/parsers/pdf-ocr.js`).

| Constant / field | Value / meaning |
|------------------|-----------------|
| `MAX_OCR_PAGES` | **12** pages per PDF |
| Operator static hint | Filter upload panel: “Scanned PDFs: OCR reads up to 12 pages…” |
| Cap message helper | `ocrPageCapMessage()` — used in OCR error strings |

When a PDF is longer than the cap:

1. OCR processes only the first `MAX_OCR_PAGES` pages
2. Parse attaches honesty flags (`ocrTruncated`, page totals, cap note)
3. `processUpload` surfaces them on **`processingMeta`**:

| `processingMeta` field | Type | Meaning |
|------------------------|------|---------|
| `ocrTruncated` | boolean | `true` when page cap truncated OCR |
| `ocrPagesProcessed` | number \| null | Pages actually OCR’d |
| `ocrPagesTotal` | number \| null | Document page count when known |
| `ocrPageCap` | number | Cap used (default 12) |
| `redactedSkipped` | number \| null | Rows skipped for redaction (family extractors) |
| `rotatedBy` | number \| number[] \| null | Auto-rotation applied |

4. Filter UI shows `#bridge-ocr-truncation-banner` when `processingMeta.ocrTruncated` is true (copy via `buildOcrTruncationWarning` in `public/js/bridge.js`). Operator is told to re-export Excel from the portal or split the PDF.

Multi-file batch merge: any file truncated → `ocrTruncated: true`; page counts / redactedSkipped **sum**; `ocrPageCap` is **max** of per-file caps.

Fixtures / tests: `tests/bridge-ocr-meta.test.js`, `tests/bridge-ocr-truncation-ui.test.js` (Wave 1).

## Lopsided / Scanned / Redacted Sheets (PDF → Excel)

City open-records packets often arrive as **image PDFs** (or photos) that are **not upright tables** — sideways scans, black-box redactions, Crystal Reports printouts, multi-page section headers. These must still become a **clean filterable `.xlsx`** before Type confirm / Train.

### Detection

Treat a file as this class when any of the following hold:

1. Embedded text is empty or page-marker-only (`needsPdfOcr`)
2. OCR orientation correction applies (`rotatedBy` 90 / 180 / 270)
3. Text matches a known report family after upright OCR (GENF record IDs, CEU case grids, Application Name / Street #, E-Gov PIR, etc.)
4. Generic line split produces title-banner “headers” with no usable street column

### Pipeline (mandatory order)

1. **Screenshot + auto-rotate** (`pdf-ocr.js` / `uprightImage`) — OSD first, multi-angle score fallback
2. **Structured family rebuild** → AOA with real headers → in-memory `.xlsx` → existing spreadsheet column path
3. **Never** ship raw OCR lines as the spreadsheet when a structured extractor can recover ≥2 address rows

| Report family | Anchor signals | Output columns (minimum) | Module |
|---------------|----------------|--------------------------|--------|
| Enforcement Cases Detail (Gainesville-style) | `GENF##-####`, “Record ID / Location”, section headers TRASH / TALL GRASS | Record ID, Location, Description, Violation Type, Status, dates | `pdf-enforcement-detail.js` |
| Code Cases by Status (Lawrenceville-style) | `CEU####-####`, Case Type, Main Address | Case #, Case Type, Main Address, status, dates | `pdf-code-cases-status.js` |
| Code Compliance grid (Pharr-style) | Application Name, Street # / Dir / Street Name | Application Name, Property Address, Opened Date | `pdf-code-compliance.js` |
| E-Gov PIR | Action Form Name, Date Submitted | Action Form Name, Issue Street Number/Name | `pdf-egov.js` |

### Redactions

Black bars often delete Record ID, owner, or complainant cells while leaving Location readable (or the reverse).

- **Keep** a row only when a **usable street address** survives
- **Skip** rows with no recoverable location (count as `redactedSkipped` / effectively `no_address`)
- Do **not** invent File# / Record ID for fully redacted identities
- Partial OCR of status (“Closed - Violation Correc”) must normalize to full status labels when possible

### Orientation rules

- Sideways pages are normal for this class — rotation is required, not optional
- Learn rotation from page 1 and reuse on later pages; re-detect if OCR score collapses
- Cover letters / exemption pages in the same PDF may still OCR as garbage — ignore pages with no case anchors

### Operator expectation

After upload, Filter should present real columns (Location / Record ID / Violation Type), not title text like “Enforcement Cases Detail By Violation…”. Type-column scoring should be able to offer **Violation Type** (or Case Type / Application Name / Action Form Name) from the rebuilt sheet.

## Deduplication

Within a single upload:

- Normalize addresses (lowercase, expand abbreviations, strip punctuation)
- Compare street addresses with Levenshtein similarity ≥ 0.92
- When issue types are present, require issue similarity ≥ 0.85 or exact match
- First occurrence is kept; later near-duplicates are discarded with reason `duplicate`

## Property Analyzer Cross-Reference (opt-in)

**Off by default (v2.0 / IND-04).** After deduplication, Filter does **not** hard-drop rows that appear in the operator's Analyze session unless:

| Layer | How opt-in is enabled |
|-------|------------------------|
| Engine | `applyAlreadyImportedFilter === true` (strict boolean) |
| HTTP process | Multipart field `applyAlreadyImportedFilter` = `true` / `1` |
| Filter UI | Checkbox `#bridge-skip-already-imported` (“Skip addresses already in Analyze”) — **unchecked by default** |

When opt-in is enabled, each kept row is checked against the Property Analyzer import index. Rows that match an existing import are removed with reason `already_imported`.

**Index source (when opt-in loads the index):**

1. `distressAnalyzerSession_LATEST.json` on disk (`PROPERTY_ANALYZER_PATH`) — preferred, no auth required
2. `GET /api/import-address-index` on the Property Analyzer service (fallback)

The index is cached for 5 minutes (force refresh on process when opt-in runs). Matching uses the same address similarity threshold as deduplication (≥ 0.92), comparing the composite key `streetAddress, city, state, zip`. Pure helper: `lib/bridge-engine/import-filter.js` (`filterAlreadyImported`).

**Stats (default process):** `alreadyImported` is `0` and `processingMeta.importIndexCount` is `0` because the index is not loaded. When opt-in runs: `alreadyImported` counts hard-drops; `importIndexCount` is the size of the loaded index.

## Filter Saved Lists (no Auto-Push)

After processing, kept rows stay on the Filter page until the user explicitly saves them.

- API: `POST /api/bridge/lists` (user-scoped filesystem store under `FILTER_LISTS_ROOT`, default `PDA_DATA_ROOT/filter-lists` so Railway volumes keep lists across deploys)
- Download: `GET /api/bridge/lists/:id/download?format=csv|xlsx` · download-all: `GET /api/bridge/lists/download-all?format=csv|xlsx`
- Rename / delete: `PATCH` / `DELETE` on `/api/bridge/lists/:id`
- **Multi-city staging:** lists **persist until the operator deletes them**. Process, restart, and deploy do **not** wipe the list store (volume-safe `FILTER_LISTS_ROOT`).
- **No automatic push to Analyze.** Process, save, Train, and list APIs never write Analyze sessions. Legacy Filter adapter `bridge-analyzer-push.js` is **deleted**; independence locked by `tests/bridge-independence.test.js`.
- **Workflow:** Process → (Train, admin optional) → **Save list** → **Download for Analyze** (address CSV) → **manual** Analyze import → review scan. Advanced export (Full Excel / batch 5k) is secondary. Never auto-push.
- **Day-2 / known format:** when the upload fingerprint matches a prior city format, Type reuses automatically (`auto_reuse`, no Type-column modal). First upload or a changed layout still requires confirm (GATE-02). Operator path stays Process → (Train, A/D keys for admin) → Save → Download; never auto-save or Analyze push.

The Analyzer `POST /api/bridge-import-records` endpoint may still exist for **manual** import compatibility but is not called from Filter process/save/Train.

## Response Received Timestamp (Turnaround KPI)

When attaching a processed list, the user must record **when the city actually sent the response** (date + time). This is separate from `attached_at` (when Data Bridge processed/stored the file).

| Field | Required on attach | Description |
|-------|-------------------|-------------|
| `responseReceivedAt` | Yes | ISO-8601 datetime — when the city clerk/department delivered the list (email received, portal download, etc.) |

**Why:** Form Forge turnaround KPIs compare request submission time (`last_email_sent_at` / `last_online_submitted_at`) to `response_at` on the city profile. Without this field, attach would not update the tracker and averages would be wrong or missing.

**On attach, Data Bridge will:**

1. Persist `response_received_at` on the `bridge_datasets[]` version record
2. Call Form Forge `log_response()` for the mapped request type with `response_status: "yes"` and the user-supplied datetime
3. Recompute `turnaround_days` on the city profile so `average_turnaround_days` in City Tracker reflects the entry

**Upload type → Form Forge request type (attach / city outcome):**

| Data Bridge `uploadType` | Form Forge `request_type` (typical) |
|--------------------------|-------------------------------------|
| `code_violation` | `code_violation` |
| `water_shut_off` | `water_shutoff` (legacy Forge id) |
| `pre_lien` / `tax_delinquent` / `lis_pendens` / `probate` / `fire` | Same id when Forge profile supports it; primary Filter path is **save list + download**, not attach |

**Note:** Form Forge `save_bridge_dataset` historically validates attach files as `code_violation` \| `water_shut_off` only. Process + saved lists accept all seven types regardless.

**Form Forge (Phase 6):** `log_response()` preserves full ISO datetime in `response_at` when the user supplies date+time. Date-only values remain supported for legacy entries. Turnaround still uses calendar-day diff via `compute_turnaround_days`.

## Versioned Attachment Schema

Stored on city profile as `bridge_datasets[]` (Form Forge `bridge_dataset.py`):

```json
{
  "id": "20260706-143022-arizona-marana",
  "upload_type": "code_violation",
  "upload_type_label": "Code Violation",
  "original_filename": "violations-march.xlsx",
  "response_received_at": "2026-07-04T09:42:00.000-07:00",
  "attached_at": "2026-07-06T14:30:22.000000+00:00",
  "kept_count": 142,
  "discarded_count": 8,
  "deduplicated_count": 3,
  "already_imported_count": 12,
  "csv_path": "data/bridge-datasets/Arizona/arizona-marana/20260706_bridge-code_violation.csv",
  "xlsx_path": "data/bridge-datasets/Arizona/arizona-marana/20260706_bridge-code_violation.xlsx",
  "meta_path": "data/bridge-datasets/Arizona/arizona-marana/20260706_bridge-code_violation-meta.json",
  "stats": { "kept": 142, "discarded": 8, "deduplicated": 3, "tagBreakdown": {} }
}
```

Files are stored under `data/bridge-datasets/{state}/{city_id}/`.

## Extension Points

- `UPLOAD_TYPES` registry in `bridge-intake-schema.js` — add new upload types without schema changes (must also add Filter radio + CONTRACT-FREEZE lock)
- Property Analyzer cross-reference hard-drop is **off by default**; only when `applyAlreadyImportedFilter === true` (engine / multipart / UI checkbox)
- Strong-only keep is **code_violation only** via `filterDistressOnly` / `no_distress_signal`
- `bridge_datasets[]` is append-only; new uploads create new versions without overwriting prior attachments
