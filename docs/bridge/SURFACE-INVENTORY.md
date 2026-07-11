# Filter Surface Inventory (DESK-05)

**Phase:** 75 — Contract Freeze & Surface Inventory  
**Requirement:** DESK-05  
**Companion to:** [`CONTRACT-FREEZE.md`](./CONTRACT-FREEZE.md) (IDs / data-*) · [`STATE-MATRIX.md`](./STATE-MATRIX.md) (JS-owned states)  
**Status:** Paint map for v3.0 visual makeover (phases 76–80)  
**Application surface:** `/bridge` only this milestone  
**North star (look DNA only):** login / home visual — glass, grain, raised CTAs, cream Anton hierarchy. Do **not** load `home.css` on Filter.

## Purpose

Map every major Filter visual region to a **design-system target layer** so later phases restyle without renaming contracts, inventing parallel show/hide, or dumping one-off paint into the wrong stylesheet.

### Cascade layers (v3.0 target)

| Layer | Files | Owns |
|-------|-------|------|
| **0 — tokens** | `public/css/tokens.css` | Brand / glass / type / space / radius custom properties |
| **1 — phuglee components** | `distress-glass.css`, `phuglee-components.css`, `phuglee-a11y.css` | Shared elevation + controls + a11y helpers |
| **2 — shell / atmosphere** | heat-*, premium-*, shell*, settings, command-palette, distress-status | Authenticated app chrome (already on Filter) |
| **3 — bridge layout/theater** | `public/bridge.html` + `public/css/bridge.css` | Filter desk layout, cinema, Train theater, domain widgets only |

**Rule of thumb:** if the look would be correct on Collect / Command / Vault tomorrow → Layer 0/1. If it is Filter ops theater → Layer 3.

**Paint phase hints:**

| Phase | Focus |
|-------|--------|
| **76** | Token audit / gaps |
| **77** | Shared `phuglee-*` components |
| **78** | Cascade order + dual-class hooks |
| **79** | Core desk restyle (scrub → upload → lists) |
| **80** | Theater surfaces (victory, kill report, Train, dialogs) |

---

## § Region table

| Region | Primary root id(s) / class anchors | Current stylesheet home | Target layer (v3.0) | Paint phase | Notes |
|--------|------------------------------------|-------------------------|---------------------|-------------|-------|
| **Hero / title chrome** | `.bridge-hero`, `.bridge-title`, `.bridge-lead`, `.bridge-step-label` | `bridge.css` — hero block (~L23) | tokens (type/cream) + bridge layout | 76 → 79 | Align hierarchy with home Anton/cream DNA; keep Filter copy. No IDs required for JS. |
| **Victory strip** | `#bridge-victory-strip`, `#bridge-victory-title`, `#bridge-victory-meta`, `#bridge-victory-download`, `#bridge-victory-next` | `bridge.css` — Phase 73 war-room victory (~L206) | bridge layout/theater + phuglee-btn (already dual-classed) | 80 | Featured elevation. Required slogans locked in freeze. Ships `hidden`; JS reveals. |
| **Pipeline (slim steps)** | `#bridge-pipeline`, `.bridge-pipeline--slim`, `.bridge-pipeline-step` + `data-step` | `bridge.css` — Phase 69 slim pipeline (~L189, ~L370) | bridge layout | 79 | States: `.is-active`, `.is-complete` (JS). Keep density desk-tight. |
| **Scrub stage shell** | `#bridge-scrub-stage`, `.bridge-desk`, `.bridge-desk-primary` | `bridge.css` — Phase 69 one scrub desk (~L156) | bridge layout | 79 | **Primary elevated work column.** Hosts city + type + upload as one job surface. |
| **City search + state/city** | `#bridge-city-search`, `#bridge-city-search-results`, `#bridge-state`, `#bridge-city`, `.bridge-panel--desk` | `bridge.css` city search + row selects; panel dual-class `phuglee-panel` | phuglee-components (select/input) + bridge layout (typeahead z-index) | 77 → 79 | Selects often raw under `.bridge-row select` — promote look to shared select. Typeahead z-index fragile vs glass overflow. |
| **City dossier** | `#bridge-city-dossier`, `#bridge-dossier-last-scrub`, `#bridge-dossier-empty`, stamp `#bridge-last-scan-heading` | `bridge.css` — CITY-01 (~L568) | bridge layout/theater | 79–80 | Filter-only stamp chrome. SR-only bodies stay structure hooks. |
| **Outcome scrap drawer** | `#bridge-outcome-drawer`, `#bridge-outcome-drawer-toggle`, `#bridge-city-outcome` | `bridge.css` — CITY-02 scrap (~L689) | bridge layout | 79 | **Quieter / demoted** elevation. `is-open` on drawer; radios are domain values. |
| **Type chips panel** | `#bridge-type-panel`, `.bridge-type-chips`, `.bridge-type-chip`, `name="bridge-upload-type"` | `bridge.css` — Phase 71 ops chips (~L880) | bridge layout (domain chips) *or* promote generic chip in 77 if shared | 77–79 | Chips not essay cards. Banned: `bridge-type-card`. Radio values frozen. |
| **Upload — date chips** | `#bridge-response-datetime`, `#bridge-date-chips`, `#bridge-response-date` | `bridge.css` — date chips (~L2682) | bridge layout | 79 | `.is-selected` + `aria-pressed` from JS. |
| **Upload — paste path** | `#bridge-paste-panel`, `#bridge-paste-text`, `#bridge-paste-convert`, `#bridge-paste-status` | `bridge.css` import-path paste; buttons already `phuglee-btn` | phuglee-components (textarea/btn) + bridge layout | 77 → 79 | Status tones `is-success` / `is-error` / `is-busy`. |
| **Upload — dropzone + process** | `#bridge-dropzone`, `#bridge-file-input`, `#bridge-browse`, `#bridge-process`, `#bridge-clear-file`, `#bridge-file-name` | `bridge.css` dropzone (~L375, ~L982); process fire CTA (~L1067) | bridge layout (dropzone theater) + phuglee-btn | 79 | States: `has-file`, `is-dragover`. Never `pointer-events: none` on dropzone parent. Process uses `:disabled`. |
| **Loading / scrub feed** | `#bridge-loading-panel`, `#bridge-loading-copy`, `#bridge-scrub-feed`, `#bridge-scrub-feed-summary` | `bridge.css` FEED (~L1083); panel uses `phuglee-loading-state` / `phuglee-loading-bar` | phuglee-components (loading) + bridge layout (feed list) | 77 → 80 | Feed items get `is-enter` + status classes from JS. |
| **Mission surface / kill KPI** | `#bridge-mission-surface`, `#bridge-results-meta`, `#bridge-kpi-grid` (+ class `bridge-kill-report`) | `bridge.css` — Phase 72 mission (~L269); kill report (~L1232) | bridge layout/theater | 80 | **Climax-first** elevation. KPI grid class added by JS after process. |
| **Save climax panel** | `#bridge-save-panel` (`.bridge-save-panel--climax`), `#bridge-list-name`, `#bridge-save-list`, `#bridge-save-status` | `bridge.css` climax save (~L283) | bridge layout/theater + phuglee-btn/input | 79–80 | Elevated primary CTA after kill report; before Train in document order. |
| **Workflow strip** | `#bridge-workflow-strip` | `bridge.css` LIST-03 teaching strip (~L360) | bridge layout | 79 | Presentational teaching copy; keep Analyze-boundary language. |
| **Train theater + mode rail** | `#bridge-train-wrap`, `#bridge-train-mission`, `#bridge-mode-kept` / `train` / `brain`, `.bridge-results-mode` | `bridge.css` THTR train blocks | bridge layout/theater | 80 | **Fail-closed:** wrap ships `hidden`; only JS clears. Theater: `is-theater`, `bridge-results-mode--theater`. |
| **Train panel / groups** | `#bridge-train-panel`, `#bridge-train-toolbar`, `#bridge-train-search`, `#bridge-train-undo`, `#bridge-train-distressed*`, `#bridge-train-not-distressed*` | `bridge.css` train groups / pending / exiting | bridge layout/theater | 80 | Card motion: `is-pending`, `is-exiting`. `data-action` approve/deny frozen. Reduced-motion CSS twin must still complete exit. |
| **Rules armory (brain)** | `#bridge-brain-panel`, `#bridge-brain-status` | `bridge.css` brain rules | bridge layout/theater | 80 | Admin mode tab; same fail-closed host as Train. |
| **Kept table + filters + pagination** | `#bridge-results-details`, `#bridge-results-toolbar`, `#bridge-filter-*`, `#bridge-results-table`, `#bridge-results-body`, `#bridge-pagination` | `bridge.css` results table / toolbar | bridge layout; optional phuglee-table promote later | 79 | Table header `.is-sorted`. Collapsible details stay native `<details>`. |
| **Attach scrap** | `#bridge-attach-panel` (`.bridge-attach-panel--scrap`), `#bridge-attach`, `#bridge-attach-status` | `bridge.css` scrap attach (~L330) | bridge layout | 79 | **Demoted** elevation vs save climax. |
| **Lists / staging inventory** | `#bridge-lists-panel`, `#bridge-lists-details`, `#bridge-lists-toolbar`, `#bridge-lists-table`, `#bridge-lists-body`, `#bridge-lists-empty` | `bridge.css` lists panel / actions | phuglee-panel + bridge layout | 79 | Bulk download/delete; `data-action` download/rename/delete/select frozen. |
| **Inventory HUD** | `#bridge-inventory-hud` | `bridge.css` mission board / inventory HUD | bridge layout/theater | 79–80 | Session shift chrome; type filter chips use `is-active`. |
| **Error wrap** | `#bridge-error-wrap`, `#bridge-error`, `#bridge-retry` | `bridge.css` error; retry is `phuglee-btn` | phuglee-components (error empty) + bridge layout | 77 → 79 | Visibility via `hidden` only. |
| **History dialog** | `#bridge-history-dialog` (`<dialog>`), `#bridge-history-close`, `#bridge-history-list`, `#bridge-history-lead` | `bridge.css` history dialog | bridge layout/theater + a11y | 80 | **Native `<dialog>` only** — never replace with div modal. |
| **Type-column confirm dialog** | `#bridge-type-column-confirm-dialog` (`<dialog>`), candidates/samples/ok/cancel/close IDs | `bridge.css` type-confirm | bridge layout/theater + a11y | 80 | Native dialog; control IDs frozen. |
| **Shift queue (dynamic)** | `#bridge-shift-queue` (JS-created; may be absent), related flash chrome | `bridge.css` shift queue (~L2244) + lists flash | bridge layout | 80 | Legacy/session strip; string contract may remain even if desk-demoted. Do not invent static HTML IDs. |
| **Scanned toast (dynamic)** | `#bridge-scanned-toast` (created in JS) | `bridge.css` toast (~L2172) | bridge layout/theater | 80 | Classes `is-in` / `is-out`; pair `[hidden]` with display rules. |
| **Lists flash (dynamic)** | `#bridge-lists-flash` | `bridge.css` lists flash (~L2139) | bridge layout | 79–80 | Temporary save/download feedback host. |
| **App shell backdrop (shared)** | `body.has-premium-bg`, `.premium-bg*`, `.heat-field`, `#distress-os-nav-mount` | Layer 2 sheets already loaded | shell / atmosphere (Layer 2) | 78 (order only) | Not Filter-specific paint; do not re-skin in bridge.css. |
| **Skip link / a11y** | `.phuglee-skip-link`, focus/reduced-motion | `phuglee-a11y.css` | a11y | 78 | Keep a11y last in cascade target order. |

---

## § Elevation sketch

Documentation only — no new CSS in this phase.

- **Primary elevated:** `#bridge-scrub-stage` / desk panels (city + type + dropzone) — the one job surface.
- **Climax elevated:** `#bridge-mission-surface` kill report (`bridge-kill-report` on KPI grid) + `#bridge-save-panel.bridge-save-panel--climax` — stage list is the hero CTA after scrub.
- **Featured / war-room:** `#bridge-victory-strip` after successful Stage list — celebration chrome, not a second process path.
- **Theater (admin):** `#bridge-train-wrap.is-theater` + mode rail — high drama, fail-closed for non-admin.
- **Quieter / scrap:** outcome drawer, attach panel (`--scrap`), optional teaching strips — lower contrast, no competing primary CTAs.
- **Inventory secondary:** lists details / HUD under main scrub flow — utility, not climax.
- **Dialogs:** native modal layer above desk; z-index must clear shell nav and typeahead.

Rough stack (bottom → top): atmosphere → desk panels → typeahead → sticky inventory/HUD → dialog → toast.

---

## § Orphan risk (unpainted / one-off chrome)

Call-outs for Phase 80 (and late 79) so restyle does not leave Filter looking half-migrated. **Do not fix here.**

| Risk | Where | Why it matters |
|------|--------|----------------|
| Raw selects under `.bridge-row` | `#bridge-state`, `#bridge-city`, filter selects, outcome type | Look diverges from home/phuglee inputs until dual-classed |
| `.bridge-browse-link` | Dropzone browse control | One-off link style vs `phuglee-btn` / text-button primitive |
| `.bridge-type-chip` / `.bridge-date-chip` | Type + received date | Domain chips with local hex/glass; may stay Filter-only but need tokenized colors |
| `.bridge-pipeline-step` badges | Slim pipeline | Numeric badge paint lives only in bridge.css |
| Dossier stamp / outcome option cards | CITY-01/02 | Custom stamp + radio faces; easy to skip in theater pass |
| Train mode tabs + armory | `.bridge-mode-tab*` | Theater-only; must not regress fail-closed visibility |
| Kill report / victory one-offs | `.bridge-kill-*`, `.bridge-victory-*` | Heavy local color; token gaps likely |
| Dialog chrome close “×” | `.bridge-history-dialog-close` | Not a shared icon-button yet |
| Shift queue / flash / toast | Dynamic hosts | Easy to forget in visual QA (no idle HTML) |
| Legacy CSS still in sheet | e.g. type-card hooks, idle mission board remnants | Dead or rare paths — thin during 79/80, do not re-skin as new system |

---

## § Anti-targets

Explicit **non-goals** for the whole v3.0 makeover (and this inventory):

| Anti-target | Why |
|-------------|-----|
| Process / parse / OCR engine | Behavior freeze; surface only |
| Brain store / keep-kill learning logic | Admin Train data paths stay as shipped |
| Keep/kill decision rules | Theater may restyle cards; not re-open engine |
| Analyze push CTAs | Banned product strings; manual Analyze import remains narrative only |
| Renaming `bridge-*` IDs or locked `data-*` | See CONTRACT-FREEZE |
| Inventing CSS-only workflow states | See STATE-MATRIX — style JS tokens only |
| Loading home.css on `/bridge` | North star is DNA, not layout import |
| Wiping filter lists / brain / Form Forge data | AGENTS.md hard rule |
| Parallel Filter stylesheet universe | No `bridge-v3.css` — restyle `bridge.css` + shared layers |

---

## § Related docs

- [`CONTRACT-FREEZE.md`](./CONTRACT-FREEZE.md) — locked IDs, data-action/mode/format/step, structure-order
- [`STATE-MATRIX.md`](./STATE-MATRIX.md) — JS-toggled states CSS may style
- [`.planning/research/ARCHITECTURE.md`](../../.planning/research/ARCHITECTURE.md) — cascade layers
- [`.planning/research/PITFALLS.md`](../../.planning/research/PITFALLS.md) — restyle failure modes

---

*DESK-05 surface inventory — Phase 75. Docs only; no product renames.*
