# GSD — City List Requests (Form Forge)

Get Shit Done tracking for portal registry import, submission tracking, and UI.

## Workflow

1. **Milestone** — ranked work items with status, dependencies, and success criteria (`milestones/`)
2. **Plan** — bite-sized implementation plan per phase (`plans/`)
3. **Execute** — implement plan task-by-task, verify, commit
4. **Close** — mark phase `done`, note follow-ups

## Milestones

| ID | Name | Status |
|----|------|--------|
| [M1](./milestones/M1-portal-registry-tracking.md) | Portal Registry & Submission Tracking | `complete` |
| [M2](./milestones/M2-coverage-map-revamp.md) | Coverage Map Revamp | `complete` |
| [M4](./milestones/M4-city-tracker-upgrade.md) | City Tracker, Filter & Request PDFs Upgrade | `complete` |
| [M5](./milestones/M5-coverage-map-experience-upgrade.md) | Coverage Map Experience Upgrade | `complete` |
| [M6](./milestones/M6-unified-heat-design.md) | Unified Heat Design (Distress OS v1.1) | `in_progress` |

**Active:** M6 — Heat reskin + global nav (parent: `distress-os` v1.1)

**Milestone M1 complete** — all 5 phases shipped  
**Milestone M2 complete** — Coverage Map Revamp (Phases 1–4)  
**Milestone M4 complete** — City Tracker upgrade (Phases 1–5)  
**Milestone M5 complete** — Coverage Map showcase polish (Phases 1–3)

**M5 Phase 1:** [visitor-city-card](../plans/2026-07-05-m5-phase1-visitor-city-card.md) ✓  
**M5 Phase 2:** [map-interaction-polish](../plans/2026-07-05-m5-phase2-map-interaction-polish.md) ✓  
**M5 Phase 3:** [visual-polish-verify](../plans/2026-07-05-m5-phase3-visual-polish-verify.md) ✓ ([QA SUMMARY](../plans/2026-07-05-m5-phase3-visual-polish-verify-SUMMARY.md))

**M4 Phase 1:** [fix-broken-and-speed](../plans/2026-07-04-phase1-fix-broken-and-speed.md) ✓  
**M4 Phase 2:** [filter-ux-polish](../plans/2026-07-04-phase2-filter-ux-polish.md) ✓  
**M4 Phase 3:** [request-pdfs-workflow](../plans/2026-07-04-phase3-request-pdfs-workflow.md) ✓  
**M4 Phase 4:** [performance-architecture](../plans/2026-07-04-phase4-performance-architecture.md) ✓  
**M4 Phase 5:** [quality-accessibility](../plans/2026-07-04-phase5-quality-accessibility.md) ✓

**M2 Phase 1:** [progressive-map-ux](../plans/2026-07-04-phase1-progressive-map-ux.md) ✓  
**M2 Phase 2:** [selection-density](../plans/2026-07-04-phase2-selection-density.md) ✓  
**M2 Phase 3:** [data-accuracy](../plans/2026-07-04-phase3-data-accuracy.md) ✓  
**M2 Phase 4:** [premium-polish](../plans/2026-07-04-phase4-premium-polish.md) ✓

**Phase 1:** [portal-registry-import](../plans/2026-07-04-phase1-portal-registry-import.md) ✓  
**Phase 2:** [merge-pdf-queue](../plans/2026-07-05-phase2-merge-pdf-queue.md) ✓  
**Phase 3:** [submission-logging](../plans/2026-07-05-phase3-submission-logging.md) ✓  
**Phase 4:** [portal-tracker-ui](../plans/2026-07-05-phase4-portal-tracker-ui.md) ✓  
**Phase 5:** [export-excel](../plans/2026-07-05-phase5-export-excel.md) ✓

## Plan naming

```
docs/gsd/plans/YYYY-MM-DD-<phase-slug>.md
```

## Project paths

- **Tool:** `C:\Users\brand\Projects\city-list-requests`
- **Run:** `python run_review_portal.py`
- **Excel source:** `C:\Users\brand\Desktop\Online City Portal Forms.xlsx`