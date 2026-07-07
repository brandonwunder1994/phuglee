# Phase 1 — Fix Broken Stuff + Speed

> **Milestone:** M4 · **Status:** `complete`
> **Depends on:** M1 portal tracker
> **Goal:** Fix real bugs, cut API load time, align polish. Exit: audits pass, page feels fast.

---

## Tasks

| # | Task | Files | Done |
|---|------|-------|------|
| 1.1 | Batch `load_apology_queue()` once per cities API call | `apology_email.py`, `submission_tracker.py`, `app.py` | [x] |
| 1.2 | Index submission log once; stop O(n²) turnaround scan | `submission_tracker.py`, `app.py` | [x] |
| 1.3 | Filter/selection desync — clear or re-select when filtered out | `portal.js` | [x] |
| 1.4 | Request PDFs: fix skip index + month-aware progress bar | `request-pdfs.js` | [x] |
| 1.5 | `escHtml` in city list; sync CSS cache versions; `PDFs` label | `portal.js`, `portal.html`, `request-pdfs.html` | [x] |
| 1.6 | Audit scripts use dynamic apology city from queue | `scripts/audit_portal_readonly.py`, `scripts/audit_portal_browser_readonly.py`, `scripts/check_request_pdfs_page.py` | [x] |

---

## 1.1 — Batch apology queue

**Problem:** `apology_email_payload()` called `load_apology_queue()` up to 3× per city → ~1,600 file reads.

**Fix:**
- Add optional `queue: dict | None` param to `show_apology_button`, `apology_sent_at`, `apology_email_payload`
- `portal_city_payload(..., apology_queue=...)` passes preloaded queue
- `api_portal_cities` loads queue once, passes to all payloads

---

## 1.2 — Turnaround index

**Problem:** `compute_city_average_turnaround(registry=registry)` re-scanned full submission log for each of 556 cities.

**Fix:**
- Add `build_events_by_city(registry, log_path)` → `dict[str, list[dict]]`
- `collect_city_submission_events` accepts optional `events_by_city`
- `api_portal_cities` builds index once

**Target:** `/api/portal/cities` < 300ms

---

## 1.3 — Filter desync

**Problem:** User filters list; selected city hidden; detail panel still shows old city.

**Fix:** After `filteredCities()`, if `selectedId` not in results:
- If results exist → `selectCity(items[0].id)`
- Else → clear detail panel (`detail-empty` visible, `selectedId = null`)

---

## 1.4 — Request PDFs skip + progress

**Skip:** `currentIndex += 1` on skip (clamp to queue length).

**Progress:** Use month-aware formula:
```
doneThisMonth = total_sent_this_month + sentThisSession
totalForMonth = doneThisMonth + activeQueue.length
pct = doneThisMonth / totalForMonth
```

---

## 1.5 — Polish

- `renderList()`: wrap `city.city`, `city.state` in `escHtml()`
- `portal.html`: `Request PDF's` → `Request PDFs`; bump `portal.js` cache version
- `request-pdfs.html`: `portal.css?v=16` to match tracker

---

## 1.6 — Audit scripts

- `audit_portal_readonly.py`: pick first city from `apology-email-queue.json` pending list for button logic test
- `audit_portal_browser_readonly.py`: dynamic apology + non-apology city IDs from API
- `check_request_pdfs_page.py`: assert card visible + pending > 0, not hardcoded subtitle "111"

---

## Verification

```powershell
cd C:\Users\brand\Projects\city-list-requests
python scripts/audit_portal_readonly.py
python scripts/audit_portal_browser_readonly.py
python scripts/check_request_pdfs_page.py
python -c "from review_portal.app import app; import time; c=app.test_client(); t=time.time(); r=c.get('/api/portal/cities'); print(round((time.time()-t)*1000), 'ms', r.status_code)"
```

**Exit criteria:** All scripts pass; cities API < 300ms; manual spot-check filter + skip.