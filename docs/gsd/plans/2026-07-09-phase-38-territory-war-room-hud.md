# Phase 38 — Territory War-Room HUD

> **GSD:** `/gsd:execute-phase 38`  
> **Milestone:** [M6 Territory Theater](../milestones/M6-territory-theater.md)  
> **Depends on:** Phase 37 (heat palette)

**Goal:** Make the territory section read as a **command display**, not a polite embed — large live counts, glass HUD framing, atmospheric stage around the heat map.

**Architecture:** Restructure only the territory **header + map overlays** in `index.html` + CSS. Keep MapLibre container `#home-coverage-map` and dock IDs intact. Stats still flow through existing `updateCoverageStats` / chip IDs (or migrate IDs carefully with JS updates).

**Tech stack:** HTML structure, CSS (home.css / home-premium / chronicle), existing count-binding JS.

---

## Quality bar

| Pass | Fail |
|------|------|
| City + state counts at display scale (Anton / large clamp) | Only tiny uppercase chips |
| HUD feels ops glass (border, blur, gold edge) | MacOS dots / SaaS card chrome |
| Map is the hero object of the section | Header taller than map |
| Summary line supports, doesn’t dominate | Wall of muted body text above map |
| Same grit as hero (cream/gold on black) | Clean white dashboard panel |
| Mobile stacks cleanly | Overflow / unreadable HUD |

---

## Locked layout (desktop)

```text
┌─ home-territory-head ─────────────────────────────────────┐
│  LIVE COVERAGE (eyebrow)                                   │
│  Territory you can trust          ┌─ HUD pill strip ─────┐ │
│  summary line (muted, 1 line)     │ 560 CITIES  10 STATES │ │
│                                   └──────────────────────┘ │
└────────────────────────────────────────────────────────────┘
┌─ home-territory-stage (monitor bezel) ─────────────────────┐
│  ┌─ map ─────────────────────────────────────────────────┐ │
│  │  [corner marks]                        [LIVE · REC]   │ │
│  │                                                       │ │
│  │              << heat choropleth US >>                 │ │
│  │                                                       │ │
│  │  [legend: Live / Soon / Blocked]                      │ │
│  └───────────────────────────────────────────────────────┘ │
│  coverage-dock (unchanged behavior this phase)             │
└────────────────────────────────────────────────────────────┘
```

**Copy locks (keep unless clearly weak):**
- Eyebrow: `Live coverage`
- Title: `Territory you can trust` (optional stronger alt only if phase needs it: `Territory under watch` — default keep current)
- HUD meta: `LIVE · PUBLIC RECORDS` (small, tracked)

---

## Markup target (illustrative)

Replace tiny chips-as-only-proof with a **HUD stats block**. Preserve IDs used by JS:

```html
<header class="home-territory-head">
  <div class="home-territory-head-copy">
    <p class="phuglee-eyebrow">Live coverage</p>
    <h2 class="home-chapter-title home-chapter-title--sm" id="home-territory-title">Territory you can trust</h2>
    <p class="home-territory-summary" id="home-map-summary">Loading coverage…</p>
  </div>
  <div class="home-territory-hud" aria-label="Coverage totals">
    <div class="home-territory-hud-stat">
      <strong id="home-chip-cities">—</strong>
      <span>cities</span>
    </div>
    <div class="home-territory-hud-stat">
      <strong id="home-chip-states">—</strong>
      <span>states</span>
    </div>
    <p class="home-territory-hud-meta">Live · Public records</p>
  </div>
</header>
```

Inside map screen (overlays):

```html
<div class="home-territory-corners" aria-hidden="true">
  <span class="home-territory-corner home-territory-corner--tl"></span>
  <span class="home-territory-corner home-territory-corner--tr"></span>
  <span class="home-territory-corner home-territory-corner--bl"></span>
  <span class="home-territory-corner home-territory-corner--br"></span>
</div>
<span class="home-territory-live-badge">Live</span>
<!-- keep legend + scanline -->
```

Remove or empty old `.home-territory-chips` once HUD owns `#home-chip-cities` / `#home-chip-states`.

**JS note:** `home-coverage.js` `updateCoverageStats` already targets those IDs — keep IDs on the new strong elements.

---

## CSS requirements

### Head grid

```css
.home-territory-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem 1.5rem;
  align-items: end;
  margin-bottom: 1.25rem;
}
@media (max-width: 720px) {
  .home-territory-head { grid-template-columns: 1fr; align-items: start; }
}
```

### HUD stats

- Display font on numbers: `var(--font-display)`, `clamp(1.75rem, 4vw, 2.75rem)`
- Label under number: uppercase, 0.62–0.7rem, stone/taupe
- Panel: `rgba(8,12,20,0.75)`, border `rgba(229,132,53,0.28)`, soft gold outer glow
- Meta line: letter-spacing ~0.12em, gold or cream-muted

### Map atmosphere

- Slight radial glow behind US: use `::before` on `.home-territory-screen` with `var(--territory-heat-glow)` (from phase 37) — **pointer-events: none**, z-index under map canvas
- Corner brackets: 14–18px L-shapes, 1px gold/orange border, opacity ~0.55
- Live badge: top-right inside screen, pulse **only if** not reduced-motion; small pill matching signal-feed “Live”
- Bump min-height slightly if needed: map stage should feel substantial (`clamp(380px, 52vw, 520px)` desktop) without dwarfing mobile

### Anti-patterns this phase

- No new equal card row beside the map
- No macOS traffic lights
- No green success dots as primary status (amber/gold live pulse OK)

---

## Files

| Action | Path |
|--------|------|
| Modify | `public/index.html` — territory header + map overlays |
| Modify | `public/css/home.css` — head, HUD, corners, badge, chips removal |
| Modify | `public/css/home-premium.css` — live glow/scan hooks if needed |
| Modify | `public/css/home-chronicle.css` — chapter spacing if HUD needs room |
| Touch only if IDs move | `public/js/home-coverage.js`, `home-below.js` |

---

## Tasks

### Task 1: Markup restructure

- [ ] Implement head copy + HUD grid in `index.html`
- [ ] Move `#home-chip-cities` / `#home-chip-states` onto HUD strongs
- [ ] Add corner marks + live badge inside `.home-territory-screen`
- [ ] Remove obsolete chip strip if redundant

### Task 2: CSS polish

- [ ] Head grid + HUD styles
- [ ] Corner brackets + radial glow under map
- [ ] Live badge (with `@media (prefers-reduced-motion: reduce)` static)
- [ ] Mobile: HUD full-width under title; counts still large enough
- [ ] Ensure dock + map flex layout still works (explorer screen column)

### Task 3: JS sanity

- [ ] Load page — confirm counts populate from coverage API/bootstrap
- [ ] Confirm close proof still updates (phase 41 will fuse; phase 38 must not break `#home-close-proof`)
- [ ] Confirm `is-live` class still applies scanline

### Task 4: Verify

- [ ] Desktop + narrow (~375px) screenshot
- [ ] `npm test` + `scripts/verify-live.ps1`
- [ ] Side-by-side mental check vs hero grit

### Task 5: Commit

```text
feat(home): territory war-room HUD and command-display framing
```

---

## Done when

Visitor’s eye hits **big counts + heat map** first. Section no longer feels like a muted admin widget.

## Out of scope

Ticker feed, dock dossier, entrance cascade, moving close into map (those are 39–41).
