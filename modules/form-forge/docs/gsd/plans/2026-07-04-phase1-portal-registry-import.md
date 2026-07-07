# Phase 1 — Portal Registry Import

> **For agentic workers:** Implement task-by-task. Check boxes as you go.  
> **Milestone:** M1 Portal Registry & Submission Tracking  
> **Phase:** 1 of 5

**Goal:** Turn `Online City Portal Forms.xlsx` into clean, structured `data/portal-registry.json` inside the project.

**Architecture:** One import script + small normalization module. Excel is import-only; JSON is the source of truth going forward. Re-import merges by `id` without destroying fields added in later phases (`submissions`, etc.).

**Tech stack:** Python 3.12, pandas, openpyxl, existing `data_guard.write_json_atomic`

---

## Files to create / modify

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `review_portal/portal_registry.py` | Normalize helpers, schema builders, merge logic |
| Create | `scripts/import_portal_registry.py` | CLI: read Excel → write JSON + report |
| Create | `tests/test_portal_registry.py` | Unit tests for normalization |
| Create | `data/portal-registry.json` | Generated output (git-tracked) |
| Create | `data/import-report.json` | Generated warnings report |
| Modify | `requirements.txt` | Add `pandas`, `openpyxl` |
| Modify | `review_portal/data_guard.py` | Add `portal-registry.json` to protected patterns |

---

## Data model (`portal-registry.json`)

```json
{
  "version": 1,
  "imported_at": "2026-07-04T...",
  "source_file": "C:\\Users\\brand\\Desktop\\Online City Portal Forms.xlsx",
  "source_rows": 458,
  "city_count": 454,
  "warnings": [],
  "cities": [
    {
      "id": "arizona-marana",
      "city": "Marana",
      "state": "Arizona",
      "pathway": "online",
      "portal_url": "https://marana.seamlessdocs.com/f/recordsrequest",
      "contact_email": "",
      "url_notes": "",
      "form_type": "Online",
      "requests": {
        "water_shutoff": {
          "requested": true,
          "response_status": "yes",
          "response_raw": "YES"
        },
        "code_violation": {
          "requested": true,
          "requested_at": "2026-06-08",
          "response_status": "approved_bad_data",
          "response_raw": "Approved (Bad Data)"
        }
      },
      "submissions": []
    }
  ]
}
```

### Normalization rules

| Excel column | Registry field | Rule |
|--------------|----------------|------|
| City | `city` | Strip whitespace |
| State | `state` | `CO` → `Colorado`; title-case |
| Water Shut Off Requested? | `requests.water_shutoff.requested` | `Yes`/`No` → bool |
| Did they send back water shut offs yet? | `requests.water_shutoff.response_*` | Blank → `pending`; map free-text to enum |
| URL | `portal_url`, `contact_email`, `url_notes` | Extract `https://`; detect `@` emails |
| Code Violation Requested on Jun 8th 2026? | `requests.code_violation.requested` | `Yes` → true |
| CV Sent Back... | `requests.code_violation.response_*` | Blank → `pending`; map to enum |
| Form Type | `form_type` | Pass through (`Online`) |

### Response status enums

**Water:** `pending`, `yes`, `no`, `wont_give`, `not_available`, `redirect`, `unknown`

**Code violation:** `pending`, `yes`, `no`, `denied`, `gave_other_info`, `approved_bad_data`, `approved_parcels`, `request_from_pd`, `they_charge`, `specific_address_only`, `unknown`

### Duplicate merge (4 pairs)

When two rows share the same `id` (city + state slug):
1. Score each row by count of non-null fields
2. Keep higher-scoring row as base
3. Fill gaps from the other row
4. Add warning: `{ type: "duplicate_merged", id, cities: [...] }`

### Slug ID

Reuse existing pattern from `scripts/build_raw_editor_queue.py`:

```python
def slugify(state: str, city: str) -> str:
    raw = f"{state}-{city}".lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
```

---

## Tasks

### Task 1: Dependencies + test scaffold

**Files:**
- Modify: `requirements.txt`
- Create: `tests/test_portal_registry.py`

- [ ] Add to `requirements.txt`:
  ```
  pandas>=2.0.0
  openpyxl>=3.1.0
  ```
- [ ] Run: `pip install pandas openpyxl`
- [ ] Create `tests/test_portal_registry.py` with one failing test importing `slugify` from `portal_registry`

**Acceptance:** `python -m pytest tests/test_portal_registry.py -v` runs (may fail on import)

---

### Task 2: Normalization module

**Files:**
- Create: `review_portal/portal_registry.py`

Implement:

```python
REGISTRY_PATH = ROOT / "data" / "portal-registry.json"
REPORT_PATH = ROOT / "data" / "import-report.json"
DEFAULT_EXCEL = Path(r"C:\Users\brand\Desktop\Online City Portal Forms.xlsx")

EXCEL_COLUMNS = {
    "city": "City",
    "state": "State",
    "water_requested": "Water Shut Off Requested?",
    "water_response": "Did they send back water shut offs yet?",
    "url": "URL",
    "cv_requested": "Code Violation Requested on Jun 8th 2026?",
    "cv_response": "CV Sent Back fomr the June 8th 2026 request?",
    "form_type": "Form Type",
}

def normalize_state(state: str) -> str: ...
def parse_yes_no(value) -> bool | None: ...
def extract_url_and_email(raw: str) -> tuple[str, str, str]: ...  # portal_url, email, notes
def normalize_water_response(raw) -> tuple[str, str]: ...       # status, raw
def normalize_cv_response(raw) -> tuple[str, str]: ...
def slugify(state: str, city: str) -> str: ...
def merge_duplicate_records(records: list[dict]) -> tuple[list[dict], list[dict]]: ...
def build_city_record(row: dict) -> dict: ...
def merge_into_existing(existing: dict | None, incoming: dict) -> dict: ...
```

**Tests to write (all in `tests/test_portal_registry.py`):**

| Test | Input | Expected |
|------|-------|----------|
| `test_normalize_state_co` | `"CO"` | `"Colorado"` |
| `test_parse_yes_no` | `"Yes"`, `"No"`, `None` | `True`, `False`, `None` |
| `test_extract_url_from_free_text` | Tempe-style cell | `portal_url` starts with `https://` |
| `test_extract_email_url` | `policerecords@tolleson.az.gov` | `contact_email` set, `pathway` hint |
| `test_water_response_pending` | `None` | `status == "pending"` |
| `test_cv_response_mapping` | `"Approved (Bad Data)"` | `status == "approved_bad_data"` |
| `test_slugify` | Arizona + Marana | `"arizona-marana"` |
| `test_merge_duplicates` | Two Georgetown DE rows | One record + one warning |

**Acceptance:** `python -m pytest tests/test_portal_registry.py -v` — all pass

---

### Task 3: Import script

**Files:**
- Create: `scripts/import_portal_registry.py`

CLI behavior:

```bash
# Default: read Desktop Excel
python scripts/import_portal_registry.py

# Custom path
python scripts/import_portal_registry.py --excel "C:\path\to\file.xlsx"

# Dry run (report only, no write)
python scripts/import_portal_registry.py --dry-run
```

Steps inside `main()`:
1. Read Excel with pandas
2. Validate expected columns exist (fail with clear message if not)
3. Build city records via `build_city_record`
4. Merge duplicates via `merge_duplicate_records`
5. Load existing `portal-registry.json` if present
6. Merge incoming into existing via `merge_into_existing` (preserve `submissions` array)
7. Write `data/portal-registry.json` via `write_json_atomic`
8. Write `data/import-report.json` with stats + warnings
9. Print summary to stdout

**Stdout summary format:**
```
Imported 454 cities from 458 rows
Warnings: 4 duplicates merged, 11 url_notes, 1 missing url
Wrote data/portal-registry.json
Wrote data/import-report.json
```

**Acceptance:**
- Script runs without error against Desktop Excel
- `data/portal-registry.json` has `city_count: 454`
- `data/import-report.json` lists 4 duplicate warnings
- Re-run produces same city count (idempotent)

---

### Task 4: Protect registry in data guard

**Files:**
- Modify: `review_portal/data_guard.py`

- [ ] Add `"portal-registry.json"` to `PROTECTED_COPY_PATTERNS`
- [ ] Add `"import-report.json"` to snapshot copy list if snapshots iterate data files

**Acceptance:** `python scripts/verify_data_integrity.py` still passes

---

### Task 5: Verification + close phase

- [ ] Run full import: `python scripts/import_portal_registry.py`
- [ ] Spot-check 5 cities in JSON against Excel (Marana, Tolleson, Tempe, Boulder, Asheville)
- [ ] Run tests: `python -m pytest tests/test_portal_registry.py -v`
- [ ] Run integrity: `python scripts/verify_data_integrity.py`
- [ ] Update M1 milestone: Phase 1 checkboxes → done

**Phase 1 done when:** Registry JSON exists, tests pass, import report generated, PDF editor untouched.

---

## What Phase 1 does NOT do

| Not in Phase 1 | Which phase |
|----------------|-------------|
| Show cities in UI | Phase 4 |
| Add map pins | Phase 4 |
| Log submissions | Phase 3 |
| Merge PDF queue | Phase 2 |
| Export back to Excel | Phase 5 |

---

## Execution handoff

**Plan saved.** Two options:

1. **Execute now** — implement Tasks 1–5 in this session
2. **Review first** — adjust schema or normalization rules, then execute