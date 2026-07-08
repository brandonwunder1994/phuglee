# Analyze Page Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Phuglee Analyze page (`/analyzer`) into three clear sections — Scan, Global KPIs, Historical Search — with a premium, low-clutter UI consistent with Filter and the Distress OS shell.

**Architecture:** Reorganize `modules/property-analyzer/public/index.html` into a vertical stack of three panels. Reuse existing scan/review/export engines unchanged; add thin UI layers for scan-ready header, distilled KPI cards (`.bridge-kpi` pattern), upgraded location hub with upload-date chips and scoped KPIs, and a property-by-property live scan feed. Move admin Settings out of the sidebar into the shell user dropdown. Remove import/upload chrome from the main page (data arrives from Filter via bridge push).

**Tech Stack:** Vanilla JS (PDA.env pattern), Node test runner (`npm test`), Phuglee/Heat CSS tokens (`phuglee-components`, `bridge-kpi`, `glass`), Distress OS shell (`settings-menu.js`, `shell-nav.js`).

**Milestone:** New item under M4 — `docs/gsd/milestones/M4-phuglee-signature-brand.md` (Analyze surface polish)

**Supersedes (partially):** Location Hub spec `docs/superpowers/specs/2026-07-08-analyze-location-hub-design.md` — hub remains but is folded into Section 3 with upload-date filter + local KPIs.

---

## Global Constraints

- **Preserve scan, review, export, tier engines** — no changes to `scan.js`, review overlay paths, `lib/tier-engine.js`, or `lib/export-schema.js` beyond additive filters.
- **No spreadsheet upload on main page** — remove empty-state upload CTA; keep backup restore in ⌘K / overflow for edge cases only.
- **KPI visual language** — match Filter page `.bridge-kpi` grid (`public/css/bridge.css`), not legacy `.command-kpi` bento.
- **Admin-only Settings** — API Keys + AI Brain visible only when `PhugleeSettings.isAdmin()` (`phuglee_session === 'admin'`).
- **Upload date filter** — chip list of actual import dates for selected city/state; no calendar picker.
- **impeccable commands for implementation:** `distill` (remove layers), `layout` (3-section hierarchy), `polish` (token alignment).

---

## Page Audit (Current State)

**Surface:** `modules/property-analyzer/public/index.html` — served embedded at `/analyzer` with `analyzer-embedded` body class and Distress OS top nav.

| Zone | Current | Problem |
|------|---------|---------|
| Empty workspace | "Import your bridged list" + Upload spreadsheet | Redundant — Filter pushes data; feels like a second import step |
| Command bar | Brand + status + Start/Stop | Duplicates scan CTA; competes with section hierarchy |
| Progress (`#progressSection`) | % bar + done/remaining/workers + fail stats + scan log toggle | Passive; layered with agent grid |
| Agent grid (`#agentGridPanel`) | 8 worker cards (AGT-01…) | Technical, not property-focused |
| Scan Summary (`#summarySection`) | 3 hero KPIs + pipeline bar + 3 secondary KPIs | 6+ metrics, nested cards, inconsistent with Filter KPIs |
| Location hub (`#locationHub`) | State rows + city chips (implemented) | Good foundation; missing upload-date filter, local KPIs, export in context |
| Dashboard (`#dashboard`) | Distress Rankings + tier filters + cards/table | Title "Lead Rankings" duplicates sidebar; export only in sidebar |
| Sidebar | Overview · Lead Rankings · Review · More (Settings + Export) | Cluttered; Settings too broad; Export should live in results context |
| Settings | Sidebar overflow → API Keys, AI Brain | Should be admin-only in shell dropdown |

**Existing assets to reuse:**
- `lib/import-meta.js` — `deriveImportLocation()`, `countUnscannedLeads()` for Scan section
- `lib/location-index.js` + `public/js/location-hub.js` — state/city index (extend for records + upload dates)
- `public/css/app.css` — `.scan-feed-panel` styles (not wired in HTML)
- `public/js/session.js` — `updateAgentSlot`, `scanPreview` — feed data source
- Filter `.bridge-kpi` pattern — premium KPI reference

**Gap — upload dates:** Records lack `importedAt`. Bridge push sets session `savedAt` only. Need per-batch `importedAt` on new records + `importBatches[]` on session for chip labels.

---

## Target Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Distress OS shell nav (unchanged)                               │
├──────────┬──────────────────────────────────────────────────────┤
│ Sidebar  │  SECTION 1 — SCAN READY                              │
│ Overview │  Cheyenne, Wyoming · 312 leads        [Start Scan]   │
│ Review ▾ │  (most recent import from Filter / pending queue)      │
│          ├──────────────────────────────────────────────────────┤
│          │  SECTION 2 — GLOBAL KPIs (session-wide, minimal)       │
│          │  [Distressed] [Needs Review] [Scanned]               │
│          ├──────────────────────────────────────────────────────┤
│          │  SECTION 3 — HISTORICAL SEARCH                         │
│          │  State ▾  City ▾  Upload dates: [Jul 6] [Jun 28] …   │
│          │  ── Local KPIs (scoped to selection) ──                │
│          │  [Distressed] [Review] [Total]                         │
│          │  Distress Rankings … [Export CSV] [Export Excel]       │
│          ├──────────────────────────────────────────────────────┤
│          │  (while scanning) LIVE ACTIVITY — property feed        │
│          │  2524 E 11TH ST · Analyzing… → Distressed              │
│          │  2520 E 11TH ST · Street View…                         │
└──────────┴──────────────────────────────────────────────────────┘
```

**Visibility rules:**
| State | Section 1 | Section 2 | Section 3 | Live feed |
|-------|-----------|-----------|-----------|-----------|
| No data | Hidden — show slim "Return to Filter" empty state | Hidden | Hidden | Hidden |
| Records loaded, not scanning | Show pending list + Start Scan | Show (zeros OK) | Hub visible, no location picked | Hidden |
| Scanning | Show active list + Stop | Updates live | Hidden or collapsed | **Primary** |
| Results exist | Show last import or "scan complete" | Global totals | State/City picker → results | Visible if scanning |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Import UI | Remove from main page | Filter is canonical intake; reduces "slop" |
| Scan CTA placement | Section 1 card, not command bar | Single prominent action; command bar becomes status-only |
| Global vs local KPIs | 3 metrics global; 3 scoped in Section 3 | Minimal, scannable; avoids 6-card bento |
| Location picker | Upgrade hub → State/City selects + chips | Clearer than expandable state rows for power users |
| Upload date filter | Chips from `importBatches` / `record.importedAt` | No calendar; only real upload dates |
| Live scan | Property feed list replaces progress bar + agent grid | User watches addresses, not worker IDs |
| Sidebar | Overview + Review only | Remove Lead Rankings, Export, Settings |
| Settings | Admin links in shell dropdown | Reuse `PhugleeSettings.isAdmin()` pattern |
| Review entry | Keep Review in sidebar **or** add "Review Leads" in Section 3 | **Needs confirmation** (see Open Questions) |
| Export | Buttons in Section 3 results header | Contextual to selected market |

---

## File Map

| File | Change |
|------|--------|
| `modules/property-analyzer/public/index.html` | Restructure 3 sections; remove upload empty state; add scan-ready, live feed, local KPIs; slim sidebar |
| `modules/property-analyzer/public/css/phuglee-analyzer.css` | Scan-ready card, `.analyze-kpi-grid`, live feed, historical search controls |
| `modules/property-analyzer/public/css/app.css` | Hide retired progress/agent panels; feed panel defaults |
| `public/css/distress-analyzer-os.css` | Embedded overrides for new sections |
| `modules/property-analyzer/public/js/scan-ready.js` | **Create** — render Section 1 from `import-meta` |
| `modules/property-analyzer/public/js/location-hub.js` | Upgrade to State/City selects, upload-date chips, local KPIs |
| `modules/property-analyzer/public/js/live-scan-feed.js` | **Create** — property-by-property feed during scan |
| `modules/property-analyzer/public/js/render.js` | Distilled global KPI render; wire export in results header |
| `modules/property-analyzer/public/js/session.js` | Remove agent grid as primary scan UI; feed hooks |
| `modules/property-analyzer/public/js/state.js` | `importDateFilter`, session save/restore |
| `modules/property-analyzer/public/js/config.js` | DOM refs, defaults |
| `modules/property-analyzer/public/js/app.js` | ⌘K palette updates; sidebar nav cleanup |
| `modules/property-analyzer/lib/import-meta.js` | `deriveRecentImport()`, batch helpers |
| `modules/property-analyzer/lib/import-batches.js` | **Create** — batch index + date chip logic |
| `modules/property-analyzer/lib/bridge-import-records.js` | Stamp `importedAt` + append `importBatches[]` |
| `lib/bridge-analyzer-push.js` | Pass `importedAt` / batch metadata on push |
| `public/js/settings-menu.js` | Admin section: API Keys, AI Brain (open analyzer modals) |
| `tests/import-batches.test.js` | **Create** — batch/date chip unit tests |
| `tests/location-index.test.js` | Extend for upload-date filtering |

---

## PR Plan (incremental)

| PR | Title | Depends |
|----|-------|---------|
| 1 | Data: import batches + `importedAt` on bridge push | — |
| 2 | HTML/CSS: 3-section shell + distilled KPI styles | — |
| 3 | Section 1: Scan-ready card + remove import empty state | 2 |
| 4 | Section 2: Global KPI redesign | 2 |
| 5 | Section 3: Historical search upgrade (selects, date chips, local KPIs, export) | 1, 2 |
| 6 | Live scan feed (replace progress bar + agent grid) | 2 |
| 7 | Sidebar + admin Settings in shell dropdown | 2 |

---

### Task 1: Import batch metadata

**Files:**
- Create: `modules/property-analyzer/lib/import-batches.js`
- Create: `modules/property-analyzer/tests/import-batches.test.js`
- Modify: `modules/property-analyzer/lib/bridge-import-records.js`
- Modify: `lib/bridge-analyzer-push.js`

**Interfaces:**
- Produces:
  - `createImportBatch({ city, state, sourceFile, leadCount, importedAt })` → batch object
  - `stampRecordsWithBatch(records, batchId, importedAt)` → records with `importedAt`, `importBatchId`
  - `listUploadDatesForLocation(batches, locationFilter)` → `string[]` ISO date labels for chips
  - `matchesImportDateFilter(record, selectedDates)` → `boolean`

- [ ] **Step 1: Write failing tests** for batch creation and date chip listing
- [ ] **Step 2: Implement `import-batches.js`**
- [ ] **Step 3: Update `appendRecordsToSession` to push batch + stamp records**
- [ ] **Step 4: Update bridge push to pass city/state/sourceFile for batch**
- [ ] **Step 5: Run** `npm test` — expect PASS
- [ ] **Step 6: Commit** `feat(analyzer): track import batches for upload-date filter`

---

### Task 2: HTML structure — three sections

**Files:**
- Modify: `modules/property-analyzer/public/index.html`

- [ ] **Step 1: Add Section 1** after command bar:

```html
<section class="scan-ready-section panel-chrome" id="scanReadySection" hidden>
  <div class="scan-ready-meta">
    <h2 class="scan-ready-location" id="scanReadyLocation">—</h2>
    <p class="scan-ready-count" id="scanReadyCount">—</p>
  </div>
  <button type="button" class="btn-primary scan-ready-start" id="scanReadyStartBtn" disabled>Start Scan</button>
</section>
```

- [ ] **Step 2: Replace `#summarySection` inner grid** with 3-card `.analyze-kpi-grid` (Distressed, Needs Review, Scanned)
- [ ] **Step 3: Wrap Section 3** — rename `#locationHub` to historical search; add `#historicalStateSelect`, `#historicalCitySelect`, `#uploadDateChips`, `#localKpiSection`
- [ ] **Step 4: Add live feed** — replace `#progressSection` + `#agentGridPanel` with:

```html
<section class="live-scan-section panel-chrome" id="liveScanSection" hidden aria-live="polite">
  <header class="live-scan-head">
    <span class="live-scan-dot" aria-hidden="true"></span>
    <h2>Live scan</h2>
    <span class="live-scan-progress" id="liveScanProgress">0 / 0</span>
  </header>
  <ol class="live-scan-feed" id="liveScanFeed"></ol>
</section>
```

- [ ] **Step 5: Replace empty workspace** copy:

```html
<section class="empty-workspace phuglee-empty-state" id="emptyWorkspace">
  <h2>No leads loaded</h2>
  <p>Import a list from <a href="/bridge">Filter</a>, then return here to scan.</p>
  <button type="button" class="btn-secondary" id="emptyRestoreBackupBtn">Restore last scan</button>
</section>
```

- [ ] **Step 6: Slim sidebar** — remove Lead Rankings button; remove Settings + Export from overflow (keep backup load in ⌘K)
- [ ] **Step 7: Commit** `refactor(analyzer): three-section page structure`

---

### Task 3: Scan-ready section (JS)

**Files:**
- Create: `modules/property-analyzer/public/js/scan-ready.js`
- Modify: `modules/property-analyzer/lib/import-meta.js`
- Modify: `modules/property-analyzer/public/js/state.js` (`buildImportHeaderCopy` sync)
- Modify: `modules/property-analyzer/public/js/config.js`

- [ ] **Step 1: Add `deriveRecentImport(records, importBatches)`** — most recent batch by `importedAt`
- [ ] **Step 2: Implement `updateScanReadyUi()`** — show city/state, lead count, wire Start Scan to `#startBtn.click()`
- [ ] **Step 3: Call from `render.js` / session restore paths**
- [ ] **Step 4: Hide `#scanReadySection` when no records**
- [ ] **Step 5: Commit** `feat(analyzer): scan-ready section with Start Scan`

---

### Task 4: Global KPI redesign

**Files:**
- Modify: `modules/property-analyzer/public/css/phuglee-analyzer.css`
- Modify: `modules/property-analyzer/public/js/render.js` (`updateSummaryStats`)

- [ ] **Step 1: Add `.analyze-kpi-grid` styles** — port from `.bridge-kpi-grid` / `.bridge-kpi` in `bridge.css`
- [ ] **Step 2: Remove pipeline bar + secondary grid** from DOM (or hide via CSS `display:none`)
- [ ] **Step 3: Simplify `updateSummaryStats`** to update 3 values only
- [ ] **Step 4: Keep click-to-filter** on Distressed + Needs Review cards
- [ ] **Step 5: Commit** `style(analyzer): premium global KPI row`

---

### Task 5: Historical search upgrade

**Files:**
- Modify: `modules/property-analyzer/public/js/location-hub.js`
- Modify: `modules/property-analyzer/lib/location-index.js`
- Modify: `modules/property-analyzer/public/js/review.js` (`getFilteredResults`)
- Modify: `modules/property-analyzer/public/js/render.js`

- [ ] **Step 1: Build index from `records + results`** (cities with data only)
- [ ] **Step 2: State `<select>` populates from index; City `<select>` filters by state**
- [ ] **Step 3: On State+City select** — set `locationFilter`, show dashboard + local KPIs
- [ ] **Step 4: Render upload-date chips** from `listUploadDatesForLocation`; multi-select toggles `state.importDateFilter`
- [ ] **Step 5: Add `matchesImportDateFilter` to `getFilteredResults`**
- [ ] **Step 6: Local KPI section** — `computeTierCountsForFiltered()` scoped to location + date
- [ ] **Step 7: Move export buttons** to results header (`#resultsHeaderActions`)
- [ ] **Step 8: Commit** `feat(analyzer): historical search with upload dates and local KPIs`

---

### Task 6: Live scan feed

**Files:**
- Create: `modules/property-analyzer/public/js/live-scan-feed.js`
- Modify: `modules/property-analyzer/public/js/session.js`
- Modify: `modules/property-analyzer/public/js/scan.js` (or `render.js` log hook)

- [ ] **Step 1: On `scanPreview` / result save** — prepend feed item `{ address, status, tier?, ts }`
- [ ] **Step 2: Cap feed at 50 items**; auto-scroll within feed container only (not page)
- [ ] **Step 3: Show `#liveScanSection` when `state.running`**; hide progress bar + agent grid
- [ ] **Step 4: Feed row template:**

```html
<li class="live-scan-item" data-phase="working|done|failed">
  <span class="live-scan-addr">2524 E 11TH ST</span>
  <span class="live-scan-status">Analyzing…</span>
  <span class="live-scan-tier tier-distressed" hidden>Distressed</span>
</li>
```

- [ ] **Step 5: `prefers-reduced-motion`** — no slide-in animation
- [ ] **Step 6: Commit** `feat(analyzer): property-by-property live scan feed`

---

### Task 7: Sidebar + admin Settings

**Files:**
- Modify: `modules/property-analyzer/public/index.html` (sidebar)
- Modify: `public/js/settings-menu.js`
- Modify: `modules/property-analyzer/public/js/app.js` (⌘K commands)

- [ ] **Step 1: Remove** Lead Rankings nav button + `data-scroll="dashboard"` handler
- [ ] **Step 2: Remove** Export block from `#sidebarManageDataMenu`
- [ ] **Step 3: Remove** Settings accordion from sidebar overflow
- [ ] **Step 4: Add admin items to `settings-menu.js`:**

```js
'<button type="button" class="shell-settings-item" data-analyzer-action="api-keys">API Keys</button>' +
'<button type="button" class="shell-settings-item" data-analyzer-action="ai-brain">AI Brain</button>'
```

- [ ] **Step 5: Wire clicks** — `postMessage` or `window.openSettingsModal()` if analyzer exposes hooks
- [ ] **Step 6: Commit** `refactor(analyzer): admin settings in shell dropdown`

---

### Task 8: Verification

- [ ] **Run** `npm test` in `modules/property-analyzer`
- [ ] **Manual smoke:**
  - Filter push → Analyze shows Scan section (city, count, Start Scan)
  - No "Import your bridged list" visible
  - Global KPIs: 3 cards, Filter-like styling
  - State → City → results with local KPIs
  - Upload date chips filter results
  - Export works from results header
  - Scan shows live property feed (not % bar)
  - Sidebar: Overview + Review only
  - Admin dropdown: API Keys + AI Brain; regular user does not see them
  - Review mode still works
  - Session restore preserves location + date filters

---

## Open Questions (confirm before execute)

1. **Review entry:** Keep Review submenu in sidebar (current), or remove it and add a **"Review Leads"** button in Section 3 / global KPI area?
2. **Command bar:** Slim to status-only (remove Start/Stop), or keep Stop in command bar during scan?
3. **Empty state backup:** Keep "Restore last scan" for non-admin users, or admin-only?
4. **Upload date granularity:** Date only (Jul 6, 2026) or date + time (Jul 6, 2:14 PM)?
5. **Scope:** Implement in `distress-os/modules/property-analyzer` only, or sync to standalone `property-distress-analyzer` repo too?

---

## Approval

Reply with **Approved** (and answers to open questions), or **Changes needed: …**

Do not begin implementation until approved.