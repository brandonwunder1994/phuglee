# Geocodio bulk address clean + SCAN HISTORY export

**Date:** 2026-07-11  
**Status:** Approved for implementation planning  
**Surface:** Filter page (`bridge.html` / SCAN HISTORY) + server-side Geocodio jobs  
**Out of scope:** Writing cleaned addresses back into Filter lists, Analyzer import automation, third-party enrichment tools

---

## Goal

1. Export all SCAN HISTORY inventory leads as **one CSV** for offline work.
2. Upload that (or any address list) into a **Geocodio clean** section under SCAN HISTORY.
3. Run Geocodio across **multiple API keys**, rotating every **2,500 lookups per key**, to produce standardized street / city / state / zip.
4. Store result files as a **download list** under that section (operator downloads when ready).
5. Provide a **usage tracker modal** showing each account, key, and **lookups remaining today** (2,500/day free tier).

Cleaned data is **not** merged back into app state. Operator filters further in a third-party tool, then imports into Analyzer manually.

---

## Success criteria

- One bulk CSV export from SCAN HISTORY with all selected (or all) list rows combined.
- Geocodio section under SCAN HISTORY: upload → process → progress → downloadable results.
- Result CSV columns exactly: `Street Address`, `City`, `State`, `Zip Code` — values from **Geocodio geocoded fields only**.
- Rows without all four geocoded fields are **dropped** from the download.
- Up to 11 keys loaded from server env; rotation every 2,500 lookups per key per day.
- Tracker modal shows account email, API key, used/remaining for today; numbers match our ledger and Geocodio hard stops.
- Keys never appear in git, client bundles, or public static files (except when the authenticated operator opens the tracker modal — see Security).

---

## Architecture overview

```
[SCAN HISTORY] --bulk CSV export--> operator disk
                                         |
                                         v
[Geocodio section] --upload--> server job queue/store
                    --rotate keys 2500 each--> Geocodio batch API
                    --write result CSV--> data/geocodio/jobs/{id}/
                    --usage ledger--> data/geocodio/usage.json
                                         |
                                         v
[Downloads list] <--list/download API-- result file
[Tracker modal]  <--usage API--------- ledger + live exhaust signals
```

### Components

| Piece | Responsibility |
|-------|----------------|
| `lib/geocodio-keys.js` | Parse env keys + optional account labels; never log full keys |
| `lib/geocodio-usage.js` | Per-key daily usage ledger (used, remaining, reset day, exhausted flag) |
| `lib/geocodio-client.js` | Batch geocode; map `address_components` → 4 columns; detect limit errors |
| `lib/geocodio-jobs.js` | Job create/run/status/list/download; retain last 10 completed jobs |
| `lib/bridge-api.js` (or dedicated routes) | HTTP: upload, job status, download, usage |
| `public/bridge.html` + `public/js/bridge.js` | UI: export emphasis, Geocodio panel, downloads, tracker modal |
| Server env | `GEOCODIO_API_KEYS`, `GEOCODIO_API_ACCOUNTS` (emails parallel to keys) |

---

## 1. SCAN HISTORY bulk export

### Behavior

- Primary action: **Export all (CSV)** — single file combining all rows from selected lists if any are selected, otherwise all lists (match existing download-all semantics).
- Columns remain the existing Filter enrichment shape for **outbound** inventory:

  `Street Address`, `City`, `State`, `Postal Code`

- Existing 5k multi-sheet XLSX / CSV-zip can remain as secondary controls (not removed in v1 unless UI is cluttered; no functional change required beyond keeping one-file CSV as the obvious primary).

### Implementation note

Reuse `buildDownloadAll` / `rowsToCsv` / `toAddressExportRow` in `lib/bridge-export.js` and `lib/bridge-list-store.js`. Prefer labeling the primary button for the Geocodio workflow; do not change the 4 outbound column set without a separate decision.

---

## 2. Geocodio section (UI)

Place **below** the SCAN HISTORY panel on Filter (`bridge.html`).

### Upload

- Accept `.csv` / `.xlsx`.
- Auto-detect columns via existing alias patterns (street, city, state, zip / postal).
- Require at least a street column; city/state improve match quality when present.
- Button: **Start Geocodio clean**.
- Show progress while job runs: processed / total, kept (full match) count, current key index (e.g. “Key 3 of 11 · 1,204 / 2,500 today”).

### Downloads list

- Table under the upload area.
- Columns: date/time, source filename, input rows, kept rows, status (`queued` / `running` / `complete` / `failed` / `partial`), actions (Download when complete, Delete optional).
- **Retention:** keep last **10** jobs; older completed jobs deleted (files + metadata). Failed jobs count toward retention.
- Download serves the cleaned CSV only (not the raw upload).

### Tracker control

- Button: **API key usage** (or similar).
- Opens a modal (see §5).

---

## 3. Job processing (server)

### Input

Parse uploaded file to rows: `{ street, city, state, zip? }`. Build Geocodio query as structured components when possible (`street`, `city`, `state_province`, `postal_code`), else single-line `q`.

### Key rotation

- Load ordered key list from env (11 keys).
- Each key has a **daily capacity of 2,500** lookups.
- Assign work in order: fill key 0 up to remaining capacity for today, then key 1, etc.
- Within a key, use Geocodio **batch** endpoint (`POST /v2/geocode`) in sub-batches (e.g. 100–500 addresses per HTTP request) until that key’s remaining daily budget is 0 or the job finishes.
- Each address = **1 lookup** (no field appends in v1 → keeps math equal to row count).
- If Geocodio returns a daily-limit / over-quota error for a key: mark that key **exhausted for today**, stop using it, continue with next key.
- If all keys are exhausted mid-job: mark job `partial` if any rows kept, else `failed`; surface message “Daily free tier exhausted across all keys — resume tomorrow or add capacity.”

### Output mapping (Geocodio → CSV)

Use the **best (first) result** per query. Map from Geocodio v2 `address_components` (and `address_lines` as fallback for street):

| Output column | Geocodio source |
|---------------|-----------------|
| `Street Address` | Prefer `address_lines[0]` if non-empty; else compose `number` + `formatted_street` (or number + predirectional + street + suffix + postdirectional) |
| `City` | `address_components.city` |
| `State` | `address_components.state_province` |
| `Zip Code` | `address_components.postal_code` (US 5-digit preferred; strip to 5 if ZIP+4 unless full is desired — **use returned postal_code as Geocodio provides**, typically 5-digit for US) |

**Include row only if** all four output fields are non-empty after trim.  
Do **not** fall back to original input values.

### Storage

```
data/geocodio/
  usage.json          # daily ledger (see §5)
  jobs/
    {jobId}/
      meta.json       # status, counts, timestamps, source name
      input.csv       # optional retain for debug; can omit in v1
      result.csv      # cleaned 4-column file
```

Jobs are scoped like Filter lists (per Phuglee user if multi-user; single-operator local deploy still works).

### Concurrency

- One active Geocodio job per user at a time (queue or reject second start with clear error).
- Job runs in-process on the Node server (same pattern as other long Filter work). Progress polled via `GET /api/bridge/geocodio/jobs/:id`.

---

## 4. API surface

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/bridge/geocodio/jobs` | Multipart upload; create + start job |
| `GET` | `/api/bridge/geocodio/jobs` | List recent jobs (last 10) |
| `GET` | `/api/bridge/geocodio/jobs/:id` | Job status + counts |
| `GET` | `/api/bridge/geocodio/jobs/:id/download` | Download `result.csv` when complete/partial |
| `DELETE` | `/api/bridge/geocodio/jobs/:id` | Optional manual delete |
| `GET` | `/api/bridge/geocodio/usage` | Tracker modal data (accounts, keys, remaining) |

Auth: same session / Phuglee user gates as other `/api/bridge/*` routes.

---

## 5. Usage tracker (accurate remaining)

### Why self-ledger

Geocodio documents **2,500 free lookups/day per account**, reset at midnight in the **account timezone**. Dashboard shows remaining, but the public REST API does **not** expose a “remaining lookups” endpoint. Accuracy for this product is therefore:

1. **Authoritative for Distress OS traffic:** every lookup we submit is counted on that key’s ledger before/after the request.
2. **Hard sync on Geocodio rejection:** if the API reports daily limit exceeded, set `used = 2500`, `remaining = 0`, `exhausted = true` for that calendar day.
3. **Honest limitation:** usage of the same key outside this app (dashboard spreadsheet upload, another tool) is **not** visible until Geocodio rejects a call; the modal should note “Counts lookups made through Phuglee/Distress OS. External use is detected when Geocodio blocks the key.”

### Daily reset

- Store usage keyed by **UTC date string in a fixed timezone**: default `America/Phoenix` (AZ operator base), overridable via `GEOCODIO_USAGE_TZ`.
- On first access each day, roll ledgers: if stored `day` ≠ today’s date in that TZ, set `used = 0`, `exhausted = false`.
- Capacity constant: `GEOCODIO_DAILY_LIMIT=2500` (default 2500).

### Ledger shape (`usage.json`)

```json
{
  "timezone": "America/Phoenix",
  "day": "2026-07-11",
  "dailyLimit": 2500,
  "keys": [
    {
      "id": "k0",
      "email": "imcashingdeals@aol.com",
      "keyFingerprint": "…aaae",
      "used": 1204,
      "exhausted": false,
      "lastError": null
    }
  ]
}
```

Full API keys are **not** stored in `usage.json` (only env). Modal receives full key from env at response time for display (operator-requested).

### Modal UI

- Title: **Geocodio API usage**
- Refresh button re-fetches `GET .../usage`
- Table rows per account:

  | Account email | API key | Used today | Remaining | Status |
  |---------------|---------|------------|-----------|--------|
  | … | full key text (monospace, copy button optional) | 1204 | 1296 | OK / Exhausted |

- Footer totals: sum remaining across keys (e.g. “14,296 lookups left today across 11 keys”).
- Short note about free-tier 2,500/day and OS-tracked accuracy.

### Security

- Keys live in server env only (gitignored `.env` / Railway variables). Never commit.
- `GET /api/bridge/geocodio/usage` returns full keys **only** to authenticated operators (same as Filter). Document that anyone with Filter access can see keys in the modal.
- Do not log full keys in server logs; log fingerprint (last 4) only.
- Operator-provided keys in chat must be installed into env at deploy time — not hardcoded in source.

### Env configuration

```bash
# Comma-separated, same order
GEOCODIO_API_KEYS=key1,key2,...
GEOCODIO_API_ACCOUNTS=email1@x.com,email2@y.com,...
GEOCODIO_DAILY_LIMIT=2500
GEOCODIO_USAGE_TZ=America/Phoenix
```

Emails are labels for the modal only; length should match keys (pad/truncate with clear warning in logs if mismatch).

---

## 6. Error handling

| Case | Behavior |
|------|----------|
| No keys configured | UI disabled; message to set env |
| Invalid/empty upload | 400, no job |
| Geocodio network error | Retry once; then fail chunk or job with message |
| Daily limit on key | Exhaust key; rotate |
| All keys exhausted | Partial result if any kept rows |
| Job crash / server restart | Job marked failed; no auto-resume in v1 (re-upload) |
| Download before complete | 409 |

---

## 7. Testing

- Unit: map Geocodio fixture → 4 columns; drop incomplete rows.
- Unit: rotation math (2500 boundary, multi-key, exhausted skip).
- Unit: usage day rollover in fixed TZ.
- Integration: mock Geocodio HTTP; job complete → CSV download headers/columns.
- UI smoke: section visible under SCAN HISTORY; modal lists N keys when env set.

---

## 8. Explicit non-goals (v1)

- Writing results back into SCAN HISTORY or Analyzer.
- Geocodio field appends (census, etc.).
- Parallel multi-job processing.
- Auto-resume after server restart.
- Scraping Geocodio dashboard for usage.
- Changing Analyzer import pipeline.

---

## 9. Implementation order (for planning)

1. Env key loader + usage ledger + unit tests.
2. Geocodio client (batch + map + limit detection).
3. Job store + API routes.
4. Filter UI: section, upload, progress, downloads.
5. Tracker modal.
6. SCAN HISTORY primary export label/affordance for single bulk CSV.
7. Wire keys into local `.env` and Railway vars (ops step; no secrets in repo).

---

## Approval record

- Download-only cleaned files under Geocodio section: **yes**
- Drop incomplete geocodes: **yes**
- Output columns from Geocodio fields only: **yes**
- Multi-key rotate every 2500: **yes**
- Usage tracker modal with account + key + remaining: **yes** (this revision)
- Job retention: **last 10** (default unless changed later)
