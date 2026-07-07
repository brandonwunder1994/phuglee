# M4 — City Tracker, Filter & Request PDFs Upgrade

> **Status:** `complete`
> **Created:** 2026-07-04
> **Depends on:** M1 (portal tracker shipped), M2 (map revamp)
> **Base:** City Tracker at `/portal`, Request PDFs at `/portal/request-pdfs`

---

## Goal

Fix broken UX, speed up page load, polish the filter button and Request PDFs workflow, and improve long-term maintainability.

---

## Context

| Metric | Value | Implication |
|--------|-------|-------------|
| Tracker cities | 556 | Full list API was ~1s due to per-city log scans |
| Pending PDF queue | 111 | Monthly email workflow is active workload |
| Apology pending | ~108 | Most queue items need apology email first |

**User-reported / audit pain:**
- Filter hides selected city but detail panel stays visible
- Request PDFs skip/progress misleading
- City Tracker loads slowly
- Request PDFs uses browser prompts vs polished Tracker dialogs
- No clear filters / result count

---

## Phases

| Phase | Name | Delivers | Status |
|-------|------|----------|--------|
| **1** | Fix broken + speed | API perf, filter desync, skip/progress, polish, audit scripts | `complete` |
| **2** | Filter UX polish | Result count, clear filters, active count, quick chips | `complete` |
| **3** | Request PDFs workflow | Email dialog, month progress, skip undo, lazy PDFs | `complete` |
| **4** | Performance & architecture | Light list API, detail on demand, shared JS | `complete` |
| **5** | Quality & accessibility | Keyboard nav, E2E tests, error toasts, URL filters | `complete` |

Plans: `docs/gsd/plans/2026-07-04-phase1-fix-broken-and-speed.md` (and phases 2–5 as we go)

---

## Success criteria (milestone)

### Phase 1
- [x] `/api/portal/cities` < 300ms (now ~40ms, was ~1083ms)
- [x] Filter no longer leaves ghost city in detail panel
- [x] Request PDFs skip marks cities done; progress reflects month
- [x] `PDFs` label fixed; `escHtml` in city list
- [x] Audit scripts pass with dynamic apology fixture

### Phase 2
- [x] Search debounced; "N of 556" shown
- [x] Clear filters + active filter count
- [x] Quick filter chips work

### Phase 3
- [x] Request PDFs uses email confirm dialog (no `prompt()`)
- [x] Skip undo panel
- [x] Lazy PDF thumbnails

### Phase 4
- [x] Light cities list + detail on demand (`/api/portal/cities/summary` + `/api/portal/city/{id}`)
- [x] `portal-shared.js` extracted; actions merge detail via `applyCityUpdate`

### Phase 5
- [x] Keyboard city list nav (↑↓ Home End, j/k)
- [x] Playwright E2E with dynamic fixtures (keyboard, URL filters, toasts)
- [x] URL-persisted filters (`q`, `state`, `pathway`, `cv`, `quick`, `city`)
- [x] Auto-dismiss error/success toasts via `portal-shared.js`