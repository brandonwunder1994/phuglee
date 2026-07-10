# Data Bridge v2 — API Contract

> Distress OS endpoints under `/api/bridge/*`. City persistence proxied to Form Forge.

## Authentication

Same session as Distress OS shell (auth guard on `/bridge` page). API routes inherit shell access.

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

Upload and process a city response file. Does **not** persist to city profile.

**Content-Type:** `multipart/form-data`

| Field | Required | Description |
|-------|----------|-------------|
| `cityId` | Yes | Existing city profile ID |
| `uploadType` | Yes | `code_violation` or `water_shut_off` |
| `file` | Yes | Source file(s) — repeat the `file` field up to **5** times for the same city (xlsx, csv, pdf, docx, txt, jpg, png). Results are merged with cross-file address dedupe. |

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
    "alreadyImported": 12,
    "lowConfidence": 2,
    "discardReasons": { "no_address": 5, "blank_row": 3 },
    "tagBreakdown": {
      "Strong Distressed Signal": 28,
      "Standard Code Violation": 114
    },
    "confidenceBreakdown": { "high": 130, "medium": 10, "low": 2 }
  },
  "rows": [ { "streetAddress": "123 Main St", "distressedSignalTag": "..." } ],
  "discarded": [
    { "reason": "no_address", "rawPreview": "..." }
  ],
  "processingMeta": {
    "parser": "spreadsheet",
    "columnMap": { "streetAddress": "Property Address" },
    "importIndexCount": 10482,
    "importIndexSources": { "records": 10200, "results": 282 },
    "durationMs": 420
  }
}
```

Processing **does not** push to Analyze. Save filtered lists via `POST /api/bridge/lists`, then download for third-party enrichment. Analyze only receives data when you manually import an enriched list there.

Addresses already present in the Analyze session are still removed from kept rows (`stats.alreadyImported`).

**Response 400:** Invalid upload type, unsupported file, empty file, city not found.

**Response 422:** File parsed but zero usable rows.

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

**POST body:** `{ name?, rows, stats?, cityId?, cityName?, state?, uploadType?, sourceFile?, processingMeta? }`

---

## `POST /api/bridge/attach`

Attach the processed dataset to a city profile (versioned, append-only).

**Content-Type:** `application/json`

```json
{
  "cityId": "arizona-marana",
  "uploadType": "code_violation",
  "responseReceivedAt": "2026-07-04T09:42:00.000-07:00",
  "originalFilename": "violations-march.xlsx",
  "stats": { "kept": 142, "discarded": 8, "deduplicated": 3, "alreadyImported": 12 },
  "rows": [ { "streetAddress": "123 Main St", "...": "..." } ],
  "metadata": { "processingMeta": { "parser": "spreadsheet" } }
}
```

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

Common codes: `INVALID_UPLOAD_TYPE`, `UNSUPPORTED_FILE`, `CITY_NOT_FOUND`, `EMPTY_FILE`, `PARSE_FAILED`, `NO_USABLE_ROWS`.