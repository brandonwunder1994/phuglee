# Coding Conventions

**Analysis Date:** 2026-07-09

## Naming Patterns

**Files:**
- Backend modules: kebab-case with domain prefix — `bridge-list-store.js`, `bridge-import-filter` lives at `lib/bridge-engine/import-filter.js`, `analyzer-import-index.js`
- Tests: mirror source name + `.test.js` — `bridge-list-store.test.js` ↔ `lib/bridge-list-store.js`
- Frontend page scripts: short kebab or page name — `public/js/bridge.js`, `public/js/auth-session.js`
- CSS: `phuglee-*.css` for design-system sheets under `public/css/`
- HTML pages: short route names — `bridge.html`, `heat.html`, `command.html`
- Fixtures: descriptive kebab under `tests/fixtures/bridge/` — `code-violations-varied.csv`, `water-shutoffs.txt`

**Functions:**
- camelCase: `saveList`, `writeJsonAtomic`, `filterAlreadyImported`, `normalizeAddress`
- Boolean helpers: `is` / `has` prefix — `isAcceptedFile`, `isValidStatus`, `isNearDuplicate`
- Async I/O handlers: verb + resource — `handleProcess`, `handleStates`, `loadImportAddressIndex`
- Path builders: noun + `Path` / `Dir` — `metaPath`, `rowsPath`, `scopeDir`, `indexPath`

**Variables:**
- camelCase locals: `listId`, `scopeMeta`, `contentType`
- SCREAMING_SNAKE for module constants: `MAX_ROWS`, `MAX_NAME_LEN`, `VALID_STATUSES`, `DISCARD_REASONS`
- Config keys on `lib/config.js`: SCREAMING_SNAKE exported properties — `FILTER_LISTS_ROOT`, `ANALYZER_PATH`

**Types / error codes:**
- No TypeScript — plain JS + JSDoc only where present
- Machine-readable error codes: SCREAMING_SNAKE strings on `err.code` — `LIST_NOT_FOUND`, `MISSING_ROWS`, `NO_USABLE_ROWS`, `OCR_UNAVAILABLE`
- API JSON always includes both human `error` and machine `code`

## Code Style

**Language / module system:**
- CommonJS only for shell/lib/tests: `require` / `module.exports`
- No ES modules in root app code (no `"type": "module"` in root `package.json`)
- Frontend page scripts: IIFE wrapping — `(function () { ... })();` in `public/js/bridge.js`
- Node built-ins preferred over extra deps: `fs`, `path`, `crypto`, `http`, `os`

**Formatting:**
- No project-root ESLint/Prettier/Biome config — match surrounding file style
- 2-space indent
- Single quotes for strings
- Semicolons required
- Trailing commas in multi-line object/array literals when nearby code uses them
- Prefer `const`; `let` only when reassigned

**Linting:**
- Not enforced at root
- Form Forge submodule may use Ruff (`modules/form-forge/ruff.toml`) — do not apply Python tooling to Node shell code

## Import Organization

**Order (lib modules):**
1. Node built-ins (`fs`, `path`, `crypto`, `http`)
2. Third-party (`xlsx`, etc.)
3. Local config / shared (`./config`, `./phuglee-user`)
4. Domain modules (`./bridge-export`, `./bridge-engine`)

**Path style:**
- Relative paths only — no path aliases (`@/`, `~`)
- Tests import from `../lib/...`
- Cross-module reuse from analyzer: require into `modules/property-analyzer/lib/...` from thin wrappers like `lib/phuglee-user.js`

**Lazy requires:**
- Heavy or optional deps may be required inside functions — e.g. `require('xlsx')` and `require('./bridge-intake-schema')` inside export helpers in `lib/bridge-list-store.js`
- Server entry lazy-loads bridge/analyzer modules via getters in `server.js` (`getBridgeApi`, `getEmbeddedAnalyzer`)

## Error Handling

**Patterns:**
1. **Throw coded errors in domain layer** — attach `err.code` before throw:
   ```js
   const err = new Error('List not found');
   err.code = 'LIST_NOT_FOUND';
   throw err;
   ```
2. **Map codes to HTTP in API layer** (`lib/bridge-api.js`):
   - 400 — validation (`MISSING_CITY`, `INVALID_UPLOAD_TYPE`, `EMPTY_FILE`)
   - 404 — missing resource (`CITY_NOT_FOUND`, `LIST_NOT_FOUND`)
   - 422 — business empty result (`NO_USABLE_ROWS`)
   - 501 — not implemented (`PARSER_NOT_READY`)
   - 503 — dependency down (`OCR_UNAVAILABLE`)
   - 500 — default `SERVER_ERROR`
3. **JSON error shape:**
   ```js
   sendJson(res, 400, { error: 'cityId is required', code: 'MISSING_CITY' });
   ```
4. **Soft read failures** — prefer fallback over throw when reading durable JSON:
   ```js
   function readJson(filePath, fallback) {
     if (!fs.existsSync(filePath)) return fallback;
     try {
       return JSON.parse(fs.readFileSync(filePath, 'utf8'));
     } catch (err) {
       console.warn('[Filter lists] Could not read', filePath, err.message);
       return fallback;
     }
   }
   ```
5. **Swallow non-critical loops carefully** — e.g. `markDownloaded` failures in `buildDownloadAll` use empty `catch (_) {}` only for best-effort side effects

## Atomic JSON Writes (copy this pattern)

**Canonical implementation:** `lib/bridge-list-store.js` → `writeJsonAtomic`

```js
function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}
```

**Rules when adding durable JSON persistence:**
- Always write temp then `renameSync` — never write the final path in place
- Include `process.pid` + `Date.now()` in temp suffix to avoid collisions
- Pretty-print with `JSON.stringify(data, null, 2)` for human-debuggable on-disk files
- Ensure parent dir exists with `mkdirSync(..., { recursive: true })`
- Use for index + entity files together when updating both (`meta.json`, `rows.json`, `index.json`)
- Pair with defensive `readJson(path, fallback)` that never throws on corrupt/missing files

**Do not:**
- Use `writeFileSync` directly to the canonical path for multi-reader durable state
- Leave `.tmp` files as the permanent artifact
- Skip directory creation before write

## Logging

**Framework:** bare `console` (no Winston/Pino)

**Patterns:**
- Prefix with subsystem tag in brackets: `[Bridge]`, `[Bridge API]`, `[Filter lists]`, `[Form Forge]`, `[Property Analyzer]`
- `console.warn` for recoverable failures (missing session file, index API down)
- `console.error` for start failures and unhandled API errors
- `console.log` sparingly for process lifecycle (child process start)
- Prefer `err.message` in messages; full `err` only at top-level API catch

## Comments

**When to Comment:**
- File-level purpose for non-obvious domain modules — e.g. `bridge-dedup.js` header describing near-duplicate detection
- Config property JSDoc for env-driven behavior (`AUTH_DISABLED`, `FILTER_LISTS_ROOT` in `lib/config.js`)
- Inline only for non-obvious business rules (why fence permit is discarded, why street-number guard exists)

**Avoid:**
- Narrating obvious code
- Large commented-out blocks

**JSDoc/TSDoc:**
- Light usage on config and a few public helpers
- Not required on every export; name + `module.exports` list is the public API surface

## Function Design

**Size:**
- Prefer small pure helpers (`normalizeAddress`, `sanitizeListId`, `toSummary`)
- Orchestrators (`processUpload`, `handleProcess`, `saveList`) compose helpers
- Keep HTTP mapping in `lib/bridge-api.js`; keep disk/domain logic in stores/engines

**Parameters:**
- Options objects for multi-field inputs:
  ```js
  saveList({ name, rows, stats = {}, cityId = '', username = '', plan = '' } = {})
  getList(listId, scopeMeta = {}, { includeRows = false } = {})
  ```
- Scope always passed as `{ username, plan }` or request-derived meta — never global mutable user state

**Return Values:**
- Prefer plain objects with clear keys: `{ scope, meta }`, `{ rows, removedCount, removed }`, `{ ok: true }`
- Buffers for downloads: `{ buffer, contentType, filename, meta }`
- Stats objects accumulate counts (`kept`, `discarded`, `alreadyImported`) rather than throwing for partial success

## Module Design

**Exports:**
- Named exports via `module.exports = { fnA, fnB, CONSTANT }` at file bottom
- No default export objects mixed with class instances for lib code
- Export testable pure functions even if only used internally by API (e.g. `groupStates` pattern when tested)

**Barrel Files:**
- Minimal — `lib/bridge-engine/index.js` is the engine entry (`processUpload`)
- Prefer direct requires of the concrete module for stores/schemas

**Layering (prescriptive):**
| Layer | Location | Responsibility |
|-------|----------|----------------|
| HTTP / routes | `server.js`, `lib/bridge-api.js` | status codes, multipart, `sendJson` |
| Domain / pipeline | `lib/bridge-engine/**` | parse → normalize → tag → dedupe → filter |
| Persistence | `lib/bridge-list-store.js` | atomic JSON lists, scoped by user |
| Schema / constants | `lib/bridge-intake-schema.js` | row shape, discard reasons, upload types |
| Config | `lib/config.js` | env + paths only |
| Frontend | `public/js/*.js` | DOM, fetch, no Node APIs |

## Frontend Conventions

**DOM IDs:**
- Prefixed by page: `bridge-state`, `bridge-save-list`, `bridge-lists-body`
- Keep IDs stable — tests and CSS may reference them

**State:**
- Page-local variables inside IIFE — not global app frameworks
- Session helpers exposed as `window.PhugleeSession` from `public/js/auth-session.js`

**API calls:**
- Relative `/api/bridge/...` paths
- Send `X-Phuglee-User` / `X-Phuglee-Plan` headers when user-scoped (via session helpers)

## Data / Path Safety

**Sanitize before filesystem use:**
- List IDs: strip to `[a-zA-Z0-9_-]`, max 64 (`sanitizeListId`)
- Names: trim, collapse whitespace, max length (`sanitizeName`)
- Static files: `path.normalize` + `startsWith(config.PUBLIC)` guard in `server.js`

**User scoping:**
- Filter lists live under `FILTER_LISTS_ROOT / {storageKey} / ...`
- Always resolve scope via `resolveSessionScope` / `resolveListScope` — never trust client-supplied storage paths

## String / Address Normalization

**Shared rules (copy when matching addresses):**
- Lowercase, strip punctuation, collapse whitespace
- Expand abbreviations (`St` → `street`) before compare — `lib/bridge-dedup.js`
- Default near-duplicate threshold: `0.92`
- Guard adjacent house numbers: same street with different leading number is **not** a duplicate
- Import filter keys: full address key + street-only key — `lib/bridge-engine/import-filter.js` + `lib/analyzer-import-index.js`

---

*Convention analysis: 2026-07-09*
