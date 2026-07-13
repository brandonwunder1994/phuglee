# The Vault (Leads Platform) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real, filter-first curated leads database at `/vault` for Max-plan members, fed by the Filter → Analyze pipeline.

**Architecture:** Evolve the existing Vault preview in place. Backend lives in `lib/leads-platform/` (schema, disk store, query API, scoring). Frontend is vanilla `public/js/vault-app.js` wired into `vault.html`, using Phuglee design-system classes. Catalog data in `data/leads-catalog/` (gitignored); dev fixtures in `tests/fixtures/leads/`.

**Tech Stack:** Node.js (existing `server.js`), vanilla HTML/CSS/JS, Phuglee tokens/components, disk JSON store (pattern from `lib/bridge-list-store.js`).

**Spec:** `docs/superpowers/specs/2026-07-13-leads-platform-design.md`

## Global Constraints

- Never delete/truncate `data/filter-lists/`, `data/bridge-brain/`, or `data/leads-catalog/` unless user explicitly asks.
- Distressed leads require `reviewStatus === 'approved'` before publish.
- No fake leads in production UI — fixtures only under `tests/fixtures/leads/`.
- Max plan (`plan === 'max'`) required for catalog API reads; Pro sees upgrade gate.
- Reuse Phuglee shell (`shell-bundle.css`, `shell-nav.js`, auth guard).
- `scripts/verify-live.ps1` must exit 0 before claiming Vault is live.
- `npm test` must stay green after each phase.
- Vanilla stack only — no React/Tailwind migration for this milestone.

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/leads-platform/schema.js` | LeadRecord validation, enums, normalize helpers |
| `lib/leads-platform/scoring.js` | `computePriorityScore(lead)` |
| `lib/leads-platform/store.js` | CRUD, index, query filters, user overlays |
| `lib/leads-platform/publish.js` | Map Analyze/Filter rows → LeadRecord |
| `lib/leads-platform/api.js` | HTTP handlers for `/api/leads/*` |
| `lib/config.js` | Add `LEADS_CATALOG_ROOT` env override |
| `server.js` | Mount leads API routes |
| `public/vault.html` | App mount points, conditional gate markup |
| `public/css/vault.css` | Live desk styles (retire preview-only blur for Max) |
| `public/js/vault-app.js` | Client: fetch, filters, table, drawer |
| `tests/leads-platform.test.js` | API + store unit tests |
| `tests/fixtures/leads/*.json` | Sample catalog for tests |

---

### Task 1: Schema + scoring foundation

**Files:**
- Create: `lib/leads-platform/schema.js`
- Create: `lib/leads-platform/scoring.js`
- Create: `tests/leads-platform.test.js`
- Create: `tests/fixtures/leads/sample-distressed.json`
- Modify: `lib/config.js`

**Interfaces:**
- Produces: `normalizeLeadRecord(raw)`, `validateLeadRecord(lead)`, `computePriorityScore(lead)`, `LEAD_TYPES`, `REVIEW_STATUS`

- [ ] **Step 1: Add catalog root to config**

In `lib/config.js`, add:

```javascript
LEADS_CATALOG_ROOT: process.env.LEADS_CATALOG_ROOT
  || path.join(__dirname, '..', 'data', 'leads-catalog'),
```

- [ ] **Step 2: Write failing schema tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateLeadRecord, normalizeLeadRecord } = require('../lib/leads-platform/schema');
const fixture = require('./fixtures/leads/sample-distressed.json');

test('validateLeadRecord accepts approved distressed lead', () => {
  const lead = normalizeLeadRecord(fixture);
  assert.equal(validateLeadRecord(lead).ok, true);
});

test('validateLeadRecord rejects distressed without approval', () => {
  const lead = normalizeLeadRecord({ ...fixture, reviewStatus: 'pending' });
  assert.equal(validateLeadRecord(lead).ok, false);
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `node --test tests/leads-platform.test.js`
Expected: module not found

- [ ] **Step 4: Implement schema.js**

```javascript
const LEAD_TYPES = new Set(['distressed', 'well_maintained', 'land']);
const REVIEW_STATUS = new Set(['approved', 'pending']);

function normalizeLeadRecord(raw = {}) {
  return {
    leadId: String(raw.leadId || '').trim(),
    address: String(raw.address || '').trim(),
    city: String(raw.city || '').trim(),
    state: String(raw.state || '').trim().toUpperCase().slice(0, 2),
    zip: String(raw.zip || '').trim(),
    leadType: String(raw.leadType || '').trim(),
    reviewStatus: String(raw.reviewStatus || 'pending').trim(),
    priorityScore: Number(raw.priorityScore) || 0,
    confidence: raw.confidence || 'medium',
    signalTags: Array.isArray(raw.signalTags) ? raw.signalTags.map(String) : [],
    ownerName: String(raw.ownerName || '').trim(),
    phones: Array.isArray(raw.phones) ? raw.phones.map(String) : [],
    publishedAt: raw.publishedAt || new Date().toISOString(),
    // pass through optional fields
    ...raw,
  };
}

function validateLeadRecord(lead) {
  if (!lead.leadId) return { ok: false, error: 'missing leadId' };
  if (!LEAD_TYPES.has(lead.leadType)) return { ok: false, error: 'invalid leadType' };
  if (!lead.address || !lead.city || !lead.state) return { ok: false, error: 'missing address' };
  if (lead.leadType === 'distressed' && lead.reviewStatus !== 'approved') {
    return { ok: false, error: 'distressed requires approval' };
  }
  return { ok: true };
}

module.exports = { LEAD_TYPES, REVIEW_STATUS, normalizeLeadRecord, validateLeadRecord };
```

- [ ] **Step 5: Implement scoring.js + test**

```javascript
test('computePriorityScore returns 0-100', () => {
  const { computePriorityScore } = require('../lib/leads-platform/scoring');
  const score = computePriorityScore(normalizeLeadRecord(fixture));
  assert.ok(score >= 0 && score <= 100);
});
```

Implement `computePriorityScore` per design spec formula.

- [ ] **Step 6: Run tests — expect PASS**

Run: `node --test tests/leads-platform.test.js`

- [ ] **Step 7: Add fixture file** `tests/fixtures/leads/sample-distressed.json` with one complete approved distressed lead.

---

### Task 2: Disk store + list query API

**Files:**
- Create: `lib/leads-platform/store.js`
- Create: `lib/leads-platform/api.js`
- Modify: `server.js`
- Modify: `tests/leads-platform.test.js`

**Interfaces:**
- Consumes: `schema.js`, `scoring.js`, `config.LEADS_CATALOG_ROOT`
- Produces: `listLeads(query)`, `getLead(id)`, `getMeta()`, `upsertLead(lead)`, `handleLeadsApi(req, res)`

- [ ] **Step 1: Write failing store tests** — seed temp dir, upsert lead, list with `leadType` filter, signal AND stack.

- [ ] **Step 2: Implement store.js** — mirror atomic JSON writes from `bridge-list-store.js`:
  - `index.json` with `{ leads: [{ leadId, leadType, city, state, priorityScore, publishedAt }] }`
  - `{leadId}.json` per record
  - `queryLeads({ leadType, state, city, signals[], minScore, maxScore, q, page, limit })`

- [ ] **Step 3: Implement api.js** with plan gate:

```javascript
function requireMaxPlan(req) {
  const { readPhugleePlan } = require('../phuglee-user');
  const plan = readPhugleePlan(req);
  return plan === 'max' || readPhugleeUser(req) === 'admin';
}
```

- [ ] **Step 4: Wire server.js** before static fallback:

```javascript
if (pathname.startsWith('/api/leads')) {
  const { handleLeadsApi } = getLeadsApiModule();
  const handled = await handleLeadsApi(req, res, pathname);
  if (handled) return;
}
```

- [ ] **Step 5: API tests** — GET `/api/leads` 403 for pro, 200 for max (mock headers or test helper).

- [ ] **Step 6: Run full suite** — `npm test`

---

### Task 3: Vault HTML shell — live app mount

**Files:**
- Modify: `public/vault.html`
- Modify: `public/css/vault.css`
- Create: `public/js/vault-app.js` (bootstrap only)
- Modify: `tests/distress-routes.test.js`

**Interfaces:**
- Produces: DOM IDs `#vault-app`, `#vault-gate`, `#vault-hero`, `#vault-filters`, `#vault-results`, `#vault-drawer`

- [ ] **Step 1: Restructure vault.html**

Replace mock-only layout with:

```html
<main id="main" class="vault-main vault-main--app">
  <div id="vault-gate" class="vault-gate" hidden>...</div>
  <div id="vault-app" class="vault-app" hidden>
    <header id="vault-hero" class="vault-hero">...</header>
    <aside id="vault-filters" class="vault-filters">...</aside>
    <section id="vault-results" class="vault-results">...</section>
    <aside id="vault-drawer" class="vault-drawer" hidden>...</aside>
  </div>
</main>
<script src="/js/vault-app.js" defer></script>
```

Keep upgrade gate markup for non-Max; remove frosted mock table from default Max path.

- [ ] **Step 2: vault-app.js bootstrap**

```javascript
(async function initVault() {
  const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
  const isMax = me.plan === 'max' || me.username === 'admin';
  document.getElementById('vault-gate').hidden = isMax;
  document.getElementById('vault-app').hidden = !isMax;
  if (!isMax) return;
  // Task 4+ will hydrate table
})();
```

- [ ] **Step 3: CSS** — add `.vault-app` full-width desk layout; keep `.vault-gate` styles.

- [ ] **Step 4: Update route test** — vault.html contains `#vault-app`.

- [ ] **Step 5: verify-live** — `powershell -File scripts/verify-live.ps1`

---

### Task 4: Hero strip + lead type tabs + KPI meta

**Files:**
- Modify: `public/js/vault-app.js`
- Modify: `public/css/vault.css`
- Modify: `public/vault.html`

- [ ] **Step 1: Fetch meta** — `GET /api/leads/meta` returns counts by type + cities.

- [ ] **Step 2: Render tabs** — All | Distressed | Well Maintained | Land with `aria-selected`.

- [ ] **Step 3: KPI strip** — total leads, fresh this week, active filters count.

- [ ] **Step 4: Tab change** re-fetches list with `leadType` param.

- [ ] **Step 5: Manual QA** — Max session on local, tabs switch without reload.

---

### Task 5: Filter rail + search

**Files:**
- Modify: `public/js/vault-app.js`
- Modify: `public/css/vault.css`
- Modify: `lib/leads-platform/store.js` (ensure all filters work)

- [ ] **Step 1: State object** — `{ leadType, state, city, signals[], minScore, maxScore, q, page }`

- [ ] **Step 2: Signal chip stack** — toggle chips, AND logic, `phuglee-chip` styling.

- [ ] **Step 3: Geo selects** — populate from meta facets.

- [ ] **Step 4: Score range** — dual range or min/max inputs.

- [ ] **Step 5: Debounced search** — 300ms on address/owner/phone `q` param.

- [ ] **Step 6: Clear filters** control.

---

### Task 6: Results table

**Files:**
- Modify: `public/js/vault-app.js`
- Modify: `public/css/vault.css`
- Modify: `public/css/phuglee-components.css` (if table density helper needed)

- [ ] **Step 1: Render table** — columns: Address, City, Signal, Score, Owner, Phone.

- [ ] **Step 2: Use `phuglee-table`** classes; mono font for data cells (match vault mock).

- [ ] **Step 3: Sort** — default `priorityScore` desc; clickable headers for address/score.

- [ ] **Step 4: Pagination** — 50 per page, prev/next.

- [ ] **Step 5: Row click** — opens drawer (Task 7).

- [ ] **Step 6: Empty state** — honest copy when catalog empty.

- [ ] **Step 7: Responsive** — hide phone/owner columns ≤900px per existing vault.css pattern.

---

### Task 7: Detail drawer (lead dossier)

**Files:**
- Modify: `public/js/vault-app.js`
- Modify: `public/css/vault.css`
- Modify: `public/vault.html`

- [ ] **Step 1: Drawer markup** — native focus trap, `aria-modal`, close button.

- [ ] **Step 2: Fetch** `GET /api/leads/:id` on row select.

- [ ] **Step 3: Sections** — Identity, Signals (all chips), Financials, Owner (tel: links), Media, Comps.

- [ ] **Step 4: Missing data** — show "—" not invented values.

- [ ] **Step 5: Keyboard** — Escape closes; focus returns to row.

---

### Task 8: Operator tools — favorites, notes, export

**Files:**
- Create: `lib/leads-platform/user-overlays.js`
- Modify: `lib/leads-platform/api.js`
- Modify: `public/js/vault-app.js`

- [ ] **Step 1: User overlay store** — `data/leads-catalog/_users/{username}/overlays.json`

- [ ] **Step 2: API routes** — favorites toggle, notes upsert, export POST (CSV via existing `bridge-export` pattern).

- [ ] **Step 3: UI** — star icon in table + drawer; notes textarea in drawer; export selected rows.

- [ ] **Step 4: Rate limits** — 500 rows/export, constants at top of api.js.

- [ ] **Step 5: Tests** for overlay persistence.

---

### Task 9: Publish pipeline hook

**Files:**
- Create: `lib/leads-platform/publish.js`
- Create: `scripts/publish-leads-fixture.js` (dev/admin CLI)
- Modify: `lib/leads-platform/api.js` (POST `/api/leads/publish` admin-only)
- Modify: `tests/leads-platform.test.js`

- [ ] **Step 1: `mapAnalyzeResultToLead(row, meta)`** — map Analyze session result shape.

- [ ] **Step 2: `mapFilterRowToLead(row, meta)`** — enrich from Filter kept row.

- [ ] **Step 3: `publishLead(raw)`** — normalize, validate, score, upsert idempotent by leadId.

- [ ] **Step 4: Admin API** — POST publish accepts single lead or batch.

- [ ] **Step 5: CLI script** — load fixture dir into catalog for local dev.

- [ ] **Step 6: Document** ingest flow in spec (already written).

---

### Task 10: Plan gates + shell polish

**Files:**
- Modify: `public/js/vault-app.js`
- Modify: `public/vault.html`
- Modify: `public/js/shell-nav.js`
- Modify: `lib/phuglee-auth.js` (optional `requireMaxPlan` export)

- [ ] **Step 1: Non-Max gate** — show honest preview + upgrade CTA (no blurred fake rows labeled live).

- [ ] **Step 2: Shell nav** — change "The Vault (soon)" → "The Vault" when catalog has meta.leadCount > 0 OR env flag.

- [ ] **Step 3: Meta description** — update vault.html SEO copy for live product.

- [ ] **Step 4: Command palette** — add Vault entry if missing.

---

### Task 11: QA lock

**Files:**
- Modify: `tests/leads-platform.test.js`
- Modify: `tests/a11y-seo.test.js` (vault page)
- Create: `.planning/phases/97-leads-platform-qa/97-QA-CHECKLIST.md`

- [ ] **Step 1: API coverage** — auth, plan gate, filters, publish validation.

- [ ] **Step 2: Route + shell tests** updated.

- [ ] **Step 3: a11y** — skip link, drawer focus, reduced-motion (no infinite animations).

- [ ] **Step 4: Full `npm test`**

- [ ] **Step 5: `verify-live.ps1`**

- [ ] **Step 6: Screenshot QA** at 390 + 1440 (manual or Playwright if pattern exists).

---

## Phase → task mapping

| Phase | Tasks |
|-------|-------|
| 89 Foundation | 1, 2 |
| 90 Vault shell | 3 |
| 91 Filter engine | 4, 5 |
| 92 Detail drawer | 7 |
| 93 Scoring UX | 1 (scoring), 6 |
| 94 Operator tools | 8 |
| 95 Publish pipe | 9 |
| 96 Plan gates | 10 |
| 97 QA lock | 11 |

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Three lead types | 1, 4 |
| Distressed approval gate | 1, 9 |
| Stackable signal filters | 5 |
| Priority scoring | 1, 6 |
| Max plan gate | 2, 10 |
| Detail dossier | 7 |
| Favorites/notes/export | 8 |
| Publish pipeline | 9 |
| No fake production data | 3, 10 |
| Phuglee brand | 3, 6 |
| verify-live | 3, 11 |

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-13-leads-platform.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

**Which approach?**
