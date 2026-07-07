# Coding Conventions

**Analysis Date:** 2026-07-04

## Naming Patterns

**Files:**
- Use **kebab-case** for shared logic modules: `lib/tier-engine.js`, `lib/export-schema.js`, `lib/backup-logic.js`
- Use **short camelCase** for frontend UI modules: `public/js/app.js`, `public/js/review.js`, `public/js/session.js`
- Use **kebab-case** for route modules: `routes/session.js`, `routes/maps.js`, `routes/gemini.js`
- Use **kebab-case** for test files mirroring the module under test: `tests/tier-engine.test.js`, `tests/export-schema.test.js`
- Use **kebab-case** for one-off scripts: `scripts/run-golden-set.js`, `scripts/migrate-imagery.js`
- Root entry points stay flat: `server.js`, `imagery-cache.js`, `persistence.js`

**Functions:**
- Use **camelCase** for all functions: `computeLeadTier`, `buildDialReadyRow`, `mergeSessionSave`, `sendJson`
- Prefix factory creators with `create`: `createBackups`, `createSafety`, `createRouter`, `createReviewTrainingBuffer`
- Prefix normalization helpers with `normalize`: `normalizeLeadTier`, `normalizeCategory`, `normalizeIndicators`
- Prefix inference helpers with `infer` or `compute`: `inferCategory`, `computeTierCounts`, `computeNeedsReview`
- Prefix boolean predicates with `is`, `has`, or `should`: `isManuallyEditedResult`, `hasNeglectCombo`, `shouldReplaceSessionResult`

**Variables:**
- Use **camelCase** for locals and parameters: `cachedAt`, `incomingCount`, `reviewedKeysByFilter`
- Use **UPPER_SNAKE_CASE** for module-level constants and frozen sets: `DIAL_READY_COLUMNS`, `HIGH_INDICATORS`, `REVIEW_THRESHOLD`, `MILESTONE_SAVE_REASONS`
- Use **snake_case string literals** for domain enums stored in data: `'well_maintained'`, `'vacant_lot'`, `'code_violation'`, `'boarded_windows'`
- Use **camelCase** for record/object field names: `firstName`, `leadTier`, `manualScore`, `satelliteClassification`, `reviewedKeysByFilter`

**Types:**
- Not applicable — project is plain JavaScript with no TypeScript or runtime schema validation
- Document expected shapes via inline object literals in tests and JSON fixtures under `tests/fixtures/`

## Code Style

**Formatting:**
- No Prettier, ESLint, Biome, or `.editorconfig` detected
- Use **2-space indentation** consistently (observed in `lib/`, `routes/`, `tests/`, `public/js/`)
- Use **single quotes** for strings in server and test code
- Use **semicolons** at statement ends in CommonJS modules
- Keep lines reasonably short; break long argument lists across lines when needed (see `lib/export-schema.js`, `tests/export-schema.test.js`)

**Linting:**
- Not detected — no automated style enforcement
- Rely on `npm test` and manual review for correctness

## Import Organization

**Order:**
1. Node built-ins (`fs`, `path`, `crypto`, `http`)
2. Root-level project modules (`./imagery-cache`, `./persistence.js`)
3. `lib/` modules (`./lib/config`, `../lib/tier-engine`)
4. `routes/` modules (in `server.js` only)
5. JSON fixtures (in tests only): `require('./fixtures/tier-cases.json')`

**Path Aliases:**
- Not used — always use relative paths: `require('../lib/export-schema')`, `require('./backup-logic')`
- Frontend loads shared `lib/` files via absolute script URLs in `public/index.html` (e.g. `/lib/tier-engine.js`), served by `routes/static.js`

**Module patterns — use the right one for the target runtime:**

1. **Dual-target UMD factory** (shared browser + Node) — use for classification, export, and parsing logic:

```javascript
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(/* optional deps */);
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.tierEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function tierEngineFactory() {
  // ...
  return { computeLeadTier, normalizeLeadTier };
});
```

Examples: `lib/tier-engine.js`, `lib/export-schema.js`, `lib/gemini-json.js`, `lib/imagery-routing.js`, `lib/virtual-scroll.js`, `lib/classification-confidence.js`

2. **Plain CommonJS export** — use for server-only modules:

```javascript
module.exports = { sendJson, readBody, corsPreflight };
```

Examples: `lib/http.js`, `lib/backup-logic.js`, `lib/result-classify.js`, `lib/config.js`, `lib/save-result.js`

3. **Factory with dependency injection** — use for modules that touch filesystem, config, or cross-cutting services:

```javascript
module.exports = function createBackups(deps) {
  const { config, fs, path, crypto, getSafety } = deps;
  // ...
  return { buildSessionSummary, readLatestSessionFile, /* ... */ };
};
```

Examples: `lib/backups.js`, `lib/safety.js`

4. **Frontend PDA.env module** — use for browser UI code in `public/js/`:

```javascript
// config.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    R.BATCH_SIZE = 50;
    R.sessionSaveEveryN = function sessionSaveEveryN() { /* uses shared state */ };
  }
})(typeof globalThis !== 'undefined' ? globalThis : globalThis);
```

Examples: `public/js/config.js`, `public/js/state.js`, `public/js/scan.js`, `public/js/review.js`

Frontend consumers access shared lib via `PDA.lib`:

```javascript
const te = PDA.lib.tierEngine;
const gj = PDA.lib.geminiJson;
```

See `public/js/app.js` for the canonical import pattern.

## Error Handling

**Patterns:**
- **HTTP responses:** Return JSON with `ok` boolean and `error` string via `sendJson` in `lib/http.js`. Unauthorized requests return `{ ok: false, error: 'Unauthorized' }` from `server.js` `requireAuth`.
- **Route handlers:** Catch parse/read failures and respond with 4xx/5xx + message. Example in `routes/session.js`: corrupt backup → `{ ok: false, error: 'Backup file is corrupt: ...' }`.
- **Recoverable I/O:** Log with `console.warn('[Tag] message:', err.message)` and continue or return a safe default. Examples: `lib/config.js` `.env` read failure, `lib/backups.js` scan result write failure.
- **Silent optional cleanup:** Use empty catch `catch (_) {}` when failure is acceptable (unlink temp files, parse optional metadata). See `lib/fs-atomic.js`, `lib/golden-replay.js`.
- **Pure function validation:** Throw `Error` with descriptive message; test with `assert.throws`. Example: `lib/gemini-json.js` `parseLooseJson` throws `/invalid JSON/i` on garbage input.
- **Client-side fetch:** Check `data.ok` on API responses; surface short user-facing error strings. See `public/js/state.js` `geminiRequest`.
- **Result objects over exceptions** for expected failure paths in client helpers: `{ ok: false, error: '...' }` rather than throwing.

## Logging

**Framework:** `console` only — no structured logging library

**Patterns:**
- Prefix logs with bracketed subsystem tags: `[Session]`, `[Safety]`, `[Auth]`, `[Env]`, `[Scan result log]`, `[Offsite]`
- Use `console.log` for successful lifecycle events (promotions, summary served, offsite copy)
- Use `console.warn` for recoverable failures (backup failed, env read failed, promote failed)
- Use `console.error` sparingly in tests when dumping regression reports (see `tests/golden-set.test.js`)
- Do not log secrets — auth token is injected into HTML via `routes/static.js`, keys loaded from files referenced in `lib/config.js` (`MAPS_KEY_FILE`, `.env` via `loadEnvFile`)

## Comments

**When to Comment:**
- Add a **file header** on frontend modules: `// state.js — PDA module (shared PDA.env runtime)`
- Add **block comments** (`/** ... */`) for non-obvious business rules, merge semantics, or API contracts. Examples: `lib/backup-logic.js` (manual override precedence), `lib/tier-counts.js` (all-count semantics), `lib/export-profiles.js` (profile distinction)
- Add **inline comments** only where logic is genuinely tricky (JSON repair loops, tier migration suffix stripping)
- Do not comment obvious code — most functions are self-describing via naming

**JSDoc/TSDoc:**
- Minimal usage — occasional `/**` one-liners, not full `@param` blocks
- Exception: `tailwind.config.js` uses `/** @type {import('tailwindcss').Config} */`
- Reference external docs in comments when relevant (e.g. StateFace license URL in `public/js/config.js`)

## Function Design

**Size:**
- Prefer **small pure functions** in `lib/` (normalize, count, format helpers)
- Allow **larger orchestration functions** in `lib/backups.js`, `public/js/scan.js`, `public/js/session.js` where I/O and state intertwine
- Extract repeated tier/classification logic into `lib/tier-engine.js` and `lib/result-classify.js` rather than duplicating in client and server

**Parameters:**
- Pass **explicit context objects** for tier computation: `computeLeadTier(score, category, ctx)` where `ctx` holds `indicators`, `satelliteClassification`, `reason`
- Pass **dependency bags** to row builders and integration points: `buildDialReadyRow(record, deps)` with injectable `resolveImageryForResult`, `getCachedImageryUrls`, `origin` (see `lib/export-schema.js`, `tests/export-schema.test.js` `BASE_DEPS`)
- Use **default parameters** for optional config: `absoluteUrl(url, origin = '')`, `buildSessionSummary(session, { lite: false })`
- Use **destructuring** at factory boundaries: `const { config, fs, path, crypto, getSafety } = deps`

**Return Values:**
- Pure helpers return **primitives, arrays, or plain objects** — no classes
- HTTP layer returns via `sendJson(res, status, obj)` — always include `ok` field for API consumers
- Normalization functions return **canonical enum strings** or empty string for unknown (`exportLeadCategoryLabel` returns `''`)
- Boolean predicates return strict booleans; never truthy/falsy shortcuts for tier decisions

## Module Design

**Exports:**
- Export **named functions** via `module.exports = { fn1, fn2 }` or return object from factory
- Export **constants** alongside functions when tests need them: `DIAL_READY_COLUMNS`, `HARD_NEVER_LEARN_INDICATORS`, `FULL_EXPORT_COLUMNS`
- Dual-target modules return a single object from the factory closure — do not export individual bindings in browser mode
- Keep `lib/backup-logic.js` as the **pure merge/replace policy** layer; keep filesystem side effects in `lib/backups.js`

**Barrel Files:**
- Not used — no `index.js` re-export barrels
- `server.js` wires modules explicitly; `public/index.html` lists each `<script>` in dependency order (lib before `public/js/config.js`, `app.js` last)

**Route registration:**
- Each route file exports `register(ctx)` that attaches handlers to `lib/router.js`
- Context object carries shared deps: `{ router, sendJson, readBody, backups, safety, config, fs, path }`
- Handlers return `true` when handled, `false` to fall through

**Shared logic placement:**
- Put **tier/classification rules** in `lib/tier-engine.js` — single source of truth for server tests and browser (via UMD)
- Put **session merge policy** in `lib/backup-logic.js`
- Put **HTTP transport** in `lib/http.js`
- Put **path constants** in `lib/config.js`
- Put **UI-only behavior** in `public/js/`; do not duplicate tier rules there — consume `PDA.lib.tierEngine`

---

*Convention analysis: 2026-07-04*