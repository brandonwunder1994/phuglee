# Phase 39 — Live Territory Ticker

> **GSD:** `/gsd:execute-phase 39`  
> **Milestone:** [M6 Territory Theater](../milestones/M6-territory-theater.md)  
> **Depends on:** Phase 38 (HUD stage regions stable)

**Goal:** Make “Live coverage” **feel live** — a continuous, real-data pulse of cities/states under watch, same energy language as the homepage signal feed.

**Architecture:** Build a ticker row list from **real coverage payload** (cities array / state aggregates). Render into a dedicated region on the territory stage (side panel desktop, under-map strip mobile). Animate with CSS (track scroll or staggered fade); no fake city names.

**Tech stack:** Vanilla JS in explorer or small helper, CSS animation, coverage-shared data.

---

## Quality bar

| Pass | Fail |
|------|------|
| Rows use real cities/states from coverage data | Invented addresses or “Sample City” |
| Visible motion when data exists (unless reduced-motion) | Completely static list that looks like Lorem |
| Visual kinship with signal feed rows | Unrelated SaaS activity log |
| Doesn’t block map click / dock search | Overlay steals all pointer events |
| Empty/sparse data degrades gracefully | Broken empty panel or spinner forever |
| Accessible: region labeled; motion optional | Infinite scroll traps focus |

---

## Data rules (honesty)

Source: `coverage.cities` from `PhugleeCoverageShared.fetchCoverageMap()` / explorer `coverage` object.

**Row shape (locked):**

| Field | Source | Example |
|-------|--------|---------|
| Place | `city.city` + state abbrev or name | `Phoenix, AZ` |
| Meta | pin type or county if present | `Portal` / `Live` / county |
| Count context | optional city-level only if available | skip if none |

**Build strategy:**

1. Prefer cities with `pin_type === 'portal'` or completed first; then others.
2. Shuffle or rotate deterministically by day seed optional — or simple cycle of top N by state diversity (max 2 per state in first 24 rows) so ticker doesn’t spam one market.
3. Cap list length: **24–40 rows**, duplicate the list in DOM once for seamless marquee if using track scroll.
4. If `cities.length < 4`: show static compact list, **no marquee** (looks broken with 2 items spinning).

**Never:**

- Fabricate cities not in the payload
- Show timestamps as “2m ago” unless real event timestamps exist (they don’t on coverage map) — use status labels instead: `Live`, `Portal`, `Covered`

---

## Locked UI layout

### Desktop (≥900px)

```text
┌─ monitor ──────────────────────────────────────────────┐
│  map (flex 1)          │  ticker panel (~240–280px)    │
│                        │  SIGNAL · TERRITORY           │
│                        │  Phoenix, AZ · Portal         │
│                        │  Houston, TX · Live           │
│                        │  … scrolling …                │
└────────────────────────┴───────────────────────────────┘
│ dock full width                                        │
```

### Mobile

Ticker becomes a **horizontal or vertical compact strip under map** (max ~120px height), dock below. Do not squeeze map to unreadable width.

---

## Markup target

```html
<aside class="home-territory-ticker" aria-label="Live territory feed" id="home-territory-ticker">
  <div class="home-territory-ticker-head">
    <span class="home-territory-ticker-label">Territory feed</span>
    <span class="home-territory-ticker-status">Live</span>
  </div>
  <div class="home-territory-ticker-viewport">
    <div class="home-territory-ticker-track" id="home-territory-ticker-track" data-home-territory-ticker>
      <!-- rows injected -->
    </div>
  </div>
</aside>
```

Row template:

```html
<div class="home-territory-ticker-row">
  <span class="home-territory-ticker-place">Phoenix, AZ</span>
  <span class="home-territory-ticker-tag home-territory-ticker-tag--portal">Portal</span>
</div>
```

Wire into explorer init after `coverage` loads (same place as `updateSummary`).

---

## Motion

**Default:** vertical marquee — track translates upward, linear, ~40–60s full loop for 24 rows; `animation-play-state: paused` on hover.

**Reduced motion:**

```css
@media (prefers-reduced-motion: reduce) {
  .home-territory-ticker-track {
    animation: none;
    transform: none;
  }
  .home-territory-ticker-viewport {
    overflow-y: auto;
  }
}
```

**Pause when tab hidden:** optional `document.visibilityState` — nice-to-have, not required.

---

## JS placement

Prefer **`home-coverage-explorer.js`** (has coverage already) with a function:

```js
function buildTerritoryTicker(cov) {
  var track = document.getElementById('home-territory-ticker-track');
  if (!track || !cov || !cov.cities) return;
  // build rows… set track.innerHTML
  // if rows.length >= 4, track.classList.add('is-marquee')
}
```

Call from `initExplorer` after coverage fetch (both MapLibre success and consider SVG fallback path: call from a shared point so SVG-only users still see ticker).

If SVG fallback via `home-coverage.js` only: also call ticker builder from `PhugleeCoverage` export after stats update, or dispatch a custom event `phuglee:coverage-ready` — pick **one** path and document it in the commit.

**State abbrev helper:** simple map of full state name → USPS if cities store full names; if they already have `state` as `AZ`, use as-is.

---

## CSS kinship with signal feed

Reuse patterns (not necessarily classes) from `.home-signal-feed-row`:

- Mono-ish time/meta optional; place is cream; tag is pill
- Hot row border/glow using orange alpha
- Dense 0.72–0.8rem type

Do **not** copy macOS chrome.

---

## Files

| Action | Path |
|--------|------|
| Modify | `public/index.html` — ticker shell in territory stage |
| Modify | `public/css/home.css` (or new `public/css/home-territory-ticker.css` if cleaner) |
| Modify | `public/js/home-coverage-explorer.js` — build + mount ticker |
| Possibly | `public/js/home-coverage.js` — ensure fallback path mounts ticker |
| Link CSS | `index.html` if new stylesheet |

---

## Tasks

### Task 1: Stage layout for ticker

- [ ] Add ticker shell markup
- [ ] CSS grid/flex: map + ticker on desktop; stack on mobile
- [ ] Ensure `#home-coverage-map` still receives MapLibre correctly (resize after layout!)

**Critical:** After layout change, call `previewMap.resize()` when map exists (already on load — re-check if container size changes).

### Task 2: Data builder

- [ ] Implement `buildTerritoryTicker(cov)` with real cities only
- [ ] Diversity cap (≤2 per state in first pass)
- [ ] Portal/Live tags from `pin_type`
- [ ] Escape HTML on city/state strings

### Task 3: Motion + a11y

- [ ] Marquee CSS + reduced-motion fallback
- [ ] `aria-label` on aside; decorative animation doesn’t trap keyboard
- [ ] Hover pause

### Task 4: Verify

- [ ] Network: confirm rows match API/bootstrap cities
- [ ] Mobile layout screenshot
- [ ] Map still clickable; dock still works
- [ ] `npm test` + verify-live

### Task 5: Commit

```text
feat(home): live territory ticker from real coverage data
```

---

## Done when

Section has **proof of life**. “Live coverage” is no longer a static atlas.

## Out of scope

State dossier card (40), close fusion (41), fake realtime WebSocket feeds.
