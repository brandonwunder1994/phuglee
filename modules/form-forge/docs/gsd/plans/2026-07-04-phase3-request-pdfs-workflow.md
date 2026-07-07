# Phase 3 — Request PDFs Workflow

> **Milestone:** M4 · **Status:** `complete`
> **Depends on:** Phase 1 + 2
> **Goal:** Polish the monthly PDF send workflow — proper dialogs, skip undo, lazy previews.

## Tasks

| # | Task | Files | Done |
|---|------|-------|------|
| 3.1 | Email confirm dialog (replace `prompt()` for single sends) | `request-pdfs.html`, `request-pdfs.js` | [x] |
| 3.2 | Skip undo panel + `sessionStorage` persistence | `request-pdfs.html`, `request-pdfs.js`, `request-pdfs.css` | [x] |
| 3.3 | Lazy PDF thumbnail (placeholder; load in preview dialog only) | `request-pdfs.html`, `request-pdfs.js`, `request-pdfs.css` | [x] |
| 3.4 | Settings menu on Request PDFs page | `request-pdfs.html` | [x] |
| 3.5 | Preserve skip state across reload; smarter empty state | `request-pdfs.js` | [x] |
| 3.6 | Update `check_request_pdfs_page.py` | `scripts/check_request_pdfs_page.py` | [x] |