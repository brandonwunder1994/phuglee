# Government Lists Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 9,831-row Government Lists dump with a place-grouped directory (one card per city/county, trust badges, orientation strip, filter rail, action drawer) without changing catalog data, playbook API, filter semantics, or Collect/Pre-liens wiring.

**Architecture:** Pure front-end presentation change across three existing files. `government-lists-app.js` gains a grouping layer (`groupByPlace`), verify-badge + method label helpers, rail count computation, and a restyled drawer; the catalog fetch, filter predicates, and playbook/API code keep their current behavior. `government-lists.html` is restructured into rail + orientation + grouped results + drawer while preserving all element IDs the JS binds and the tab/aria structure. `government-lists.css` is rewritten against DESIGN.md tokens.

**Tech Stack:** Vanilla JS (IIFE, no framework), CSS with Phuglee tokens (`--phuglee-*`), Anton + Outfit + JetBrains Mono, node:test for the wiring test, PowerShell verify scripts, cursor-ide-browser for visual proof.

## Global Constraints

- Presentation only: do NOT modify `public/data/government-lists/catalog.json`, `/api/gov-playbooks`, filter meaning, or Collect/Pre-liens/Filter hrefs.
- Keep wiring strings so `tests/government-lists.test.js` stays green: HTML must contain `Government Lists`, `government-lists-app.js`, `government-lists.css`; app must contain `/data/government-lists/catalog.json`.
- Preserve every element ID the JS reads/binds (see Task 1 ID inventory) and the `role="tablist"`/`tab`/`tabpanel` + `aria-selected` structure.
- Tokens only: dark earth body, cream text, ember `--phuglee-orange`/gold `--phuglee-gold` for action/selection/verified only. No side-stripe borders, no gradient text, no decorative glass.
- Accessibility: WCAG AA contrast on dark; `@media (prefers-reduced-motion: reduce)` fallback on every transition; ≥44px touch targets; `font-size:16px` inputs ≤768px.
- Never claim live/fixed without proof in the same turn: `scripts\verify-live.ps1` (200) + `scripts\verify-mobile.ps1` (PASS) + a browser screenshot.

---

### Task 1: Element-ID contract + app.js data/grouping layer

**Files:**
- Modify: `public/js/government-lists-app.js`

**ID inventory (must all continue to exist in HTML after Task 2):**
`gl-toast, gl-count, gl-research-progress, gl-research-progress-stats, gl-tab-sources, gl-tab-playbooks, gl-panel-sources, gl-panel-playbooks, gl-type-chips (repurposed → type rail list), gl-search, gl-type, gl-state, gl-method, gl-hide-playbook, gl-results, gl-empty, gl-detail, gl-detail-title, gl-detail-close, gl-detail-body`, plus all `gl-pb-*` playbook IDs.

**Interfaces:**
- Produces: `groupByPlace(sources) -> [{ key, label, city, county, state, items: source[] }]` (stable order by label); `verifyBadge(status) -> { cls, label }`; `computeRailCounts(sources) -> { byType: {id:n}, byState: {st:n}, byVerify: {status:n}, states: [{value,label,count}] }`. `renderResults()` consumes grouped places; `renderDetail(src)` unchanged signature.
- Consumes: existing `state.sources`, `state.filtered`, `typeLabel`, `methodLabel`, `placeLabel`, `esc`.

- [ ] **Step 1: Add grouping + badge helpers** near `placeLabel` in `government-lists-app.js`:

```js
function placeKey(src) {
  return [src.city || '', src.county || '', src.state || ''].join('|');
}

function groupByPlace(sources) {
  const map = new Map();
  const order = [];
  for (const s of sources) {
    const key = placeKey(s);
    if (!map.has(key)) {
      map.set(key, { key, label: placeLabel(s), city: s.city || '', county: s.county || '', state: s.state || '', items: [] });
      order.push(key);
    }
    map.get(key).items.push(s);
  }
  const groups = order.map((k) => map.get(k));
  const typePriority = new Map(state.listTypes.map((t) => [t.id, t.priority || 99]));
  for (const g of groups) {
    g.items.sort((a, b) => (typePriority.get(a.listType) || 99) - (typePriority.get(b.listType) || 99));
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}

const VERIFY_BADGES = {
  verified: { cls: 'gl-badge--verified', label: 'Verified' },
  pdf_only: { cls: 'gl-badge--pdf', label: 'PDF' },
  email_only: { cls: 'gl-badge--email', label: 'Email' },
  unverified: { cls: 'gl-badge--unverified', label: 'Unverified' }
};
function verifyBadge(status) {
  return VERIFY_BADGES[status] || VERIFY_BADGES.unverified;
}
```

- [ ] **Step 2: Add `computeRailCounts`** (used by the rail in Task 3):

```js
function computeRailCounts(sources) {
  const byType = {}, byState = {}, byVerify = {};
  for (const s of sources) {
    if (s.isPlaybook) continue;
    byType[s.listType] = (byType[s.listType] || 0) + 1;
    if (s.state) byState[s.state] = (byState[s.state] || 0) + 1;
    byVerify[s.verifyStatus] = (byVerify[s.verifyStatus] || 0) + 1;
  }
  const states = Object.keys(byState).sort().map((v) => ({ value: v, label: v, count: byState[v] }));
  return { byType, byState, byVerify, states };
}
```

- [ ] **Step 3: Sanity-check the helpers** with a node one-liner (no test file needed):

Run:
```
node -e "const c=require('./public/data/government-lists/catalog.json'); const m=new Map(); for(const s of c.sources){const k=[s.city||'',s.county||'',s.state||''].join('|'); m.set(k,(m.get(k)||0)+1);} console.log('places',m.size,'sources',c.sources.length);"
```
Expected: `places 4393 sources 9831` (grouping collapses ~9.8k rows into ~4.4k cards).

- [ ] **Step 4: Commit**

```
git add public/js/government-lists-app.js
git commit -m "feat(gov-lists): add place grouping, verify badges, rail counts"
```

---

### Task 2: Restructure government-lists.html

**Files:**
- Modify: `public/government-lists.html`

**Interfaces:**
- Produces: DOM containing every ID from Task 1's inventory; new containers `gl-rail`, `gl-type-rail`, `gl-orient` (orientation strip), `gl-drawer` (may reuse `gl-detail`).
- Consumes: nothing new.

- [ ] **Step 1: Rewrite `<main>`** into: hero (`gl-hero` with Anton H1 + `gl-count`), keep `gl-research-progress`, keep `gl-tabs` (Sources / County playbooks), then `#gl-panel-sources` containing a two-column `gl-workspace`:
  - `<aside id="gl-rail" class="gl-rail">` with: search (`gl-search`), a `<div id="gl-type-rail">` (replaces `gl-type-chips`; JS renders the type toggle list here — keep `id="gl-type-chips"` as an alias container OR rename references in Task 3), hidden native `<select id="gl-type">`/`<select id="gl-state">`/`<select id="gl-method">` retained for logic + populated, verify-status `<select id="gl-verify">` (new, optional filter), `gl-hide-playbook` checkbox, Clear-all button `gl-clear`.
  - `<section class="gl-main">` with `<div id="gl-orient" class="gl-orient"></div>`, `<div id="gl-results" class="gl-results" role="list"></div>`, `<p id="gl-empty" hidden>`, and the restyled `<aside id="gl-detail">` drawer (keep `gl-detail-title`, `gl-detail-close`, `gl-detail-body`).
- Keep `#gl-panel-playbooks` markup exactly as-is (all `gl-pb-*` IDs preserved).
- Keep `<head>` wiring; bump `government-lists.css?v=` and `government-lists-app.js?v=` by one.

- [ ] **Step 2: Verify IDs present** — run:
```
node -e "const h=require('fs').readFileSync('public/government-lists.html','utf8'); const ids=['gl-toast','gl-count','gl-tab-sources','gl-tab-playbooks','gl-panel-sources','gl-panel-playbooks','gl-search','gl-type','gl-state','gl-method','gl-hide-playbook','gl-results','gl-empty','gl-detail','gl-detail-title','gl-detail-close','gl-detail-body','gl-pb-form','gl-pb-list','gl-pb-county']; const miss=ids.filter(i=>!h.includes('id=\"'+i+'\"')); console.log(miss.length?('MISSING '+miss.join(',')):'all ids present'); console.log('wiring', h.includes('government-lists-app.js')&&h.includes('government-lists.css')&&h.includes('Government Lists'));"
```
Expected: `all ids present` and `wiring true`.

- [ ] **Step 3: Commit**
```
git add public/government-lists.html
git commit -m "feat(gov-lists): restructure page into rail + grouped main + drawer"
```

---

### Task 3: Rework render + bind for grouped directory

**Files:**
- Modify: `public/js/government-lists-app.js`

**Interfaces:**
- Consumes: `groupByPlace`, `verifyBadge`, `computeRailCounts` (Task 1); DOM from Task 2.
- Produces: grouped `renderResults()`, `renderTypeRail()` (replaces `renderTypeChips`), `renderOrient()`, updated `applyFilters()` (adds verify filter + rail/orient refresh), `bind()` additions for `gl-clear` and type-rail clicks.

- [ ] **Step 1: Replace `renderResults`** so it renders grouped place cards over `state.filtered`:

```js
function renderResults() {
  const host = $('gl-results');
  const empty = $('gl-empty');
  const count = $('gl-count');
  if (!host) return;
  const groups = groupByPlace(state.filtered);
  if (count && state.tab === 'sources') {
    count.textContent = state.filtered.length
      ? `${state.filtered.length.toLocaleString()} sources · ${groups.length.toLocaleString()} places`
      : '0 sources';
  }
  const slice = groups.slice(0, state.visibleCount);
  if (!slice.length) { host.innerHTML = ''; if (empty) empty.hidden = false; return; }
  if (empty) empty.hidden = true;
  host.innerHTML = slice.map((g) => {
    const rows = g.items.map((s) => {
      const b = verifyBadge(s.verifyStatus);
      const active = s.id === state.openId ? ' is-active' : '';
      return `<button type="button" class="gl-list-row${active}" role="listitem" data-id="${esc(s.id)}">
        <span class="gl-list-type">${esc(typeLabel(s.listType))}</span>
        <span class="gl-list-method">${esc(methodLabel(s.method))}</span>
        <span class="gl-badge ${b.cls}">${esc(b.label)}</span>
        <span class="gl-list-go" aria-hidden="true">&rarr;</span>
      </button>`;
    }).join('');
    return `<article class="gl-place">
      <header class="gl-place-head">
        <h3 class="gl-place-name">${esc(g.label)}</h3>
        <span class="gl-place-count">${g.items.length} list${g.items.length === 1 ? '' : 's'}</span>
      </header>
      <div class="gl-place-rows">${rows}</div>
    </article>`;
  }).join('');
  if (groups.length > state.visibleCount) {
    host.insertAdjacentHTML('beforeend',
      `<button type="button" class="phuglee-btn phuglee-btn-ghost gl-more" id="gl-more">Show more (${(groups.length - state.visibleCount).toLocaleString()} places left)</button>`);
  }
}
```

- [ ] **Step 2: Add `renderTypeRail` + `renderOrient`; replace `renderTypeChips` calls.**

```js
function renderTypeRail() {
  const host = $('gl-type-rail') || $('gl-type-chips');
  if (!host) return;
  const counts = computeRailCounts(state.sources).byType;
  const active = ($('gl-type') && $('gl-type').value) || '';
  const rows = state.listTypes.slice().sort((a, b) => a.priority - b.priority).map((t) => {
    const pressed = active === t.id ? 'true' : 'false';
    const n = counts[t.id] || 0;
    return `<button type="button" class="gl-type-row" data-type="${esc(t.id)}" aria-pressed="${pressed}">
      <span class="gl-type-row-label">${esc(t.label)}</span>
      <span class="gl-type-row-count">${n.toLocaleString()}</span>
    </button>`;
  }).join('');
  host.innerHTML = rows;
}

function renderOrient() {
  const host = $('gl-orient');
  if (!host) return;
  const c = computeRailCounts(state.filtered);
  const places = new Set(state.filtered.filter((s) => !s.isPlaybook).map(placeKey)).size;
  const cells = [
    ['Sources', state.filtered.filter((s) => !s.isPlaybook).length],
    ['Places', places],
    ['Verified', c.byVerify.verified || 0],
    ['PDF', c.byVerify.pdf_only || 0],
    ['Email', c.byVerify.email_only || 0]
  ];
  host.innerHTML = cells.map(([l, v]) =>
    `<span class="gl-orient-cell"><span class="gl-orient-label">${esc(l)}</span><strong>${Number(v).toLocaleString()}</strong></span>`
  ).join('');
}
```

- [ ] **Step 3: Update `applyFilters`** to add the verify filter and refresh rail + orient. Add after the `method` check:
```js
      const verify = ($('gl-verify') && $('gl-verify').value) || '';
```
and in the predicate (before the search `q` block):
```js
      if (verify && s.verifyStatus !== verify) return false;
```
and at the end of `applyFilters`, replace `renderTypeChips();` with:
```js
    renderResults();
    renderTypeRail();
    renderOrient();
```

- [ ] **Step 4: Wire new controls in `bind()`** — add `gl-verify` to the change-listener id list; change the `gl-type-chips` click handler to also match `gl-type-rail` (`$('gl-type-rail')?.addEventListener(...)` with the same `[data-type]` toggle logic); add:
```js
    $('gl-clear')?.addEventListener('click', () => {
      ['gl-search','gl-type','gl-state','gl-method','gl-verify'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
      applyFilters();
    });
```
Also populate the new verify select in `init()` after the state select is filled:
```js
      fillSelect($('gl-verify'), [
        { value: 'verified', label: 'Verified' },
        { value: 'pdf_only', label: 'PDF only' },
        { value: 'email_only', label: 'Email only' },
        { value: 'unverified', label: 'Unverified' }
      ], 'Any status');
```

- [ ] **Step 5: Run the wiring test**
Run: `node --test tests/government-lists.test.js`
Expected: PASS (2 tests) — wiring strings + catalog references intact.

- [ ] **Step 6: Commit**
```
git add public/js/government-lists-app.js
git commit -m "feat(gov-lists): grouped place cards, type rail, orientation strip, verify filter"
```

---

### Task 4: Rewrite government-lists.css for the grouped directory

**Files:**
- Modify: `public/css/government-lists.css`

**Interfaces:**
- Consumes: markup/classes from Tasks 2-3 (`gl-workspace, gl-rail, gl-type-rail, gl-type-row, gl-orient, gl-place, gl-list-row, gl-badge, gl-detail` drawer, playbook classes).
- Produces: full stylesheet using `--phuglee-*` tokens.

- [ ] **Step 1: Rewrite the stylesheet** with: wider `.gl-page .vault-main--app` (max-width ~1320px); `.gl-workspace` grid (`260px minmax(0,1fr)` ≥1024px, single column below with rail → horizontal filter bar); sticky `.gl-rail` on a second neutral surface; `.gl-type-row` list (label left, count right, gold active state, ≥44px); `.gl-orient` thin inline stat bar (mono values, no big-number template); `.gl-place` card (full 1px border, subtle bg) with `.gl-place-head` (Anton-free H3, cream) and `.gl-place-rows`; `.gl-list-row` as a grid (`type | method | badge | arrow`, hover gold border, `.is-active` gold bg, ≥44px); `.gl-badge` variants (`--verified` gold/green, `--pdf`, `--email`, `--unverified` muted, all AA contrast); `.gl-detail` drawer sticky right ≥1024px and stacked/sheet below; skeleton `.gl-place--skeleton`; keep/restyle all `.gl-pb-*` playbook rules to the new tokens. Include `@media (max-width:768px)` (16px inputs, 44px targets, no h-scroll) and `@media (prefers-reduced-motion: reduce)` (transitions → none/opacity only).

- [ ] **Step 2: Contrast + overflow sanity** — confirm body text on card bg ≥4.5:1 and badges ≥3:1 by reading the token values; ensure `.gl-place-rows` and `.gl-template` are the only horizontal-scroll owners (wrappers), never the page.

- [ ] **Step 3: Commit**
```
git add public/css/government-lists.css
git commit -m "feat(gov-lists): grouped directory stylesheet (rail, cards, badges, drawer)"
```

---

### Task 5: Verify live, mobile, and visual

**Files:** none (verification only).

- [ ] **Step 1: Ensure server + health**
Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1`
Expected: `LIVE ok health=200 home=200`. If down: `scripts\restart.ps1` then re-run.

- [ ] **Step 2: Mobile**
Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-mobile.ps1 -Pages "/government-lists"`
Expected: `MOBILE ok` (no horizontal overflow at 375/320px). Fix CSS if exit code 1.

- [ ] **Step 3: Browser proof (desktop + mobile widths)**
Navigate cursor-ide-browser to `http://127.0.0.1:3000/government-lists`; screenshot full page (expect grouped place cards, rail with type counts, orientation strip, badges). Click a list row; screenshot the open drawer. Resize/emulate ~390px; screenshot single-column layout. Also click "County playbooks" tab; confirm the form still renders and saves are unaffected.

- [ ] **Step 4: Node tests**
Run: `node --test tests/government-lists.test.js`
Expected: PASS.

- [ ] **Step 5: Commit any fixes** discovered during verification, then report verified with the exact assertions (health=200, MOBILE ok, tests pass) and screenshots.
