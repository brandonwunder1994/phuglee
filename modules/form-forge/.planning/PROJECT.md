# The Form Forge

## What This Is

A local Flask application for real-estate FOIA workflows: fill city PDF forms, track portal submissions, email completed requests, and visualize geographic coverage across 554+ cities.

## Core Value

One tool to go from blank city PDF → filled form → emailed request → tracked response, without juggling spreadsheets, Gmail, and file folders manually.

## Requirements

### Must have (shipped)

- PDF form editor with layout save and desktop mirror
- Portal registry import from Excel
- City Tracker with submission logging and cooldown rules
- Request PDFs monthly email queue
- Coverage map with completed/portal layers
- Apology resend workflow for corrected PDFs
- GSD verification wrapper (`scripts/gsd.py`)

### In progress (audit)

- Zero known code bugs (Phases 1–4 complete)
- Full test + audit sweep (Phase 5)
- Sidney OH contact email for final apology

### Out of scope (v1)

- Cloud hosting / multi-user auth
- CRM or Google Sheets sync
- SQLite migration

## Status

Brownfield — M1–M4 milestones complete. Entry: `python run_review_portal.py`