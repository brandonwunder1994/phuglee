# Phase 44: Admin Train brain UX - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Bridge admin-only Train brain UI (vanilla HTML/CSS/JS on results)  
**Confidence:** HIGH

## Summary

Phase 44 is a **client-only UX layer** on Filter results. It does **not** persist decisions or write brain rules (phase 45). It consumes the phase 43 process payload (`lastResult.reviewGroups`, `notDistressedRows`, `rowIds`) and renders an admin-only **Train brain** surface with two sections (marked distressed / not marked), stacked violation-type group cards, matched signal chips, description samples, and ✓ Approve / ✗ Deny controls.

The existing Bridge page already has the insertion points: `renderResults(data)` stores `lastResult`, builds KPI + table chrome, and uses `esc()` / `setHidden()` / `bridge-tag` patterns. Admin identity is already established elsewhere as exact session username `admin` (`public/js/settings-menu.js` → `PhugleeSettings.isAdmin`, `phuglee-session-headers.js` special-cases plan for `admin`). Non-admin must never see train chrome — client hide only in this phase; server enforce lands in 45.

**Primary recommendation:** Extend `public/bridge.html` + `public/js/bridge.js` + `public/css/bridge.css` with a mode-tab shell (`Kept list` | `Train brain`), admin gate via `PhugleeSession.getSessionUser() === 'admin'`, pure render from `reviewGroups`, and stubbed decision handlers ready for phase 45 POST without redesign.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Admin = session username `admin` (client hide + later server enforce in 45)
- Group by violation type as returned in reviewGroups
- Match existing bridge design system (no new visual language)
- Vanilla HTML/CSS/JS in public/bridge.*

### Claude's Discretion
- Tab vs panel layout details; toast copy

### Deferred Ideas (OUT OF SCOPE)
Real decision persistence (45), phrase panel (46)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRAIN-01 | Admin can open Train brain on Filter results with two sections: marked distressed and not marked distressed | Mode tabs + `#bridge-train-panel` with two `aria-labelledby` sections; show only after `renderResults` when admin; bind `reviewGroups.distressed` / `reviewGroups.notDistressed` |
| TRAIN-02 | Admin can Approve or Deny a stacked violation-type group with one action | Per-card ✓ Approve / ✗ Deny buttons carrying `data-group-id`, `data-section`, `data-action`; one click = whole group; stub handler until 45 |
| TRAIN-03 | Non-admin users never see train controls | `isBridgeAdmin()`; keep `#bridge-train-wrap` `hidden` and never inject train markup for non-admin; no train tab in DOM for non-admin preferred |
| TRAIN-04 | Train UI shows matched signals and description samples on each group card | Render `matchedIndicators` as chips + `descriptionSamples` (truncate ~160 chars) + optional `sampleAddresses` from ReviewGroup shape |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Vanilla DOM + IIFE | `public/js/bridge.js` (~1141 lines) | Results state + render | Project convention; no SPA framework |
| `public/bridge.html` | existing | Markup shell for train wrap | Page owns stable IDs |
| `public/css/bridge.css` | existing (`?v=5`) | Cards, tags, buttons, KPI grid | Match design system; no new visual language |
| `window.PhugleeSession` | `public/js/auth-session.js` | Session username via `getSessionUser()` | Canonical client session |
| `window.PhugleeSessionHeaders` | `public/js/phuglee-session-headers.js` | Future decision headers | Loaded before bridge; phase 45 reuse |
| `window.PhugleeSettings.isAdmin` | `public/js/settings-menu.js` | Existing admin check pattern | Same rule: `getSessionUser() === 'admin'` |
| Phase 43 payload | process response | `reviewGroups`, `rowIds`, `notDistressedRows` | Data source for cards (depends on 43) |
| `node:test` | built-in | Static/source unit tests | Project standard (`npm test`) |

### Supporting

| Module / Pattern | Purpose | When to Use |
|------------------|---------|-------------|
| `esc(text)` in bridge.js | XSS-safe HTML build | All dynamic train card strings |
| `setHidden(el, hidden)` | Show/hide panels | Mode toggle + admin gate |
| `bridge-tag` / `bridge-kpi` / `bridge-history-item` CSS | Existing card/chip vocabulary | Reuse classes or mirror under `.bridge-train-*` |
| `auth-tabs` / `.auth-tab` pattern | Segmented control look | Visual reference for mode tabs (copy structure into bridge.css, not import auth.css) |
| `showError` / `setSaveStatus` / `setAttachStatus` | Status messaging | Soft train feedback (stub toast) |
| Design spec | `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` §6 UX | Canonical UX structure |
| Prior plan notes | `docs/gsd/plans/2026-07-09-phase-44-filter-admin-review-ux.md` | Task sketch; correct API names before use |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mode tabs (Kept \| Train) | Always-visible train panel below table | Tabs match locked design §6; less vertical noise for non-train work — **prefer tabs** (discretion) |
| Local `isBridgeAdmin()` | Only `PhugleeSettings.isAdmin()` | Settings may load later / optional; local helper + fallbacks is safer and unit-testable |
| Real POST decisions | Stub only | Phase 45 owns API; UI must not fake success |
| Analyzer learned-rules UI | Port from property-analyzer | Forbidden domain; different CSS/theme; would break design lock |
| React/component framework | Stay vanilla | Explicit product + CONTEXT lock |

**Installation:** none — no new npm packages.

```bash
# verify only
npm test
node --test tests/bridge-train-ux.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

## Architecture Patterns

### Recommended Project Structure

```
public/
├── bridge.html                 # ADD train wrap + mode tabs inside #bridge-results-panel
├── css/bridge.css              # ADD .bridge-results-mode, .bridge-train-*, chip/action styles
└── js/
    ├── bridge.js               # MODIFY — isBridgeAdmin, renderTrain*, mode toggle, stub handlers
    ├── auth-session.js         # REUSE getSessionUser (do not invent getUsername)
    ├── phuglee-session-headers.js  # REUSE later for 45; no change required in 44
    └── settings-menu.js        # PATTERN — isAdmin === (user === 'admin')

tests/
└── bridge-train-ux.test.js     # CREATE — static HTML/JS + pure helper tests via vm if extracted
```

### Pattern 1: Admin gate (client hide)

**What:** Exact match session username `admin` (case-sensitive as stored; bootstrap uses lowercase `admin`).  
**When to use:** Before showing train wrap, mode tabs, or approve/deny buttons.  
**Example:**

```js
// Source: public/js/settings-menu.js (isAdmin) + public/js/auth-session.js (getSessionUser)
// Do NOT use PhugleeSession.getUsername — it does not exist.
function isBridgeAdmin() {
  try {
    if (window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function') {
      return window.PhugleeSettings.isAdmin() === true;
    }
    const u = (window.PhugleeSession && typeof window.PhugleeSession.getSessionUser === 'function')
      ? window.PhugleeSession.getSessionUser()
      : (sessionStorage.getItem('phuglee_session') || '');
    return String(u || '').trim() === 'admin';
  } catch (_) {
    return false;
  }
}
```

**Confidence:** HIGH — verified against `auth-session.js`, `settings-menu.js`, design §5.

### Pattern 2: Mode tabs (Kept list | Train brain) — discretionary choice

**What:** Segmented control inside results panel; default **Kept list**. Train panel hidden until tab selected.  
**When to use:** Always for admin after process with any result payload; non-admin never mounts tabs.  
**Why tabs over stacked panel:** Matches design spec §6; keeps save/export workflow primary; discretionary toast/layout freedom still allows simple stack if tabs prove cramped on mobile (CSS: stack tabs full-width).

```html
<!-- Source: design §6 + docs/gsd/plans/2026-07-09-phase-44-filter-admin-review-ux.md -->
<div id="bridge-train-wrap" hidden>
  <div class="bridge-results-mode" role="tablist" aria-label="Results mode">
    <button type="button" role="tab" id="bridge-mode-kept" data-mode="kept"
      class="bridge-mode-tab is-active" aria-selected="true" aria-controls="bridge-kept-view">Kept list</button>
    <button type="button" role="tab" id="bridge-mode-train" data-mode="train"
      class="bridge-mode-tab" aria-selected="false" aria-controls="bridge-train-panel">Train brain</button>
  </div>
  <div id="bridge-train-panel" hidden role="tabpanel" aria-labelledby="bridge-mode-train">
    <section aria-labelledby="train-distressed-h">
      <h3 id="train-distressed-h">Marked distressed</h3>
      <p class="bridge-panel-lead">Approve if the tagger is right. Deny removes these from the kept list (training writes in phase 45).</p>
      <div id="bridge-train-distressed" class="bridge-train-groups"></div>
    </section>
    <section aria-labelledby="train-fn-h">
      <h3 id="train-fn-h">Not marked distressed</h3>
      <p class="bridge-panel-lead">Catch false negatives. Approve promotes into the kept list (phase 45).</p>
      <div id="bridge-train-not-distressed" class="bridge-train-groups"></div>
    </section>
  </div>
</div>
```

Place `#bridge-train-wrap` inside `#bridge-results-panel` **after** KPI/meta (so chrome is visible) and **before or around** toolbar/table — recommended: after KPIs, with mode toggle controlling visibility of toolbar+table (`kept`) vs train panel (`train`). Save/attach can remain visible in both modes or only in kept — prefer **kept-only** for save/export to avoid mutating confusion before 45.

### Pattern 3: Render from `lastResult.reviewGroups`

**What:** Pure DOM string build from phase 43 shape; no regrouping client-side.  
**When to use:** End of `renderResults(data)` after `lastResult = data`.

```js
// Source: design §4.3 ReviewGroup (phase 43 contract)
// ReviewGroup = {
//   groupId, section: 'distressed' | 'not_distressed',
//   violationTypeLabel, violationTypeKey, count, rowIds[],
//   sampleAddresses[], matchedIndicators[], descriptionSamples[],
//   confidenceLevels[], isSingleton
// }
// reviewGroups = { distressed: ReviewGroup[], notDistressed: ReviewGroup[] }

function getReviewGroups(data) {
  const g = data && data.reviewGroups;
  return {
    distressed: Array.isArray(g && g.distressed) ? g.distressed : [],
    notDistressed: Array.isArray(g && g.notDistressed) ? g.notDistressed : []
  };
}
```

### Pattern 4: Group card

**What:** One card = one stacked type group; one Approve and one Deny.  
**When to use:** Every group in both sections.

```js
// Source: design §6 + phase-44 plan — build with esc()
function renderTrainGroupCard(group) {
  const count = Number(group.count || group.rowIds?.length || 0);
  const singleton = group.isSingleton || count === 1
    ? '<span class="bridge-train-badge bridge-train-badge--singleton">Singleton</span>'
    : '';
  const chips = (group.matchedIndicators && group.matchedIndicators.length)
    ? group.matchedIndicators.map((s) =>
        `<span class="bridge-tag bridge-tag--strong">${esc(s)}</span>`).join(' ')
    : '<span class="bridge-train-muted">No matched signals</span>';
  const samples = (group.descriptionSamples || []).slice(0, 5).map((d) => {
    const t = String(d || '');
    const cut = t.length > 160 ? t.slice(0, 157) + '…' : t;
    return `<li>${esc(cut)}</li>`;
  }).join('') || '<li class="bridge-train-muted">No description samples</li>';
  const addrs = (group.sampleAddresses || []).slice(0, 5)
    .map((a) => esc(a)).join(' · ');

  return (
    `<article class="bridge-train-group" data-group-id="${esc(group.groupId)}" data-section="${esc(group.section)}">` +
    `<header class="bridge-train-group-head">` +
    `<h4 class="bridge-train-group-title">${esc(group.violationTypeLabel || 'Unknown type')}</h4>` +
    `<span class="bridge-train-count">×${count.toLocaleString()}</span>${singleton}` +
    `</header>` +
    `<div class="bridge-train-signals" aria-label="Matched signals">${chips}</div>` +
    `<ul class="bridge-train-descriptions">${samples}</ul>` +
    (addrs ? `<p class="bridge-train-addresses">${addrs}</p>` : '') +
    `<div class="bridge-train-actions">` +
    `<button type="button" class="bridge-btn bridge-btn-primary bridge-train-approve" data-action="approve" aria-label="Approve group ${esc(group.violationTypeLabel)}">✓ Approve</button>` +
    `<button type="button" class="bridge-btn bridge-btn-ghost bridge-train-deny" data-action="deny" aria-label="Deny group ${esc(group.violationTypeLabel)}">✗ Deny</button>` +
    `</div></article>`
  );
}
```

### Pattern 5: Stub decision handler (phase 45 seam)

**What:** Wire click handlers that resolve group from `data-*`, show soft status, optionally mark card `is-resolved` visually — **do not** claim brain write success.  
**When to use:** TRAIN-02 UI complete without DEC-*.

```js
// Prefer explicit PHASE45 seam over fake API success
function onTrainDecision(action, group) {
  // Phase 45: POST /api/bridge/brain/decisions with phugleeSessionHeaders
  // body: { action, section: group.section, groupId, rowIds, violationTypeKey, ... }
  setTrainStatus(
    `“${group.violationTypeLabel}” ${action} recorded locally — training API ships in phase 45.`,
    'info'
  );
  // Optional: visual only — card.classList.add('is-pending') — not is-success that implies brain write
}
```

**Recommendation (discretion — toast copy):** Use a dedicated `#bridge-train-status` `role="status"` line under the mode tabs (mirror `bridge-save-status`), not a global toast system. Copy:

| Event | Copy |
|-------|------|
| Approve click (stub) | `Approve queued for “{type}” · training API ships in phase 45` |
| Deny click (stub) | `Deny queued for “{type}” · training API ships in phase 45` |
| Empty groups | `No review groups in this batch. Process a code-violation file with mixed types to train.` |
| Missing reviewGroups (pre-43 server) | `Train brain needs a process response with review groups (phase 43).` |

### Anti-Patterns to Avoid

- **`PhugleeSession.getUsername`:** Does not exist — use `getSessionUser` (plan doc error).
- **Regrouping on client:** Do not re-stack by type; trust phase 43 `reviewGroups`.
- **Showing train chrome in HTML without JS gate:** Static visible train wrap fails TRAIN-03 if JS fails open — default `hidden`, only unhide for admin.
- **Fake 200 success:** Do not invent decision API responses in 44.
- **Analyzer AI Brain UI copy:** Different product surface; do not share CSS modules from property-analyzer.
- **Revealing train to non-admin via CSS only:** Hide entire wrap in JS; prefer not rendering tabs at all for non-admin.
- **Icon-only buttons:** Always include text + `aria-label` (a11y quality bar).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin detection | New auth protocol | `PhugleeSession.getSessionUser` / `PhugleeSettings.isAdmin` | Already canonical; spoofable but server 45 will enforce |
| Grouping algorithm | Client re-group | `lastResult.reviewGroups` from phase 43 | Product grouping + rowIds already server-side |
| XSS escaping | Manual ad-hoc replace | Existing `esc()` | Consistent with table/history render |
| Design system | New colors/fonts | `--phuglee-*`, `bridge-btn`, `bridge-tag`, glass panels | CONTEXT lock: no new visual language |
| Toast framework | toastify / custom portal | `role="status"` status line | Bridge already uses inline status patterns |
| Decision persistence | localStorage brain | Phase 45 API | Deferred |
| Phrase rule panel | Extra drawer | Phase 46 | Deferred |

**Key insight:** Phase 44 is almost entirely presentation. Risk is leaking chrome to non-admin or inventing a second grouping/auth model — not missing libraries.

## Common Pitfalls

### Pitfall 1: Admin check wrong API name
**What goes wrong:** `getUsername` undefined → always non-admin → train never shows.  
**Why it happens:** Draft plan uses non-existent API.  
**How to avoid:** Use `getSessionUser()`; unit-test helper with vm mock sessionStorage.  
**Warning signs:** Admin login still no Train tab.

### Pitfall 2: `reviewGroups` missing (phase 43 not executed / stub response)
**What goes wrong:** `Cannot read properties of undefined` or blank crash.  
**Why it happens:** Engine not yet shipping groups.  
**How to avoid:** `getReviewGroups` defensive empty arrays + empty-state copy.  
**Warning signs:** Console errors after process; train tab opens empty crash.

### Pitfall 3: Non-admin still sees chrome
**What goes wrong:** TRAIN-03 fail.  
**Why it happens:** Markup always visible; only CSS hide; or AUTH_DISABLED shows everyone as admin incorrectly.  
**How to avoid:** Gate on username only (not plan); keep wrap `hidden` by default; when `AUTH_DISABLED`, still require session user `admin` for train chrome (do not treat auth-disabled as admin).  
**Warning signs:** Non-admin session sees mode tabs.

### Pitfall 4: Train mode hides save forever
**What goes wrong:** Admin switches to Train and cannot find Save list.  
**Why it happens:** Aggressive hide of entire results body.  
**How to avoid:** Mode toggle only swaps table vs train; keep results meta + KPIs; clear path back to Kept list.  
**Warning signs:** Support confusion after training.

### Pitfall 5: XSS via description samples
**What goes wrong:** Malicious city notes inject HTML.  
**Why it happens:** Unescaped `innerHTML` join.  
**How to avoid:** Always `esc()` labels, samples, addresses, groupIds in attributes.  
**Warning signs:** Broken markup when description has `<` or quotes.

### Pitfall 6: Water shut-off noise
**What goes wrong:** Train sections full of water groups with no type-suppress semantics.  
**Why it happens:** Water still produces rows/groups.  
**How to avoid:** Optional soft note on train panel when `uploadType === 'water_shut_off'`: type suppress does not apply (phase 42 rule); still allow UI if groups exist. Do not special-case hide entire train unless product asks.  
**Warning signs:** Admin confuses water training with code-violation type rules.

### Pitfall 7: Breaking non-admin results regression
**What goes wrong:** Table/export/save broken by train refactor.  
**Why it happens:** `renderResults` rewrite without preserving paths.  
**How to avoid:** Add train as additive branch after existing table setup; keep `lastResult` contract.  
**Warning signs:** Existing bridge tests or manual process fail.

## Code Examples

### Hook into `renderResults`

```js
// Source: public/js/bridge.js renderResults — extend after lastResult assignment
function renderResults(data) {
  lastResult = data;
  tableState.page = 1;
  // ... existing meta, KPIs, table visibility ...

  const trainWrap = document.getElementById('bridge-train-wrap');
  if (isBridgeAdmin()) {
    setHidden(trainWrap, false);
    renderTrainGroups(getReviewGroups(data));
    setResultsMode(resultsMode || 'kept'); // preserve mode if re-render after future 45
  } else {
    setHidden(trainWrap, true);
    // clear train containers so no residual DOM
    const d = document.getElementById('bridge-train-distressed');
    const n = document.getElementById('bridge-train-not-distressed');
    if (d) d.innerHTML = '';
    if (n) n.innerHTML = '';
  }
}
```

### Event delegation for Approve/Deny

```js
// Source: project pattern — listsBody click delegation in bridge.js
document.getElementById('bridge-train-panel')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="approve"], [data-action="deny"]');
  if (!btn || !isBridgeAdmin()) return;
  const card = btn.closest('.bridge-train-group');
  if (!card) return;
  const groupId = card.getAttribute('data-group-id');
  const section = card.getAttribute('data-section');
  const action = btn.getAttribute('data-action');
  const groups = getReviewGroups(lastResult);
  const list = section === 'not_distressed' ? groups.notDistressed : groups.distressed;
  const group = list.find((g) => g.groupId === groupId);
  if (!group) return;
  onTrainDecision(action, group);
});
```

### CSS tokens to mirror (no new palette)

```css
/* Source: public/css/bridge.css — extend, don't replace */
.bridge-results-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  margin: 0 0 1rem;
  padding: 0.28rem;
  background: rgba(0, 0, 0, 0.38);
  border: 1px solid rgba(174, 163, 143, 0.14);
  border-radius: var(--radius-md);
}
.bridge-train-group {
  padding: 0.85rem 0.9rem;
  margin-bottom: 0.65rem;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(174, 163, 143, 0.14);
  border-radius: var(--radius-sm);
}
.bridge-train-deny {
  border-color: rgba(220, 80, 60, 0.35);
  color: #f0b4a8;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Results = kept table only | Kept + admin Train brain mode | v1.6 / phase 44 | Admin can grade type groups |
| FN rows dropped silently | Full `notDistressedRows` + groups (43) | Phase 43 | Train section B has data |
| Static regex only | Global brain (42) + HITL train (44–46) | v1.6 | Product “superpower” |

**Deprecated/outdated:**
- Draft plan snippet using `PhugleeSession.getUsername` — use `getSessionUser`
- Wiring real decision persistence in this phase — deferred to 45

## Open Questions

1. **Should save/export remain available in Train mode?**
   - What we know: Spec emphasizes list mutation after decisions (45); save uses `lastResult.rows`.
   - What's unclear: UX preference.
   - Recommendation: Keep meta+KPIs always; hide table toolbar in train mode; **leave save panel visible** so admin can still save after returning to kept — or keep save always visible under both modes. Prefer save always visible.

2. **Expand group → sample rows table?**
   - What we know: Design §6 item 3 optional expand; phase 44 plan marks optional.
   - What's unclear: Effort vs value for v1.
   - Recommendation: **Skip expand table in 44** if time-constrained; cards already show addresses + descriptions. Easy add later via `rowIds` lookup on `lastResult.rows` / `notDistressedRows`.

3. **Case of admin username (`Admin` vs `admin`)?**
   - What we know: Bootstrap and storage use lowercase `admin`; `sanitizePhugleeUsername` lowercases on server.
   - What's unclear: Hand-edited sessionStorage.
   - Recommendation: Exact `=== 'admin'` to match `PhugleeSettings.isAdmin`; do not accept `admin@phuglee.com` as train admin (settings-menu does not).

4. **Phase 43 not yet implemented when 44 plans execute?**
   - What we know: Roadmap order 42→43→44.
   - Recommendation: Plan 44 assumes 43 payload; defensive empty groups; do not reimplement grouping in 44.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node built-in) |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-train-ux.test.js` |
| Full suite command | `npm test` |
| Live verify | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TRAIN-01 | Markup has two train sections + mode control IDs | unit (static HTML) | `node --test tests/bridge-train-ux.test.js` | ❌ Wave 0 |
| TRAIN-01 | `getReviewGroups` / render helpers handle both sections | unit | same | ❌ Wave 0 |
| TRAIN-02 | Card HTML includes Approve + Deny with data-action | unit (string assert) | same | ❌ Wave 0 |
| TRAIN-03 | `isBridgeAdmin` true only for `admin`; non-admin path leaves wrap hidden | unit (vm + sessionStorage mock) | same | ❌ Wave 0 |
| TRAIN-03 | bridge.js source contains admin gate / no open train by default | unit (source read) | same | ❌ Wave 0 |
| TRAIN-04 | Card render includes matchedIndicators + descriptionSamples | unit | same | ❌ Wave 0 |
| TRAIN-* | Live page still 200 after HTML/CSS/JS edit | smoke | `scripts\verify-live.ps1` | ✅ scripts exist |
| TRAIN-* | Admin/non-admin visual | manual | Login admin vs other → process → observe | manual-only (no browser runner) |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-train-ux.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + `scripts\verify-live.ps1` exit 0 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-train-ux.test.js` — covers TRAIN-01–04 static + helper behaviors
- [ ] Optional: extract pure helpers (`isBridgeAdmin`, `getReviewGroups`, `renderTrainGroupCard`) to testable functions in bridge.js or thin `public/js/bridge-train.js` if planner wants cleaner unit seams (discretion: keep in bridge.js IIFE with vm load pattern like `auth-session.test.js` if needed)
- [ ] No framework install required

## Sources

### Primary (HIGH confidence)

- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — §4.3 ReviewGroup, §5 admin gate, §6 UX, phase map
- `public/js/bridge.js` — `lastResult`, `renderResults`, `esc`, table/KPI patterns
- `public/bridge.html` — `#bridge-results-panel` structure, script load order
- `public/js/auth-session.js` — `getSessionUser`, session key `phuglee_session`
- `public/js/phuglee-session-headers.js` — session headers + admin plan default
- `public/js/settings-menu.js` — `ADMIN_USER = 'admin'`, `isAdmin()`
- `public/css/bridge.css` — tags, KPI, buttons, history cards
- `.planning/REQUIREMENTS.md` — TRAIN-01–04
- `.planning/ROADMAP.md` — Phase 44 success criteria
- `.planning/codebase/CONVENTIONS.md` — frontend IIFE, DOM ID prefixes, relative `/api`
- `.planning/phases/44-admin-train-brain-ux/44-CONTEXT.md` — locked decisions
- `docs/gsd/plans/2026-07-09-phase-43-filter-review-groups.md` — payload contract dependency
- `docs/gsd/plans/2026-07-09-phase-45-filter-brain-decisions.md` — API seam for handlers
- `tests/auth-session.test.js` — vm loading pattern for public JS

### Secondary (MEDIUM confidence)

- `docs/gsd/plans/2026-07-09-phase-44-filter-admin-review-ux.md` — task sketch (correct getUsername → getSessionUser)
- `docs/gsd/milestones/M7-filter-superpower-brain.md` — quality bar phase 44
- `public/css/auth.css` `.auth-tabs` — visual reference for segmented mode control

### Tertiary (LOW confidence)

- Optional expand-to-rows table UX — design optional, not requirement-gated
- Exact toast wording — discretionary

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; verified files on disk
- Architecture: HIGH — design + existing bridge insertion points aligned
- Pitfalls: HIGH — admin API name, XSS, missing reviewGroups are concrete
- Layout discretion (tabs vs panel): MEDIUM — recommend tabs per design §6

**Research date:** 2026-07-09  
**Valid until:** 2026-08-08 (stable vanilla surface; recheck if bridge.js results architecture changes)

---

## Planner Notes (prescriptive)

1. **Do not** implement decision API, list mutation, or brain writes — stub only.
2. **Do** depend on phase 43 field names: `reviewGroups.distressed` / `reviewGroups.notDistressed`, `matchedIndicators`, `descriptionSamples`, `groupId`, `section`, `rowIds`, `isSingleton`.
3. **Files to touch:** `public/bridge.html`, `public/js/bridge.js`, `public/css/bridge.css` (+ cache-bust `?v=` on css/js), `tests/bridge-train-ux.test.js`.
4. **Admin rule:** session username exact `admin`; client-only hide.
5. **A11y:** tablist/tab/tabpanel roles; labeled Approve/Deny; section headings.
6. **Verify:** `npm test` + `scripts\verify-live.ps1`; manual admin vs non-admin on `/bridge`.
