# Wave 3 — Scale & Housecleaning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Vault/Land responsive at ~10k+ leads, stop memory leaks in rate-limit maps, remove security footguns and dead product files, and trim the marketing home page’s unused CSS/JS — without redesigning desks or redoing Wave 0–2 work.

**Architecture:** Focused server/store optimizations (map caps, single-pass facets where easy, prune Maps), delete/quarantine public stubs and Trust Funds orphans, light home payload trim. No full webpack bundler. No Filter engine rewrites.

**Tech Stack:** `lib/leads-platform/store.js`, `lib/leads-platform/api.js`, `server.js`, `public/` static cleanup, `node --test`, `verify-live.ps1` (+ `-Deep`).

**Program cadence:** Plan → **user approval** → execute → test → **close Wave 3** (program complete unless follow-ups).

**Prior waves:** 0 trust, 1 speed, 2 correctness — all closed. Do not regress rewrite, auth-guard, gov-lists API, shell-bundle, gzip, buyers geo, trust-funds 302.

## Global Constraints

- Never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge data, analyzer users/sessions, or live `data/leads-catalog/leads/*.json` / `index.json` content.
- Deleting **empty stub** catalogs under `public/data/buyers/` is allowed (already blocked by static server).
- Deleting **orphan** Trust Funds static files is allowed only after grep shows no live HTML references (except `trust-funds.html` itself).
- After site-facing edits: `scripts\verify-live.ps1`; closeout includes `-Deep`.
- Do not commit unless the user asks.
- Prefer TDD for store constants/helpers and source contracts for deletions.

## Plain-English “done”

| You should notice… | Proof |
|--------------------|--------|
| Vault/Land maps don’t try to ship 15k markers on home surface | Lower default home map cap; land already ≤2500 |
| Facet/list work does less duplicate full-index scanning when callers already skip facets | Existing `skipFacets` respected; optional single-pass helper if cheap |
| Login rate-limit memory doesn’t grow forever | Prune expired keys + max Map size |
| No buyer intel stubs under public/ | Files gone; server block remains |
| Dead Trust Funds page/JS/CSS gone | Grep clean; 302 still works |
| Home loads fewer unused styles/scripts | Drop unused CSS/JS links proven by no HTML refs |
| Giant unused logo-hd optional removal | File gone or documented keep |

## Measured baseline (2026-07-23)

| Item | Value |
|------|--------|
| Lead JSON files | **~10,192** |
| `MAP_MAX_MARKERS` | **15,000** (land already min 2500) |
| `public/data/buyers|fund-buyers` stubs | present (~200 B each), static 404 already |
| Orphan TF assets | `trust-funds.html` + 8 JS + CSS (not routed) |
| `phuglee-logo-hd.png` | **~3,036 KB** (og:image already points to smaller logo) |
| Home CSS | 14+ sheets including chronicle, ui-preview, coverage-dock |
| Dead JS (0 HTML refs) | `home-guide.js`, `home-coverage-explorer.js`, `home-coverage-directory.js` |
| Home loads `video-fallback.js` | yes, distilled home has no videos |

## File map

| Area | Files |
|------|--------|
| Map/facets scale | `lib/leads-platform/store.js`, maybe `lib/leads-platform/api.js` |
| loginAttempts prune | `server.js` |
| exportCounts prune | `lib/leads-platform/api.js` |
| Public stubs | `public/data/buyers/`, `public/data/fund-buyers/`, `server.js` block (keep) |
| TF orphans | `public/trust-funds.html`, `public/js/trust-funds-*.js`, `public/css/trust-funds.css` |
| Logo | `public/images/phuglee-logo-hd.png` |
| Home trim | `public/index.html`, optional move dead JS to `_retired/` or delete |
| Tests | `tests/leads-map-cap.test.js`, `tests/auth-rate-limit-prune.test.js`, source deletion tests |

## Out of scope

- Full secondary indexes by state on disk  
- esbuild minify of Filter/UC  
- Buyers/TF code merge into shared modules (orphans deleted instead)  
- Rewriting home marketing design  
- Server HTML auth 302 for all desks  

---

### Task 1: Lower default map marker cap (home/all surfaces)

**Files:**
- Modify: `lib/leads-platform/store.js` — `MAP_MAX_MARKERS`
- Test: `tests/leads-map-cap.test.js` (source or unit)

**Change:**

```js
// Before
const MAP_MAX_MARKERS = 15000;

// After — hard ceiling; land already uses Math.min(..., 2500)
const MAP_MAX_MARKERS = 5000;
const MAP_MAX_MARKERS_LAND = 2500;
```

In `queryMapMarkers`:

```js
const maxMarkers = query.surface === 'land'
  ? MAP_MAX_MARKERS_LAND
  : Math.min(MAP_MAX_MARKERS, Number(query.maxMarkers) || MAP_MAX_MARKERS);
```

Keep `capped: true` when limit hit so UI can show “showing first N”.

- [ ] **Step 1: Write test** asserting exported constants or source contains 5000 not 15000  
- [ ] **Step 2: Implement**  
- [ ] **Step 3: PASS**  
- [ ] **Step 4: Grep clients** for assumptions of 15000 — adjust copy if any  

---

### Task 2: Facet scan efficiency (minimal, safe)

**Files:**
- Modify: `lib/leads-platform/store.js` `facetCountsForQuery`

**Current:** One loop over index already (good) with three `matchesQuery` calls per entry.

**Wave 3 target (don’t over-engineer):**

1. Document that list/map callers should pass `skipFacets: true` when facets come from a separate meta call.  
2. Grep `queryLeads` / `queryMapMarkers` call sites in `api.js` — ensure hot paths that also call `getMeta` use `skipFacets` where facets are unused.  
3. Optional: short-circuit city facet loop when `!wantState` earlier (already returns empty cities).  

**Avoid** rewriting `matchesQuery` semantics.

- [ ] **Step 1: Audit api.js** for double work (list + facets + meta)  
- [ ] **Step 2: Add `skipFacets: true`** on any path that ignores facet fields  
- [ ] **Step 3: Unit test** one handler or store behavior if easy; else source assertion  

---

### Task 3: Prune `loginAttempts` Map

**Files:**
- Modify: `server.js` `authRateLimitOk`  
- Test: extract pure helper to `lib/auth-rate-limit.js` for testability **or** source-contract that prune exists

**Implementation:**

```js
// lib/auth-rate-limit.js
const MAX_KEYS = 5000;

function pruneLoginAttempts(map, now = Date.now()) {
  for (const [k, row] of map) {
    if (!row || row.resetAt < now) map.delete(k);
  }
  // If still huge, drop oldest by resetAt
  if (map.size > MAX_KEYS) {
    const entries = [...map.entries()].sort((a, b) => (a[1].resetAt || 0) - (b[1].resetAt || 0));
    const drop = map.size - MAX_KEYS;
    for (let i = 0; i < drop; i++) map.delete(entries[i][0]);
  }
}

function authRateLimitOk(map, clientIp, username, now = Date.now()) {
  if (map.size > MAX_KEYS / 2) pruneLoginAttempts(map, now);
  // ... existing count logic
  return row.count <= 20;
}
```

Wire from `server.js`.

- [ ] **Step 1: Test prune removes expired keys**  
- [ ] **Step 2: Implement + wire**  
- [ ] **Step 3: PASS**

---

### Task 4: Prune `exportCounts` Map

**Files:**
- Modify: `lib/leads-platform/api.js`

On each export rate check, delete keys not matching today’s date suffix (or keys older than 2 days).

```js
function pruneExportCounts(now = new Date()) {
  const today = /* YYYY-MM-DD same as exportRateKey */;
  for (const key of exportCounts.keys()) {
    if (!String(key).endsWith(today) && !String(key).includes(/* yesterday */)) {
      exportCounts.delete(key);
    }
  }
}
```

Keep logic simple: if key’s date part !== today, delete.

- [ ] **Step 1: Implement prune on write path**  
- [ ] **Step 2: Small unit test if extractable; else comment + manual review**

---

### Task 5: Remove public buyer/fund catalog stubs

**Files:**
- Delete: `public/data/buyers/catalog.json`, `public/data/fund-buyers/catalog.json`  
- Optionally delete empty dirs if empty  
- Keep `server.js` 404 block for defense-in-depth  
- Confirm live API still uses `data/buyers` via `/api/buyers` (not public)

- [ ] **Step 1: Grep** for `/data/buyers` or `/data/fund-buyers` in public JS — must be none (or only comments)  
- [ ] **Step 2: Delete stubs**  
- [ ] **Step 3: Test**

```js
test('public buyer catalogs are not shipped', () => {
  assert.equal(fs.existsSync('public/data/buyers/catalog.json'), false);
  assert.equal(fs.existsSync('public/data/fund-buyers/catalog.json'), false);
});
```

- [ ] **Step 4: Live** — `GET /data/buyers/catalog.json` still 404  

---

### Task 6: Delete Trust Funds orphan static assets

**Files to delete (after grep):**

- `public/trust-funds.html`  
- `public/css/trust-funds.css`  
- `public/js/trust-funds-app.js`  
- `public/js/trust-funds-deal-flag.js`  
- `public/js/trust-funds-load-deal.js`  
- `public/js/trust-funds-map.js`  
- `public/js/trust-funds-match.js`  
- `public/js/trust-funds-pitch.js`  
- `public/js/trust-funds-presets.js`  
- `public/js/trust-funds-url.js`  

**Keep:**

- Server 302 `/trust-funds` → `/buyers`  
- `shell-nav` activeId mapping `/trust-funds` → buyers  
- `phuglee-roles` allowlist entry for `/trust-funds` (redirect before gate is fine; keep for safety)

**Grep exceptions:** `under-contract.js` may mention trust-funds string — check context before deleting wrong things.

- [ ] **Step 1: Grep** all references  
- [ ] **Step 2: Delete orphan files**  
- [ ] **Step 3: Test** files absent + 302 still works  
- [ ] **Step 4: Run** `tests/trust-funds-route.test.js` + `tests/shell-nav.test.js`

---

### Task 7: Remove unused `phuglee-logo-hd.png` (optional but recommended)

**Files:**
- Grep for `phuglee-logo-hd`  
- Delete `public/images/phuglee-logo-hd.png` if zero references (Wave 2 moved og:image to `phuglee-logo.png`)

- [ ] **Step 1: Grep**  
- [ ] **Step 2: Delete if safe**  
- [ ] **Step 3: Assert** no HTML refs; file gone  

---

### Task 8: Home page payload trim

**Files:**
- Modify: `public/index.html`

**Safe removals (verify distilled home doesn’t need them):**

1. **`video-fallback.js`** — home has no `<video>` (Wave 1 distilled). Remove script.  
2. **`home-ui-preview.css`** — only if no classes from that sheet appear in index HTML (grep class prefixes used in that CSS).  
3. **`coverage/coverage-dock.css`** — only if home territory UI no longer uses dock classes.  
4. **`home-chronicle.css`** — only if chronicle sections still present; if home still uses chronicle classes, **keep**.

**Process for each CSS candidate:**

```powershell
# Extract unique class selectors from CSS file (manual sample)
# Grep those roots in index.html
```

If unsure, **keep CSS** — only remove when zero matches.

**Dead JS files** (0 HTML refs today): move to `public/js/_retired/` or delete:

- `home-guide.js`  
- `home-coverage-explorer.js`  
- `home-coverage-directory.js`  
- Optionally `coverage/city-profile-modal.js` if unreferenced  

Prefer **delete** only after repo-wide grep (not just HTML).

- [ ] **Step 1: Inventory** index classes vs candidate CSS  
- [ ] **Step 2: Remove proven-unused link/script tags**  
- [ ] **Step 3: Delete or retire dead JS modules**  
- [ ] **Step 4: Live home 200 + visual smoke (no broken layout)**  
- [ ] **Step 5: Source test** — index does not include `video-fallback.js`  

---

### Task 9: Stretch — defer home geojson (if not done in Wave 1)

**Files:** `public/js/home-coverage.js`

If home distilled path only needs bootstrap counts, skip loading `us-states.geojson` until a map node is present and visible.

Skip if time-boxed after Tasks 1–8.

---

### Task 10: Wave 3 verification gate (program closeout)

- [ ] **Step 1: New + regression tests**

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/leads-map-cap.test.js tests/trust-funds-route.test.js tests/shell-nav.test.js tests/rewrite.test.js tests/auth-guard-cookie.test.js tests/gov-lists-catalog.test.js tests/shell-bundle.test.js
# plus any new prune/public-stub tests
```

- [ ] **Step 2: Live**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1 -Deep
```

- [ ] **Step 3: Smoke**

```powershell
# /, /vault, /land-vault, /buyers, /trust-funds (302), /filter, /government-lists
# /data/buyers/catalog.json → 404
```

- [ ] **Step 4: Closeout** below  
- [ ] **Step 5: Mark program complete** in `2026-07-23-site-audit-wave-program.md`  

---

## Wave 3 Closeout

- Date: **2026-07-23**  
- Map caps: **MAP_MAX_MARKERS=5000**, **MAP_MAX_MARKERS_LAND=2500**  
- List facets: land still skipFacets; house vault keeps facets (required by UI)  
- Map endpoints: **skipFacets default true**  
- loginAttempts: `lib/auth-rate-limit.js` with prune + max keys  
- exportCounts: prune non-today keys on check  
- Files deleted:
  - `public/data/buyers/catalog.json`, `public/data/fund-buyers/catalog.json` (+ empty dirs)
  - Trust Funds orphans: html, css, 8 js modules
  - `public/images/phuglee-logo-hd.png`
  - Dead home JS: home-guide, home-coverage-explorer, home-coverage-directory, city-profile-modal
- Home CSS/JS removed: video-fallback.js, home-ui-preview.css, coverage-dock.css (kept home-chronicle for edge UI)  
- Tests: 38-file suite including wave3-housecleaning + map-cap + rate-limit + regressions → **pass**  
- Live: verify-live + Deep **200**, modules up; buyers stub **404**; trust-funds **302** → /buyers  
- Residual: full esbuild minify, secondary lead indexes, home-geojson defer still optional  
- Program complete: **yes** — user closed Wave 3 on 2026-07-23  


---

## Self-review (plan author)

| Audit item | Task |
|------------|------|
| 10k leads map/facet weight | Tasks 1–2 |
| loginAttempts growth | Task 3 |
| exportCounts growth | Task 4 |
| public buyer stubs | Task 5 |
| Trust Funds orphans | Task 6 |
| 3 MB logo-hd | Task 7 |
| Home CSS/JS bloat | Task 8 |
| Home geojson | Task 9 stretch |
| Proof | Task 10 |

No Wave 0–2 rework. No full bundler. Safe deletions only with grep gates.
