# Wave 2 — Correctness & UX Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining mid-severity product edges so desks behave consistently: settings/chrome on Operating Costs, Buyers map works when Form Forge is down, shell remount doesn’t double-bind listeners, Trust Funds is one clear product path (not a dead twin), Analyze mobile menu is usable, and land-vault doesn’t load unused auth UI code.

**Architecture:** Small, targeted fixes on existing vanilla pages and shell JS — no redesign, no speed rework (Wave 1 done), no vault scale (Wave 3). Prefer dual URL / fallback patterns already used in `home-coverage.js`. Product call for Trust Funds: **Buyers desk is canonical**; `/trust-funds` stays a redirect/alias to Buyers; orphan `trust-funds.html` + unused TF modules are marked obsolete or removed carefully with tests.

**Tech Stack:** Vanilla `public/` HTML/JS/CSS, `lib/config.js` routes, `node --test`, PowerShell `verify-live.ps1` (+ `-Deep`).

**Program cadence:** Plan (this doc) → **user approval** → execute → test → **close Wave 2** → only then write Wave 3 plan.

**Prior waves:** Wave 0 trust closed; Wave 1 speed closed 2026-07-23. Do not regress rewrite/auth-guard/gov-lists/shell-bundle/gzip.

## Global Constraints

- Never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge data, or analyzer sessions unless the user explicitly asks.
- After site-facing edits: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1`.
- Closeout also: `scripts\verify-live.ps1 -Deep`.
- Do not commit unless the user asks.
- Prefer TDD for pure helpers / source contracts; HTML order checks via source tests.
- Keep `/filter` and `/bridge` both serving Filter.
- **Out of scope:** gov catalog API changes, shell CSS rebuild, gzip, logo, vault index scale, full server-side HTML auth 302 (optional stretch only if trivial).

## Plain-English “done”

| You should notice… | Proof |
|--------------------|--------|
| Operating Costs has working settings gear + team banner like other desks | Script order + team-alert present; source test |
| Buyers state map still draws if Forge is down | Geo fetch tries public `/data/geo/us-states.geojson` |
| Opening nav remount doesn’t stack Escape handlers forever | Document-level bind once |
| `/trust-funds` clearly is Buyers (or redirects), no half-dead second desk | Config + optional orphan cleanup |
| Analyze phone menu can show | Remove double `hidden` / wire mobile CSS |
| Land Vault doesn’t load homepage login blob | `auth.js` removed from land-vault.html |

## File map

| Area | Primary files |
|------|----------------|
| OC chrome | `public/operating-costs.html` |
| Buyers map | `public/js/buyers-map.js` (and `trust-funds-map.js` if still referenced anywhere) |
| Shell listeners | `public/js/shell-nav.js` |
| Trust Funds product | `lib/config.js`, `lib/phuglee-roles.js`, `public/js/shell-nav.js`, orphan `public/trust-funds.html`, `public/js/trust-funds-*.js` |
| Analyze mobile | `modules/property-analyzer/public/index.html` (+ CSS if needed) |
| Land vault scripts | `public/land-vault.html` |
| Tests | `tests/wave2-*.test.js` or focused source-contract tests |

## Confirmed defects (2026-07-23 re-check)

| ID | Evidence |
|----|----------|
| PF-02 OC script order | `operating-costs.html`: `shell-nav.js` **before** `settings-menu.js`; no `team-alert-banner.js` |
| PF-06 Buyers map | `buyers-map.js` line 4: only `/forge/static/geo/us-states.geojson` |
| PF-10 Escape rebind | `shell-nav.js` ~423: `document.addEventListener('keydown', …)` inside `bindMobileChrome` without document-level once flag (root dataset resets on remount) |
| PF-07 Trust Funds | `config.js`: `'/trust-funds': 'buyers.html'`; `trust-funds.html` + TF JS still on disk |
| M2 Analyze mobile | `analyzeMobileNavToggle` has `hidden hidden` |
| PF-09 Land vault | loads `auth.js?v=distress20` unnecessarily |

---

### Task 1: Operating Costs — settings order + team-alert

**Files:**
- Modify: `public/operating-costs.html`
- Test: `tests/operating-costs-shell.test.js` (source contract)

**Target script order (footer, all `defer` where others use defer):**

Match other desks (e.g. vault/buyers pattern):

1. `settings-menu.js` (before shell-nav)  
2. `command-palette.js`  
3. `shell-nav.js`  
4. `team-alert-banner.js`  
5. `operating-costs.js`  

Also ensure head still has theme + auth trio. Add `phuglee-motion.js` / `distress-status.js` only if other admin desks have them and OC is missing (check vault.html) — **minimum** is settings-before-nav + team-alert.

- [ ] **Step 1: Failing source test**

```js
// tests/operating-costs-shell.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('operating-costs loads settings-menu before shell-nav and includes team-alert', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/operating-costs.html'), 'utf8');
  const settings = html.indexOf('settings-menu.js');
  const nav = html.indexOf('shell-nav.js');
  assert.ok(settings >= 0 && nav >= 0);
  assert.ok(settings < nav, 'settings-menu must precede shell-nav');
  assert.match(html, /team-alert-banner\.js/);
});
```

- [ ] **Step 2: Run — expect FAIL**  
- [ ] **Step 3: Reorder scripts + add team-alert**  
- [ ] **Step 4: Run — expect PASS**  
- [ ] **Step 5: verify-live.ps1**

---

### Task 2: Buyers map — public geo fallback

**Files:**
- Modify: `public/js/buyers-map.js`
- Modify: `public/js/trust-funds-map.js` **if** it still exists and has the same single Forge URL (even if unused by route — keep twins consistent or leave if deleting in Task 4)
- Test: `tests/buyers-map-geo.test.js` (source contract)

**Pattern (match home-coverage dual URL spirit):**

```js
const STATES_GEO_URLS = [
  '/data/geo/us-states.geojson',           // public, works when Forge down
  '/forge/static/geo/us-states.geojson'  // legacy forge path
];

async function fetchStatesGeo() {
  let lastErr;
  for (const url of STATES_GEO_URLS) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) return res.json();
      lastErr = new Error('HTTP ' + res.status + ' ' + url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('states geo unavailable');
}
```

Replace single `fetch(STATES_GEO_URL)` with `fetchStatesGeo()`.

Bump `buyers-map.js?v=` on `buyers.html` (and any TF HTML if still linked).

- [ ] **Step 1: Source test** asserts both URL strings present and Forge-only is not the sole constant  
- [ ] **Step 2: Implement**  
- [ ] **Step 3: Live** — with Forge up, map still works; optional: stop forge and confirm public path used (if easy). At minimum:  
  `Invoke-WebRequest http://127.0.0.1:3000/data/geo/us-states.geojson` → 200  

---

### Task 3: Shell-nav — document Escape bind once

**Files:**
- Modify: `public/js/shell-nav.js` (`bindMobileChrome`)
- Test: `tests/shell-nav-bind.test.js` (source contract)

**Fix:**

```js
// Module-level (outside bindMobileChrome):
let documentEscapeBound = false;

function bindMobileChrome(root) {
  if (!root || root.dataset.mobileBound === '1') return;
  root.dataset.mobileBound = '1';
  // ... menu/backdrop/link handlers on root ...

  if (!documentEscapeBound) {
    documentEscapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
    });
  }
}
```

Ensure `closeMobileNav` still finds current open nav (uses query/DOM, not stale root). If `closeMobileNav` closes via class on `#distress-os-nav`, remount is fine.

Bump `shell-nav.js?v=` across pages that pin a version (or rely on shell remount + hard refresh note). Prefer bumping `?v=43-wave2` on HTML that already version shell-nav.

- [ ] **Step 1: Source test** — `documentEscapeBound` or comment `Escape once` + single `document.addEventListener('keydown'` pattern  
- [ ] **Step 2: Implement**  
- [ ] **Step 3: PASS + verify-live**

---

### Task 4: Trust Funds product path (canonical Buyers)

**Product decision (locked for this plan unless user overrides at approval):**

- **Canonical desk:** Buyers (`/buyers` → `buyers.html`).  
- **`/trust-funds`:** keep as **alias** to Buyers (current behavior) **or** upgrade to HTTP **302** to `/buyers` for clearer UX. Prefer **302** so bookmarks and titles say Buyers.  
- **Orphan files:** `public/trust-funds.html` + `public/js/trust-funds-*.js` + `public/css/trust-funds.css` are **not served** today. Do **not** re-enable a second fund desk without product work.  
  - Wave 2: add short comment in `config.js`; stop linking TF in palette if any; optional move orphans to `public/_retired/` **or** delete only if grep shows zero references.  
  - Prefer **delete only when grep is clean**; otherwise leave files + document in closeout.

**Files:**
- Modify: `lib/config.js` — either keep map to buyers.html with clearer comment, or remove route and handle 302 in `server.js` DISTRESS_ROUTES branch  
- Modify: `lib/phuglee-roles.js` if paths list needs `/trust-funds` still allowed (redirect target after login)  
- Modify: `public/js/shell-nav.js` / `command-palette.js` — ensure no “Trust Funds” primary nav if Buyers already listed  
- Test: `tests/trust-funds-route.test.js`

**Recommended implementation (302):**

```js
// server.js early in DISTRESS_ROUTES handling or before static:
if (pathname === '/trust-funds') {
  res.writeHead(302, { Location: '/buyers', 'Cache-Control': 'no-store' });
  res.end();
  return;
}
// Remove '/trust-funds' from DISTRESS_ROUTES or leave as dead code removed
```

Roles: users allowed `/buyers` should treat `/trust-funds` as allowed (redirect happens first).

- [ ] **Step 1: Grep references** to trust-funds  
- [ ] **Step 2: Implement 302 + config comment**  
- [ ] **Step 3: Test**

```js
test('config does not serve a separate trust-funds.html as primary', () => {
  const config = require('../lib/config');
  // After change: either no key, or key points to buyers / handled by redirect test
});
// Optional http test against running server in verify step
```

- [ ] **Step 4: Live**

```powershell
# Expect 302 Location /buyers (or 200 buyers body if alias kept)
try {
  Invoke-WebRequest http://127.0.0.1:3000/trust-funds -MaximumRedirection 0 -UseBasicParsing
} catch {
  $_.Exception.Response.Headers.Location
}
```

---

### Task 5: Analyze mobile nav toggle

**Files:**
- Modify: `modules/property-analyzer/public/index.html`  
- Possibly: analyzer CSS for `analyze-mobile-nav-toggle` at ≤768px  

**Fix:**

1. Remove duplicate `hidden` attribute: keep one control mechanism.  
2. Prefer: remove both `hidden` attributes and use CSS:

```css
.analyze-mobile-nav-toggle { display: none; }
@media (max-width: 768px) {
  .analyze-mobile-nav-toggle { display: inline-flex; /* or block */ }
}
```

3. If JS already toggles sidebar via `#analyzeMobileNavToggle`, confirm listener exists; if not, wire minimal toggle in existing analyzer shell JS (find `analyzeMobileNavToggle` in `public/js`).

- [ ] **Step 1: Grep** `analyzeMobileNavToggle` in analyzer public JS  
- [ ] **Step 2: Fix HTML + CSS + wire if dead**  
- [ ] **Step 3: Source test** — `index.html` must not contain `hidden hidden`  
- [ ] **Step 4: verify-live** (analyzer may be 401 unauthenticated for full UI — source test is primary; deep health still up)

---

### Task 6: Land Vault — drop unused `auth.js`

**Files:**
- Modify: `public/land-vault.html` — remove  
  `<script src="/js/auth.js?v=distress20" defer></script>`  
  Keep auth-session / auth-config / auth-guard (login gate).

- [ ] **Step 1: Source test** land-vault has auth-guard, **no** `/js/auth.js`  
- [ ] **Step 2: Remove script**  
- [ ] **Step 3: PASS + verify-live**

---

### Task 7 (stretch): DistressStatus already clears interval — verify only

Wave 0 cleared `pollTimer` on remount. Confirm no double-mount without clear remains.

- [ ] **Step 1: Read** `public/js/distress-status.js` mount — must `clearInterval` before new interval  
- [ ] **Step 2: If missing, fix (should already be done)

---

### Task 8: Wave 2 verification gate

- [ ] **Step 1: Unit/source suite**

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/operating-costs-shell.test.js tests/buyers-map-geo.test.js tests/shell-nav-bind.test.js tests/trust-funds-route.test.js tests/land-vault-scripts.test.js
# plus any analyze mobile source test
```

- [ ] **Step 2: Regression smoke (Wave 0/1)**

```powershell
node --test tests/rewrite.test.js tests/auth-guard-cookie.test.js tests/gov-lists-catalog.test.js tests/shell-bundle.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1 -Deep
```

- [ ] **Step 3: Page smoke**

```powershell
foreach ($p in @('/','/buyers','/trust-funds','/operating-costs','/land-vault','/vault','/filter','/pipeline')) {
  # trust-funds may be 302 → follow or check status
}
```

- [ ] **Step 4: Closeout section below**  
- [ ] **Step 5: User confirms → Wave 3 plan only after close**

---

## Wave 2 Closeout

- Date: **2026-07-23**  
- Trust Funds behavior: **HTTP 302 → `/buyers`** (Buyers canonical; route removed from DISTRESS_ROUTES)  
- Tests: operating-costs-shell, buyers-map-geo, shell-nav-bind, trust-funds-route, land-vault-scripts, analyze-mobile-nav + Wave 0/1 regressions → pass  
- Live: `verify-live.ps1 -Deep` exit 0; forge+analyzer up  
- Smoke: `/buyers`, `/operating-costs`, `/land-vault`, `/vault`, `/filter`, `/pipeline` → 200; `/trust-funds` → 302 Location `/buyers`  
- Shipped:
  1. OC settings-menu before shell-nav + team-alert-banner  
  2. Buyers/TF map public geo first  
  3. shell-nav `documentEscapeBound` once  
  4. Trust Funds 302 to Buyers  
  5. Analyze mobile menu not hard-hidden  
  6. Land-vault dropped unused `auth.js`  
- Residual: orphan `trust-funds.html` + `trust-funds-*.js` still on disk (not served); optional delete in Wave 3  
- Ready for Wave 3 plan: **yes** (pending your close)  


---

## Self-review (plan author)

| Audit item | Task |
|------------|------|
| OC settings order + team-alert | Task 1 |
| Buyers map Forge-only geo | Task 2 |
| Shell Escape double-bind | Task 3 |
| Trust Funds orphan / alias | Task 4 |
| Analyze mobile double-hidden | Task 5 |
| Land-vault auth.js bloat | Task 6 |
| DistressStatus double poll | Task 7 verify |
| Proof bar | Task 8 |

**Not in Wave 2:** server-wide HTML auth 302 for all desks (larger product change), UC/Filter minify, leads index facets (Wave 3), home CSS distill (Wave 3).

No placeholders for core tasks. Product decision on Trust Funds is explicit (Buyers canonical + redirect).
