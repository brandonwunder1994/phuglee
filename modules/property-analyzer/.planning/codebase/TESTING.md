# Testing Patterns

**Analysis Date:** 2026-07-04

## Test Framework

**Runner:**
- Node.js built-in test runner (`node:test`) — no Jest, Vitest, or Mocha
- Config: none — tests discovered via `package.json` script glob

**Assertion Library:**
- `node:assert/strict` — strict equality, deep equality, regex match, throws

**Run Commands:**
```bash
npm test                    # All tests/**/*.test.js + scripts/test-atomic-write.js
npm run test:golden         # Golden-set regression + scripts/run-golden-set.js report
npm run test:metrics        # Classification metrics/smoke/scale-policy + metrics script
npm run test:backup         # Backup logic tests only
node --test tests/tier-engine.test.js   # Single file
node --test tests/export-schema.test.js tests/save-result.test.js  # Subset
```

## Test File Organization

**Location:**
- **Separate `tests/` directory** — not co-located with source
- Mirror module names: `lib/tier-engine.js` → `tests/tier-engine.test.js`
- One auxiliary smoke script outside describe/it pattern: `scripts/test-atomic-write.js` (included in `npm test`)

**Naming:**
- Pattern: `{module-name}.test.js` in kebab-case
- Fixture files: `tests/fixtures/{purpose}.json` (e.g. `tier-cases.json`, `golden-cases.json`)

**Structure:**
```
tests/
├── *.test.js              # 30 test files
├── fixtures/
│   ├── tier-cases.json           # Data-driven tier engine cases
│   ├── golden-cases.json         # 50+ regression records with baselines
│   ├── tier-count-cases.json     # Parity + count fixtures
│   ├── classification-smoke.json # End-to-end classification scenarios
│   └── tier-correction-metrics.json
scripts/
├── test-atomic-write.js   # Filesystem smoke (not node:test suite)
├── run-golden-set.js      # CLI report companion to golden-set.test.js
└── run-classification-metrics.js
lib/                       # Modules under test (require('../lib/...'))
```

## Test Structure

**Suite Organization:**
```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeLeadTier, normalizeLeadTier } = require('../lib/tier-engine');
const cases = require('./fixtures/tier-cases.json');

describe('computeLeadTier fixtures', () => {
  for (const c of cases) {
    it(c.id, () => {
      assert.equal(computeLeadTier(c.score, c.category, c.ctx || null), c.expected);
    });
  }
});

describe('normalizeLeadTier', () => {
  it('maps hot_lead to distressed', () => assert.equal(normalizeLeadTier('hot_lead'), 'distressed'));
});
```

**Patterns:**
- **Setup:** Inline at top of file — `require` modules, define helper constants (`BASE_DEPS` in `tests/export-schema.test.js`), optional local duplicate of production logic only when testing extracted snippets (see caveat in `tests/review-perf.test.js`)
- **Teardown:** Not used — no `beforeEach`, `afterEach`, `before`, or `after` hooks anywhere in `tests/`
- **Assertions:** Prefer `assert.equal` for scalars, `assert.deepEqual` for objects/arrays, `assert.ok` for existence, `assert.match` for regex string checks, `assert.notEqual` to prove legacy divergence (`tests/tier-parity.test.js`)
- **Suite naming:** Match module or behavior: `'export-schema'`, `'review persistence merge'`, `'golden-set regression'`
- **Test naming:** Descriptive string or fixture `id` field for data-driven cases
- **File-level strict mode:** Use `'use strict';` when testing integration modules that touch real I/O (`tests/session-summary-lite.test.js`)

## Mocking

**Framework:** None — no Sinon, Jest mocks, or spy libraries

**Patterns:**
```javascript
// Dependency injection via inline stub objects (preferred)
const BASE_DEPS = {
  leadTypeLabel: (id) => String(id || ''),
  resultLeadType: (r) => r?.leadType || 'code_violation',
  resultLeadTier: () => 'distressed',
  resultCategory: () => 'property',
  origin: 'http://localhost:3000'
};

const row = buildDialReadyRow(record, {
  ...BASE_DEPS,
  resolveImageryForResult: (r) => r,
  getCachedImageryUrls: () => ({ streetView: null })
});

// Factory with real Node modules injected (integration-style)
const backups = createBackups({
  config,
  fs,
  path,
  crypto,
  getSafety: () => null
});

// Local reimplementation of legacy behavior for contrast testing
function resultLeadTierServerLegacy(r) { /* old logic */ }
assert.notEqual(resultLeadTierServerLegacy(c.record), c.expectedTier);
```

**What to Mock:**
- **Injectable function deps** in builders and exporters: `resolveImageryForResult`, `getCachedImageryUrls`, `leadTypeLabel`, `resultLeadTier`
- **Safety/offsite hooks** via `getSafety: () => null` when testing `createBackups` without background timers
- **Origin/base URL** strings for URL-building tests

**What NOT to Mock:**
- **Core tier/classification logic** under test — call real `computeLeadTier`, `applyLearnedTierRules`, `mergeSessionSave`
- **Node built-ins** in integration tests — use real `fs`, `path`, `crypto` with `createBackups` (temp dirs only in `scripts/test-atomic-write.js`, not in unit tests)
- **JSON fixtures** — load real fixture files with `require('./fixtures/...')` or `loadGoldenCases(FIXTURE)` from `lib/golden-replay.js`

## Fixtures and Factories

**Test Data:**
```javascript
// Static JSON fixtures with id + expected fields
const cases = require('./fixtures/tier-cases.json');
for (const c of cases) {
  it(c.id, () => {
    assert.equal(computeLeadTier(c.score, c.category, c.ctx || null), c.expected);
  });
}

// Inline minimal records for merge/session tests
const existing = {
  results: [
    { email: 'a@test.com', phone: '1', address: '1 Main', leadTier: 'well_maintained', score: 8 }
  ],
  reviewedKeysByFilter: { distressed: ['b|2|2 Oak'], vacant: [] }
};

// Scenario arrays for multi-step classification smoke
const smoke = require('./fixtures/classification-smoke.json');
for (const scenario of smoke.scenarios) {
  it(scenario.id, () => { /* routing + tier + needsReview */ });
}
```

**Location:**
- `tests/fixtures/tier-cases.json` — tier engine parameterized cases (28+ entries)
- `tests/fixtures/golden-cases.json` — full record replay baselines (50+ cases, used by `lib/golden-replay.js`)
- `tests/fixtures/tier-count-cases.json` — `parityRecords` + `countFixture` for tier parity
- `tests/fixtures/classification-smoke.json` — satellite routing + tier scenarios
- `tests/fixtures/tier-correction-metrics.json` — correction events for metrics tests
- No factory builder library — construct plain objects inline in each test

## Coverage

**Requirements:** None enforced — no Istanbul/c8/nyc configuration

**View Coverage:**
```bash
# Not configured — run full suite for confidence
npm test
npm run test:golden    # Classification regression gate
npm run test:metrics   # Metrics + smoke scenarios
```

## Test Types

**Unit Tests:**
- **Scope:** Single module pure functions — tier engine, export schema, gemini JSON parsing, learned rules, virtual scroll, backup merge policy
- **Approach:** Direct `require('../lib/...')`, assert outputs for known inputs
- **Examples:** `tests/tier-engine.test.js`, `tests/gemini-json.test.js`, `tests/learned-rules.test.js`, `tests/virtual-scroll.test.js`, `tests/backup-logic.test.js`

**Integration Tests:**
- **Scope:** Factory modules with real filesystem deps, session summary caching, backup response interpretation
- **Approach:** Instantiate `createBackups({ config, fs, path, crypto, getSafety })` with real Node modules; build session objects in memory (no live server)
- **Examples:** `tests/session-summary-lite.test.js`, `tests/tier-parity.test.js` (buildSessionSummary), `tests/merge-partial-session.test.js`

**Regression / Golden Tests:**
- **Scope:** Full classification pipeline outputs frozen against `golden-cases.json`
- **Approach:** `replayGoldenSet(cases)` from `lib/golden-replay.js`; fail if any `summary.failed > 0`; companion script `scripts/run-golden-set.js` for CLI reports
- **Examples:** `tests/golden-set.test.js`, `npm run test:golden`

**Smoke / Scenario Tests:**
- **Scope:** Multi-module classification flows (imagery routing + tier + needs review)
- **Approach:** Fixture-driven scenarios in `classification-smoke.json`
- **Examples:** `tests/classification-smoke.test.js`, `tests/classification-metrics.test.js`

**Filesystem Smoke:**
- **Scope:** Atomic write correctness
- **Approach:** Standalone script writes to `logs/atomic-write-test/`, validates JSON round-trip, checks for orphan `.tmp` files, `process.exit(0)`
- **Example:** `scripts/test-atomic-write.js`

**E2E Tests:**
- Not used — no Playwright, Puppeteer, or HTTP-level test server startup in `tests/`
- Manual smoke documented in `.planning/phases/20-polish-perf-smoke/` (outside automated test suite)

**Frontend / Browser Tests:**
- Not used — `public/js/*.js` modules are not directly tested; shared logic is tested via UMD `lib/` copies (`lib/tier-engine.js` loaded in browser as `/lib/tier-engine.js`)

## Common Patterns

**Async Testing:**
```javascript
// Async tests are rare — most suites are synchronous
// Route handlers in production are async, but tests target pure lib functions
// When needed, use async it callbacks (pattern available but seldom used):
it('example async', async () => {
  const result = await someAsyncFn();
  assert.equal(result.ok, true);
});
```

**Error Testing:**
```javascript
assert.throws(() => parseLooseJson(''), /invalid JSON/i);

assert.throws(
  () => parseLooseJson('{"score":5,"category":"property","reason":"ok"}', ['confidence']),
  /required/i
);
```

**Data-driven iteration:**
```javascript
for (const c of fixtures.parityRecords) {
  it(`${c.id}: new tier is ${c.expectedTier}`, () => {
    assert.equal(resultLeadTier(c.record), c.expectedTier);
  });
}
```

**Regression failure diagnostics:**
```javascript
const summary = replayGoldenSet(cases);
if (summary.failed) {
  console.error(formatGoldenReport(summary));
}
assert.equal(summary.failed, 0, `golden failures: ${summary.failedIds.join(', ')}`);
```

**Column/order contract tests:**
```javascript
for (const col of DIAL_READY_COLUMNS) {
  assert.ok(col in row, `missing column ${col}`);
}
assert.deepEqual(Object.keys(row), [...DIAL_READY_COLUMNS]);
```

## Where to Add New Tests

| Change location | Test file | Pattern |
|----------------|-----------|---------|
| `lib/tier-engine.js` | `tests/tier-engine.test.js` + `tests/fixtures/tier-cases.json` | Add fixture row with `id`, `score`, `category`, `ctx`, `expected` |
| `lib/export-schema.js` | `tests/export-schema.test.js` | Table-driven row builder cases with `BASE_DEPS` stubs |
| `lib/backup-logic.js` | `tests/backup-logic.test.js`, `tests/review-persistence.test.js`, `tests/merge-partial-session.test.js` | Inline session objects, assert merge outputs |
| `lib/backups.js` | `tests/session-summary-lite.test.js`, `tests/tier-parity.test.js` | `createBackups` factory with real `fs`/`path`/`crypto` |
| `lib/learned-rules.js` | `tests/learned-rules.test.js` | Record + rule objects inline |
| `lib/gemini-json.js` | `tests/gemini-json.test.js` | String inputs, `assert.throws` for invalid |
| New shared `lib/` module | `tests/{module-name}.test.js` | `node:test` + `assert/strict` + `require('../lib/...')` |
| Classification behavior change | `tests/golden-set.test.js` + update `tests/fixtures/golden-cases.json` baselines | Run `npm run test:golden` |
| Export profile changes | `tests/export-profiles.test.js` | Assert column lists and cross-profile invariants |

## Conventions for New Tests

- Start every file with:
  ```javascript
  const { describe, it } = require('node:test');
  const assert = require('node:assert/strict');
  ```
- Use `describe` per function or feature area; avoid one giant flat list
- Prefer **fixture JSON** when cases exceed 3–4 similar assertions
- Use **dependency injection stubs** instead of mock frameworks
- Do **not** copy production logic into tests — import from `lib/` (anti-pattern exists in `tests/review-perf.test.js` where helpers are duplicated; new tests should require the real module or extract helpers to `lib/` first)
- Assert **both positive and rejection paths** for merge/save logic (see `tests/save-result.test.js` 409 reconciliation cases)
- For tier changes, update **both** `tier-cases.json` and golden baselines before merging

## Test Coverage Gaps (informational)

| Area | Files | Notes |
|------|-------|-------|
| Browser UI | `public/js/app.js`, `public/js/review.js`, `public/js/scan.js`, `public/js/session.js` | No automated tests; rely on shared `lib/` coverage |
| HTTP routes | `routes/session.js`, `routes/maps.js`, `routes/gemini.js` | No supertest or live server tests |
| Imagery cache I/O | `imagery-cache.js` | Tested indirectly via `tests/imagery-urls.test.js`, `tests/imagery-routing.test.js` |
| Review perf helpers | `tests/review-perf.test.js` | Logic duplicated inline — not wired to production exports |

---

*Testing analysis: 2026-07-04*