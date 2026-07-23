# Wave 0 — Trust & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Distress OS / Phuglee trustworthy again: Collect’s Form Forge is up, Analyze → Vault saves hit the shell correctly, login survives new tabs, vault catalog writes don’t corrupt on Windows, deep health is the operator proof bar, and water shut-off Filter safety tests run in CI.

**Architecture:** Fix server rewrite so shell APIs stay at root under `/analyzer`; make client auth-guard wait for cookie hydrate; centralize Windows-safe atomic JSON writes + serialize leads index mutations; restore Form Forge process and prove deep health; re-enable water shut-off tests and fix product code only if tests fail. No performance work (Wave 1). No UX polish beyond trust.

**Tech Stack:** Node.js shell (`server.js`, `lib/`), vanilla `public/js`, Property Analyzer under `modules/property-analyzer/`, Form Forge Python child, `node --test` under `tests/`.

**Program cadence:** Plan (this doc) → **user approval** → execute → full wave verification → **close Wave 0** → only then write Wave 1 plan.

**Spec / audit source:** Full-site audit session 2026-07-22 (findings C1–C5, H2, H5). Related older matrix: `docs/superpowers/specs/2026-07-13-full-site-audit-remediation-design.md` (do not expand Wave 0 into that whole matrix).

## Global Constraints

- Never delete/truncate `data/filter-lists/`, `data/bridge-brain/`, Form Forge data under `modules/form-forge/data/`, or analyzer users/sessions unless the user **explicitly** asks.
- Cleaning orphan `data/leads-catalog/*.tmp` and `leads/*.tmp` is allowed (temps only, not `index.json` or lead JSON).
- After any site-facing edit: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` (restart via `scripts\restart.ps1` if needed).
- Wave closeout **must** also pass: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1 -Deep` (modules up).
- Do not commit unless the user asks.
- Prefer TDD: failing test → implement → pass for every code task that can be unit-tested.
- Keep `/bridge` and `/filter` both serving Filter desk.
- Do not implement Wave 1 speed work (catalog split, shell-bundle concat, minify, images, videos) in this wave.

## Plain-English “done”

| You should be able to… | Proof |
|------------------------|--------|
| Use Collect (Forge online) | Deep health shows `formForge: up` |
| Review a property and send it to Vault without “wrong URL” failures | Rewrite tests pass; vault shell paths not rewritten |
| Stay logged in when opening a desk in a new tab | Auth-guard waits for cookie → sessionStorage |
| Trust Vault list updates under load on Windows | Atomic write + serialized index; no new orphan temps from happy path |
| Know when a module is really down | Deep health 503 when Forge down; local closeout uses `-Deep` |
| Rely on water shut-off Filter rules in CI | Six water tests no longer skipped (pass) |

## File map

| Area | Primary files |
|------|----------------|
| Rewrite shell APIs | `lib/rewrite.js`, `tests/rewrite.test.js` |
| Auth cookie gate | `public/js/auth-guard.js`, `public/js/auth-session.js`, tests if present |
| Atomic JSON | **Create** `lib/write-json-atomic.js`, modify `lib/leads-platform/store.js` (and optionally contracts later — Wave 0 minimum is store) |
| Index lock | `lib/leads-platform/store.js` |
| Form Forge boot | `lib/forge-process.js`, `lib/forge-proxy.js`, `scripts/start-form-forge.py`, env/Python |
| Deep health closeout | `scripts/verify-live.ps1` (already supports `-Deep`), operator notes in plan only unless script tweak needed |
| Water tests | `tests/bridge-engine.test.js`, `tests/bridge-distress-tagger.test.js`, `tests/bridge-accuracy-gold.test.js`, engine/tagger only if red |

## Out of scope (later waves)

- Government lists 7.5 MB catalog, shell `@import` concat, minify, WebP, video policy  
- Trust Funds route alias, OC script order, pipeline CSS  
- Server HTML 302 auth gate, MapLibre bundling  
- Full July 13 phase matrix

---

### Task 1: Shell API exclusion in analyzer rewrite

**Files:**
- Modify: `lib/rewrite.js` (`rewriteTextBody` fetch / apiFetch / template-literal rewrites)
- Test: `tests/rewrite.test.js` (existing test already defines the contract)

**Interfaces:**
- Consumes: `createRewriter({ prefix, targetHost, targetPort })`
- Produces: When `prefix === '/analyzer'`, root-relative fetches to shell APIs stay unprefixed. Shell API path prefixes (must match analyzer client `SHELL_API_PREFIXES` intent):
  - `/api/leads`
  - `/api/health`
  - `/api/auth`
  - `/api/me` (if used)
- Analyzer-owned APIs still rewrite: e.g. `/api/session-backup` → `/analyzer/api/session-backup`
- Forge rewriter (`prefix === '/forge'`) behavior unchanged for this task (only analyzer needs vault/shell exclusions; do not break forge `/api/forms` prefixing)

**Shell path helper (implement inside rewrite.js or small shared list):**

```js
function isShellApiPath(pathWithOptionalQuery) {
  const pathOnly = String(pathWithOptionalQuery || '').split('?')[0];
  const shells = ['/api/leads', '/api/health', '/api/auth', '/api/me'];
  return shells.some((p) => pathOnly === p || pathOnly.startsWith(p + '/'));
}
```

Apply before prefixing in:
- `fetch("...")` / `fetch('...')` rewrites
- `apiFetch(...)` rewrites  
- template literal `fetch(\`/...)` and `apiFetch(\`/...)` rewrites  
- Do **not** exempt href/src of random assets; only fetch-style API calls (existing test is fetch-focused). If template tests fail for shell paths, extend exemptions consistently.

- [ ] **Step 1: Confirm failing baseline**

Run:

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/rewrite.test.js
```

Expected: fail on `does not rewrite shell Vault/health APIs under /analyzer` (or already green if fixed — then still verify all rewrite tests pass after any touch).

- [ ] **Step 2: Implement shell exclusions in `lib/rewrite.js`**

In each JS fetch rewrite branch, when about to prefix `/${rest}`:

```js
if (prefix === '/analyzer' && isShellApiPath('/' + rest)) return match;
```

For template literals starting `fetch(\`/`, only rewrite when the path after `/` is **not** a shell API. Safest approach: replace template rewrite with a function that peeks the next path segment:

```js
out = out.replace(
  /\bfetch\(`\/(?!\/)/g,
  (match, offset, full) => {
    // Look ahead from match end for path start
    const start = offset + match.length; // after `fetch(`/
    // Actually match is `fetch(\`` + we need different pattern:
  }
);
```

Prefer a clearer pattern:

```js
out = out.replace(
  /\bfetch\(`(\/(?!\/)[^`]*)/g,
  (match, pathPart) => {
    if (alreadyPrefixed(pathPart.split('${')[0]) /* careful */) { ... }
    const pathOnly = pathPart.split('?')[0].split('${')[0];
    if (prefix === '/analyzer' && isShellApiPath(pathOnly)) return match;
    if (alreadyPrefixed(pathOnly)) return match;
    return `fetch(\`${prefix}${pathPart.startsWith('/') ? pathPart : '/' + pathPart}`;
  }
);
```

Keep forge tests green: shell exemption **only** when `prefix === '/analyzer'`.

- [ ] **Step 3: Run rewrite tests — expect PASS**

```powershell
node --test tests/rewrite.test.js
```

Expected: all tests pass (including vault/health/auth unprefixed; session-backup still prefixed).

- [ ] **Step 4: Live sanity (optional if no server change to static)**

No HTML change required. If server already running, no restart strictly required for pure `lib/rewrite.js` until process reload — restart after Task 1 if executing live:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restart.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

- [ ] **Step 5: Commit (only if user asked)**

```text
fix(rewrite): keep shell vault/auth/health APIs unprefixed under /analyzer
```

---

### Task 2: Auth-guard waits for cookie → session before redirect

**Files:**
- Modify: `public/js/auth-guard.js`
- Modify: `public/js/auth-session.js` only if a small API is needed (e.g. export already has `syncSessionFromServerCookie`)
- Test: Create `tests/auth-guard-cookie.test.js` as a **source-contract** test (no browser): assert auth-guard source awaits sync before `redirectToSignIn` when not logged out; or a tiny extracted pure helper if easier.

**Interfaces:**
- Consumes: `window.PhugleeSession.syncSessionFromServerCookie()` → `Promise<data|null>`
- Consumes: `isAuthenticated` / `getSessionUser` / `hasExplicitLogout` via PhugleeSession
- Produces: Protected routes do **not** call `location.replace` login until:
  1. Explicit logout flag is set, OR
  2. Sync completed and user still unauthenticated

**Target behavior (auth-guard.js):**

Replace the eager block:

```js
if (!isLoggedIn()) {
  // logout check...
  redirectToSignIn();
  return;
}
```

With:

```js
if (!isLoggedIn()) {
  try {
    if (sessionStorage.getItem('phuglee_logout') === '1') {
      window.location.replace(signOutUrl);
      return;
    }
  } catch (_) {}

  var api = sessionApi();
  if (api && typeof api.syncSessionFromServerCookie === 'function') {
    // Defer redirect until cookie hydrate finishes
    api.syncSessionFromServerCookie().then(function (data) {
      if (data && data.username) {
        enforceRestrictedPath(data.username);
        return;
      }
      redirectToSignIn();
    });
    return;
  }
  redirectToSignIn();
  return;
}
```

Keep public paths `/` and `/heat` early-return logic. Keep restricted-path enforcement after login known.

Bump cache query on pages that load auth-guard only if they use `?v=` inconsistently — at minimum bump `auth-guard.js?v=` on a representative set or document “hard refresh” in closeout. Prefer bumping `?v=` on all HTML that reference auth-guard (grep `auth-guard.js`).

- [ ] **Step 1: Write failing source-contract test**

Create `tests/auth-guard-cookie.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('auth-guard awaits cookie sync before sign-in redirect when session empty', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/js/auth-guard.js'),
    'utf8'
  );
  assert.match(src, /syncSessionFromServerCookie/);
  // Must not only redirect immediately in the !isLoggedIn branch without sync
  assert.match(
    src,
    /syncSessionFromServerCookie\s*\(\s*\)\s*\.then/,
    'must chain .then on cookie sync before redirect'
  );
  // Explicit logout still hard-redirects
  assert.match(src, /phuglee_logout/);
});
```

- [ ] **Step 2: Run test — expect FAIL** (if current code still redirects before sync)

```powershell
node --test tests/auth-guard-cookie.test.js
```

- [ ] **Step 3: Implement auth-guard change**

Edit `public/js/auth-guard.js` as above. Do not remove role gates for brad/matt.

- [ ] **Step 4: Run test — expect PASS**

```powershell
node --test tests/auth-guard-cookie.test.js
```

- [ ] **Step 5: Manual check list (document in closeout notes)**

With auth enabled and a valid session cookie:
1. Open `/filter` while logged in → works  
2. Open a **new tab** to `/vault` or `/under-contract` → should **not** flash to login if cookie valid  
3. After Sign out → protected page must still redirect to login  

- [ ] **Step 6: verify-live.ps1** after static change

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

### Task 3: Shared Windows-safe `writeJsonAtomic` + leads store adoption + tmp cleanup

**Files:**
- Create: `lib/write-json-atomic.js`
- Modify: `lib/leads-platform/store.js` — replace local `writeJsonAtomic` with shared module
- Create: `tests/write-json-atomic.test.js`
- Optional helper: cleanup temps on catalog warm/boot in `store.js` `warmIndex` / server boot path that already warms index

**Interfaces:**

```js
// lib/write-json-atomic.js
/**
 * @param {string} filePath
 * @param {string|object} data - object is JSON.stringify(..., null, 2)
 * @param {{ pretty?: boolean }} [opts]
 */
function writeJsonAtomic(filePath, data, opts) { ... }
module.exports = { writeJsonAtomic };
```

Behavior (mirror `lib/leads-platform/contracts.js` 239–256):
1. `mkdirSync` parent  
2. Write `${filePath}.${pid}.${Date.now()}.tmp`  
3. `renameSync(tmp, filePath)`  
4. On failure: unlink destination if exists, rename again; else copyFile + unlink tmp  
5. On total failure: try unlink tmp; rethrow  
6. Never leave successful write with tmp still present

**Tmp cleanup (safe):**

```js
function cleanupStaleTemps(rootDir) {
  // only *.tmp files matching *.json.<pid>.<ts>.tmp or *.tmp under leads/
  // do NOT delete index.json or *.json leads
}
```

Call once from `readIndex` warm or `server.js` after `warmIndex` if such exists — max once per process boot.

- [ ] **Step 1: Failing test for Windows overwrite path**

```js
// tests/write-json-atomic.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomic } = require('../lib/write-json-atomic');

test('writeJsonAtomic overwrites existing file and leaves no tmp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wja-'));
  const file = path.join(dir, 'index.json');
  fs.writeFileSync(file, '{"a":1}', 'utf8');
  writeJsonAtomic(file, { a: 2, b: 3 });
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.a, 2);
  assert.equal(parsed.b, 3);
  const leftover = fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'));
  assert.equal(leftover.length, 0);
});
```

- [ ] **Step 2: Implement `lib/write-json-atomic.js` — tests pass**

- [ ] **Step 3: Wire `store.js` to shared helper; remove private broken rename-only function**

- [ ] **Step 4: Boot-time cleanup of `data/leads-catalog/**/*.tmp` only** (and under `leads/`) — log count cleaned. Do not delete non-tmp files.

- [ ] **Step 5: Run**

```powershell
node --test tests/write-json-atomic.test.js
```

Expected: PASS

---

### Task 4: Serialize leads catalog index mutations

**Files:**
- Modify: `lib/leads-platform/store.js` — `upsertLead`, `upsertLeadsBatch`, `writeIndex`, any delete that rewrites index
- Test: `tests/leads-index-serialize.test.js` (or extend existing leads store tests)

**Interfaces:**
- In-process mutex/queue so two concurrent `upsertLead` calls cannot interleave readIndex → writeIndex  
- Pattern:

```js
let indexChain = Promise.resolve();

function withIndexLock(fn) {
  const run = indexChain.then(() => fn());
  indexChain = run.catch(() => {});
  return run;
}
```

If current API is sync (`upsertLead` returns lead immediately), either:
- Keep sync API but use a **sync** mutex flag + queue of pending ops drained on same tick (harder), OR  
- Make internal write path exclusive with a simple busy loop / lock flag for sync code:

```js
let indexLocked = false;
const waiters = [];

function withIndexLockSync(fn) {
  // For Node single-threaded sync code, a reentrancy guard is enough IF no await
  // between read and write. Problem is async callers interleaving via await.
  // Prefer: convert upsertLead path to async only if already async at API layer.
}
```

**Practical Wave 0 approach (match codebase style):**  
If `upsertLead` is fully synchronous today, concurrent HTTP handlers still interleave at `await` points **outside** the sync function. Race is: Handler A reads index, Handler B reads index, A writes, B writes (clobber). Fix:

```js
function upsertLead(raw) {
  return withIndexLockSync(() => {
    // entire readIndex + mutate + writeIndex inside lock
  });
}
```

With:

```js
let depth = 0;
function withIndexLockSync(fn) {
  if (depth > 0) {
    // Nested: allow reentry on same stack only
  }
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
  }
}
```

**That does NOT fix two concurrent async handlers** both calling sync upsertLead at different times — in Node, two requests only interleave at await. If both call sync upsertLead without await between read and write inside upsertLead, **single-threaded sync section is already atomic**.

Re-check real race: `scheduleBackgroundSync` → `setImmediate` → many upserts; overlapping with request handlers. Sync upsertLead body is atomic per call; lost update is:

```
A: readIndex (list L)
B: readIndex (list L)
A: writeIndex (L + a)
B: writeIndex (L + b)  // drops a
```

Yes — two separate sync calls can still lose updates if both read before either writes. **Need a write queue** even for sync:

```js
// Serialize by forcing writers to apply against latest after previous writer finishes.
// Simplest correct sync approach: always re-read index immediately before write inside a module-level lock that forbids nested read-modify-write overlap — but JS is single-threaded so the bug is only:

// Request A: await something between read and write
// OR two upsertLead calls where each does read, then write — without await between, they can't interleave mid-function.

// So lost update requires:
// upsertLead() { const i = readIndex(); ...; writeIndex(i); }
// call1 and call2 cannot interleave mid-function in JS unless call1 awaits.

// Therefore race is only if readIndex/writeIndex are split across await in callers, or upsertLeadsBatch / background does async between.

// serializeBackground + ensure all index RMW happens inside one function without await.
```

**Wave 0 mandatory fix:** Audit `upsertLead` / `upsertLeadsBatch` / `writeIndex` for any await between read and write; ensure entire RMW is synchronous; add a **process-wide chain** for `scheduleBackgroundSync` vs request handlers if background uses async loops:

```js
async function upsertLeadSerialized(raw) {
  return enqueue(() => upsertLeadSync(raw));
}
```

Implement `enqueue` as promise chain. Export sync version only for tests if needed. Prefer changing public `upsertLead` to remain sync **and** document that all index mutation goes through `mutateIndex(fn)`:

```js
function mutateIndex(mutator) {
  const index = readIndex(); // array or object as store uses
  const next = mutator(index);
  writeIndex(next);
  return next;
}
```

Every upsert uses mutator so no double-read outside.

- [ ] **Step 1: Read full `upsertLead` / `upsertLeadsBatch` / `writeIndex` in store.js** and list all call sites that touch index  
- [ ] **Step 2: Write a unit test** that simulates two logical updates without losing either (call upsertLead twice with different leadIds; both must appear in index)  
- [ ] **Step 3: Refactor to single `mutateIndex` path**  
- [ ] **Step 4: Tests pass**

```powershell
node --test tests/write-json-atomic.test.js tests/leads-index-serialize.test.js
```

(If no separate serialize test file, include concurrency simulation in store tests.)

---

### Task 5: Restore Form Forge (ops) + prove deep health

**Files:**
- Diagnose/modify only as needed: `lib/forge-process.js`, `lib/forge-proxy.js`, `scripts/start-form-forge.py`, Python env, port `FORGE_PORT` (default 8787)
- Do **not** delete forge data

**Interfaces:**
- Health: shell `GET /api/health` body `modules.formForge`  
- Deep: `GET /api/health/deep` → 200 only if forge **and** analyzer up  
- Proxy: `/forge/api/health` (may be 401 through shell auth — prefer deep health or forge-proxy check)

- [ ] **Step 1: Capture current state**

```powershell
cd C:\Users\brand\Projects\distress-os
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# note modules JSON
Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing | Select-Object -ExpandProperty Content
try { Invoke-WebRequest http://127.0.0.1:3000/api/health/deep -UseBasicParsing } catch { $_.Exception.Response.StatusCode }
```

- [ ] **Step 2: Diagnose Forge down**

Check in order:
1. Python available: `python --version` / `py -3 --version`  
2. `modules/form-forge/run_review_portal.py` or `scripts/start-form-forge.py` exists  
3. Port 8787 free / conflict  
4. Server logs after `scripts\restart.ps1` for `[Form Forge]` lines  
5. `ensureForgeRunning` path in forge-proxy on first `/forge` request  

- [ ] **Step 3: Fix root cause** (only what is broken — missing dep, wrong PYTHON path, crash on import, etc.). Prefer env/`forge-process` fix over rewriting Collect.  

- [ ] **Step 4: Restart and deep verify**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restart.ps1
Start-Sleep -Seconds 5
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1 -Deep
```

Expected: exit 0, deep=200, `formForge: up`, `propertyAnalyzer: up`.

- [ ] **Step 5: If Forge cannot be fixed in this environment** (no Python on machine), document **blocker** in closeout with exact error; do not fake health. Wave 0 remains **open** until deep is green on the operator machine **or** user accepts documented environment limitation in writing.

---

### Task 6: Operator-visible module honesty (minimal)

**Files:**
- Modify: `public/js/distress-status.js` **only if** it already shows forge/analyzer pills and hides failures  
- Or: ensure `GET /api/health` JSON remains accurate for `modules.*` (already does) and document that Railway stays on shallow 200 by design  
- Optional: add `modulesReady: boolean` field to shallow health **without** changing status code (keeps Railway happy)

**Interfaces:**

```json
{
  "ok": true,
  "modulesReady": false,
  "modules": { "formForge": "down", "propertyAnalyzer": "up" }
}
```

- [ ] **Step 1: Add test** if health payload shape is tested; else manual assert after change  
- [ ] **Step 2: Implement `modulesReady` on shallow health** in `server.js`  
- [ ] **Step 3: If distress-status UI exists, show warning when `modulesReady === false`** (no spam — one subtle banner)  
- [ ] **Step 4: verify-live still passes shallow (exit 0) when modules down; -Deep fails**

---

### Task 7: Re-enable water shut-off Filter safety tests

**Files:**
- Modify: `tests/bridge-engine.test.js` — remove `.skip` from water tests (~750, ~813, ~1667 if present)  
- Modify: `tests/bridge-distress-tagger.test.js` — remove `.skip` from water tests  
- Modify: `tests/bridge-accuracy-gold.test.js` — remove `.skip` from ACC-01 water  
- Modify product code **only if tests fail**: `lib/bridge-engine/**`, `lib/bridge-distress-tagger.js`, brain apply path

**Product rules to preserve:**
- `uploadType: 'water_shut_off'` never empties kept rows via type-suppress  
- Water rows get high-value distress tag  
- `filterDistressOnly` keeps water rows  
- Gold ACC-01: water-hostile fixture ignores active type suppress  

- [ ] **Step 1: Unskip the six tests** (change `test.skip` → `test`)  

- [ ] **Step 2: Run**

```powershell
node --test tests/bridge-engine.test.js tests/bridge-distress-tagger.test.js tests/bridge-accuracy-gold.test.js
```

- [ ] **Step 3: If red, fix product (not tests) until green** — re-read brain BRAIN-03 / water path in engine  

- [ ] **Step 4: Confirm no remaining water-related skips**

```powershell
Select-String -Path tests\*.js -Pattern "test\.skip\('.*water"
```

Expected: no matches (or only unrelated skips).

---

### Task 8: Wave 0 verification gate (closeout)

**Do not mark Wave 0 complete until all of the following pass in one session.**

- [ ] **Step 1: Unit / contract suite for Wave 0**

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/rewrite.test.js tests/auth-guard-cookie.test.js tests/write-json-atomic.test.js
# plus leads index test if created
node --test tests/bridge-engine.test.js tests/bridge-distress-tagger.test.js tests/bridge-accuracy-gold.test.js
```

Expected: 0 failures. Water tests not skipped.

- [ ] **Step 2: Live shallow + deep**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1 -Deep
```

Expected: both exit 0; deep body `formForge: up`, `propertyAnalyzer: up`.

- [ ] **Step 3: Smoke URLs**

```powershell
$pages = @('/','/filter','/collect','/vault','/under-contract','/command')
foreach ($p in $pages) {
  $r = Invoke-WebRequest "http://127.0.0.1:3000$p" -UseBasicParsing -TimeoutSec 15
  "$p $($r.StatusCode)"
}
```

Expected: all 200.

- [ ] **Step 4: Write closeout note** in this plan file under **Wave 0 Closeout** (date, commit SHAs if any, test commands + pass, deep health JSON, residual risks).

- [ ] **Step 5: User confirmation** — present closeout; only then start **Wave 1 plan** writing.

---

## Wave 0 Closeout

- Date: 2026-07-23  
- Deep health: **200** — `formForge: up`, `propertyAnalyzer: up`, shallow `modulesReady: true`  
- Tests run (all pass, 0 fail):
  - `node --test tests/rewrite.test.js tests/auth-guard-cookie.test.js tests/write-json-atomic.test.js` → 16/16  
  - `node --test tests/bridge-distress-tagger.test.js tests/bridge-accuracy-gold.test.js tests/bridge-engine.test.js` → 83/83  
  - water `test.skip` remaining: **0**  
  - `scripts\verify-live.ps1` → exit 0  
  - `scripts\verify-live.ps1 -Deep` → exit 0  
  - Smoke pages 200: `/`, `/filter`, `/collect`, `/vault`, `/under-contract`, `/command`, `/buyers`, `/government-lists`  
- Shipped:
  1. Analyzer rewrite leaves shell `/api/leads|health|auth|me` unprefixed  
  2. Auth-guard awaits cookie hydrate before login bounce (`auth-guard.js?v=5-wave0`)  
  3. Shared Windows-safe `lib/write-json-atomic.js` + catalog tmp cleanup on warm  
  4. `mutateIndex` for leads catalog RMW  
  5. Form Forge boot: fixed root `.env` non-UTF-8 (0x97) + `load_dotenv=False` in start-form-forge.py  
  6. Shallow health `modulesReady` + distress-status clearInterval on remount  
  7. Restored `water_shut_off` engine upload type (UI remains retired); unskipped water tests; test `allowEmptyWipe` cleanup  
- Residual risks / blockers:  
  - Root `.env` must stay UTF-8 (Flask no longer loads it; Node still does)  
  - Water type is engine/API-capable but not re-added to Filter desk UI (intentional product choice)  
- Ready for Wave 1 plan: **yes** (pending your close confirmation)  


---

## Self-review (plan author)

| Wave 0 audit item | Task |
|-------------------|------|
| C1 Form Forge down | Task 5 |
| C2 Rewrite vault | Task 1 |
| C3 Atomic writes / temps | Task 3 |
| C4 Index RMW races | Task 4 |
| C5 Auth cookie bounce | Task 2 |
| H2 Health honesty | Task 6 |
| H5 Water skips | Task 7 |
| Proof bar | Task 8 |

No Wave 1 performance items included. No placeholders left for core code paths.
