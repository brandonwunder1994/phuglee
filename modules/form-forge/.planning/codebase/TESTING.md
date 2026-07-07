# Testing

**Analysis date:** 2026-07-05

## Unit tests (pytest)

```powershell
python scripts/gsd.py test
```

**100 tests** across 12 modules:

| Module | Covers |
|--------|--------|
| `test_portal_registry.py` | Import, slugify, email validation, tracker rules |
| `test_submission_tracker.py` | Logging, KPIs, queues, apology consistency |
| `test_apology_email.py` | Apology queue + send flow |
| `test_contact_email_wrong.py` | Wrong/invalid email hard stops |
| `test_request_status.py` | Cooldown and channel status |
| `test_email_only.py` | Email-only city detection |
| `test_coverage_data.py` | Map payload and geojson |
| `test_merge_export.py` | PDF queue merge + Excel export |
| `test_api_errors.py` | Error sanitization + app handler |
| `test_product_ideas.py` | Ideas feature |
| `test_api_integration.py` | API contracts, perf budget, security paths |
| `test_request_pdfs_e2e.py` | Request PDFs Playwright E2E (pytest) |

## Readonly audits

```powershell
python scripts/gsd.py audit
```

| Script | What it checks |
|--------|----------------|
| `audit_portal_readonly.py` | API payloads, DOM wiring, button logic |
| `audit_email_only_cities.py` | Email-only pathway consistency |
| `check_request_pdfs_page.py` | Request PDFs UI (Playwright + embedded server) |

## Browser audit (requires live server on 8787)

```powershell
python run_review_portal.py   # separate terminal
python scripts/audit_portal_browser_readonly.py
```

## Data integrity

```powershell
python scripts/gsd.py verify-data
```

Checks 111 PDFs ↔ manifest ↔ layouts alignment.

## Performance budget

```powershell
python scripts/gsd.py perf
python scripts/gsd.py verify
```

Summary payload must stay under 50% of full cities payload (currently ~22%).

`verify` runs the full sweep: structure → lint → test → perf → data → audit → GSD health.