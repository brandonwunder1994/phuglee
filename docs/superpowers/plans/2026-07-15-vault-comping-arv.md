# Vault Comping (Confident ARV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a Vault lead drawer, click Comp and get a Comping Rules–backed ARV report persisted on that lead (auto via RealEstateAPI in disclosure states; manual Propelio paste + report upload in non-disclosure states).

**Architecture:** New `lib/leads-platform/comping/` engine scores sold candidates against Wholesale Brain Comping Rules, computes ARV + confidence, and writes `estARV` / `comps` / `compingReport` onto the lead. RealEstateAPI is server-only. ND states short-circuit to a manual API + file store under the leads catalog volume.

**Tech Stack:** Node.js (`lib/leads-platform/`, `server.js`), vanilla `public/js/vault-app.js` + `vault.css`, `node:test`, RealEstateAPI HTTP, OSM Overpass for road barriers.

**Spec:** `docs/superpowers/specs/2026-07-15-vault-comping-arv-design.md`

## Global Constraints

- Product language is **Comping Rules** (never “Compmandments” in UI copy).
- ARV only — no repairs / MAO / LAO in v1.
- Never save vendor AVM / `estimatedValue` as `estARV`.
- `REALESTATE_API_KEY` server-only; never browser or git.
- Never wipe `data/leads-catalog/`, `comp-reports/`, `data/filter-lists/`, or `data/bridge-brain/`.
- Max plan + auth required for Comp routes (same as Vault catalog).
- Preserve Comp results on analyzer sync (do not overwrite with AVM).
- ND states: no fake auto ARV; manual Propelio path + report file upload.
- After Vault UI edits: `scripts/verify-live.ps1` and scoped `verify-mobile.ps1` before claiming live.
- `npm test` / `node --test tests/comping*.test.js` green after each task.

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/leads-platform/comping/nd-states.js` | Non-disclosure state set + `isNonDisclosureState(state)` |
| `lib/leads-platform/comping/rules.js` | Score one candidate vs subject → pass/soft/fail + reasons |
| `lib/leads-platform/comping/arv.js` | Adjustments, outlier drop, median ARV, haircuts |
| `lib/leads-platform/comping/confidence.js` | Map evidence → `high`/`medium`/`low`/`blocked` |
| `lib/leads-platform/comping/reapi-client.js` | PropertyDetail, PropertyComps, Search wrappers |
| `lib/leads-platform/comping/barriers.js` | OSM road-crossing check (degrade to soft flag) |
| `lib/leads-platform/comping/street-view.js` | Build Street View URLs for subject/comps |
| `lib/leads-platform/comping/run-comp.js` | Orchestrate auto Comp → report + lead patch |
| `lib/leads-platform/comping/manual-comp.js` | Validate manual payload → report |
| `lib/leads-platform/comping/report-files.js` | Store/serve Propelio uploads under catalog |
| `lib/leads-platform/schema.js` | Normalize new Comp fields |
| `lib/leads-platform/analyzer-sync.js` | Preserve Comp ARV/comps/report on merge |
| `lib/leads-platform/store.js` | `updateLead` helpers if needed |
| `lib/leads-platform/api.js` | Comp HTTP routes |
| `lib/config.js` | `REALESTATE_API_KEY`, `REALESTATE_API_BASE`, report root |
| `public/js/vault-app.js` | Comp button, report UI, manual panel, upload |
| `public/css/vault.css` | Comp panel / report styles |
| `tests/comping-rules.test.js` | Rules + ND + ARV math |
| `tests/comping-run.test.js` | Orchestrator with mocked REAPI |
| `tests/comping-api.test.js` | HTTP routes (manual + blocked ND) |
| `tests/fixtures/comping/*` | Subject + candidate fixtures |

---

### Task 1: Schema + ND list + sync preserve

**Files:**
- Create: `lib/leads-platform/comping/nd-states.js`
- Create: `tests/comping-rules.test.js` (ND section first)
- Modify: `lib/leads-platform/schema.js`
- Modify: `lib/leads-platform/analyzer-sync.js`
- Modify: `lib/config.js`

**Interfaces:**
- Produces: `isNonDisclosureState(state: string): boolean`, `NON_DISCLOSURE_STATES: Set<string>`
- Produces (schema): lead fields `compingReport`, `compReportFiles`, `compedAt`, `compConfidence`, `compSource`, `compBlockPass`
- Produces (config): `REALESTATE_API_KEY`, `REALESTATE_API_BASE`, `LEADS_COMP_REPORTS_ROOT`

- [ ] **Step 1: Write failing ND + schema tests**

```js
// tests/comping-rules.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isNonDisclosureState } = require('../lib/leads-platform/comping/nd-states');
const { normalizeLeadRecord } = require('../lib/leads-platform/schema');

describe('nd-states', () => {
  it('treats TX as non-disclosure', () => {
    assert.equal(isNonDisclosureState('TX'), true);
    assert.equal(isNonDisclosureState('tx'), true);
  });
  it('treats CA as disclosure', () => {
    assert.equal(isNonDisclosureState('CA'), false);
  });
});

describe('schema comp fields', () => {
  it('normalizes comping fields', () => {
    const lead = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 250000,
      compSource: 'manual_propelio',
      compConfidence: 'manual',
      compedAt: '2026-07-15T00:00:00.000Z',
      comps: [{ address: '2 Main', price: 240000, soldDate: '2026-01-01', sqft: 1400 }],
      compingReport: { version: '1', arv: 250000, confidence: 'manual' },
      compReportFiles: [{ id: 'f1', filename: 'cma.pdf', mime: 'application/pdf', size: 10, uploadedAt: '2026-07-15T00:00:00.000Z', path: 'x' }]
    });
    assert.equal(lead.compSource, 'manual_propelio');
    assert.equal(lead.compConfidence, 'manual');
    assert.equal(lead.comps.length, 1);
    assert.equal(lead.compReportFiles[0].filename, 'cma.pdf');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `node --test tests/comping-rules.test.js`  
Expected: FAIL cannot find `nd-states` and/or missing fields.

- [ ] **Step 3: Implement ND list + config + schema fields**

`nd-states.js` — include at least: `AK, ID, KS, LA, MS, MO, MT, NM, ND, TX, UT, WY` (verify against current ND list used in industry docs; keep as single exported Set).

In `lib/config.js` add:

```js
REALESTATE_API_KEY: String(process.env.REALESTATE_API_KEY || '').trim(),
REALESTATE_API_BASE: String(process.env.REALESTATE_API_BASE || 'https://api.realestateapi.com').replace(/\/$/, ''),
LEADS_COMP_REPORTS_ROOT: process.env.LEADS_COMP_REPORTS_ROOT
  ? path.resolve(process.env.LEADS_COMP_REPORTS_ROOT)
  : path.join(
      process.env.LEADS_CATALOG_ROOT
        ? path.resolve(process.env.LEADS_CATALOG_ROOT)
        : (process.env.PDA_DATA_ROOT
          ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'leads-catalog')
          : path.join(ROOT, 'data', 'leads-catalog')),
      'comp-reports'
    ),
```

In `normalizeLeadRecord`, add:

```js
compedAt: slugPart(raw.compedAt || '') || null,
compConfidence: slugPart(raw.compConfidence || '') || null,
compSource: slugPart(raw.compSource || '') || null,
compBlockPass: ['pass', 'kill'].includes(slugPart(raw.compBlockPass))
  ? slugPart(raw.compBlockPass) : null,
compingReport: raw.compingReport && typeof raw.compingReport === 'object'
  ? raw.compingReport : null,
compReportFiles: Array.isArray(raw.compReportFiles) ? raw.compReportFiles : [],
```

- [ ] **Step 4: Preserve Comp on analyzer sync**

In `mergeIncomingWithCatalogLead` (`analyzer-sync.js`), after existing estARV merge:

```js
const existingComped = Boolean(existing.compedAt && (existing.compSource || existing.compingReport));
if (existingComped) {
  next.estARV = existing.estARV;
  next.comps = Array.isArray(existing.comps) ? existing.comps : next.comps;
  next.compingReport = existing.compingReport || null;
  next.compReportFiles = Array.isArray(existing.compReportFiles)
    ? existing.compReportFiles : [];
  next.compedAt = existing.compedAt;
  next.compConfidence = existing.compConfidence;
  next.compSource = existing.compSource;
  next.compBlockPass = existing.compBlockPass || null;
} else {
  next.comps = (existing.comps && existing.comps.length)
    ? existing.comps
    : (next.comps || []);
}
```

Add a focused unit test in `tests/comping-rules.test.js` (or `tests/leads-platform.test.js`) that merges a lead with `compedAt` + `estARV: 300000` against incoming `estARV: 111111` and asserts 300000 kept.

- [ ] **Step 5: Run tests — expect PASS**

Run: `node --test tests/comping-rules.test.js`

- [ ] **Step 6: Commit**

```bash
git add lib/leads-platform/comping/nd-states.js lib/leads-platform/schema.js lib/leads-platform/analyzer-sync.js lib/config.js tests/comping-rules.test.js
git commit -m "feat(comping): schema fields, ND states, preserve Comp on sync"
```

---

### Task 2: Comping Rules scorer + ARV math + confidence

**Files:**
- Create: `lib/leads-platform/comping/rules.js`
- Create: `lib/leads-platform/comping/arv.js`
- Create: `lib/leads-platform/comping/confidence.js`
- Create: `tests/fixtures/comping/subject.json`
- Create: `tests/fixtures/comping/candidates.json`
- Modify: `tests/comping-rules.test.js`

**Interfaces:**
- Produces: `scoreComp(subject, candidate, opts) → { status: 'pass'|'soft'|'fail', rules: [...], renovation, includedEligible }`
- Produces: `computeArvFromComps(subject, scoredComps, opts) → { arv, method, haircuts, included, excluded }`
- Produces: `assessConfidence({ included, ladderLevel, marketTag, renovationKnown }) → 'high'|'medium'|'low'|'blocked'`

- [ ] **Step 1: Write failing tests for rules + ARV**

```js
const { scoreComp } = require('../lib/leads-platform/comping/rules');
const { computeArvFromComps } = require('../lib/leads-platform/comping/arv');
const { assessConfidence } = require('../lib/leads-platform/comping/confidence');

it('hard-fails zero sale price', () => {
  const r = scoreComp(
    { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1980, lat: 30, lng: -97 },
    { price: 0, sqft: 1480, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01' }
  );
  assert.equal(r.status, 'fail');
});

it('hard-fails size beyond ±10%', () => {
  const r = scoreComp(
    { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1980, lat: 30, lng: -97 },
    { price: 280000, sqft: 2200, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01' }
  );
  assert.equal(r.status, 'fail');
});

it('computes median ARV from included comps', () => {
  const scored = [
    { includedEligible: true, status: 'pass', adjustedPrice: 200000, candidate: { price: 200000 } },
    { includedEligible: true, status: 'pass', adjustedPrice: 220000, candidate: { price: 220000 } },
    { includedEligible: true, status: 'pass', adjustedPrice: 210000, candidate: { price: 210000 } }
  ];
  const out = computeArvFromComps({ sqft: 1500 }, scored, {});
  assert.equal(out.arv, 210000);
});

it('blocks confidence when fewer than 3 included', () => {
  assert.equal(assessConfidence({ included: 2, ladderLevel: 0 }), 'blocked');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/comping-rules.test.js`

- [ ] **Step 3: Implement rules.js**

Implement rule ids matching the spec: `usable_price`, `size_band`, `beds_baths`, `distance`, `recency`, `age`, `property_type`, `renovation` (soft), `barrier` (optional input `barrierCrossed: boolean`).

Distance defaults: pass ≤0.5, soft ≤1.0, fail >1.0 unless `ladderLevel` raised.

Recency: pass ≤180d, soft ≤365d, fail >365 unless thin ladder.

Renovation heuristic helper: `classifyRenovation(candidate)` → `likely|uncertain|as_is` using cashBuyer, $/sf vs subject neighborhood median (pass median in opts), flip hold if prior sale present.

- [ ] **Step 4: Implement arv.js**

- Apply simple Jamil-style adjustments when beds/baths/garage differ (configurable table in file).  
- Drop high/low when ≥5 comps; else median of adjusted.  
- Apply `domSoftHaircutPct` (default 0 or 5 when `marketTag === 'soft'`).  
- Apply optional `conservativeHaircutPct` only when opts say so; always list in `haircuts[]`.  
- Return `included` / `excluded` arrays for the report.

- [ ] **Step 5: Implement confidence.js**

```js
function assessConfidence({ included, ladderLevel = 0, marketTag, renovationLikelyCount = 0 }) {
  if (included < 3) return 'blocked';
  if (ladderLevel >= 2) return 'low';
  if (included >= 3 && renovationLikelyCount >= 2 && ladderLevel === 0) return 'high';
  if (included >= 3) return 'medium';
  return 'low';
}
```

Tune to match tests; document thresholds in file header comment.

- [ ] **Step 6: Run tests — PASS; commit**

```bash
git add lib/leads-platform/comping/rules.js lib/leads-platform/comping/arv.js lib/leads-platform/comping/confidence.js tests/comping-rules.test.js tests/fixtures/comping
git commit -m "feat(comping): Comping Rules scorer, ARV math, confidence"
```

---

### Task 3: Barriers + Street View helpers

**Files:**
- Create: `lib/leads-platform/comping/barriers.js`
- Create: `lib/leads-platform/comping/street-view.js`
- Modify: `tests/comping-rules.test.js`

**Interfaces:**
- Produces: `async checkRoadBarrier(subject, candidate) → { crossed: boolean, degraded: boolean, detail: string }`
- Produces: `streetViewUrl({ lat, lng, address }) → string`

- [ ] **Step 1: Failing tests**

```js
const { streetViewUrl } = require('../lib/leads-platform/comping/street-view');
const { checkRoadBarrier } = require('../lib/leads-platform/comping/barriers');

it('builds google street view URL', () => {
  const u = streetViewUrl({ lat: 30.27, lng: -97.74 });
  assert.match(u, /google\.com\/maps/);
});

it('degrades gracefully when overpass fails', async () => {
  const r = await checkRoadBarrier(
    { lat: 30, lng: -97 },
    { lat: 30.01, lng: -97.01 },
    { fetchImpl: async () => { throw new Error('network'); } }
  );
  assert.equal(r.degraded, true);
  assert.equal(r.crossed, false);
});
```

- [ ] **Step 2: Implement street-view.js** — `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lng` (or standard Street View search URL with address).

- [ ] **Step 3: Implement barriers.js** — query OSM Overpass for highways intersecting the subject–comp bounding box / line; if fetch fails, `{ crossed: false, degraded: true }`. Keep timeout ≤3s. Cache in-memory per pair key for the Comp run.

- [ ] **Step 4: Wire optional `barrierCrossed` into `scoreComp`** (already planned in Task 2).

- [ ] **Step 5: Tests PASS; commit**

```bash
git commit -m "feat(comping): OSM barriers and Street View links"
```

---

### Task 4: RealEstateAPI client + run-comp orchestrator

**Files:**
- Create: `lib/leads-platform/comping/reapi-client.js`
- Create: `lib/leads-platform/comping/run-comp.js`
- Create: `tests/comping-run.test.js`
- Create: `tests/fixtures/comping/reapi-comps-mock.json`

**Interfaces:**
- Produces: `createReapiClient({ apiKey, baseUrl, fetchImpl })` with `propertyDetail`, `propertyComps`, `propertySearch`
- Produces: `async runAutoComp(lead, opts) → { ok, needsManual?, leadPatch, report, error? }`

- [ ] **Step 1: Failing orchestrator test with mock fetch**

```js
it('returns needsManual for TX lead without calling REAPI comps', async () => {
  const { runAutoComp } = require('../lib/leads-platform/comping/run-comp');
  let called = false;
  const out = await runAutoComp(
    { leadId: '1', address: '1 Main', city: 'Houston', state: 'TX', lat: 29.7, lng: -95.3 },
    { reapi: { propertyComps: async () => { called = true; return {}; } } }
  );
  assert.equal(out.needsManual, true);
  assert.equal(called, false);
});

it('persists ARV patch for disclosure subject with priced comps', async () => {
  const mockComps = require('./fixtures/comping/reapi-comps-mock.json');
  const { runAutoComp } = require('../lib/leads-platform/comping/run-comp');
  const out = await runAutoComp(
    { leadId: '1', address: '1 Main St', city: 'Columbus', state: 'OH',
      lat: 39.96, lng: -82.99, propertyDetails: { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1985 } },
    {
      reapi: {
        propertyDetail: async () => ({ id: 's1', ... }),
        propertyComps: async () => mockComps,
        propertySearch: async () => ({ data: [] })
      },
      checkRoadBarrier: async () => ({ crossed: false, degraded: false })
    }
  );
  assert.equal(out.ok, true);
  assert.ok(out.leadPatch.estARV > 0);
  assert.equal(out.leadPatch.compSource, 'reapi');
  assert.ok(out.report.rulesSummary);
});
```

Build `reapi-comps-mock.json` with ≥5 comps, positive `lastSaleAmount`, similar sf/beds, distances under 0.5 mi.

- [ ] **Step 2: Implement reapi-client.js**

```js
async function post(base, key, path, body, fetchImpl) {
  const res = await fetchImpl(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || json.statusMessage || `REAPI ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}
```

Endpoints: `/v2/PropertyDetail`, `/v3/PropertyComps` (fallback `/v2/PropertyComps` if needed), `/v2/PropertySearch`. Map comps to internal `{ price: lastSaleAmount, soldDate, sqft, beds, baths, lat, lng, address, distanceMi, cashBuyer, ... }`. Skip / mark unusable when price is 0.

- [ ] **Step 3: Implement run-comp.js concentric loop**

1. If `isNonDisclosureState(lead.state)` → `{ needsManual: true }`.  
2. If `lead.leadType === 'land'` → `{ ok: false, error: 'Land Comp out of scope' }`.  
3. Load subject attrs from lead + Detail.  
4. For radii `[0.25, 0.5, 1.0]` (then thin `[5.0]`): fetch comps with beds/baths/sf/year filters; score; stop when ≥3 includedEligible.  
5. Optional actives search (`mls_active: true`) for DOM soft tag.  
6. `computeArvFromComps` + `assessConfidence`.  
7. If `blocked` → report without setting confident ARV (`estARV: null` or leave prior — follow spec gate).  
8. Build `compingReport` object per spec; `comps` array for lead; Street View URLs on subject + included.  
9. Return `leadPatch` including `compedAt: new Date().toISOString()`.

**Never** set `estARV` from `estimatedValue`.

- [ ] **Step 4: Tests PASS; commit**

```bash
git commit -m "feat(comping): RealEstateAPI client and auto Comp orchestrator"
```

---

### Task 5: Manual Comp + report file storage

**Files:**
- Create: `lib/leads-platform/comping/manual-comp.js`
- Create: `lib/leads-platform/comping/report-files.js`
- Create: `tests/comping-api.test.js` (file section; or `tests/comping-manual.test.js`)

**Interfaces:**
- Produces: `buildManualCompReport({ lead, arv, comps, note }) → { leadPatch, report }`
- Produces: `saveCompReportFile(leadId, { buffer, filename, mime }) → fileMeta`
- Produces: `readCompReportFile(leadId, fileId) → { path, mime, filename }`

- [ ] **Step 1: Failing tests**

```js
it('requires arv and at least 3 comps', () => {
  const { buildManualCompReport } = require('../lib/leads-platform/comping/manual-comp');
  assert.throws(() => buildManualCompReport({
    lead: { state: 'TX' }, arv: null, comps: []
  }));
});

it('builds manual leadPatch', () => {
  const { buildManualCompReport } = require('../lib/leads-platform/comping/manual-comp');
  const out = buildManualCompReport({
    lead: { leadId: 'L1', state: 'TX', address: '1 Main' },
    arv: 275000,
    comps: [
      { address: 'a', price: 270000, soldDate: '2026-01-01', sqft: 1400, beds: 3, baths: 2 },
      { address: 'b', price: 280000, soldDate: '2026-02-01', sqft: 1450, beds: 3, baths: 2 },
      { address: 'c', price: 275000, soldDate: '2026-03-01', sqft: 1420, beds: 3, baths: 2 }
    ],
    note: 'Propelio CMA'
  });
  assert.equal(out.leadPatch.estARV, 275000);
  assert.equal(out.leadPatch.compSource, 'manual_propelio');
  assert.equal(out.leadPatch.compConfidence, 'manual');
});
```

Optional: after build, call `scoreComp` on each pasted row for distance/size flags if lat/lng present.

- [ ] **Step 2: Implement report-files.js**

- Root: `config.LEADS_COMP_REPORTS_ROOT/{safeLeadId}/`  
- Allowed mime: pdf, png, jpeg, webp  
- Max 25MB  
- Filename sanitized; id = `crypto.randomBytes(8).toString('hex')`  
- Never delete other leads’ folders in normal ops  

- [ ] **Step 3: Tests PASS; commit**

```bash
git commit -m "feat(comping): manual Comp builder and Propelio report file store"
```

---

### Task 6: API routes

**Files:**
- Modify: `lib/leads-platform/api.js`
- Modify: `lib/leads-platform/store.js` (ensure `upsertLead` / `updateLead` writes new fields into lead JSON + index summary if needed)
- Modify: `tests/comping-api.test.js`

**Interfaces:**
- Routes under `/api/leads/:id/comp*` with `requireMax`

- [ ] **Step 1: Failing API tests** using existing test harness pattern from `tests/leads-platform.test.js` (temp `LEADS_CATALOG_ROOT`, call `handle`).

Cover:
1. TX lead POST `/comp` → 200 `{ needsManual: true }` (no ARV invent).  
2. Manual POST saves estARV.  
3. Missing API key on OH auto → 503.  
4. Upload + GET download.

- [ ] **Step 2: Wire routes in `api.js`** near other lead-id routes:

| Method | Path |
|--------|------|
| POST | `/api/leads/:id/comp` |
| GET | `/api/leads/:id/comp` |
| POST | `/api/leads/:id/comp/manual` |
| POST | `/api/leads/:id/comp/report-file` |
| GET | `/api/leads/:id/comp/report-file/:fileId` |
| POST | `/api/leads/:id/comp/block-pass` | body `{ pass: 'pass'|'kill' }` optional |

Flow for auto POST:
1. `requireMax`  
2. Load lead  
3. If existing `compedAt` and no `?replace=1` / body.replace → 409 or return existing with `confirmReplace: true` (pick one; document in response). Prefer: body `{ replace: true }` required to overwrite.  
4. `runAutoComp`  
5. If `needsManual` → JSON without writing ARV  
6. Else upsert lead with `leadPatch`  
7. Return `{ lead, report }`

Multipart: use existing multipart helper if present in api.js / busboy; else read raw buffer with content-type check for small uploads.

- [ ] **Step 3: Persist via store**

If `upsertLead` already replaces full lead JSON, merge patch then `normalizeLeadRecord` + write. Update index card fields for `estARV` if index stores it.

- [ ] **Step 4: Tests PASS; commit**

```bash
git commit -m "feat(comping): Vault Comp API routes"
```

---

### Task 7: Vault UI — Comp button, auto report, manual + upload

**Files:**
- Modify: `public/js/vault-app.js`
- Modify: `public/css/vault.css`
- Modify: `public/vault.html` only if a mount node is required (prefer JS-injected panel)

**Interfaces:**
- Consumes: Comp API JSON shapes from Task 6

- [ ] **Step 1: Add Comp control in drawer actions**

When rendering drawer header/actions for lead `l`:
- Button **Comp**  
- If `l.compedAt`: show ARV chip (`moneyFmt(l.estARV)`) + confidence badge + **Re-comp**

- [ ] **Step 2: Auto click handler**

```js
async function runComp(leadId, { replace = false } = {}) {
  const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/comp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ replace })
  });
  const data = await res.json();
  if (data.needsManual) {
    openManualCompPanel(leadId, data);
    return;
  }
  if (data.confirmReplace) {
    if (!window.confirm('Replace existing comps and ARV on this lead?')) return;
    return runComp(leadId, { replace: true });
  }
  // refresh drawer from data.lead; show report section
}
```

- [ ] **Step 3: Report section UI**

New drawer section id `comping` (label **ARV Report**) when `compingReport` or `comps` present:
- Large ARV + confidence  
- How we got here  
- Comping Rules summary  
- Comps table (included/excluded, reasons)  
- Sanity AVM labeled “estimate — not ARV”  
- Street View links  
- Files list with download links  

Reuse existing `renderComps` where possible; extend for rule columns.

- [ ] **Step 4: Manual Comp panel**

Modal or drawer panel:
- Copy address button  
- Note: use Propelio for MLS solds in this state  
- ARV number input  
- Comps rows (add/remove); min 3  
- File input / dropzone for PDF/images  
- Save → POST manual then POST each file → refresh drawer  

- [ ] **Step 5: CSS** — desk density, gold primary for Comp, no purple chrome; mobile-friendly (≥44px targets, no page overflow).

- [ ] **Step 6: Manual browser check locally; run verifies**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-mobile.ps1 -Pages "/vault"
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(comping): Vault Comp UI with auto report and Propelio manual upload"
```

---

### Task 8: Integration polish + docs smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-vault-comping-arv-design.md` only if implementation discovered a needed clarifier (prefer plan/commit message instead)
- Ensure `.env.example` already has REAPI keys (done)
- Add: `tests/comping-run.test.js` edge cases (price=0 comps → blocked)

- [ ] **Step 1: Fixture for ND blocked auto + disclosure blocked thin market**

- [ ] **Step 2: Run full related tests**

```bash
node --test tests/comping-rules.test.js tests/comping-run.test.js tests/comping-api.test.js
npm test
```

- [ ] **Step 3: Confirm Railway has `REALESTATE_API_KEY` set (operator)** — do not print key.

- [ ] **Step 4: Commit any test fixes**

```bash
git commit -m "test(comping): edge cases for blocked and thin markets"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Comping Rules engine | 2 |
| ARV median/haircuts/confidence | 2 |
| Concentric + thin ladder | 4 |
| OSM barriers + SV links | 3 |
| REAPI client, never AVM as ARV | 4 |
| ND manual + Propelio upload | 5, 6, 7 |
| Persist on lead / replace confirm | 6, 7 |
| Preserve Comp on analyzer sync | 1 |
| API routes + Max auth | 6 |
| Vault UI report | 7 |
| verify-live / mobile | 7 |
| Env Railway / .env.example | 1 (example already) |

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-15-vault-comping-arv.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
