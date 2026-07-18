# Government Lists → Operator Data Console — Design Spec

**Date:** 2026-07-18
**Status:** Approved (direction: dense virtualized table · merge duplicates · bulk actions)
**Surface:** `/government-lists` (Sources tab). County Playbooks tab unchanged.

## Problem

The Sources view renders ~9,823 sources as thousands of stacked "place" cards.
It reads like a spreadsheet dump, not a working database:

- **Duplicate places.** Two data sources use different conventions —
  `research_verified` uses `City, County, ST`; `form_forge` uses
  `City, <Full State Name>` with no county. So the same city appears twice
  (`Abilene, Taylor, TX` **and** `Abilene, Texas`) and the State filter lists
  both `TX` and `Texas` (69 "states" for 50 states + territories).
- **Cards at the wrong scale.** 3,820 of 4,393 places have exactly 2 lists
  (code + water). The page is a wall of chunky 2-row cards — huge scroll,
  low density.
- **No sorting, no windowing.** "Show more" pages 80 places at a time; you
  can't sort by state/status/recency and the DOM isn't virtualized.
- **Redundant signals.** Each row shows the method text *and* a badge saying
  the same thing.
- **No shareable state.** Filters/search aren't in the URL.
- **No bulk actions.** Can't select rows to copy emails, export, or hand off.

## Data model (unchanged on disk)

Catalog: `public/data/government-lists/catalog.json` (mirror `data/government-lists/catalog.json`).
Each non-playbook source: `id, listType, city, county, state, url, method,
cadence, notes, requestTemplate, contactEmail, verifyStatus, lastVerified,
source, priority`. Playbooks come from `/api/gov-playbooks`.

Counts (2026-07-18): non-playbook 9,823 · methods portal 4,474 / request 2,501 /
email 2,136 / pdf 657 · verifyStatus verified 6,074 / email_only 1,771 /
pdf_only 752 / unverified 1,226 · url 91% · email 36%.

## Solution — operator data console

Replace the card wall with a **dense, virtualized, sortable table** driven by a
sticky command toolbar and a facet rail. No disk/data mutations — all
normalization happens at render time.

### 1. Place de-duplication + state normalization (render-time, pure)

New pure module `public/js/gov-lists-normalize.js` (works in browser + node):

- `normalizeState(value)` → 2-letter code. Maps full US state/territory names
  to codes, upper-cases existing 2-letter codes, returns the trimmed original
  when unknown.
- `mergeSources(sources, listTypePriority)` → collapses rows that represent the
  **same list at the same place**. Merge key = `city|normState|listType`
  (falls back to `county|normState|listType` when city is empty). On collision,
  keep the row with the strongest `verifyStatus`
  (`verified > pdf_only > email_only > unverified`) and backfill missing
  `county`, `contactEmail`, `url`, `notes`, `requestTemplate`, `lastVerified`
  from the other. Output each row carries a normalized 2-letter `state`.
- Exposed as `window.GLNormalize` (browser) and `module.exports` (node tests).

### 2. Virtualized table

- Fixed-height rows (compact, one list per row). A scroll viewport with a
  spacer element sized to `rows * rowHeight`; only the visible window (+ overscan)
  is rendered on scroll. Target: smooth scroll over all 9.8k rows.
- Columns: **select** · **Place** (`City, County, ST`) · **List** · **Method** ·
  **Status** · **Contact** · **Verified**. Row click opens the detail drawer.
- Sticky column header; click a header to sort (toggle asc/desc). Sort keys:
  place, list, method, status, verified.
- Kill method/badge redundancy: method is its own column; Status is a single
  badge that folds verify state + "needs email".

### 3. Command toolbar + facet rail + URL state

- Toolbar: instant search (`/` focuses), sort indicator, **active-filter chips**
  (each removable), live "N sources · M places" count, density is compact.
- Rail (deduped): list-type toggles with counts, normalized State select,
  Method select, Status select, quick toggles (Needs email / Has email /
  Verified only), Clear.
- URL querystring mirrors `q, type, state, method, status, sort, dir, tab` so a
  filtered view is shareable and back-button friendly.

### 4. Bulk actions

- Header checkbox selects all filtered rows; per-row checkboxes. A sticky bulk
  bar appears when ≥1 selected: **N selected · Copy emails · Export CSV ·
  Start requests · Clear**.
  - **Copy emails** → unique `contactEmail`s of selected → clipboard; toast the
    count and how many had no email.
  - **Export CSV** → downloads selected rows (place, type, method, status, url,
    email, verified, notes) as a CSV blob.
  - **Start requests** → if all selected share a workflow, open the right desk
    (code/water → `/collect`, pre_lien → `/pre-liens`); otherwise copy a
    tab-separated worklist and toast to route per row. (No batch API exists;
    this is the honest handoff.)

### 5. Detail drawer (kept, extended)

Right-side drawer (below table on mobile): list type, method, cadence, URL,
email (or "needs email" note), notes, request template with copy, and the
existing handoffs — Open source, Collect, Pre-liens, Filter, County playbook.

### 6. Keyboard

`/` focus search · ↑/↓ move the active row · Enter open drawer · Esc close
drawer / clear selection.

## Visual language

Inherit `.vault-page` tokens (dark earth surface `#121212`, cream ink `#f5f2e4`,
ember `#e58435`, gold `#eeb746`). Gold reserved for active/selected/verified.
Mono (`JetBrains Mono`) for counts, codes, dates. Body text ≥4.5:1 contrast.
No side-stripe borders, no gradient text, no glass. Table over cards (cards are
the wrong affordance at this scale).

## States

- **Loading:** skeleton rows in the viewport; count shows "Loading…".
- **Empty:** "No sources match — clear the state filter or search a county."
  with a Clear-filters action.
- **Error:** toast + count "Catalog failed to load"; playbooks still work.

## Motion

Row hover/active and drawer open are short transform/opacity transitions on the
`--gl-ease` curve. No layout-property animation on scroll (virtualization must
stay 60fps). Full `prefers-reduced-motion` fallback (instant).

## Responsive

- ≥1024px: sticky rail (16rem) + table; drawer docks right (22rem) when open.
- ≤768px: rail collapses into a filter sheet/stack; table becomes a horizontal
  scroll region *inside* its wrapper (never page-level overflow); inputs 16px;
  drawer stacks below; touch targets ≥44px.

## Files

- Create: `public/js/gov-lists-normalize.js` (pure normalize/merge)
- Rewrite (Sources side): `public/js/government-lists-app.js`
- Rewrite (major): `public/css/government-lists.css`
- Modify: `public/government-lists.html` (Sources panel markup; add normalize
  script; bump `?v=8`). County Playbooks panel untouched.
- Extend: `tests/government-lists.test.js` (unit tests for normalize/merge)

## Constraints

- No data-file mutations; normalization is render-time only.
- Preserve County Playbooks tab, `/api/gov-playbooks` behavior, research
  progress strip, and all handoffs/templates.
- Keep catalog path, script/style filenames, and the `/data/government-lists/catalog.json`
  fetch (test depends on them).
- Ship to prod via git → `origin/main` (GitHub auto-deploy); do not wipe user data.

## Success criteria

1. Each real place appears once; State facet shows normalized 2-letter codes only.
2. All ~9.8k rows scroll smoothly (virtualized), sortable by every column.
3. Search + facets + sort are reflected in the URL and restore on reload.
4. Bulk select → copy emails, export CSV, and start-requests handoff work.
5. Playbooks tab, handoffs, and templates still work; tests pass;
   local live + mobile verify pass; prod serves the new UX (proven).
