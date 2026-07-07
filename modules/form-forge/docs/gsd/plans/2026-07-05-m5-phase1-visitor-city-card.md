# M5 Phase 1 — Visitor City Card

> **Milestone:** M5 · **Depends on:** M3 (MapLibre map shipped)
> **Goal:** Redesign the city sidebar card as a clean coverage showcase — what data exists here, not internal workflow state.

## Architecture

Keep lazy detail fetch (`/api/coverage/city/<id>`) for portal URLs and PDF paths. Change **presentation only** in `map.html`, `map.js`, `map.css`. No API schema changes required; existing fields are enough.

## Deliverables

| # | Item | Files |
|---|------|-------|
| 1 | Card HTML structure | `map.html` — coverage badge, availability list, single CTA area |
| 2 | Visitor copy in JS | `map.js` — rewrite `renderCityDetail()` |
| 3 | Card styling | `map.css` — badge, availability list, demoted footer |
| 4 | Remove ops clutter | `map.js` / `map.html` — hide editor, tracker, submission log on map card |

## Task 1: HTML structure

**Modify:** `review_portal/static/map.html` — `#sidebar-city` article

Replace city detail body with:

```html
<p class="city-kicker" id="city-kicker"></p>
<h2 id="city-title"></h2>
<p class="coord-badge" id="city-coord-badge" hidden></p>

<span class="coverage-badge" id="city-coverage-badge"></span>

<ul class="coverage-available" id="city-available" aria-label="Available data types"></ul>

<p class="city-status-line" id="city-status-line"></p>

<div class="city-actions city-actions-showcase">
  <a class="btn seal" id="link-portal" href="#" target="_blank" rel="noopener" hidden>View government portal</a>
  <a class="btn ghost" id="link-pdf" href="#" target="_blank" rel="noopener" hidden>View completed form</a>
</div>

<p class="city-card-footer" id="city-card-footer">Part of Form Forge public records coverage</p>
```

Remove `#city-saved`, `#city-status`, `#link-editor`, `#link-tracker` from map card (or leave in DOM hidden — prefer delete for clarity).

Hide `#city-coord-badge` on showcase card (exact/approx coords are internal; remove `setCoordBadge` call or gate it off).

## Task 2: `renderCityDetail()` rewrite

**Modify:** `review_portal/static/map.js`

Logic:

```javascript
function renderCityDetail(city) {
  const isPortal = city.pin_type === "portal";
  const county = city.county && city.county !== "Unknown County" ? city.county : null;

  $("#city-kicker").textContent = county ? `${city.state} · ${county}` : city.state;
  $("#city-title").textContent = city.city;

  const badge = $("#city-coverage-badge");
  badge.textContent = isPortal ? "Online Portal" : "Records Form";
  badge.className = `coverage-badge ${isPortal ? "is-portal" : "is-form"}`;

  const avail = $("#city-available");
  avail.innerHTML = "";
  if (isPortal) {
    appendAvail(avail, "Code violation lists");
    appendAvail(avail, "Water shutoff lists");
  } else {
    appendAvail(avail, "Public records requests (FOIA)");
  }

  $("#city-status-line").textContent = isPortal
    ? "Active data source"
    : "Records access established";

  const portalUrl = city.url || city.portal_url || "";
  const portalLink = $("#link-portal");
  portalLink.href = portalUrl || "#";
  portalLink.hidden = !(isPortal && portalUrl);

  const pdfLink = $("#link-pdf");
  pdfLink.href = city.pdf_path ? `/api/file/${city.pdf_path}` : "#";
  pdfLink.hidden = !city.pdf_path;
  if (!isPortal && city.pdf_path) {
    pdfLink.textContent = "View completed form";
  }
}
```

Helper `appendAvail(ul, text)` creates `<li>` items.

Do **not** render: `submission_count`, `last_submitted_at`, CV/water response_status, editor/tracker links.

## Task 3: CSS

**Modify:** `review_portal/static/map.css`

Add:

- `.coverage-badge` — pill, gold border for portal, muted cream for form
- `.coverage-available` — simple list with check or dot markers in brand green
- `.city-status-line` — muted, single line
- `.city-card-footer` — 0.68rem uppercase muted, margin-top auto
- `.city-actions-showcase` — single column, max one primary + one ghost visible

Match existing `--gold-bright`, `--muted`, `--display` tokens.

## Task 4: Verify

Manual:
- Click portal city (e.g. Ohio) → badge "Online Portal", two availability lines, portal link works
- Click completed form city → badge "Records Form", FOIA line, PDF link if path exists
- No submission/tracker/editor UI visible on card

## must_haves

1. City card answers: where, what type of access, what lists available
2. No internal ops jargon on the map page
3. Stamp-theme visual consistency preserved