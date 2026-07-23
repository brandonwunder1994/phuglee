# Wave 1 — Speed & Load Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Distress OS / Phuglee open and navigate much faster by cutting the largest downloads (government catalog, shell CSS waterfall, heavy desk assets, giant logo/videos) and adding gzip for text static assets — without redesigning product UX or wiping operator data.

**Architecture:** Keep the multi-page vanilla stack. (1) Serve government-list **meta + per-state sources** instead of one 7.5 MB blob on every open; fix client cache. (2) **Concatenate** shell CSS into a real single file (kill `@import` chain). (3) Add optional **gzip** for text MIME in `serveStatic`. (4) Unify cache-bust versions; drop Pipeline’s full Under Contract CSS; slim OG logo; gate Heat videos. Minify is **optional secondary** (no esbuild in package today) — gzip + payload cuts first.

**Tech Stack:** Node.js `server.js` / `lib/static-cache.js`, vanilla `public/`, PowerShell verify scripts, `node --test`, no new npm deps unless explicitly approved (prefer zero-deps zlib for gzip).

**Program cadence:** Plan (this doc) → **user approval** → execute → verification → **close Wave 1** → only then write Wave 2 plan.

**Prior wave:** Wave 0 closed 2026-07-23 (`2026-07-23-wave-0-trust-reliability.md`). Do not re-litigate trust work unless a Wave 1 change breaks it.

**Audit source:** Full-site audit 2026-07-22 findings H1, H3, H6–H8, H10, M6–M7, L4; Wave 1 items from operator-facing plan.

## Global Constraints

- Never delete/truncate `data/filter-lists/`, `data/bridge-brain/`, Form Forge data, or analyzer users/sessions unless the user **explicitly** asks.
- After any site-facing edit: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` (restart via `scripts\restart.ps1` if needed).
- Wave closeout also: `scripts\verify-live.ps1 -Deep` (modules up).
- Do not commit unless the user asks.
- Prefer TDD for server/API and pure helpers; static HTML/CSS proof via live size/header checks.
- Keep `/bridge` and `/filter` both serving Filter.
- **Do not** implement Wave 2 UX polish or Wave 3 scale work here (Trust Funds route, OC script order, MapLibre bundling, leads facet rewrite).
- Do not break Government Lists filtering/sort/selection; only change how catalog data is loaded.
- Full `public/data/government-lists/catalog.json` may remain on disk as the **source of truth** for generation; browser must not be forced to download all ~7.5 MB on first open.

## Plain-English “done”

| You should notice… | Proof |
|--------------------|--------|
| Government Lists opens without multi-second multi-MB download | First open loads meta + one state (or empty until state picked); no full-catalog `no-store` fetch |
| App pages paint shell faster | `shell-bundle.css` has **zero** `@import`; one CSS body |
| Smaller text downloads | `Content-Encoding: gzip` on CSS/JS/JSON when client accepts it |
| Pipeline lighter | No full `under-contract.css` on `/pipeline` |
| Home/Heat/Command share same map script version | One `home-coverage.js?v=` stamp |
| Heat kinder to phones | Videos respect reduced-motion / Save-Data; no triple autoplay without gates |
| OG/share logo sane size | `phuglee-logo-hd.png` well under 200 KB (or replaced by webp/png derivative + HTML update) |

## Measured baseline (2026-07-23)

| Asset | Size |
|-------|------|
| `public/data/government-lists/catalog.json` | **~7,570 KB** (~6,029 sources, 70 states) |
| `public/css/shell-bundle.css` | **0.6 KB** of `@import` × 12 (not real bundle) |
| `public/js/bridge.js` + `bridge.css` | ~274 + 161 KB |
| `public/js/under-contract.js` + CSS | ~260 + 190 KB |
| `public/images/phuglee-logo-hd.png` | **~3,036 KB** |
| Videos (analyze/collect/filter) | ~13 + 6.8 + 6.8 MB |
| `home-coverage.js` query | index `?v=14`, heat `?v=18`, command `?v=23-map-clip` |

## File map

| Area | Primary files |
|------|----------------|
| Gov lists load | `public/js/government-lists-app.js`, `public/js/gov-lists-normalize.js`, **new** `lib/gov-lists-catalog.js` and/or API in `server.js` / `lib/gov-playbooks` sibling |
| Catalog data | `public/data/government-lists/catalog.json` (source); optional generated `by-state/*.json` under same folder |
| Shell CSS | `public/css/shell-bundle.css`, `scripts/build-shell-bundle.mjs` (new), source sheets listed in current `@import`s |
| Gzip static | `server.js` `serveStatic`, tests `tests/static-gzip.test.js` |
| Pipeline CSS | `public/pipeline.html`, `public/css/pipeline.css` |
| Cache versions | `public/index.html`, `public/heat.html`, `public/command.html` |
| Videos | `public/heat.html`, `public/js/video-fallback.js` |
| Logo | `public/images/phuglee-logo-hd.png` (replace/compress), `public/index.html` / `heat.html` og:image if path changes |
| Home geo (optional stretch) | `public/js/home-coverage.js` |

## Out of scope (Wave 2+)

- Trust Funds route vs buyers alias  
- Operating Costs script order / team-alert  
- Buyers map forge geo fallback  
- Server HTML 302 auth  
- Full esbuild/webpack app bundler for all pages  
- Transcoding MP4s to smaller codecs (optional note only; Wave 1 gates playback)

---

### Task 1: Government lists — meta + state sources API (biggest win)

**Files:**
- Create: `lib/gov-lists-catalog.js` — read catalog from disk, cache in memory by mtime, export helpers
- Modify: `server.js` — routes under `/api/gov-lists/...` **or** mount from small handler
- Modify: `public/js/government-lists-app.js` — stop full-file `cache: 'no-store'` fetch; load meta then sources by state
- Test: `tests/gov-lists-catalog.test.js`
- Optional generate: `scripts/split-gov-lists-catalog.mjs` if using static shards instead of on-the-fly filter (API filter is enough for Wave 1)

**Interfaces:**

```js
// lib/gov-lists-catalog.js
function loadCatalog() // { version, updatedAt, listTypes, methods, sources, researchProgress, stats }
function getMeta() // no sources array — include stateCounts: { TX: 521, ... }, sourceCount
function getSources({ state, listType, q, limit, offset }) // filtered page
function getSourceById(id)
```

**HTTP (public read is OK — catalog already public under `/data/`):**

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/gov-lists/meta` | `{ ok, meta }` where meta has listTypes, methods, stats, researchProgress, stateCounts, sourceCount, updatedAt — **no sources** |
| GET | `/api/gov-lists/sources?state=TX` | `{ ok, sources: [...], total, state }` — **require `state`** (2-letter) unless `all=1` **and** authenticated admin (optional; if too heavy, require state always for Wave 1) |
| GET | `/api/gov-lists/sources?state=TX&listType=code_violation` | filtered |
| GET | `/data/government-lists/catalog.json` | **Keep** for backwards compat but client must stop using it on boot |

**Client change (government-lists-app.js):**

1. Replace `CATALOG_URL` full fetch with:
   - `fetch('/api/gov-lists/meta')` → fill listTypes, methods, researchProgress, state dropdown counts  
   - On init: if URL/state select has a state, `fetch('/api/gov-lists/sources?state=' + encodeURIComponent(st))`  
   - If no state selected: `state.merged = []`, show empty table + prompt “Pick a state to load sources” (or auto-load last-used state from localStorage key `gl-last-state`)
2. Remove `cache: 'no-store'` on catalog; use default browser cache or `cache: 'default'`.
3. When user changes `#gl-state`, re-fetch that state’s sources (show small loading toast).
4. Playbooks path unchanged (`/api/gov-playbooks`).

**Wave 1 hard rule:** First paint must not download full 6k sources.

- [ ] **Step 1: Write failing tests**

```js
// tests/gov-lists-catalog.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMeta, getSources } = require('../lib/gov-lists-catalog');

test('getMeta has no sources array and reports stateCounts', () => {
  const meta = getMeta();
  assert.equal(meta.sources, undefined);
  assert.ok(meta.sourceCount > 1000);
  assert.ok(meta.stateCounts.TX > 0);
  assert.ok(Array.isArray(meta.listTypes));
});

test('getSources requires state and returns only that state', () => {
  assert.throws(() => getSources({}), /state/i);
  const { sources, total } = getSources({ state: 'TX' });
  assert.ok(sources.length > 0);
  assert.equal(sources.length, total);
  assert.ok(sources.every((s) => s.state === 'TX'));
});
```

- [ ] **Step 2: Implement `lib/gov-lists-catalog.js`** — read `path.join(config.PUBLIC, 'data/government-lists/catalog.json')`, mtime cache.

- [ ] **Step 3: Wire routes in server.js** before static `/data` handling (so API wins).

```js
if (pathname.startsWith('/api/gov-lists')) {
  // handle meta + sources; 400 if sources missing state
}
```

- [ ] **Step 4: Update government-lists-app.js** load path as above; bump script `?v=` on `government-lists.html`.

- [ ] **Step 5: Run tests**

```powershell
node --test tests/gov-lists-catalog.test.js
```

Expected: PASS

- [ ] **Step 6: Live proof**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# meta size
(Invoke-WebRequest http://127.0.0.1:3000/api/gov-lists/meta -UseBasicParsing).RawContentLength
# TX only
(Invoke-WebRequest 'http://127.0.0.1:3000/api/gov-lists/sources?state=TX' -UseBasicParsing).RawContentLength
# assert TX response << 7.5MB (e.g. < 800_000 bytes)
```

Expected: meta tens of KB; TX hundreds of KB max; never ~7.5 MB for meta.

- [ ] **Step 7: Manual UI** — open `/government-lists`, pick TX, rows appear; change state reloads.

---

### Task 2: Build real `shell-bundle.css` (kill `@import` waterfall)

**Files:**
- Create: `scripts/build-shell-bundle.mjs`
- Modify: `public/css/shell-bundle.css` — **output** of build (concatenated CSS, no `@import`)
- Optional: keep source list in `scripts/shell-bundle.manifest.json` or top of build script
- Test: `tests/shell-bundle.test.js` — asserts no `@import` in built file; size > 10 KB

**Source order (current imports — preserve order):**

1. `tokens.css`  
2. `distress-glass.css`  
3. `phuglee-components.css`  
4. `phuglee-shell.css`  
5. `shell.css`  
6. `shell-nav.css`  
7. `team-alert-banner.css`  
8. `settings-menu.css`  
9. `command-palette.css`  
10. `distress-status.css`  
11. `phuglee-a11y.css`  
12. `mobile-baseline.css`  

**Build script sketch:**

```js
// scripts/build-shell-bundle.mjs
import fs from 'fs';
import path from 'path';
const root = path.join(process.cwd(), 'public', 'css');
const files = [/* names without query */];
let out = '/* shell-bundle generated — do not hand-edit; run node scripts/build-shell-bundle.mjs */\n';
for (const f of files) {
  const body = fs.readFileSync(path.join(root, f), 'utf8');
  out += `\n/* === ${f} === */\n` + body.replace(/@import[^;]+;/g, '/* stripped import */');
}
fs.writeFileSync(path.join(root, 'shell-bundle.css'), out);
console.log('wrote', out.length, 'bytes');
```

- [ ] **Step 1: Write test expecting no @import and min size**

```js
test('shell-bundle.css is concatenated not import chain', () => {
  const css = fs.readFileSync('public/css/shell-bundle.css', 'utf8');
  assert.equal(/@import\s+url/i.test(css), false);
  assert.ok(css.length > 10_000);
});
```

- [ ] **Step 2: Implement + run build**

```powershell
node scripts/build-shell-bundle.mjs
node --test tests/shell-bundle.test.js
```

- [ ] **Step 3: Bump all HTML `shell-bundle.css?v=`** to a new stamp e.g. `?v=20-wave1-concat` (grep `shell-bundle.css`).

- [ ] **Step 4: Document** in plan closeout: after editing any shell source CSS, re-run build script (add npm script `"build:shell": "node scripts/build-shell-bundle.mjs"`).

- [ ] **Step 5: verify-live.ps1** after restart if needed.

---

### Task 3: Gzip text static assets

**Files:**
- Modify: `server.js` `serveStatic` — if `Accept-Encoding` includes `gzip` and ext is `.js`/`.css`/`.json`/`.geojson`/`.svg`/`.html` (if ever static), stream through `zlib.createGzip()` or pre-buffer small files  
- Prefer **streaming gzip** for large JSON; for simplicity Wave 1 may gzip buffers under 15 MB with size cap  
- Set headers: `Content-Encoding: gzip`, `Vary: Accept-Encoding`, omit wrong `Content-Length` or set compressed length  
- Test: `tests/static-gzip.test.js` — unit-test a pure helper `shouldGzip(ext, acceptEncoding)` + optional integration with http if easy

**Interfaces:**

```js
// lib/static-gzip.js (new)
function clientAcceptsGzip(acceptEncodingHeader) // boolean
function gzippableExt(ext) // boolean
```

Wire in `serveStatic` after path resolution, before createReadStream for full-body (non-Range) responses. **Do not gzip** video/image Range responses.

- [ ] **Step 1: Tests for helper**  
- [ ] **Step 2: Implement helper + serveStatic**  
- [ ] **Step 3: Live**

```powershell
# PowerShell may not send Accept-Encoding; use curl if available:
curl.exe -sI -H "Accept-Encoding: gzip" http://127.0.0.1:3000/css/shell-bundle.css?v=20-wave1-concat
# expect Content-Encoding: gzip
```

- [ ] **Step 4: Ensure Wave 0 deep health still passes**

---

### Task 4: Unify `home-coverage.js` cache-bust

**Files:**
- Modify: `public/index.html`, `public/heat.html`, `public/command.html`

**Target stamp (single):** `home-coverage.js?v=24-wave1` (or keep highest feature stamp `23-map-clip` everywhere — pick **one** string).

- [ ] **Step 1: Grep all references**

```powershell
Select-String -Path public\*.html -Pattern 'home-coverage\.js'
```

- [ ] **Step 2: Set every hit to the same `?v=24-wave1`**  
- [ ] **Step 3: Source test**

```js
// tests/home-coverage-version.test.js
test('home-coverage.js version stamp is unified', () => {
  const files = ['index.html','heat.html','command.html'];
  const versions = new Set();
  for (const f of files) {
    const html = fs.readFileSync(path.join('public', f), 'utf8');
    const m = html.match(/home-coverage\.js\?v=([^"']+)/);
    assert.ok(m, f);
    versions.add(m[1]);
  }
  assert.equal(versions.size, 1);
});
```

---

### Task 5: Pipeline — drop full Under Contract CSS

**Files:**
- Modify: `public/pipeline.html` — remove  
  `<link rel="stylesheet" href="/css/under-contract.css?...">`  
- Modify: `public/css/pipeline.css` — copy **only** rules needed for classes used by pipeline HTML/JS that came from UC (e.g. `.uc-view-toggle`, `.uc-view-btn`, shared vault toast if not in vault.css)

**Discovery steps (mandatory before delete link):**

```powershell
# classes in pipeline HTML + pipeline-app.js
Select-String -Path public\pipeline.html,public\js\pipeline-app.js -Pattern 'class="[^"]+"|classList|uc-'
```

Keep `vault.css` (gate/toast tokens). Expand `pipeline.css` with minimal UC clones.

- [ ] **Step 1: Inventory classes**  
- [ ] **Step 2: Port missing rules into pipeline.css**  
- [ ] **Step 3: Remove under-contract.css link; bump pipeline.css `?v=`**  
- [ ] **Step 4: Live open `/pipeline` — board/toggle look intact; network tab must not request under-contract.css  

```powershell
# HTML must not reference under-contract.css
Select-String -Path public\pipeline.html -Pattern 'under-contract\.css'
# expect no matches
```

---

### Task 6: Heat videos — data/motion gates

**Files:**
- Modify: `public/heat.html` — ensure each pipeline video has `preload="none"` or `metadata`, `playsinline`, `muted`; add `data-pipeline-video`  
- Modify: `public/js/video-fallback.js` — if `prefers-reduced-motion: reduce` **or** `navigator.connection.saveData` **or** `navigator.connection.effectiveType` is `slow-2g`/`2g`, **do not autoplay**; leave click-to-play (add play control only if missing — minimal: keep paused until user gesture on video click)

**Behavior:**

```js
function shouldAutoplayVideo() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch (_) {}
  try {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData || /2g/i.test(c.effectiveType || ''))) return false;
  } catch (_) {}
  return true;
}
```

Only call IntersectionObserver autoplay path if `shouldAutoplayVideo()`.

- [ ] **Step 1: Update video-fallback.js**  
- [ ] **Step 2: heat.html preload=metadata or none; bump video-fallback `?v=`**  
- [ ] **Step 3: Confirm home still OK if it loads video-fallback without videos** (no throw)  
- [ ] **Step 4: Manual** — Heat with reduced-motion in DevTools does not start three MP4s.

---

### Task 7: Shrink OG / logo HD asset

**Files:**
- Replace or add: `public/images/phuglee-logo-hd.png` (target **≤ 150–200 KB**) and/or `public/images/phuglee-og.png`  
- Modify: `public/index.html`, `public/heat.html` (and any `og:image` refs) to point at the slim asset  
- **Do not** use a 3 MB file for og:image

**How (Windows-friendly, no new deps if possible):**

1. Prefer existing smaller `phuglee-logo.png` (~216 KB) or SVG for on-page; for og:image use a resized PNG.  
2. If ImageMagick/ffmpeg available: resize to ~1200×630 social card.  
3. If tools missing: copy best existing logo under 300 KB and update meta tags; document residual if still large.

- [ ] **Step 1: Measure current og targets**  
- [ ] **Step 2: Produce slim file**  
- [ ] **Step 3: Update meta tags**  
- [ ] **Step 4: Assert**

```powershell
(Get-Item public\images\phuglee-logo-hd.png).Length -lt 250KB
# or new og path
```

---

### Task 8 (stretch if time): Defer home geojson when only stats chips needed

**Files:**
- Modify: `public/js/home-coverage.js` — if `data-home-map-preview` / distilled home only needs bootstrap counts, **do not** fetch `us-states.geojson` until map canvas visible  
- Test: source or unit if pure function

Skip if Task 1–7 consume the wave budget; note in closeout as deferred to Wave 1.1 / Wave 2.

---

### Task 9: Wave 1 verification gate (closeout)

**Do not mark Wave 1 complete until all pass in one session.**

- [ ] **Step 1: Automated**

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/gov-lists-catalog.test.js tests/shell-bundle.test.js tests/home-coverage-version.test.js tests/static-gzip.test.js
# plus any other new tests from this wave
node scripts/build-shell-bundle.mjs   # if not already committed built
```

Expected: 0 failures.

- [ ] **Step 2: Live**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1 -Deep
```

- [ ] **Step 3: Payload checks**

```powershell
$meta = (Invoke-WebRequest http://127.0.0.1:3000/api/gov-lists/meta -UseBasicParsing).RawContentLength
$tx = (Invoke-WebRequest 'http://127.0.0.1:3000/api/gov-lists/sources?state=TX' -UseBasicParsing).RawContentLength
"meta=$meta tx=$tx"
# meta must be < 200_000; tx must be < 1_500_000 (tune if real TX larger — still << 7.5e6)
$bundle = Get-Item public\css\shell-bundle.css
assert no @import: Select-String shell-bundle.css '@import'
```

- [ ] **Step 4: Smoke pages**

```powershell
foreach ($p in @('/','/filter','/collect','/government-lists','/pipeline','/heat','/command','/under-contract')) {
  (Invoke-WebRequest "http://127.0.0.1:3000$p" -UseBasicParsing).StatusCode
}
```

- [ ] **Step 5: Regression** — quick run of Wave 0 critical tests:

```powershell
node --test tests/rewrite.test.js tests/auth-guard-cookie.test.js
```

- [ ] **Step 6: Write closeout** below; user confirms → Wave 2 plan only after that.

---

## Wave 1 Closeout

- Date: **2026-07-23**  
- Payload numbers:
  - Gov lists **meta**: **9,268** bytes (was ~7,751,749 full catalog)
  - Gov lists **TX sources**: **578,363** bytes
  - `shell-bundle.css`: **83,300** bytes concatenated, **0** `@import`; gzip **16,286** bytes
  - `bridge.js` gzip sample: **65,374** bytes compressed
  - OG image: `phuglee-logo.png` **~216 KB** (was logo-hd **~3,036 KB**)
- Tests run: `gov-lists-catalog`, `shell-bundle`, `static-gzip`, `home-coverage-version`, rewrite, auth-guard, write-json-atomic → **23/23 pass**
- Live: `verify-live.ps1` + `-Deep` → **exit 0**, `modulesReady: true`, formForge+analyzer **up**
- Smoke pages 200: `/`, `/government-lists`, `/pipeline`, `/heat`, `/filter`, `/command`
- Shipped:
  1. `/api/gov-lists/meta` + `/api/gov-lists/sources?state=` + client state-scoped load
  2. `scripts/build-shell-bundle.mjs` + real `shell-bundle.css`
  3. Gzip for text static (js/css/json/geojson/svg/html)
  4. Unified `home-coverage.js?v=24-wave1`
  5. Pipeline no longer loads `under-contract.css`
  6. Heat video reduced-motion / Save-Data / click-to-play gates
  7. OG images point at smaller logo.png
- Residual / deferred:
  - Full catalog still on disk at `/data/government-lists/catalog.json` (compat); client no longer boots on it
  - logo-hd.png file still on disk (~3 MB) but not used for og:image on main pages — optional delete later
  - Stretch Task 8 (defer home geojson) not done
  - No full esbuild minify (gzip covers primary transfer win)
- Ready for Wave 2 plan: **yes** (pending your close confirmation)  


---

## Self-review (plan author)

| Wave 1 audit item | Task |
|-------------------|------|
| H1 Gov lists 7.5 MB + no-store | Task 1 |
| H3 shell-bundle @import | Task 2 |
| No gzip | Task 3 |
| H10 home-coverage version skew | Task 4 |
| M6 pipeline full UC CSS | Task 5 |
| H8 / video mobile | Task 6 |
| H7 3 MB logo HD | Task 7 |
| Home geojson weight | Task 8 stretch |
| Proof bar | Task 9 |

**Intentionally light on minify:** no esbuild in package.json; gzip + payload elimination deliver most of the speed. Full minify can be a follow-up if operator still wants smaller Filter/UC after gzip.

No Wave 2 Trust Funds / OC script-order items included.
