# Phase 3 — Submission Logging

> **For agentic workers:** Implement task-by-task. Check boxes as you go.  
> **Milestone:** M1 Portal Registry & Submission Tracking  
> **Phase:** 3 of 5  
> **Depends on:** Phase 1 complete (`portal-registry.json` exists)

**Goal:** Log every new request submission (online portal or emailed PDF) and city response — with timestamps — so you never lose track of what was sent and when.

**Architecture:** Append-only `submission-log.jsonl` (audit trail) + sync summary into each city's `submissions[]` in `portal-registry.json`. Flask API endpoints for logging; minimal CLI for use before Phase 4 UI exists. PDF save hook deferred to Phase 2 merge.

**Why Phase 3 before Phase 2:** Portal cities (454) have zero overlap with the PDF queue (135). Submission logging works on the imported registry now. Phase 2 (merge PDF queue) can follow without blocking this.

**Tech stack:** Python 3.12, Flask (existing), `data_guard.append_jsonl` + `write_json_atomic`

---

## What Phase 3 delivers

| You can… | How |
|----------|-----|
| Log an online portal submit | API or CLI: city + request type + channel |
| Log an emailed PDF send | API or CLI: city + email + optional PDF path |
| Record a city response | API or CLI: update water/CV status |
| See submission history per city | `submissions[]` on each registry city + full JSONL log |

**Not in Phase 3:** Portal Tracker UI (Phase 4), map pins (Phase 4), PDF queue merge (Phase 2), auto-log on PDF save (Phase 2).

---

## Files to create / modify

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `review_portal/submission_tracker.py` | Log events, sync registry, load/query |
| Create | `scripts/log_submission.py` | CLI for logging without UI |
| Create | `tests/test_submission_tracker.py` | Unit tests |
| Create | `data/submission-log.jsonl` | Generated append-only log |
| Modify | `review_portal/app.py` | Portal registry + submission API routes |
| Modify | `review_portal/portal_registry.py` | `load_registry()`, `find_city()`, `save_registry()` |
| Modify | `review_portal/data_guard.py` | Protect `submission-log.jsonl` in snapshots |

---

## Data model

### Submission log entry (`submission-log.jsonl`)

One JSON object per line — never edited, only appended.

```json
{
  "event_id": "20260705-143022-arizona-marana",
  "logged_at": "2026-07-05T14:30:22.123456+00:00",
  "city_id": "arizona-marana",
  "city": "Marana",
  "state": "Arizona",
  "request_type": "code_violation",
  "channel": "online_portal",
  "action": "submitted",
  "portal_url": "https://marana.seamlessdocs.com/f/recordsrequest",
  "email": "",
  "pdf_path": "",
  "notes": ""
}
```

```json
{
  "event_id": "20260705-150000-arizona-carefree",
  "logged_at": "2026-07-05T15:00:00.000000+00:00",
  "city_id": "arizona-carefree",
  "city": "Carefree",
  "state": "Arizona",
  "request_type": "code_violation",
  "channel": "email_pdf",
  "action": "submitted",
  "portal_url": "",
  "email": "PublicRecords@Carefree.org",
  "pdf_path": "forms/user-filled/Arizona/arizona-carefree.pdf",
  "notes": "Emailed filled PDF"
}
```

```json
{
  "event_id": "20260706-090000-arizona-marana",
  "logged_at": "2026-07-06T09:00:00.000000+00:00",
  "city_id": "arizona-marana",
  "city": "Marana",
  "state": "Arizona",
  "request_type": "code_violation",
  "channel": "online_portal",
  "action": "response_received",
  "response_status": "yes",
  "response_raw": "Yes",
  "notes": ""
}
```

### Allowed values

| Field | Values |
|-------|--------|
| `request_type` | `water_shutoff`, `code_violation` |
| `channel` | `online_portal`, `email_pdf` |
| `action` | `submitted`, `response_received` |
| `response_status` | Same enums as Phase 1 (`pending`, `yes`, `denied`, …) |

### City `submissions[]` summary (in registry)

Denormalized copy of recent events for fast Phase 4 UI. Keep last **20** per city.

```json
{
  "event_id": "20260705-143022-arizona-marana",
  "logged_at": "2026-07-05T14:30:22+00:00",
  "request_type": "code_violation",
  "channel": "online_portal",
  "action": "submitted"
}
```

When `action == response_received`, also update `requests.{request_type}.response_status` and `response_raw` on the city record.

---

## API routes (new)

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/portal/cities` | List all 454 cities with submission summary |
| `GET` | `/api/portal/city/<id>` | Single city detail + submissions |
| `POST` | `/api/portal/city/<id>/submit` | Log online portal submission |
| `POST` | `/api/portal/city/<id>/email` | Log emailed PDF submission |
| `POST` | `/api/portal/city/<id>/response` | Record city response |
| `GET` | `/api/portal/submissions` | Recent log entries (default limit 100) |

### POST body examples

**`/submit`**
```json
{
  "request_type": "code_violation",
  "notes": "Submitted 30-day grass/trash request"
}
```

**`/email`**
```json
{
  "request_type": "code_violation",
  "email": "PublicRecords@Carefree.org",
  "pdf_path": "forms/user-filled/Arizona/arizona-carefree.pdf",
  "notes": ""
}
```

**`/response`**
```json
{
  "request_type": "water_shutoff",
  "response_status": "yes",
  "response_raw": "YES",
  "notes": ""
}
```

All POST routes return `{ "ok": true, "event": {...}, "city": {...} }`.

---

## CLI usage (for daily workflow before UI)

```powershell
cd C:\Users\brand\Projects\city-list-requests

# Log online portal submit
python scripts/log_submission.py submit arizona-marana --type code_violation

# Log emailed PDF
python scripts/log_submission.py email arizona-tolleson --type code_violation --email policerecords@tolleson.az.gov

# Record response
python scripts/log_submission.py response arizona-marana --type code_violation --status yes --raw "Yes"
```

---

## Tasks

### Task 1: Registry load/save helpers

**Files:**
- Modify: `review_portal/portal_registry.py`

Add:

```python
def load_registry() -> dict: ...
def save_registry(data: dict) -> None: ...  # uses write_json_atomic
def find_city(registry: dict, city_id: str) -> dict | None: ...
def city_index(registry: dict) -> dict[str, dict]: ...
```

**Acceptance:** Can load 454 cities and find by id in Python shell.

---

### Task 2: Submission tracker module

**Files:**
- Create: `review_portal/submission_tracker.py`

Implement:

```python
LOG_PATH = ROOT / "data" / "submission-log.jsonl"
MAX_CITY_SUBMISSIONS = 20

def make_event_id(city_id: str) -> str: ...
def log_submission(city_id, request_type, channel, *, email="", pdf_path="", notes="") -> dict: ...
def log_response(city_id, request_type, response_status, *, response_raw="", notes="") -> dict: ...
def append_event(entry: dict) -> dict: ...
def sync_city_submissions(registry: dict, city_id: str, event: dict) -> None: ...
def read_recent_submissions(limit: int = 100) -> list[dict]: ...
def city_submission_summary(city: dict) -> dict: ...  # last_submitted_at, last_channel, count
```

**Rules:**
- Validate `city_id` exists in registry before logging
- Validate `request_type` and `channel` enums
- On `log_submission` with `online_portal`: auto-fill `portal_url` from city record
- On `log_response`: update `requests.{type}` on city + append log
- Re-import (`import_portal_registry.py`) must not wipe `submissions[]` — already handled by `merge_into_existing`

**Acceptance:** Module importable; functions callable from tests.

---

### Task 3: Unit tests

**Files:**
- Create: `tests/test_submission_tracker.py`

| Test | Verifies |
|------|----------|
| `test_log_online_submission` | Event written, city `submissions[]` updated |
| `test_log_email_submission` | `channel == email_pdf`, email stored |
| `test_log_response_updates_registry` | `requests.code_violation.response_status` changes |
| `test_unknown_city_raises` | Invalid id rejected |
| `test_invalid_request_type_raises` | Bad enum rejected |
| `test_submissions_capped_at_20` | Oldest dropped when over limit |

Use a temp registry fixture — do not mutate production `portal-registry.json` in tests.

**Acceptance:** `python -m pytest tests/test_submission_tracker.py -v` — all pass

---

### Task 4: Flask API routes

**Files:**
- Modify: `review_portal/app.py`

Add routes listed above. Import from `submission_tracker` and `portal_registry`.

`GET /api/portal/cities` response shape:

```json
{
  "total": 454,
  "items": [
    {
      "id": "arizona-marana",
      "city": "Marana",
      "state": "Arizona",
      "pathway": "online",
      "portal_url": "https://...",
      "contact_email": "",
      "requests": { "...": "..." },
      "submission_count": 2,
      "last_submitted_at": "2026-07-05T14:30:22+00:00",
      "last_channel": "online_portal"
    }
  ]
}
```

**Acceptance:** Server starts; `curl http://127.0.0.1:8787/api/portal/cities` returns 454 items.

---

### Task 5: CLI script

**Files:**
- Create: `scripts/log_submission.py`

Subcommands: `submit`, `email`, `response`

Prints confirmation:
```
Logged online_portal submission for Marana, Arizona (code_violation)
Event: 20260705-143022-arizona-marana
```

**Acceptance:** CLI logs a test event against a real city id; appears in `submission-log.jsonl`.

---

### Task 6: Data guard + verify

**Files:**
- Modify: `review_portal/data_guard.py`

- [ ] Add `submission-log.jsonl` to `PROTECTED_COPY_PATTERNS`
- [ ] Add to `create_full_snapshot` copy list

**Acceptance:**
- `python scripts/verify_data_integrity.py` passes
- Snapshot includes `submission-log.jsonl`

---

### Task 7: Close phase

- [ ] Run all tests: `python -m pytest tests/ -v`
- [ ] Log one real test submission via CLI, verify in JSONL + registry
- [ ] Confirm re-import preserves submissions: `python scripts/import_portal_registry.py`
- [ ] Update M1 milestone: Phase 3 → `complete`

---

## Phase 3 success criteria

- [x] `submission-log.jsonl` captures every logged event with timestamp
- [x] Online submit logged in under 10 seconds via CLI or API
- [x] Email submit logged with recipient + optional PDF path
- [x] Response logging updates city status in registry
- [x] Re-importing Excel does not wipe submission history
- [x] All tests pass; PDF editor unchanged

---

## What comes after Phase 3

| Phase | What it adds |
|-------|--------------|
| **4** | Portal Tracker tab + map pins (uses these APIs) |
| **2** | Merge 135 PDF cities; auto-log on PDF save |
| **5** | Export everything back to Excel |

**Recommended next after Phase 3:** Phase 4 (UI) — you'll finally see and click through all 454 cities.

---

## Execution handoff

**Plan saved.** Options:

1. **Execute Phase 3 now** — build tracker module, APIs, CLI
2. **Adjust plan** — e.g. add auto-log on PDF save in this phase
3. **Skip to Phase 4** — build UI first, add logging endpoints alongside