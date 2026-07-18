# Government Lists Redesign — Design Spec

**Date:** 2026-07-17
**Surface:** `/government-lists` (Phuglee Distress OS, product register)
**Type:** Presentation-only redesign. No change to catalog data, playbook API, filter semantics, or Collect/Pre-liens wiring.

## Problem

The page dumps ~9,831 catalog sources as one flat wall of near-identical rows (place + gray mono meta + raw URL). Consequences:

- **Row monotony** — nothing anchors the eye; scanning is exhausting.
- **Duplicated places** — each city/county repeats once per list type (e.g. "Anchorage County, AK" ×4, "Calhoun County, AL" ×5).
- **No orientation** — no sense of what states/counties are covered or how much.
- **Trust invisible** — `verifyStatus` (verified / pdf_only / email_only / unverified) is never surfaced.
- **Weak action path** — actions live in an empty side panel the user must discover.
- **Wasted canvas** — narrow 1100px column in a sea of dead space.

## Users & mental model

Solo wholesaler operators working a market. Mental model: *"What lists can I pull in this place, and how do I fire off the request?"* → design around **place + list type → action**.

## Data (from catalog.json)

- `sources[]`: `id, listType, city, county, state, url, method, cadence, notes, contactEmail, requestTemplate, verifyStatus, wave, isPlaybook`.
- `listTypes[]` (8): pre_lien, code_violation, tax_delinquent, lis_pendens, probate, fire, eviction, water_shutoff (each `id,label,priority,summary`). Note: sources also include `assessor` type rows (175).
- `methods[]` (9): open_data, accela, court, recorder, request, email, manual, portal, pdf.
- Distribution: 4,393 unique places, 620 counties, ~50 real states. verifyStatus: verified 6,074 · pdf_only 752 · email_only 1,771 · unverified 1,234. isPlaybook rows: 8 (how-to, hidden by default).

## Solution — place-grouped directory

### Layout (desktop ≥1024px)
Two-column work surface, max-width ~1320px:

- **Sticky left rail (~260px):** search box; the 8 list types as a vertical single-select toggle list with live counts; State select (with counts); Method select; Verify-status select; "Hide how-to rows" toggle; Clear-all.
- **Main column:**
  - **Orientation strip** — thin restrained inline bar: `Sources N · States N · Counties N · Verified N · PDF N · Email N`. Reflects the *current filtered set*. Not a big-number hero template.
  - **Place-grouped result cards** — one card per place (`city|county|state` key). Header: place label + list count. Body: one compact row per list type available there → `{type label} · {method} · {trust badge} →`. Clicking a list row opens the action drawer.
  - **Show more** pagination over grouped places (page size ~40 places).

### Trust badges
Map `verifyStatus` → badge: `verified` → gold ✓ "Verified"; `pdf_only` → "PDF"; `email_only` → "Email"; `unverified` → muted "Unverified".

### Action drawer (right side, restyle of existing `#gl-detail`)
Selected list shows: type, method, cadence, URL (Open source), email, notes, request template with **Copy request text**, plus existing context actions: → Collect (code_violation/water_shutoff), → Pre-liens (pre_lien), County playbook (county+state), Filter. Close button.

### County playbooks tab
Restyle markup/CSS to match the new system. Form fields, IDs, and the `/api/gov-playbooks` logic in app.js stay byte-identical in behavior.

## Visual language (DESIGN.md tokens)
- Dark earth body, cream text; ember/gold **only** on action, current selection, and verified badge.
- Anton on H1 only (matches other desks); Outfit everywhere else. Fixed rem type scale.
- Full 1px borders (no side-stripes), no gradient text, no decorative glass.
- Second neutral layer for the rail vs content surface.

### States
- Loading: skeleton place cards (no center spinner).
- Empty: teaching copy ("No sources match — clear the state filter or search a county name").
- Error: existing toast + count message ("Catalog failed to load").

### Motion
150–250ms hover/selection/drawer transitions; `@media (prefers-reduced-motion: reduce)` fallback (instant/crossfade). No page-load choreography.

### Responsive
- <1024px: rail collapses to a top filter bar (search + selects); cards full width; drawer becomes a bottom/stacked sheet.
- ≤768px: single column, `font-size:16px` inputs, ≥44px touch targets, no page-level horizontal scroll.

## Files
- `public/government-lists.html` — restructure body (rail + orientation + grouped main + drawer; keep playbooks tab; keep wiring strings `government-lists-app.js`, `government-lists.css`, title "Government Lists"; bump cache versions).
- `public/css/government-lists.css` — full rewrite for the new system.
- `public/js/government-lists-app.js` — grouping, rail counts, verify badges, drawer; playbook logic unchanged.

## Constraints / non-negotiables
- Presentation only; do not alter catalog, playbook API, filter meaning, or Collect/Pre-liens links.
- Keep `tests/government-lists.test.js` green (wiring strings + catalog references).
- Keep accessibility: tablist/tabs, roles, aria-selected, labels; WCAG AA contrast on dark.
- Verify live (`scripts\verify-live.ps1`) + mobile (`scripts\verify-mobile.ps1`) + browser screenshot before claiming done.

## Success criteria
- One card per place; no duplicate place rows.
- Orientation strip + per-type/state counts reflect filters.
- Trust badges visible and correct.
- Drawer actions work (open source, copy template, Collect/Pre-liens/playbook).
- Existing node tests pass; verify-live 200; verify-mobile PASS; no h-scroll ≤768px.
