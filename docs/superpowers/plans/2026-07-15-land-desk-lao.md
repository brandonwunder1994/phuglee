# Land Desk Phase 2 — LAO Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators enter land FMV, site costs, investor gap, and assignment fee on a Land Vault lead and persist a computed buyer ceiling, contract target, and LAO (manual comps list optional; no comps API).

**Architecture:** New `lib/leads-platform/land/lao.js` owns math + normalize. Schema adds `landUnderwriting`. API `PUT /api/leads/:id/land-underwriting` recomputes derived fields server-side. Land Vault drawer adds an LAO panel under the 7-check screen. Analyzer sync preserves underwriting on merge.

**Tech Stack:** Node.js (`lib/leads-platform/`), vanilla `public/js/land-vault-app.js`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-15-land-desk-design.md` § Phase 2

## Global Constraints

- Never use house `ARV×90% − repairs×2` or the 70% rule.
- Investor gap default **$5,000** (editable, must be ≥ 0; warn if &lt; 5000 in UI copy only).
- 10/15/20 sanity is **display-only** — never overwrite `landFmv`.
- Default LAO = contract target; operator may set LAO lower (not higher than contract target without note — allow but warn).
- Never wipe catalog / filter-lists / bridge-brain.
- Preserve `landUnderwriting` on analyzer sync merge.
- After UI edits: `verify-live.ps1` + `verify-mobile.ps1 -Pages "/land-vault"` before claiming live.
- `method: 'manual'` for this phase (engine comes in Phase 3).

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/leads-platform/land/lao.js` | Normalize + compute LAO stack + 10/15/20 bands |
| `lib/leads-platform/schema.js` | Attach `landUnderwriting` on normalize |
| `lib/leads-platform/analyzer-sync.js` | Preserve underwriting on merge |
| `lib/leads-platform/api.js` | `GET/PUT .../land-underwriting` |
| `public/js/land-vault-app.js` | LAO panel UI |
| `public/css/land-vault.css` | Panel layout |
| `tests/land-lao.test.js` | Math + API unit tests |

---

### Task 1: LAO math module + unit tests

**Files:**
- Create: `lib/leads-platform/land/lao.js`
- Create: `tests/land-lao.test.js`

**Interfaces:**
- `computeLaoStack({ landFmv, siteCosts, siteCostParts, investorGap, assignmentFee, lao })` → derived fields
- `computeSanityBands({ pocket, newBuildArv })` → `{ buyBand, sellBand }` or nulls
- `normalizeLandUnderwriting(raw)` → full shape with computed fields
- Pocket factors: sticks 0.10/0.15, suburbia 0.15/0.20, prime 0.20/0.25

Math:

```
siteCosts = sum(parts) if parts provided, else siteCosts number
buyerCeiling = landFmv − siteCosts − investorGap
contractTarget = buyerCeiling − assignmentFee
lao default = contractTarget (if lao null); else use provided lao
```

All money fields null-safe: if `landFmv` null → derived stay null.

- [ ] **Step 1: Write failing tests**

```js
const { computeLaoStack, computeSanityBands, normalizeLandUnderwriting } = require('../lib/leads-platform/land/lao');

it('computes ceiling, target, default LAO', () => {
  const r = computeLaoStack({
    landFmv: 45000, siteCosts: 5000, investorGap: 5000, assignmentFee: 5000
  });
  assert.equal(r.buyerCeiling, 35000);
  assert.equal(r.contractTarget, 30000);
  assert.equal(r.lao, 30000);
});

it('sums siteCostParts', () => {
  const r = computeLaoStack({
    landFmv: 100000,
    siteCostParts: { clearing: 10000, demo: 8000, grade: 0, other: 2000 },
    investorGap: 5000,
    assignmentFee: 10000
  });
  assert.equal(r.siteCosts, 20000);
  assert.equal(r.buyerCeiling, 75000);
  assert.equal(r.contractTarget, 65000);
});

it('sanity bands for suburbia', () => {
  const s = computeSanityBands({ pocket: 'suburbia', newBuildArv: 400000 });
  assert.equal(s.buyBand, 60000);
  assert.equal(s.sellBand, 80000);
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `lao.js`**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(land): add LAO math and 10/15/20 sanity bands`

---

### Task 2: Schema + sync preserve + API

**Files:**
- Modify: `schema.js` — `landUnderwriting: normalizeLandUnderwriting(raw.landUnderwriting)`
- Modify: `analyzer-sync.js` — preserve existing `landUnderwriting` like `landScreen`
- Modify: `api.js` — GET/PUT `/api/leads/:id/land-underwriting`
- Extend: `tests/land-lao.test.js` with API tests (temp catalog like surface tests)

**PUT body:** `{ landUnderwriting: { landFmv, siteCostParts, investorGap, assignmentFee, lao, sanity, compsManual } }`  
Server normalizes + computes; sets `method: 'manual'`, `updatedAt`.

- [ ] **Step 1: Schema default test** — land lead has `landUnderwriting.investorGap === 5000`, `method === 'manual'`
- [ ] **Step 2: Implement schema + sync preserve**
- [ ] **Step 3: API routes** (land leads only; 404 otherwise)
- [ ] **Step 4: API tests PASS**
- [ ] **Step 5: Commit** `feat(land): persist landUnderwriting via API`

---

### Task 3: Land Vault LAO panel UI

**Files:**
- Modify: `land-vault-app.js` — render LAO section under screen; save button
- Modify: `land-vault.css` — formula breakdown styles
- Bump cache query on css/js in html if present

**UI fields:**
- Land FMV ($)
- Site costs parts: clearing, demo, grade, other (show total)
- Investor gap (default 5000)
- Assignment fee
- Read-only: Buyer ceiling, Contract target
- LAO (editable; defaults to contract target on compute)
- Optional: pocket select + new-build ARV → show buy/sell bands + warning if FMV outside
- Optional: 1–3 manual comps rows (address, sold price, date, acres, notes) — persist only
- Suggest clearing $10k hint if `landScreen.checks.cleared.status === 'fail'`

Live recompute on input (client) + Save persists via PUT.

Show formula line: `FMV − site − gap = ceiling; − fee = target → LAO`.

- [ ] **Step 1: Implement panel + wire save**
- [ ] **Step 2: `verify-live.ps1` + `verify-mobile.ps1 -Pages "/land-vault"`**
- [ ] **Step 3: Commit** `feat(land-vault): add manual LAO calculator panel`

---

## Out of scope

- Lot comps API / Land Comp engine (Phase 3)
- Teardown bridge, Filter preferential
- PDF builder packet
- Auto-writing LAO from screen alone
