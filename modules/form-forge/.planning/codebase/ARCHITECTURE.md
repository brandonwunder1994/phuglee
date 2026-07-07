# Architecture

**Analysis date:** 2026-07-05

## Pattern

**Local monolith** — single Flask process serving API + static UI, JSON-on-disk persistence, no external database.

## Layers

**Presentation (static + routes)**
- `review_portal/app.py` — HTTP routes, thin handlers
- `review_portal/static/` — Records Desk, City Tracker, Request PDFs, Coverage Map

**Domain / workflows**
- `portal_registry.py` — City data model, import, validation, tracker inclusion rules
- `submission_tracker.py` — Submission logging, KPIs, queues, city payloads
- `apology_email.py` — One-time apology resend queue
- `email_workflow.py` / `email_only_workflow.py` — Gmail send paths
- `request_status.py` — Cooldown and channel availability

**PDF pipeline**
- `raw_upload.py` → `fillable_detect.py` → `layout_store.py` → `pdf_save.py` → `pdf_date_update.py`
- `save_tracker.py` — Desktop mirror + manifest

**Infrastructure**
- `data_guard.py` — Atomic writes, snapshots, integrity checks
- `api_errors.py` — Sanitized API error responses
- `gmail_client.py` — OAuth + send

## Key data flows

```
Excel import → portal-registry.json
Editor save → forms/user-filled/ + review-queue.json + manifest
City Tracker → /api/portal/cities/summary (light) → /api/portal/city/{id} (detail on demand)
Email send → Gmail API → submission-log.jsonl → registry submissions[]
```

## Performance design

- City list uses **summary payload** (~22% size of full cities API)
- Full city detail fetched on selection only
- Single apology queue read shared across all tracker rows per request
- Map uses pre-built `coverage-map-bootstrap.json`