---
phase: 14
slug: results-data-views
status: approved
shadcn_initialized: false
preset: inherits Phase 11 — shadcn zinc dark (warm stone)
created: 2026-06-30
---

# Phase 14 — UI Design Contract

> Results & data views: segmented filters, prominent search, calm lead cards/table, deferred bulk edit. Inherits Phase 11 tokens + Phases 12–13 shell/workflow. No new design system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (inherits `public/css/tokens.css`) |
| Preset | Phase 11 calm stone — **no new colors** |
| Component library | none — native overflow pattern from Phase 12 sidebar |
| Icon library | Existing view-toggle SVGs |
| Font (display) | Newsreader 600 — results section title only |
| Font (body) | IBM Plex Sans 400/600 — filters, search, card text |
| Font (mono) | JetBrains Mono 400 — sort label, bulk count |

**Phase 14 rule:** Restyle results toolbar, cards, table, bulk edit only. Do not touch modals/review overlay (Phase 15). No changes to virtual scroll algorithm or tier/save logic.

---

## DATA-01 — Segmented Filter Toolbar

### Current → Target

| Current | Target |
|---------|--------|
| 6 pill buttons + lead type select in one row | Segmented: **All · Distressed · Needs Review · More▾** |
| All filters always visible | Secondary tiers in overflow menu |
| Toolbar wraps on 1280px | Single filter row at 1280px |

### Primary segment (always visible)

| # | `data-filter` | Label |
|---|---------------|-------|
| 1 | `all` | All |
| 2 | `distressed` | Distressed |
| 3 | `review` | Needs Review |
| 4 | — | **More** (toggle, not a filter) |

### Overflow menu (`#filterOverflowMenu`)

| `data-filter` | Label |
|---------------|-------|
| `well_maintained` | Well Maintained (no emoji) |
| `vacant` | Vacant Lot/Land |
| `blurred` | Blurred Imagery |

Plus `#leadTypeFilter` select moved into overflow.

**Preserve:** All 6 `.filter-btn[data-filter]` elements in DOM — primary 3 visible in segment; secondary 3 in overflow menu. `setFilter()` and `updateFilterLabels()` unchanged.

### Layout at 1280px

```
┌─ Distress Rankings (42) ──────────────────── [Cards|Table] [Edit] ─┐
│ [Search name, address, phone…                    ]  Newest first   │
│ [ All | Distressed | Needs Review | More ▾ ]                      │
└───────────────────────────────────────────────────────────────────┘
```

---

## DATA-02 — Prominent Search

| Element | Style |
|---------|-------|
| `#resultSearch` | Full-width primary row; 14px body; `--card` bg; `1px solid var(--border)`; min-height 44px |
| `#resultSortLabel` | Subtle text only — no box border; `--muted-foreground`; 12px mono; right-aligned beside search |
| Focus ring | `var(--ring)` — no copper/neon glow |

Search row is **row 1** of results chrome (above filter segment).

---

## DATA-03 — Calm Lead Cards

### Hierarchy (top → bottom)

1. **Address** — primary line (`card-address` 14px 600)
2. **Tier badge** — single quiet badge (drop category badge from card face unless review)
3. **Thumbnail** — 16:9, flat border, no score float overlay on thumb
4. **Name + meta** — muted secondary (`card-name` 12px `--muted-foreground`)

### Remove/quiet on cards

| Remove/quiet | Reason |
|--------------|--------|
| `TARGET #N` rank badge on thumb | HUD theater |
| `REVIEW` neon badge on thumb | Use tier badge only |
| `.card-score-float` on thumb | Move score to subtle text in meta row OR hide on card (table retains score) |
| Gradient card backgrounds | Flat `--card` + tier left border only |
| Hover lift `-4px` | Flat hover: border-color only (unless `body.legacy-hud`) |
| Emoji in well-maintained filter label | Calm copy |

### Card structure target

```html
<div class="prop-card" data-key="...">
  <div class="card-body card-body-calm">
    <div class="card-address">142 Oak St, Brunswick GA</div>
    <div class="card-badges-calm">
      <span class="tier-badge">Distressed</span>
    </div>
  </div>
  <div class="card-thumb">...</div>
  <div class="card-meta-calm">
    <div class="card-name">John Smith</div>
    <div class="card-meta-row">Level 7 · uploaded date</div>
  </div>
</div>
```

**Virtual scroll:** Keep `VIRTUAL_ROW_HEIGHT`, `renderVirtualCards`, `initVirtualScroll` logic unchanged. If card height changes, update `VIRTUAL_ROW_HEIGHT` constant only (document in plan).

---

## DATA-04 — Bulk Edit Mode

| Current | Target |
|---------|--------|
| `#bulkSelectToggleBtn` label "☑ Bulk edit" | **Edit** (toggle) |
| `#bulkEditBar` visible when mode on | Unchanged behavior — calm styling only |
| Bar always styled loud | Flat `--muted` bar; no gradient |

**Entry:** User clicks **Edit** → `setBulkSelectMode(true)` → bar appears. **Done** or toggle off exits.

---

## DATA-05 — Calm Table View

| Property | Value |
|----------|-------|
| Header | Flat `--card`; no neon borders |
| Rows | `--card` / `--secondary` zebra optional; tier badges match card style |
| Hover | `--muted` background — no glow |
| Bulk column | Hidden until `body.bulk-select-mode` (existing pattern) |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Bulk toggle | **Edit** |
| Bulk toggle (active) | **Done editing** or keep **Edit** with active state |
| Overflow toggle | **More** |
| Overflow toggle (open) | **More** (chevron ▴) |
| Search placeholder | **Search name, address, phone, email… (press /)** |
| Sort label default | **Newest first** |
| Well Maintained filter | **Well Maintained** (no ✨) |
| Bulk hint (idle) | **Select leads, then mark tier or category** |

---

## DOM ID Preservation (critical)

```
resultsWrap, results-toolbar (class may change), resultCount,
filter-btn (all 6 data-filter values), leadTypeFilter,
bulkSelectToggleBtn, bulkEditBar, bulkEditCount, bulkEditHint,
bulkSelectAllBtn, bulkClearBtn, bulkTierDistressedBtn,
bulkTierWellMaintainedBtn, bulkCatVacantBtn, bulkCatPropertyBtn, bulkDoneBtn,
resultSearch, resultSortLabel, view-btn (data-view), cardsView, tableView,
cardsGrid, resultsBody, resultsLoadMore, resultsLoadMoreBtn, resultsLoadMoreHint
```

**New IDs allowed:**
`filterOverflowToggle`, `filterOverflowMenu`, `filterSegmented`, `resultsSearchRow`, `resultsFilterBar`

---

## Phase 14 Deliverables Checklist

1. `index.html` — search-first header, segmented filters, overflow menu
2. `app.css` — segmented control, calm cards/table, bulk bar, search prominence
3. `render.js` — `buildPropCard` calm hierarchy HTML
4. `session.js` / `app.js` — overflow toggle wiring; filter active sync for More
5. `review.js` — `FILTER_LABELS.well_maintained` remove emoji (if not done in HTML)
6. **No virtual scroll algorithm changes** beyond optional `VIRTUAL_ROW_HEIGHT` tweak
7. `npm test` passes (78 tests)

**Out of scope (Phase 15):** Settings/upload modals, property inspector, review overlay.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS — search focal point; card address-first hierarchy
- [x] Dimension 3 Color: PASS — tier semantics preserved; accent only on Edit active/search focus
- [x] Dimension 4 Typography: PASS — 12/14px body; display for section title only
- [x] Dimension 5 Spacing: PASS — 44px touch targets on segment and search
- [x] Dimension 6 Registry Safety: PASS — no third-party registries

**Approval:** approved 2026-06-30

## UI-SPEC COMPLETE