# Filter DOM Contract Freeze (DESK-05)

**Phase:** 75 — Contract Freeze & Surface Inventory  
**Requirement:** DESK-05  
**Status:** Locked for v3.0 visual makeover (phases 75–81)  
**Source of truth:** `public/bridge.html` + `public/js/bridge.js` + `public/js/bridge-train.js` (as shipped)

## Rule (non-negotiable)

| Allowed | Forbidden |
|---------|-----------|
| CSS paint on existing classes | Renaming any `id="bridge-*"` |
| Adding dual-class hooks (`bridge-*` + `phuglee-*`) | Renaming / removing locked `data-action`, `data-mode`, `data-format`, `data-step` values |
| Wrapping **outside** locked nodes | Replacing `<dialog>` with custom modals |
| Markup class hooks for design-system layers | CSS-only show/hide that bypasses the HTML `hidden` attribute |
| Copy tweaks that leave IDs/`data-*` intact | `display:flex !important` (or similar) on `#bridge-train-wrap` to unhide Train |

**Restyle wrap rule:** Put new chrome *around* locked IDs. Never rename an ID to match a design-system name — dual-class the node instead.

**Verification:** `tests/bridge-contract-freeze.test.js` + complementary cinema/theater suites + full `npm test`.

---

## § Critical `bridge-*` IDs

Complete inventory of every `id="bridge-…"` in `public/bridge.html`.  
**JS consumer:** `boot` = top-level `getElementById` at script start; `lazy` = looked up inside functions; `presentational` = HTML/aria only (still freeze); `template` = string templates only.

### Victory / hero

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-victory-strip` | victory | lazy |
| `bridge-victory-title` | victory | lazy |
| `bridge-victory-meta` | victory | lazy |
| `bridge-victory-download` | victory | lazy + click; static `data-action="flash-download"` |
| `bridge-victory-next` | victory | lazy + click |

### Pipeline / scrub desk

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-pipeline` | pipeline | **removed from UI** (operator preference); JS `setPipelineStep` is no-op if missing |
| `bridge-scrub-stage` | scrub | presentational (structure lock) |
| `bridge-step-location` | scrub | presentational (`aria-labelledby`) |
| `bridge-city-search` | scrub | lazy |
| `bridge-city-search-results` | scrub | lazy |
| `bridge-state` | scrub | boot |
| `bridge-city` | scrub | boot |

### City dossier / outcome

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-city-dossier` | dossier | boot |
| `bridge-last-scan-heading` | dossier | presentational |
| `bridge-dossier-empty` | dossier | boot |
| `bridge-dossier-last-scrub` | dossier | lazy |
| `bridge-dossier-last-scrub-body` | dossier | boot |
| `bridge-dossier-attaches` | dossier | presentational (shell) |
| `bridge-dossier-attaches-body` | dossier | boot |
| `bridge-dossier-lists` | dossier | presentational (shell) |
| `bridge-dossier-lists-body` | dossier | boot |
| `bridge-outcome-drawer` | dossier | boot |
| `bridge-outcome-drawer-toggle` | dossier | boot |
| `bridge-city-outcome` | dossier | boot |
| `bridge-other-source-wrap` | dossier | boot |
| `bridge-outcome-notes-label` | dossier | lazy |
| `bridge-other-source-notes` | dossier | boot |
| `bridge-outcome-type` | dossier | boot |
| `bridge-outcome-save` | dossier | boot |
| `bridge-outcome-status` | dossier | boot |

### Type / upload / loading

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-type-panel` | type | boot |
| `bridge-step-type` | type | presentational |
| `bridge-upload-panel` | upload | boot |
| `bridge-step-upload` | upload | presentational |
| `bridge-response-datetime` | upload | presentational (fieldset) |
| `bridge-response-date` | upload | boot |
| `bridge-date-chips` | upload | lazy |
| `bridge-paste-panel` | upload | presentational |
| `bridge-paste-heading` | upload | presentational |
| `bridge-paste-text` | upload | lazy |
| `bridge-paste-convert` | upload | lazy |
| `bridge-paste-clear` | upload | lazy |
| `bridge-paste-status` | upload | lazy |
| `bridge-dropzone` | upload | boot |
| `bridge-file-input` | upload | boot |
| `bridge-dropzone-inner` | upload | presentational |
| `bridge-drop-hint` | upload | presentational |
| `bridge-browse` | upload | boot |
| `bridge-file-name` | upload | boot |
| `bridge-process` | upload | boot |
| `bridge-clear-file` | upload | boot |
| `bridge-loading-panel` | loading | boot |
| `bridge-loading-copy` | loading | boot |
| `bridge-scrub-feed-summary` | loading | lazy |
| `bridge-scrub-feed` | loading | lazy |

### Results / mission / save climax

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-results-panel` | results | boot |
| `bridge-step-results` | results | presentational |
| `bridge-mission-surface` | results | presentational (structure lock) |
| `bridge-results-meta` | results | boot |
| `bridge-kpi-grid` | results | boot |
| `bridge-stub-note` | results | lazy |
| `bridge-save-panel` | results / save | boot |
| `bridge-save-heading` | results / save | presentational |
| `bridge-list-name` | results / save | boot |
| `bridge-save-list` | results / save | boot |
| `bridge-save-status` | results / save | boot |
| `bridge-workflow-strip` | results | presentational |
| `bridge-results-details` | results | presentational (collapsible table) |
| `bridge-results-details-summary` | results | lazy |
| `bridge-results-toolbar` | results | boot |
| `bridge-filter-search` | results | boot |
| `bridge-filter-category` | results | boot |
| `bridge-filter-tag` | results | boot |
| `bridge-filter-confidence` | results | boot |
| `bridge-filter-review` | results | boot |
| `bridge-export-csv` | results | boot |
| `bridge-table-wrap` | results | boot |
| `bridge-results-table` | results | boot |
| `bridge-results-body` | results | boot |
| `bridge-pagination` | results | boot |

### Train / brain (fail-closed region)

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-train-wrap` | train | lazy — **default `hidden`** |
| `bridge-train-mission` | train | lazy — **must be inside wrap** |
| `bridge-train-open-count` | train | lazy |
| `bridge-train-kept-count` | train | lazy |
| `bridge-mode-kept` | train | lazy |
| `bridge-mode-train` | train | lazy |
| `bridge-mode-brain` | train | lazy |
| `bridge-train-status` | train | lazy |
| `bridge-train-panel` | train | lazy |
| `bridge-train-toolbar` | train | presentational |
| `bridge-train-search` | train | lazy |
| `bridge-train-undo` | train | lazy |
| `bridge-train-distressed` | train | lazy |
| `bridge-train-distressed-pager` | train | lazy |
| `bridge-train-not-distressed` | train | lazy |
| `bridge-train-not-distressed-pager` | train | lazy |
| `bridge-brain-panel` | train / brain | lazy |
| `bridge-brain-status` | train / brain | lazy |

### Attach (demoted scrap)

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-attach-panel` | results / attach | boot — class `bridge-attach-panel--scrap` |
| `bridge-attach-heading` | results / attach | presentational |
| `bridge-attach` | results / attach | boot |
| `bridge-attach-status` | results / attach | boot |

### Lists / inventory

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-lists-panel` | lists | lazy (delegation host) |
| `bridge-lists-details` | lists | lazy |
| `bridge-lists-details-summary` | lists | presentational |
| `bridge-lists-heading` | lists | presentational |
| `bridge-lists-details-count` | lists | lazy |
| `bridge-lists-details-hint` | lists | lazy |
| `bridge-lists-toolbar` | lists | boot |
| `bridge-download-all-csv` | lists | boot |
| `bridge-download-all-xlsx` | lists | boot |
| `bridge-delete-selected-lists` | lists | boot |
| `bridge-clear-all-lists` | lists | boot |
| `bridge-inventory-hud` | lists | lazy |
| `bridge-lists-empty` | lists | boot |
| `bridge-lists-wrap` | lists | boot |
| `bridge-lists-table` | lists | presentational |
| `bridge-lists-select-all` | lists | lazy |
| `bridge-lists-body` | lists | boot |
| `bridge-lists-total` | lists | lazy |

### Error + dialogs

| id | Region | JS consumer |
|----|--------|-------------|
| `bridge-error-wrap` | error | boot |
| `bridge-error` | error | boot |
| `bridge-retry` | error | boot |
| `bridge-history-dialog` | dialogs | boot — native `<dialog>` |
| `bridge-history-heading` | dialogs | presentational |
| `bridge-history-lead` | dialogs | boot |
| `bridge-history-close` | dialogs | boot |
| `bridge-history-list` | dialogs | boot |
| `bridge-type-column-confirm-dialog` | dialogs | boot — native `<dialog>` |
| `bridge-type-column-confirm-heading` | dialogs | presentational |
| `bridge-type-column-confirm-lead` | dialogs | boot |
| `bridge-type-column-suggested` | dialogs | boot |
| `bridge-type-column-confirm-close` | dialogs | boot |
| `bridge-type-column-candidates` | dialogs | boot |
| `bridge-type-column-samples` | dialogs | boot |
| `bridge-type-column-confirm-cancel` | dialogs | boot |
| `bridge-type-column-confirm-ok` | dialogs | boot |

### JS-referenced IDs not static in HTML (still freeze string contracts)

| id | Note |
|----|------|
| `bridge-city-actions` | Boot lookup; element may be absent (null-safe) |
| `bridge-history-open` | Boot lookup; opener may be absent |
| `bridge-scanned-toast` | Created dynamically in JS |
| `bridge-lists-flash` | Lazy; flash chrome host |
| `bridge-shift-queue` | Lazy / legacy shift UI (removed from desk; string may remain) |
| `bridge-shift-queue-clear` | Dynamic create under shift queue |
| `bridge-flash-download-csv` | Selector alias in flash-download click path |

---

## § `data-action` contract

**Locked values — never rename or reassign meaning:**

| Value | Produced in | Consumed by |
|-------|-------------|-------------|
| `approve` | `bridge.js` + `bridge-train.js` Train card templates | Train panel click delegation |
| `deny` | `bridge.js` + `bridge-train.js` Train card templates | Train panel click delegation |
| `download` | `bridge.js` list-row template | Lists panel click + `data-format` |
| `rename` | `bridge.js` list name input template | Lists input/change handlers |
| `delete` | `bridge.js` list-row template | Lists panel click |
| `select` | `bridge.js` list checkbox template | Lists select handlers |
| `flash-download` | **Static HTML** on `#bridge-victory-download` | Document/lists click closest |

**Copy may change later only if tests update — `data-action` values never change.**

---

## § `data-mode` / `data-format` / `data-step` / radio names

### `data-mode` (results mode tabs)

| Value | Host |
|-------|------|
| `kept` | `#bridge-mode-kept` |
| `train` | `#bridge-mode-train` |
| `brain` | `#bridge-mode-brain` |

### `data-format`

| Value | Hosts |
|-------|-------|
| `csv` | Victory `#bridge-victory-download`; list row download buttons |
| `xlsx` | List row download buttons |

### `data-step` (pipeline stepper — retired from HTML)

The slim City / Type / Upload / Results banner was removed. Values below remain valid if JS still references them; they are not required in HTML.

| Value | Former host |
|-------|------|
| `location` | `#bridge-pipeline` step li (removed) |
| `type` | `#bridge-pipeline` step li (removed) |
| `upload` | `#bridge-pipeline` step li (removed) |
| `results` | `#bridge-pipeline` step li (removed) |

### Radio contract (list type chips)

All seven Filter list types (must match `UPLOAD_TYPES` / `public/bridge.html`):

```
name="bridge-upload-type" value="code_violation"
name="bridge-upload-type" value="pre_lien"
name="bridge-upload-type" value="tax_delinquent"
name="bridge-upload-type" value="lis_pendens"
name="bridge-upload-type" value="probate"
name="bridge-upload-type" value="fire"
name="bridge-upload-type" value="water_shut_off"
```

Host classes: `bridge-type-chips` / `bridge-type-chip`.  
**Banned:** `bridge-type-card`, `bridge-type-desc` (essay cards).  
**Do not** drop a radio without updating `UPLOAD_TYPES`, API docs, and DESK-05 freeze tests.

---

## § Structure-order locks

These are cinema/theater structural contracts. Visual phases must not reorder or CSS-unhide them.

1. **Train fail-closed (THTR-03)**  
   - `#bridge-train-mission` is a **descendant** of `#bridge-train-wrap`  
   - `#bridge-train-wrap` ships with the HTML `hidden` attribute  
   - Only JS may clear `hidden` for authorized Train sessions — never CSS `display` hacks

2. **Cinema climax order (results)**  
   - Kill/mission surface (`#bridge-mission-surface`) hosts KPI + **elevated save**  
   - Save panel: `#bridge-save-panel` with class `bridge-save-panel--climax`  
   - Attach is demoted: `#bridge-attach-panel` with `bridge-attach-panel--scrap`  
   - Kept table is collapsible: `#bridge-results-details`  
   - Save climax appears **before** `#bridge-train-wrap` in document order

3. **Victory strip slogans + IDs**  
   - `#bridge-victory-strip`, `#bridge-victory-download`, `#bridge-victory-next`  
   - Required copy: `List staged`, `Filter Data`, `Scrub next city`  
   - Victory download: `data-action="flash-download"` + `data-format="csv"`

4. **Type chips radio contract**  
   - Chips, not essay cards; banned `bridge-type-card`  
   - Radios: `bridge-upload-type` x all seven: `code_violation` | `pre_lien` | `tax_delinquent` | `lis_pendens` | `probate` | `fire` | `water_shut_off`

5. **Native dialogs**  
   - `#bridge-type-column-confirm-dialog` and `#bridge-history-dialog` remain `<dialog>`  
   - Control IDs fixed: confirm close/cancel/ok; history close/list/lead

6. **No Analyze push CTAs**  
   Banned strings in Filter HTML/JS product surface:  
   - `Send to Analyze`  
   - `Push to Analyze`  
   - `Import to Analyzer`  
   - `Open in Analyze`  
   - `Push to Analyzer`  

   (Narrative “Analyze stays separate” / “manual Analyze import” copy is allowed.)

---

## § Restyle rules (v3.0)

1. **Dual-class OK:** e.g. `class="bridge-save-panel bridge-save-panel--climax phuglee-panel"` — keep the `bridge-*` ID and class spine.
2. **Never** force Train open with CSS:
   ```css
   /* FORBIDDEN */
   #bridge-train-wrap { display: flex !important; }
   ```
3. **Never** replace `<dialog>` with div modals for history or type-confirm.
4. **Never** invent CSS-only show/hide that bypasses the `hidden` attribute on locked regions (`bridge-train-wrap`, panels gated by JS).
5. **Wrap outside** locked nodes — do not rename IDs to match design tokens.
6. **No product JS behavior changes** for pure visual phases (76–80): CSS + optional class hooks only unless a later plan explicitly opens a JS gate.

---

## § Verification

| Layer | Command / artifact |
|-------|-------------------|
| **DESK-05 freeze spine** | `node --test tests/bridge-contract-freeze.test.js` |
| **This checklist** | `docs/bridge/CONTRACT-FREEZE.md` |
| **Desk cinema (v2.2)** | `node --test tests/bridge-desk-cinema.test.js` |
| **Train theater** | `node --test tests/bridge-train-theater.test.js` |
| **Full permanent bar** | `npm test` |

Human inventory refresh (PowerShell from repo root):

```powershell
rg 'id="bridge-' public/bridge.html
rg "getElementById\('bridge-" public/js
rg 'data-action' public/js/bridge.js public/js/bridge-train.js public/bridge.html
```

If freeze tests fail after a visual edit: **restore the contract** — do not weaken the test to match a rename.

---

## § Related docs

| Doc | Role |
|-----|------|
| [`SURFACE-INVENTORY.md`](./SURFACE-INVENTORY.md) | Region → design-system layer map + paint phase hints (76–80) |
| [`STATE-MATRIX.md`](./STATE-MATRIX.md) | JS-owned states CSS may style; bans inventing parallel show/hide |
| [`TEST-PLAN.md`](./TEST-PLAN.md) | Suite map including DESK-05 freeze tests |

v3.0 restyles: read freeze (what not to rename) → inventory (where to paint) → state matrix (which toggles to style).
