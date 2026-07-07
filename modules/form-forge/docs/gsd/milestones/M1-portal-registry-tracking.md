# M1 — Portal Registry & Submission Tracking

> **Status:** `complete`
> **Created:** 2026-07-04  
> **Base:** Form Forge PDF editor shipped (111/135 PDFs completed)  
> **Excel source:** `Online City Portal Forms.xlsx` (458 rows, 454 unique cities)

---

## Goal

Import the online portal city list from Excel into Form Forge, then track every request submission (online portal or emailed PDF) and response in one place — visible in a Portal Tracker tab and on the Coverage Map.

---

## Context

| Dataset | Count | Purpose today |
|---------|-------|---------------|
| Excel portal cities | 458 rows / 454 unique | Online portals, water shutoff + CV Jun 8 tracking |
| PDF editor queue | 135 cities | Download/fill/email PDF forms |
| Overlap | 0 | Separate city universes — merge in Phase 2 |

**Decisions locked:**
- Portal Tracker = new tab in Form Forge (not a separate app)
- Import historical Excel statuses as-is; log new submissions going forward
- Request types: `water_shutoff`, `code_violation`
- Duplicate rows: auto-merge, keep row with most filled data

---

## Phases

| Phase | Name | Delivers | Status |
|-------|------|----------|--------|
| **1** | Portal registry import | `portal-registry.json` + import report | `complete` |
| 2 | Merge PDF queue | Unified registry, PDF editor unchanged | `complete` |
| 3 | Submission logging | `submission-log.jsonl` + log actions | `complete` |
| 4 | Portal Tracker UI + map | New tab, filters, portal pins on map | `complete` |
| 5 | Export to Excel | Round-trip spreadsheet export | `complete` |

**Phase 1 plan:** [2026-07-04-phase1-portal-registry-import.md](../plans/2026-07-04-phase1-portal-registry-import.md) ✓  
**Phase 3 plan:** [2026-07-05-phase3-submission-logging.md](../plans/2026-07-05-phase3-submission-logging.md) ✓  
**Phase 4 plan:** [2026-07-05-phase4-portal-tracker-ui.md](../plans/2026-07-05-phase4-portal-tracker-ui.md) ✓  
**Phase 2 plan:** [2026-07-05-phase2-merge-pdf-queue.md](../plans/2026-07-05-phase2-merge-pdf-queue.md) ✓  
**Phase 5 plan:** [2026-07-05-phase5-export-excel.md](../plans/2026-07-05-phase5-export-excel.md) ✓

---

## Phase 2 success criteria

- [x] `merge_pdf_queue.py` merges 135 PDF cities into registry (588 total)
- [x] PDF paths and statuses preserved on each `pdf` block
- [x] Overlapping cities become `hybrid` (3 cities)
- [x] PDF save auto-logs `email_pdf` submission
- [x] Portal Tracker shows PDF cities with pathway filter + editor link

## Phase 5 success criteria

- [x] `export_portal_registry.py` writes Excel to Desktop
- [x] Export includes original columns + PDF status + submission columns
- [x] 588 rows exported successfully

---

## Phase 4 success criteria

- [x] `/portal` loads with all 454 cities
- [x] Filters (state, CV status) and search work
- [x] One-click log submission from UI
- [x] Map shows portal (cyan) + completed PDF (gold) pins — 565 total
- [x] Nav consistent across Records Desk, Portal Tracker, Coverage Map

---

## Phase 3 success criteria

- [x] `submission-log.jsonl` captures every logged event with timestamp
- [x] Online submit logged via CLI and API
- [x] Email submit logged with recipient + optional PDF path
- [x] Response logging updates city status in registry
- [x] Re-importing Excel does not wipe submission history
- [x] All tests pass (15); PDF editor unchanged

---

## Phase 1 success criteria

- [x] `scripts/import_portal_registry.py` reads Desktop Excel and writes `data/portal-registry.json`
- [x] 454 unique cities imported (4 duplicates merged with warning)
- [x] `CO` normalized to `Colorado`; emails extracted from URL column
- [x] Water + CV statuses preserved from Excel; blanks → `pending`
- [x] `data/import-report.json` lists warnings (duplicates, bad URLs, notes)
- [x] Import is idempotent (re-run safe; does not wipe future submission data)
- [x] Unit tests pass for normalization helpers

---

## Out of scope (Phase 1)

- Portal Tracker UI
- Map pins for portal cities
- Merging PDF queue (Phase 2)
- Submission logging (Phase 3)
- Changing `review-queue.json` or PDF editor behavior