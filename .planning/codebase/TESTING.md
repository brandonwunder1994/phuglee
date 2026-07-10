# Testing Patterns

**Analysis Date:** 2026-07-09

## Test Framework

**Runner:**
- Node.js built-in test runner (`node:test`)
- Config: none — discovery via npm script glob only
- Node version: whatever runs `package.json` scripts (no engines field; use modern Node with `node:test`)

**Assertion Library:**
- `node:assert/strict` — always use strict mode:
  ```js
  const assert = require('node:assert/strict');
  ```

**Run Commands:**
```bash
npm test                              # All root tests: node --test tests/**/*.test.js
node --test tests/bridge-list-store.test.js   # Single file
node --test tests/bridge-*.test.js            # Bridge suite only (shell glob)
node --test --test-name-pattern="dedupe" tests/bridge-dedup.test.js  # Name filter
```

**Related (not root `npm test`):**
- Property Analyzer has its own tests under `modules/property-analyzer/tests/` (separate package)
- Form Forge Python tests under `modules/form-forge/tests/`
- Live server health is **not** unit tests — use `scripts/verify-live.ps1` / `npm run verify`

## Test File Organization

**Location:**
- Co-located suite directory: `tests/*.test.js` (not next to `lib/` files)
- Fixtures: `tests/fixtures/bridge/`

**Naming:**
- `{module-or-feature}.test.js`
- Bridge domain prefix for bridge coverage: `bridge-list-store.test.js`, `bridge-import-filter.test.js`, `bridge-api-handlers.test.js`

**Structure:**
```
tests/
├── fixtures/
│   └── bridge/
│       ├── code-violations-varied.csv
│       ├── water-shutoffs.txt
│       └── violation-list-plain.txt
├── bridge-list-store.test.js      # Filter list CRUD + atomic persistence
├── bridge-import-filter.test.js   # Analyzer cross-ref filter
├── bridge-engine.test.js          # End-to-end processUpload pipeline
├── bridge-api-handlers.test.js    # HTTP handlers + mock Forge
├── bridge-dedup.test.js
├── bridge-distress-tagger.test.js
├── bridge-edge-cases.test.js
├── bridge-export.test.js
├── bridge-intake-schema.test.js
├── bridge-schema.test.js
├── bridge-row-extract.test.js
├── bridge-analyzer-push.test.js
├── bridge-stress.test.js
├── bridge-api.test.js
├── analyzer-import-index.test.js
├── auth-session.test.js           # VM sandbox of public JS
├── a11y-seo.test.js               # Static HTML assertions
├── shell-nav.test.js
├── static-cache.test.js
└── ...
```

**Manual plan mapping:**
- `docs/bridge/TEST-PLAN.md` maps case IDs (A-01…L-xx) to automated files — update that table when adding bridge coverage

## Test Structure

**Suite Organization:**
```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Optional helpers / fixtures
function row(address, city = 'Marana', state = 'Arizona', zip = '85704') {
  return { streetAddress: address, city, state, zip, violationIssueType: 'Overgrown weeds' };
}

test('filterAlreadyImported removes exact analyzer matches', () => {
  const imported = new Set([/* keys */]);
  const result = filterAlreadyImported([row('123 Main St')], imported);
  assert.equal(result.rows.length, 0);
  assert.equal(result.removedCount, 1);
});
```

**Patterns:**
- **Setup:** `before()` for temp dirs, mock servers, module cache clears
- **Teardown:** `after()` restore config globals, `fs.rmSync(temp, { recursive: true, force: true })`, close HTTP mocks
- **Assertion style:** `assert.equal`, `assert.ok`, `assert.match`, `assert.throws`, `assert.deepEqual`
- **Async tests:** `async () => { ... }` with `await processUpload(...)` or mock server listen promises
- **Test names:** sentence describing behavior — `'lists are scoped per user'`, `'saveList creates a list and appears in summaries'`

## Isolation Patterns (required for disk / config)

### Temp FILTER_LISTS_ROOT (filter list store)

Copy this when tests touch `lib/bridge-list-store.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalRoot = config.FILTER_LISTS_ROOT;
let tempRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-lists-'));
  config.FILTER_LISTS_ROOT = tempRoot;
});

after(() => {
  config.FILTER_LISTS_ROOT = originalRoot;
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
});

// require store AFTER config mutation is fine if store reads config at call time
const { saveList, listSummaries } = require('../lib/bridge-list-store');
```

**Why:** production path is `data/filter-lists` (or volume-backed). Tests must never write there.

### Stub analyzer import index

Before requiring engine (or after cache delete), replace loader:

```js
const indexModule = require('../lib/analyzer-import-index');
indexModule.loadImportAddressIndex = async () => ({
  loadedAt: Date.now(),
  addresses: new Set(),
  count: 0,
  sources: null
});
const { processUpload } = require('../lib/bridge-engine');
```

### Clear require cache when env/config changes

Handler tests that set `FORM_FORGE_PORT` and rewrite `FILTER_LISTS_ROOT` delete cache for dependent modules:

```js
for (const mod of [
  '../lib/config',
  '../lib/bridge-engine',
  '../lib/bridge-list-store',
  '../lib/bridge-api'
]) {
  delete require.cache[require.resolve(mod)];
}
```

Then re-require `bridge-api` so it picks up new config/ports.

## Mocking

**Framework:** manual stubs — no Sinon/Jest. Mutate exported functions or spin lightweight `http.createServer`.

**Patterns:**

```js
// 1) Function stub on required module
indexModule.loadImportAddressIndex = emptyImportIndex;

// 2) In-memory HTTP mock Forge
mockForge = http.createServer((req, res) => {
  if (url.pathname === '/api/portal/cities/summary') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(MOCK_CITIES));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => mockForge.listen(0, '127.0.0.1', resolve));
process.env.FORM_FORGE_PORT = String(mockForge.address().port);

// 3) Fake IncomingMessage / ServerResponse for handler unit tests
function createMockReq({ method, url, headers, body }) { /* Readable stream */ }
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers || {}; },
    end(data) { this.body = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || ''); }
  };
}
```

**What to Mock:**
- Form Forge HTTP (cities summary, attach, history)
- Analyzer import index / session reads
- `config.FILTER_LISTS_ROOT` (temp dir)
- OCR / heavy parsers when testing status mapping only

**What NOT to Mock:**
- Pure functions under test (`dedupeRows`, `filterAlreadyImported`, `normalizeAddress`, schema builders)
- Real CSV/TXT fixtures for parser/engine tests
- `xlsx` when asserting spreadsheet parse (in-memory workbook is fine)

## Fixtures and Factories

**Test Data:**
```js
// Row factory (preferred over large inline objects)
function row(address, issue = 'Trash', date = '2026-01-01') {
  return {
    streetAddress: address,
    violationIssueType: issue,
    violationDate: date
  };
}

// City profile constant used across engine tests
const CITY = { id: 'arizona-marana', city: 'Marana', state: 'Arizona' };

// File fixture
const FIXTURES = path.join(__dirname, 'fixtures', 'bridge');
const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
```

**Location:**
- Shared binary/text: `tests/fixtures/bridge/`
- Generated XLSX: build in-test with `XLSX.utils.json_to_sheet` + `book_new` (see `bridge-engine.test.js`)
- Multipart bodies: hand-built buffers with boundary strings (`buildMultipart` in handlers test)

**Frontend session fixtures:**
- Load `public/js/auth-session.js` into `vm.runInNewContext` with fake `sessionStorage` (`auth-session.test.js`)

## Coverage

**Requirements:** None enforced (no nyc/c8 config in root)

**View Coverage (optional ad-hoc):**
```bash
node --test --experimental-test-coverage tests/**/*.test.js
```

**Bridge critical paths that must stay covered when changing filter brain:**
| Area | File |
|------|------|
| List CRUD + user scope | `tests/bridge-list-store.test.js` |
| Already-imported filter | `tests/bridge-import-filter.test.js` |
| Pipeline processUpload | `tests/bridge-engine.test.js` |
| Near-dupe / St vs Street | `tests/bridge-dedup.test.js` |
| Distress tags | `tests/bridge-distress-tagger.test.js` |
| API errors + list HTTP | `tests/bridge-api-handlers.test.js` |
| Edge messages / multipart | `tests/bridge-edge-cases.test.js` |

## Test Types

**Unit Tests:**
- Pure domain: schema, dedup, tagger, import-filter, static-cache, rewrite
- Fast, no network, no real disk except temp dirs when needed

**Integration-style (still node:test):**
- `processUpload` with real parsers + fixtures
- `bridge-api-handlers` with mock Forge + mock req/res
- List store against real filesystem under temp root (validates atomic write behavior)

**Static / content tests:**
- HTML SEO/a11y markers (`a11y-seo.test.js`)
- Brand/shell string presence (`brand-audit.test.js`, `shell-nav.test.js`)

**E2E Tests:**
- Not part of root `npm test`
- Playwright is a dependency for tooling/scripts, not a default suite
- Live smoke: `scripts/verify-live.ps1` (health + homepage 200)

## Common Patterns

**Async Testing:**
```js
test('processUpload keeps open and closed violations with usable addresses', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const result = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(result.stats.kept, 2);
  assert.equal(result.rows.every((row) => row.city === 'Marana'), true);
});
```

**Error Testing:**
```js
// Thrown Error with message
assert.throws(() => getList(meta.id, { username: 'tester' }), /not found/i);

// Multipart validation
assert.throws(
  () => parseMultipart(Buffer.from('data'), 'multipart/form-data'),
  /boundary/i
);

// HTTP status + machine code from handlers
assert.equal(res.status, 400);
assert.equal(res.json.code, 'MISSING_CITY');
```

**User-scope testing (filter lists):**
```js
test('lists are scoped per user', () => {
  const a = saveList({ name: 'User A', rows: [/*...*/], username: 'alice' });
  const b = saveList({ name: 'User B', rows: [/*...*/], username: 'bob' });
  const aliceLists = listSummaries({ username: 'alice' }).lists.map((l) => l.id);
  assert.ok(aliceLists.includes(a.meta.id));
  assert.ok(!aliceLists.includes(b.meta.id));
});
```

**Import-filter testing (copy for new match rules):**
```js
const { DISCARD_REASONS } = require('../lib/bridge-intake-schema');
const { filterAlreadyImported } = require('../lib/bridge-engine/import-filter');
const { normalizeAddressKey } = require('../lib/analyzer-import-index');

test('filterAlreadyImported removes abbreviation variants', () => {
  const imported = new Set([
    normalizeAddressKey('123 Main Street, Marana, Arizona, 85704')
  ]);
  const result = filterAlreadyImported([row('123 Main St')], imported);
  assert.equal(result.removedCount, 1);
  assert.equal(result.removed[0].reason, DISCARD_REASONS.already_imported);
});
```

**Atomic write / persistence checks:**
- Prefer behavioral tests: save → listSummaries → getList → rename → delete
- After `saveList`, files exist under temp root as `index.json`, `{listId}/meta.json`, `{listId}/rows.json`
- Crash-safety of rename is guaranteed by implementation convention; tests assert durable round-trip, not partial tmp files

## Adding New Tests (checklist)

1. Create `tests/{feature}.test.js` using `node:test` + `node:assert/strict`
2. If touching disk: temp dir + restore `config.*` in `before`/`after`
3. If touching analyzer index: stub `loadImportAddressIndex`
4. If touching Forge HTTP: mock server + env ports + require-cache clear
5. Prefer factories (`row()`, `CITY`) and fixtures under `tests/fixtures/bridge/`
6. Name tests as observable behavior sentences
7. Run `npm test` (or single-file `node --test ...`) before claiming done
8. For bridge cases, mark auto coverage in `docs/bridge/TEST-PLAN.md`

## Known Suite Inventory (root)

| File | Focus |
|------|--------|
| `tests/bridge-list-store.test.js` | save/rename/download/delete/clear, per-user scope, download-all |
| `tests/bridge-import-filter.test.js` | empty index, exact, abbreviation, street-only, keep non-matches |
| `tests/bridge-engine.test.js` | CSV/TXT/XLSX processUpload, tags, column map |
| `tests/bridge-api-handlers.test.js` | states/cities/process/attach/lists HTTP |
| `tests/bridge-api.test.js` | API module unit pieces |
| `tests/bridge-dedup.test.js` | normalize, similarity, near-dupe, issue-type keep |
| `tests/bridge-distress-tagger.test.js` | strong/standard/water tags |
| `tests/bridge-edge-cases.test.js` | messages, multipart, pipe TXT, file accept |
| `tests/bridge-export.test.js` | CSV/XLSX export helpers |
| `tests/bridge-intake-schema.test.js` | row shape / validation |
| `tests/bridge-schema.test.js` | schema mapping |
| `tests/bridge-row-extract.test.js` | plain-text / address-line modes |
| `tests/bridge-analyzer-push.test.js` | analyzer record mapping / push |
| `tests/bridge-stress.test.js` | larger volume / stress cases |
| `tests/analyzer-import-index.test.js` | address key normalization |
| `tests/phuglee-user.test.js` / `user-session-scope.test.js` | user scope headers |
| `tests/auth-session.test.js` | browser session API via vm |
| `tests/a11y-seo.test.js` | page meta / a11y hooks |
| `tests/static-cache.test.js` | Cache-Control by extension |
| `tests/distress-routes.test.js` | route map |
| `tests/rewrite.test.js` | HTML rewrite helpers |
| `tests/seed-session.test.js` | seed session behavior |
| `tests/shell-nav.test.js` | shell navigation chrome |
| `tests/brand-audit.test.js` | brand assets/strings |
| `tests/analyzer-auth.test.js` | analyzer auth gate |

---

*Testing analysis: 2026-07-09*
