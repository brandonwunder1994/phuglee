# Phase 2 — Merge PDF Queue into Registry

**Goal:** Unified `portal-registry.json` with 454 portal + 135 PDF cities (~589 total).

## Tasks
1. `build_pdf_city_record()` + `merge_pdf_queue_into_registry()` in `portal_registry.py`
2. `scripts/merge_pdf_queue.py` — merge `review-queue.json` → registry
3. Auto-log PDF save as `email_pdf` submission in `save_tracker.py`
4. Portal Tracker: pathway filter + PDF city detail + editor link
5. Tests for merge logic