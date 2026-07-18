# Government Lists Data Console — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Government Lists Sources view into a dense, virtualized,
sortable data table with de-duplicated places, URL state, and bulk actions.

**Architecture:** A pure render-time normalize/merge module feeds a virtualized
table + facet toolbar in the existing vanilla-JS app. County Playbooks,
research strip, handoffs, and templates are preserved. No disk data changes.

**Tech Stack:** Vanilla JS (IIFE), CSS (vault tokens), Node test runner.

## Global Constraints

- No data-file mutations; normalization is render-time only.
- Keep fetch URL `/data/government-lists/catalog.json`, script/style filenames.
- Preserve County Playbooks tab + `/api/gov-playbooks`, research progress, all handoffs/templates.
- Gold reserved for active/selected/verified. No side-stripe borders, gradient text, or glass.
- Mobile: no page-level horizontal scroll; inputs 16px; targets ≥44px.
- Ship via git → `origin/main`; never wipe user data.

---

### Task 1: Pure normalize/merge module + tests

**Files:**
- Create: `public/js/gov-lists-normalize.js`
- Test: `tests/government-lists.test.js` (extend)

**Interfaces:**
- Produces: `normalizeState(value) -> string` (2-letter or trimmed original);
  `mergeSources(sources, listTypePriority) -> Array` (deduped rows, each with
  2-letter `state`, county/email/url/notes/template/lastVerified backfilled).
  Both on `window.GLNormalize` and `module.exports`.

- [ ] Step 1: Write failing tests: `normalizeState('Texas')==='TX'`,
  `normalizeState('tx')==='TX'`, `normalizeState('TX')==='TX'`; `mergeSources`
  collapses two rows with same city/state(normalized)/listType into one,
  prefers `verified` over `email_only`, and backfills `county`+`contactEmail`.
- [ ] Step 2: Run `node --test tests/government-lists.test.js` → FAIL (module missing).
- [ ] Step 3: Implement module (US state/territory map, priority order, merge).
- [ ] Step 4: Run tests → PASS.
- [ ] Step 5: Commit.

### Task 2: HTML restructure (Sources panel)

**Files:**
- Modify: `public/government-lists.html`

- [ ] Step 1: Replace the Sources workspace inner markup with: toolbar
  (search, sort select, result count, active-filter chip row), facet rail
  (type toggles, state/method/status selects, quick toggles, clear), table
  region (`gl-table-viewport` with sticky header row + `gl-rows` spacer/body),
  bulk bar, empty state, and the detail drawer. Keep hidden native `gl-type`.
- [ ] Step 2: Add `<script src="/js/gov-lists-normalize.js?v=8">` before the app
  script; bump `government-lists.css` and `government-lists-app.js` to `?v=8`.
- [ ] Step 3: Leave the County Playbooks panel markup untouched.
- [ ] Step 4: Run `node --test tests/government-lists.test.js` → PASS (HTML checks).
- [ ] Step 5: Commit.

### Task 3: App rewrite — table, sort, virtualization, URL state

**Files:**
- Modify: `public/js/government-lists-app.js`

- [ ] Step 1: On load, `mergeSources` the catalog; build normalized facets.
- [ ] Step 2: Implement filter → sort → virtualized render (fixed row height,
  visible-window slice on scroll + overscan; spacer sets total height).
- [ ] Step 3: Wire toolbar/rail/chips + read/write URL querystring
  (`q,type,state,method,status,sort,dir,tab`); restore on load.
- [ ] Step 4: Keyboard (`/`, ↑/↓, Enter, Esc); row click → drawer with handoffs.
- [ ] Step 5: Keep playbooks, research strip, templates intact. Commit.

### Task 4: Bulk actions

**Files:**
- Modify: `public/js/government-lists-app.js`

- [ ] Step 1: Row + header checkboxes; selection set survives scroll.
- [ ] Step 2: Bulk bar: Copy emails (unique, toast counts), Export CSV (blob
  download), Start requests (route by shared workflow or copy worklist), Clear.
- [ ] Step 3: Commit.

### Task 5: CSS rewrite + responsive + verify

**Files:**
- Modify: `public/css/government-lists.css`

- [ ] Step 1: Toolbar, chips, rail, table (sticky header, compact rows, zebra
  on hover, active/selected states), bulk bar, drawer; reduced-motion + mobile.
- [ ] Step 2: `scripts\restart.ps1` → `scripts\verify-live.ps1` (health 200).
- [ ] Step 3: `scripts\verify-mobile.ps1 -Pages "/government-lists"` (exit 0).
- [ ] Step 4: `node --test tests/government-lists.test.js` → PASS.
- [ ] Step 5: Browser screenshots (desktop table, drawer open, bulk bar, mobile). Commit.

## Self-Review

- Spec coverage: dedupe (T1), table+sort+virtualization+URL (T3), bulk (T4),
  toolbar/rail/chips (T2/T3/T5), drawer+handoffs (T3), states+responsive (T5),
  tests (T1/T5). Playbooks preserved (T2/T3).
- Type consistency: `normalizeState`/`mergeSources` names used identically in T1/T3.
