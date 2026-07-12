# Analyze Page Full Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Phuglee Analyze surface (`/analyzer/`) into one hybrid system — Filter glass + Analyze heat — with scan-first IA, hard-demoted past markets, redesigned property modal, and redesigned review overlay, without changing scan/tier/export engines.

**Architecture:** Extract pure UI helpers (`analyze-visibility`, `tier-labels`) with Node tests first. Drive first-paint and zone visibility from those helpers. Rebuild HTML/CSS chrome (desk, KPIs, modal, review, cards) on Phuglee tokens; retire cyber identity. Wire through existing `scan-ready.js`, `session.js` (`updateSummaryStats`), `render.js`, `location-hub.js`, `review.js` without rewriting engines.

**Tech Stack:** Vanilla JS (PDA.env / UMD lib pattern), Node test runner (`node --test`), existing CSS tokens (`tokens.css`, glass), Distress OS shell embed. No new framework dependencies.

**Design spec:** `docs/superpowers/specs/2026-07-12-analyze-page-redesign-design.md`

**Impeccable command order (map to tasks):** distill → layout → quieter → typeset → clarify → adapt → harden → polish

## Global Constraints

- Do **not** change scan pipeline behavior, tier engine scoring, export schema field names, or session persistence format beyond additive UI flags if needed.
- Preserve DOM **ids** that engines bind to (`startBtn`, `scanReadyStartBtn`, `cardsGrid`, preview imgs, review action buttons, KPI value ids, etc.). Prefer class/visual renames over id renames.
- Stack fidelity: vanilla HTML/CSS/JS only — no React/Tailwind rewrite of Analyze.
- Hybrid C: Restrained glass overall; heat only on Start Scan, Distressed KPI, live feed, Distressed tier pills, Keep/primary review.
- Canonical UI labels: Distressed · Well Maintained · Land · Blocked · Needs Review.
- First paint: no zeroed session KPI strip, no empty rankings workbench, no peer Past markets panel.
- After any edit under `public/` or analyzer `public/`: run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` from distress-os root before claiming done.
- TDD: pure helpers get failing tests first; UI wiring tasks verify helpers + targeted regression (`npm test` in `modules/property-analyzer`).
- Work in an isolated **git worktree** (using-git-worktrees skill) for implementation.
- Every task ends with a commit.

---

## File Map

| File | Responsibility |
|------|----------------|
| `modules/property-analyzer/lib/analyze-visibility.js` | Pure zone visibility matrix from session flags |
| `modules/property-analyzer/lib/tier-labels.js` | Canonical filter key → UI label map |
| `modules/property-analyzer/tests/analyze-visibility.test.js` | Visibility matrix unit tests |
| `modules/property-analyzer/tests/tier-labels.test.js` | Label map unit tests |
| `modules/property-analyzer/public/index.html` | Zone markup, modal/review chrome, kill HUD nodes |
| `modules/property-analyzer/public/css/phuglee-analyzer.css` | Primary Analyze layout (zones, desk, workbench) |
| `modules/property-analyzer/public/css/tokens.css` | Any missing glass/heat tokens only |
| `modules/property-analyzer/public/css/cyber-*.css` + theme body | Neutralize / stop identity load |
| `modules/property-analyzer/public/css/app.css` | Remove conflicting rules; keep behavior hooks |
| `public/css/distress-analyzer-os.css` | Embedded shell overrides for new zones |
| `modules/property-analyzer/public/js/scan-ready.js` | Desk actions + apply visibility |
| `modules/property-analyzer/public/js/session.js` | `updateSummaryStats` + KPI strip visibility |
| `modules/property-analyzer/public/js/render.js` | Cards, profile empty copy, workbench show |
| `modules/property-analyzer/public/js/location-hub.js` | Hard-demote past markets control |
| `modules/property-analyzer/public/js/live-scan-feed.js` | Align with single KPI truth while scanning |
| `modules/property-analyzer/public/js/review.js` | Review chrome labels only as needed |
| `modules/property-analyzer/public/js/config.js` | Script load / env exposure if needed |
| `modules/property-analyzer/public/js/app.js` | Call `applyAnalyzeVisibility` on boot/refresh |

---

### Task 1: Analyze visibility matrix (pure + TDD)

**Files:**
- Create: `modules/property-analyzer/lib/analyze-visibility.js`
- Create: `modules/property-analyzer/tests/analyze-visibility.test.js`

**Interfaces:**
- Produces:
  - `getAnalyzeZones(input)` → `{ showPipeline, showScanDesk, showLiveScan, showSessionKpis, showResultsWorkbench, showPastMarketsExpanded, pastMarketsMode }`
  - Input shape:
    ```js
    {
      hasRecords: boolean,      // unscanned or any imported rows
      hasResults: boolean,      // state.results.length > 0
      isScanning: boolean,      // state.running
      resultsWorkbenchOpen: boolean, // explicit user open OR auto after results
      pastMarketsOpen: boolean  // user expanded history control
    }
    ```
  - `pastMarketsMode`: `'control' | 'expanded' | 'hidden'`
  - Rules (from spec §6.2):
    - Empty: desk+pipeline on; live/KPIs/results off; past markets = `control`
    - List ready: same; KPIs off
    - Scanning: live on; KPIs on (live is session truth); results off; past = control
    - Has results idle: KPIs on; results on iff `resultsWorkbenchOpen`; past control unless `pastMarketsOpen` → expanded

- [ ] **Step 1: Write the failing tests**

Create `modules/property-analyzer/tests/analyze-visibility.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getAnalyzeZones } = require('../lib/analyze-visibility');

describe('getAnalyzeZones', () => {
  it('empty session: scan desk only, no KPIs or results', () => {
    const z = getAnalyzeZones({
      hasRecords: false,
      hasResults: false,
      isScanning: false,
      resultsWorkbenchOpen: false,
      pastMarketsOpen: false
    });
    assert.equal(z.showScanDesk, true);
    assert.equal(z.showLiveScan, false);
    assert.equal(z.showSessionKpis, false);
    assert.equal(z.showResultsWorkbench, false);
    assert.equal(z.pastMarketsMode, 'control');
  });

  it('list ready not scanning: no KPI strip, no rankings', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: false,
      isScanning: false,
      resultsWorkbenchOpen: false,
      pastMarketsOpen: false
    });
    assert.equal(z.showScanDesk, true);
    assert.equal(z.showSessionKpis, false);
    assert.equal(z.showResultsWorkbench, false);
  });

  it('scanning: live + KPIs on, results off', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: true,
      isScanning: true,
      resultsWorkbenchOpen: true,
      pastMarketsOpen: false
    });
    assert.equal(z.showLiveScan, true);
    assert.equal(z.showSessionKpis, true);
    assert.equal(z.showResultsWorkbench, false);
  });

  it('has results idle with workbench open', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: true,
      isScanning: false,
      resultsWorkbenchOpen: true,
      pastMarketsOpen: false
    });
    assert.equal(z.showSessionKpis, true);
    assert.equal(z.showResultsWorkbench, true);
    assert.equal(z.showLiveScan, false);
  });

  it('past markets expanded only when flagged', () => {
    const z = getAnalyzeZones({
      hasRecords: true,
      hasResults: true,
      isScanning: false,
      resultsWorkbenchOpen: true,
      pastMarketsOpen: true
    });
    assert.equal(z.pastMarketsMode, 'expanded');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd modules/property-analyzer
node --test tests/analyze-visibility.test.js
```

Expected: FAIL — `Cannot find module '../lib/analyze-visibility'`

- [ ] **Step 3: Implement minimal module**

Create `modules/property-analyzer/lib/analyze-visibility.js` using the same UMD pattern as `lib/location-index.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.analyzeVisibility = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function analyzeVisibilityFactory() {
  function getAnalyzeZones(input) {
    const hasRecords = !!input.hasRecords;
    const hasResults = !!input.hasResults;
    const isScanning = !!input.isScanning;
    const resultsWorkbenchOpen = !!input.resultsWorkbenchOpen;
    const pastMarketsOpen = !!input.pastMarketsOpen;

    const showPipeline = true;
    const showScanDesk = true;
    const showLiveScan = isScanning;
    const showSessionKpis = isScanning || hasResults;
    const showResultsWorkbench = !isScanning && hasResults && resultsWorkbenchOpen;
    let pastMarketsMode = 'control';
    if (pastMarketsOpen) pastMarketsMode = 'expanded';

    return {
      showPipeline,
      showScanDesk,
      showLiveScan,
      showSessionKpis,
      showResultsWorkbench,
      showPastMarketsExpanded: pastMarketsMode === 'expanded',
      pastMarketsMode
    };
  }

  return { getAnalyzeZones };
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd modules/property-analyzer
node --test tests/analyze-visibility.test.js
```

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add modules/property-analyzer/lib/analyze-visibility.js modules/property-analyzer/tests/analyze-visibility.test.js
git commit -m "feat(analyzer): pure analyze visibility matrix with tests"
```

---

### Task 2: Canonical tier labels (pure + TDD)

**Files:**
- Create: `modules/property-analyzer/lib/tier-labels.js`
- Create: `modules/property-analyzer/tests/tier-labels.test.js`

**Interfaces:**
- Produces:
  - `TIER_UI_LABELS` — map of filter/key → string
  - `tierUiLabel(key)` → string (fallback: humanize key)
  - Keys at minimum: `distressed`, `well_maintained`, `vacant`, `blurred`, `review`, `all`, `land` (alias vacant), `blocked` (alias blurred)

```js
// Expected labels
{
  all: 'All',
  distressed: 'Distressed',
  well_maintained: 'Well Maintained',
  vacant: 'Land',
  blurred: 'Blocked',
  review: 'Needs Review',
  land: 'Land',
  blocked: 'Blocked'
}
```

- [ ] **Step 1: Write the failing tests**

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tierUiLabel, TIER_UI_LABELS } = require('../lib/tier-labels');

describe('tierUiLabel', () => {
  it('returns canonical labels for primary keys', () => {
    assert.equal(tierUiLabel('distressed'), 'Distressed');
    assert.equal(tierUiLabel('well_maintained'), 'Well Maintained');
    assert.equal(tierUiLabel('vacant'), 'Land');
    assert.equal(tierUiLabel('blurred'), 'Blocked');
    assert.equal(tierUiLabel('review'), 'Needs Review');
  });

  it('aliases land and blocked', () => {
    assert.equal(tierUiLabel('land'), 'Land');
    assert.equal(tierUiLabel('blocked'), 'Blocked');
  });

  it('exposes TIER_UI_LABELS map', () => {
    assert.equal(TIER_UI_LABELS.vacant, 'Land');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd modules/property-analyzer
node --test tests/tier-labels.test.js
```

- [ ] **Step 3: Implement `lib/tier-labels.js`** (UMD same as Task 1)

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.tierLabels = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function tierLabelsFactory() {
  const TIER_UI_LABELS = Object.freeze({
    all: 'All',
    distressed: 'Distressed',
    well_maintained: 'Well Maintained',
    vacant: 'Land',
    blurred: 'Blocked',
    review: 'Needs Review',
    land: 'Land',
    blocked: 'Blocked'
  });

  function tierUiLabel(key) {
    const k = String(key || '').trim();
    if (TIER_UI_LABELS[k]) return TIER_UI_LABELS[k];
    return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
  }

  return { TIER_UI_LABELS, tierUiLabel };
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd modules/property-analyzer
node --test tests/tier-labels.test.js
```

- [ ] **Step 5: Commit**

```bash
git add modules/property-analyzer/lib/tier-labels.js modules/property-analyzer/tests/tier-labels.test.js
git commit -m "feat(analyzer): canonical tier UI labels with tests"
```

---

### Task 3: Wire visibility + auto workbench flag (distill IA)

**Files:**
- Modify: `modules/property-analyzer/public/js/state.js` (or `config.js`) — add `state.resultsWorkbenchOpen`, `state.pastMarketsOpen`
- Modify: `modules/property-analyzer/public/js/scan-ready.js` — export/call `applyAnalyzeVisibility`
- Modify: `modules/property-analyzer/public/js/session.js` — hide/show `#summarySection` via matrix; set workbench open when results exist on load
- Modify: `modules/property-analyzer/public/js/render.js` — gate `#dashboard` / results wrap
- Modify: `modules/property-analyzer/public/js/location-hub.js` — past markets control mode
- Modify: `modules/property-analyzer/public/index.html` — ensure zone ids: `analyzePipeline`, `scanReadySection`, `liveScanSection`, `summarySection`, `dashboard`, `locationHub`, add `#openResultsWorkbenchBtn` if missing
- Serve lib to browser: add script tags OR attach via existing server static for `/lib/` if already exposed; if libs only load in Node today, **duplicate thin browser bridge** in `public/js/analyze-ui.js` that copies the same pure functions (preferred: one UMD file loaded in both — check how `location-index` is served)

**Interfaces:**
- Consumes: `getAnalyzeZones` from Task 1
- Produces: `applyAnalyzeVisibility()` global/R method called after session load, scan start/stop, summary update

- [ ] **Step 1: Discover how `location-index` is loaded in the browser**

```bash
rg -n "location-index|locationIndex" modules/property-analyzer/public modules/property-analyzer/server.js lib
```

Mirror that pattern for `analyze-visibility.js` and `tier-labels.js`. If server only exposes `public/`, either:
- Copy pure functions into `public/js/analyze-ui.js` (keep `lib/` as source of truth + tests require lib), **or**
- Add static route for `/analyzer/lib/...` if missing.

**Preferred:** keep tested code in `lib/`; if browser cannot load it, implement `public/js/analyze-ui.js` that re-exports identical logic and note in commit that tests own `lib/`.

- [ ] **Step 2: Add state flags**

In `config.js` / state defaults:

```js
resultsWorkbenchOpen: false,
pastMarketsOpen: false,
```

On successful session restore when `state.results.length > 0`, set `resultsWorkbenchOpen = true` (spec: auto open workbench when session already has results).

- [ ] **Step 3: Implement `applyAnalyzeVisibility`**

```js
function applyAnalyzeVisibility() {
  const lib = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.analyzeVisibility)
    || null;
  const getZones = lib && lib.getAnalyzeZones
    || (typeof getAnalyzeZones === 'function' ? getAnalyzeZones : null);
  if (!getZones) return;

  const z = getZones({
    hasRecords: (state.records && state.records.length > 0) || false,
    hasResults: (state.results && state.results.length > 0) || false,
    isScanning: !!state.running,
    resultsWorkbenchOpen: !!state.resultsWorkbenchOpen,
    pastMarketsOpen: !!state.pastMarketsOpen
  });

  const live = document.getElementById('liveScanSection');
  const summary = document.getElementById('summarySection');
  const dash = document.getElementById('dashboard');
  const hub = document.getElementById('locationHub');
  const localKpi = document.getElementById('localKpiSection');

  if (live) live.hidden = !z.showLiveScan;
  if (summary) {
    summary.hidden = !z.showSessionKpis;
    summary.classList.toggle('visible', z.showSessionKpis);
  }
  if (dash) dash.hidden = !z.showResultsWorkbench;
  if (localKpi && !z.showResultsWorkbench) localKpi.hidden = true;

  if (hub) {
    // Hard demote: never a peer panel on first paint
    if (z.pastMarketsMode === 'control') {
      hub.hidden = false;
      hub.open = false;
      hub.classList.add('historical-search--control');
    } else if (z.pastMarketsMode === 'expanded') {
      hub.hidden = false;
      hub.open = true;
    }
  }
}
```

Call from: end of `updateSummaryStats`, scan start/stop, session load complete, `updateScanReadyUi`.

- [ ] **Step 4: Add “Work results” entry when results exist but workbench closed**

In scan desk actions (only if `hasResults && !resultsWorkbenchOpen`):

```html
<button type="button" class="btn-secondary" id="openResultsWorkbenchBtn">Work results</button>
```

```js
openResultsWorkbenchBtn?.addEventListener('click', () => {
  state.resultsWorkbenchOpen = true;
  applyAnalyzeVisibility();
  renderResults?.();
});
```

- [ ] **Step 5: Run unit tests + smoke**

```bash
cd modules/property-analyzer
node --test tests/analyze-visibility.test.js tests/tier-labels.test.js
```

Manual: load `/analyzer/` empty → no Session buckets / Rankings visible.  
With existing session (10k results) → KPIs + workbench visible.

- [ ] **Step 6: Commit**

```bash
git add modules/property-analyzer/public/js modules/property-analyzer/public/index.html modules/property-analyzer/lib
git commit -m "feat(analyzer): wire scan-first visibility matrix to zones"
```

---

### Task 4: Distill action row + single KPI truth (layout/distill)

**Files:**
- Modify: `modules/property-analyzer/public/index.html` — scan-ready actions
- Modify: `modules/property-analyzer/public/css/phuglee-analyzer.css`
- Modify: `modules/property-analyzer/public/js/live-scan-feed.js` — do not render a competing permanent KPI story when session strip owns post-scan
- Modify: `modules/property-analyzer/public/js/session.js` — labels via `tierUiLabel`

**Requirements:**
- Primary row: Start/Stop + Review Leads only
- Move `exportBackupNowBtn`, `apiUsageOpenBtn` into overflow menu (`#sidebarOverflowMenu` or new `#scanDeskOverflow`)
- Session KPI labels: Distressed, Well Maintained, Land, Blocked, Scanned
- Filter bar + review menu use `tierUiLabel`
- While scanning: live section owns feed; session strip may show same counts OR live KPIs only — **do not show three grids**. Spec: during scan live KPIs are truth; hide `#summarySection` while `state.running` if live KPIs already display the five buckets (update matrix if needed: `showSessionKpis: hasResults && !isScanning` and live owns scan KPIs). **Update Task 1 tests if you change the rule** — recommended rule:

```js
// Optional refinement after Task 3:
// showSessionKpis = hasResults && !isScanning
// showLiveScan KPIs handle scan-time counts
```

If refined, amend `analyze-visibility.test.js` scanning case: `showSessionKpis === false` while scanning.

- [ ] **Step 1: Update visibility tests if refining scan-time KPI ownership, then implement**
- [ ] **Step 2: HTML action row cleanup + overflow**
- [ ] **Step 3: CSS for primary vs secondary actions (heat on Start only)**
- [ ] **Step 4: Replace hardcoded filter/review menu labels with `tierUiLabel`**
- [ ] **Step 5: Manual verify first paint + scanning + complete**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(analyzer): distill action row and single KPI truth"
```

---

### Task 5: Quieter — purge cyber identity (CSS/HTML)

**Files:**
- Modify: `modules/property-analyzer/public/index.html` — body classes, remove atmosphere divs if unused, modal classes
- Modify: `modules/property-analyzer/public/css/phuglee-analyzer.css`
- Modify: `public/css/distress-analyzer-os.css`
- Optionally stop linking unused cyber sheets if nothing breaks (verify review/modal still styled)

**Kill list (visual):**
- Visible: `.scanlines`, `.grain`, `.vignette`, `.ambient-orb`, `.cyber-grid`
- Body: prefer `analyze-phuglee` only (keep temporary class aliases if CSS depends, but neutralize cyber visuals)
- Classes: `cyber-dialog` → add `phuglee-dialog` alongside, restyle `phuglee-dialog`; keep both class names during transition if JS queries `.cyber-dialog`
- Remove from property modal markup: `.rec-badge`, `.scan-line`, `.target-reticle`, text `NO SIGNAL`, `Satellite · D4D`

**Empty imagery copy:**

```js
// render.js / modal placeholder
'No Street View for this address'
```

- [ ] **Step 1: Grep kill list and replace strings**

```bash
rg -n "NO SIGNAL|rec-badge|target-reticle|Satellite · D4D|scanlines" modules/property-analyzer/public
```

- [ ] **Step 2: HTML/CSS changes (no engine logic)**
- [ ] **Step 3: Visual check embedded `/analyzer/` and standalone if used**
- [ ] **Step 4: Commit**

```bash
git commit -m "style(analyzer): purge cyber HUD identity for hybrid glass"
```

---

### Task 6: Property modal redesign (layout + quieter)

**Files:**
- Modify: `modules/property-analyzer/public/index.html` (`#propertyModal` structure)
- Modify: `modules/property-analyzer/public/css/phuglee-analyzer.css` (and residual cyber-modals only if required)
- Modify: `modules/property-analyzer/public/js/render.js` — profile header, empty states, remove gauge cosplay if replacing with clean number

**Layout (must keep ids):**
- Keep: `previewImg`, `previewSatImg`, `previewPlaceholder`, `inspectorBody`, `gaugeNum` (or map gaugeNum to clean display), `prevPropBtn`, `nextPropBtn`, `closePropertyBtn`
- Media primary left; details right
- Header: address + tier pill + nav
- No nested card-in-card; glass elevated dialog

- [ ] **Step 1: Restructure modal HTML without removing bound ids**
- [ ] **Step 2: CSS grid for modal (desktop); stack on narrow**
- [ ] **Step 3: Update empty/placeholder copy in JS**
- [ ] **Step 4: Manual: open card → modal → prev/next → Esc**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(analyzer): redesign property profile modal glass layout"
```

---

### Task 7: Review overlay redesign + card chrome

**Files:**
- Modify: `modules/property-analyzer/public/index.html` — `#reviewModeOverlay`
- Modify: `modules/property-analyzer/public/css/cyber-review.css` and/or `phuglee-analyzer.css`
- Modify: `modules/property-analyzer/public/js/render.js` — `prop-card` classes: use `prop-card` + `card-glass` instead of visual `card-cyber` (keep `card-cyber` as alias class if needed: `prop-card card-glass card-cyber`)
- Modify: review menu item labels via `tierUiLabel`

**Requirements:**
- Review action bar labels match canonical vocabulary
- Glass chrome; heat on Keep / Distressed contexts only
- Preserve keyboard handlers 1–6 and button ids

- [ ] **Step 1: CSS restyle review overlay**
- [ ] **Step 2: Card class + CSS glass elevation**
- [ ] **Step 3: Label pass on review menu + action buttons**
- [ ] **Step 4: Manual review flow Distressed 1–6**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(analyzer): hybrid review overlay and glass property cards"
```

---

### Task 8: Typeset, clarify, adapt, harden

**Files:**
- `phuglee-analyzer.css`, `tokens.css`, `index.html`, `render.js`, filter bar markup
- `public/css/distress-analyzer-os.css`

**Typeset:**
- Panel headings: Outfit semibold, not Anton for every KPI value if currently Anton
- KPI values may stay mono; labels body/sm

**Clarify:**
- All UI strings for tiers use `tierUiLabel`
- Dropzone inner copy: list expected columns or “Spreadsheet from Filter”

**Adapt:**
- Filter segmented control: horizontal scroll or wrap at <768px
- Modal stacks media above details
- Touch targets ≥ 44px on primary actions

**Harden:**
- `aria-label` on view toggles, close buttons
- Label `#resultSearch` (`aria-label="Search leads"`)
- Fix duplicate ids `failSvCount` / `failGemCount` in legacy block (rename duplicates or remove legacy if safe)
- Remove obvious dead husks only if no JS references (`rg` first)

- [ ] **Step 1: A11y + vocabulary HTML/JS**
- [ ] **Step 2: Responsive CSS**
- [ ] **Step 3: `rg` for duplicate ids and fix**
- [ ] **Step 4: Run full analyzer tests**

```bash
cd modules/property-analyzer
npm test
```

Expected: all existing tests PASS; new tests PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(analyzer): typeset, tier copy, responsive and a11y harden"
```

---

### Task 9: Polish + live verify + critique re-check

**Files:**
- Touch-up CSS only as needed
- Docs: update design spec status to Implemented when done

- [ ] **Step 1: End-to-end manual checklist**

1. Empty → import → Start Scan → live feed  
2. Complete → session KPIs → Work results / auto workbench  
3. Filter Distressed → open modal → no cyber HUD  
4. Review Leads → Distressed → keyboard flow  
5. Past markets control expands only on click  
6. Embedded shell: no double nav, glass panels  

- [ ] **Step 2: Live verify**

```powershell
cd C:\Users\brand\Projects\distress-os
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Expected: exit 0

- [ ] **Step 3: Re-run detector**

```bash
node "C:\Users\brand\.grok\installed-plugins\impeccable-aa102dc7\.claude\skills\impeccable\scripts\detect.mjs" --json "modules/property-analyzer/public/index.html"
```

- [ ] **Step 4: Optional `/impeccable critique` score note in commit message**
- [ ] **Step 5: Final commit**

```bash
git commit -m "chore(analyzer): polish Analyze redesign and verify live"
```

---

## Spec coverage self-review

| Spec section | Task(s) |
|--------------|---------|
| §2 Goal / success criteria | 3–9 |
| §3 Hybrid C + path A + hard demote + modal + review | 3–7 |
| §6 Visibility matrix | 1, 3 |
| §7 Components | 4–7 |
| §8 Canonical vocabulary | 2, 4, 8 |
| §9 CSS / cyber retirement | 5 |
| §11 Empty states | 5–6 |
| §12 Accessibility | 8 |
| §13 Testing | 1, 2, 8, 9 |
| §14 File map | All |
| Engines out of scope | Global constraints |

**Placeholder scan:** No TBD steps; browser lib load path has an explicit discovery step in Task 3.

**Type consistency:** `getAnalyzeZones` input keys and return keys used consistently in Tasks 1 and 3. `tierUiLabel` / `TIER_UI_LABELS` consistent in Tasks 2, 4, 7, 8.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-analyze-page-redesign.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, TDD + code review; **git worktree** isolation  
2. **Inline Execution** — this session with executing-plans and checkpoints  

**Which approach?** (User already requested subagent-driven-development with worktree — default to option 1 unless they say otherwise.)
