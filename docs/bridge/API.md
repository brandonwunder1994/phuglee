# Data Bridge v2 — API Contract

> Distress OS endpoints under `/api/bridge/*`. City persistence proxied to Form Forge.  
> Filter Full Readiness Wave 5: seven upload types, OCR meta, already_imported opt-in.

## Authentication

Same session as Distress OS shell (auth guard on `/bridge` page). API routes inherit shell access.

---

## Upload types (canonical)

Process, attach validation, and Filter radios use `UPLOAD_TYPES` / `validateUploadType` from `lib/bridge-intake-schema.js`:

| `uploadType` | Label |
|--------------|-------|
| `code_violation` | Code Violation |
| `pre_lien` | Pre-lien |
| `tax_delinquent` | Tax Delinquent |
| `lis_pendens` | Pre-foreclosure (LP / NOD) |
| `probate` | Probate / Estate |
| `fire` | Fire-damaged |
| `water_shut_off` | Water Shut Off |

Unknown values → **400** `INVALID_UPLOAD_TYPE`.

**Retention note:** only `code_violation` applies Strong-only keep (`no_distress_signal` discards). See [`DATA-STANDARDS.md`](./DATA-STANDARDS.md).

---

## `GET /api/bridge/states`

Returns distinct states from cities with existing Form Forge profiles.

**Response 200:**

```json
{
  "states": [
    { "code": "Arizona", "label": "Arizona", "cityCount": 42 }
  ]
}
```

---

## `GET /api/bridge/cities?state=Arizona`

Returns cities with profiles for the given state. No free-text city creation.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `state` | Yes | State name as stored in portal registry |

**Response 200:**

```json
{
  "state": "Arizona",
  "cities": [
    { "id": "arizona-marana", "city": "Marana", "state": "Arizona" }
  ]
}
```

**Response 400:** Missing or unknown state.

---

## `POST /api/bridge/process`

Upload and process a city response file. Does **not** persist to city profile and does **not** push to Analyze.

**Content-Type:** `multipart/form-data`

| Field | Required | Description |
|-------|----------|-------------|
| `cityId` | Yes | Existing city profile ID |
| `uploadType` | Yes | One of the seven IDs above |
| `file` | Yes | Source file(s) — repeat the `file` field up to **5** times for the same city (xlsx, csv, pdf, docx, txt, jpg, png, webp, gif, tif/tiff, bmp, heic/heif). Results are merged with cross-file address dedupe. |
| `applyAlreadyImportedFilter` | No | `true` / `1` to hard-drop addresses already in Analyze import index. **Off by default** (IND-04). Filter UI checkbox `#bridge-skip-already-imported`. |
| `confirmedTypeHeader` | No | Resume Type-column confirm |
| `formatFingerprint` | No | City-format fingerprint |
| `confirmedFormats` | No | JSON array for multi-format batch confirms |

> `responseReceivedAt` is collected at **attach** time (step 4), not during process. See `POST /api/bridge/attach`.

**Response 200:**

```json
{
  "ok": true,
  "city": { "id": "arizona-marana", "city": "Marana", "state": "Arizona" },
  "uploadType": "code_violation",
  "sourceFile": "violations-march.xlsx",
  "processedAt": "2026-07-06T14:30:22.000Z",
  "stats": {
    "totalParsed": 150,
    "kept": 142,
    "discarded": 8,
    "deduplicated": 3,
    "alreadyImported": 0,
    "noDistress": 40,
    "lowConfidence": 2,
    "discardReasons": {
      "no_address": 5,
      "blank_row": 3,
      "no_distress_signal": 40
    },
    "tagBreakdown": {
      "Strong Distressed Signal": 102,
      "Standard Code Violation": 0
    },
    "confidenceBreakdown": { "high": 130, "medium": 10, "low": 2 }
  },
  "rows": [ { "streetAddress": "123 Main St", "distressedSignalTag": "Strong Distressed Signal" } ],
  "notDistressedRows": [],
  "discarded": [
    { "reason": "no_address", "rawPreview": "..." }
  ],
  "processingMeta": {
    "parser": "spreadsheet",
    "columnMap": { "streetAddress": "Property Address" },
    "importIndexCount": 0,
    "importIndexSources": null,
    "ocrTruncated": false,
    "ocrPagesProcessed": null,
    "ocrPagesTotal": null,
    "ocrPageCap": 12,
    "durationMs": 420
  }
}
```

Processing **does not** push to Analyze. Save filtered lists via `POST /api/bridge/lists`, then download for third-party enrichment. Analyze only receives data when you manually import an enriched list there.

### already_imported (opt-in)

Analyze-index hard-drop is **off by default** (v2.0 / IND-04). `stats.alreadyImported` is `0` and the import index is not loaded unless `applyAlreadyImportedFilter` is true. When on, matching rows are discarded with reason `already_imported`.

### OCR page cap

Scanned PDFs are OCR’d up to **`MAX_OCR_PAGES` (12)**. When truncated:

- `processingMeta.ocrTruncated === true`
- `ocrPagesProcessed` / `ocrPagesTotal` / `ocrPageCap` filled when known
- Filter UI shows truncation banner; API error paths for OCR failure also include cap messaging and `maxOcrPages`

### code_violation Strong-only

For `uploadType=code_violation`, rows without **Strong Distressed Signal** are not in `rows`; they contribute to `stats.noDistress` / `discardReasons.no_distress_signal` and (when present) `notDistressedRows` for Train FN review.

**Response 400:** Invalid upload type, unsupported file, empty file, city not found.

**Response 422:** File parsed but zero usable rows (`NO_USABLE_ROWS`).

**Response 503:** OCR unavailable in environment (`OCR_UNAVAILABLE` where applicable).

---

## Saved lists (`/api/bridge/lists`)

User-scoped Filter staging store. Independent of Analyze.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/bridge/lists` | List saved list summaries |
| `POST` | `/api/bridge/lists` | Save processed rows as a named list |
| `GET` | `/api/bridge/lists/:id?includeRows=1` | Get one list (optional full rows) |
| `PATCH` | `/api/bridge/lists/:id` | Rename (`{ "name": "..." }`) |
| `DELETE` | `/api/bridge/lists/:id` | Delete list |
| `GET` | `/api/bridge/lists/:id/download?format=csv\|xlsx` | Download export |
| `GET` | `/api/bridge/lists/download-all?format=csv\|xlsx` | Download all lists |
| `DELETE` | `/api/bridge/lists` (bulk) | Delete selected / clear — see handlers |

**POST body:** `{ name?, rows, stats?, cityId?, cityName?, state?, uploadType?, sourceFile?, processingMeta? }`

---

## `POST /api/bridge/attach`

Attach the processed dataset to a city profile (versioned, append-only). Secondary to **Save list → Download for Analyze**.

**Content-Type:** `application/json`

```json
{
  "cityId": "arizona-marana",
  "uploadType": "code_violation",
  "responseReceivedAt": "2026-07-04T09:42:00.000-07:00",
  "originalFilename": "violations-march.xlsx",
  "stats": { "kept": 142, "discarded": 8, "deduplicated": 3, "alreadyImported": 0 },
  "rows": [ { "streetAddress": "123 Main St", "...": "..." } ],
  "metadata": { "processingMeta": { "parser": "spreadsheet" } }
}
```

`uploadType` must pass Filter `validateUploadType` (seven ids). **Form Forge** `save_bridge_dataset` historically accepts only `code_violation` \| `water_shut_off` for on-disk attach files — non-legacy types should use saved lists as the primary export path.

**Attach side effects (Form Forge):**

- Updates `requests.{request_type}.response_at` with `responseReceivedAt`
- Sets `response_status` to `yes` when attaching a usable list
- Logs `response_received` event with `turnaround_days` for KPI / City Tracker averages

**Response 200:**

```json
{
  "ok": true,
  "version": {
    "id": "20260706-143022-arizona-marana",
    "upload_type": "code_violation",
    "original_filename": "violations-march.xlsx",
    "response_received_at": "2026-07-04T09:42:00.000-07:00",
    "attached_at": "2026-07-06T14:30:22.000000+00:00",
    "turnaround_days": 12,
    "kept_count": 142,
    "csv_download_url": "/forge/api/file/data/bridge-datasets/...",
    "xlsx_download_url": "/forge/api/file/data/bridge-datasets/..."
  }
}
```

**Response 400:** Validation error or persistence failure.

---

## `GET /api/bridge/history/:cityId`

Returns version history for Data Bridge attachments on a city profile.

**Response 200:**

```json
{
  "cityId": "arizona-marana",
  "history": [
    {
      "id": "20260706-143022-arizona-marana",
      "upload_type": "code_violation",
      "upload_type_label": "Code Violation",
      "original_filename": "violations-march.xlsx",
      "attached_at": "2026-07-06T14:30:22.000000+00:00",
      "kept_count": 142,
      "csv_download_url": "/forge/api/file/...",
      "xlsx_download_url": "/forge/api/file/..."
    }
  ]
}
```

**Response 404:** City not found.

---

## Form Forge Persistence (internal)

Attach calls Form Forge:

- `POST /api/portal/city/:cityId/bridge/attach` — persists via `bridge_dataset.save_bridge_dataset()`
- City detail payload includes `bridge_datasets` enriched with download URLs via `city_bridge_datasets()`

---

## Error Shape

```json
{
  "error": "Human-readable message",
  "code": "INVALID_UPLOAD_TYPE"
}
```

Common codes: `INVALID_UPLOAD_TYPE`, `UNSUPPORTED_FILE`, `CITY_NOT_FOUND`, `EMPTY_FILE`, `PARSE_FAILED`, `NO_USABLE_ROWS`, `OCR_UNAVAILABLE`, `MISSING_CITY`, `MISSING_FILE`, `INVALID_CONTENT_TYPE`.
