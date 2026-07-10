# Codebase Concerns

**Analysis Date:** 2026-07-09

## Tech Debt

**No Filter / Bridge brain today (static tagger only):**
- Issue: Distress tagging is a fixed regex catalog. There is no durable brain store, no decision API, no phrase mining, and no runtime apply of learned suppress/promote rules.
- Files: `lib/bridge-distress-tagger.js`, `lib/bridge-engine/index.js`, `lib/bridge-api.js`, `docs/gsd/milestones/M7-filter-superpower-brain.md`, `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`
- Why: M7 (phases 42–47) is fully planned and audited but **not executed**. Pipeline ships static `INDICATOR_CATEGORIES` only.
- Impact: False positives stay in kept lists until someone hand-edits; false negatives (FN) are permanently dropped and cannot improve future city files. Every customer re-pays the same tagging mistakes.
- Fix approach: Execute M7 in order (42 store/apply → 43 FN rows + groups → 44 admin UX → 45 decisions → 46 phrase panel → 47 hardening). Add `BRIDGE_BRAIN_PATH` under the durable volume (same pattern as `FILTER_LISTS_ROOT` in `lib/config.js`).

**`filterDistressOnly` discards FN rows before review can happen:**
- Issue: After tagging, non-strong code-violation rows are removed from the kept set. The process response returns only **kept** `rows` plus thin `discarded` summaries (`reason` + `rawPreview`). Full not-distressed row payloads are never returned.
- Files: `lib/bridge-distress-tagger.js` (`filterDistressOnly`), `lib/bridge-engine/index.js` (pipeline order: normalize → dedupe → import filter → `filterDistressOnly`), `lib/bridge-api.js` (`handleProcess`)
- Why: Product rule “only distress-worthy leads in the list” was implemented as hard drop rather than soft split (kept vs reviewable-not-distressed).
- Impact: Admins cannot see/promote false negatives. KPI only shows a count (“N generic code violation(s) dropped”). Training loop is blocked until process returns `notDistressedRows` (M7 phase 43).
- Fix approach: Split instead of hard-drop for code violations: keep `filterDistressOnly` semantics for the **saved list**, but attach full reviewable FN rows (capped) + grouped payload on the process response. Water shut-off must continue to pass through unchanged.

**Results UI omits `matchedIndicators` and descriptions:**
- Issue: Normalized rows **include** `matchedIndicators` and `descriptionNotes` (tagger + export columns), but the results table renders only address, issue type, tag, confidence, date.
- Files: `public/js/bridge.js` (`renderResultsTable` ~747–763; search haystack also skips `matchedIndicators`), `public/bridge.html` (thead columns 229–236), `lib/bridge-intake-schema.js` (schema/export fields present), `lib/bridge-distress-tagger.js` (produces indicators)
- Why: Phase-era table kept five operational columns; export path (`EXPORT_COLUMNS`) got full schema later.
- Impact: Operators cannot see **why** a row was marked distressed without downloading CSV/XLSX. Blocks train-brain UX (needs signals + descriptions on groups).
- Fix approach: Add Matched Indicators + Description columns (or expandable row detail) in `renderResultsTable` / `bridge.html`. Include `matchedIndicators` in client search haystack. M7 phase 44 also surfaces these on grouped cards.

**Admin identity is client bootstrap, not a real auth system:**
- Issue: Login is browser-local. Bootstrap admin is hardcoded (`admin` / `wunderhaus`) in client JS; users live in `localStorage`; session is `sessionStorage.phuglee_session`. Page protection is `public/js/auth-guard.js` only (redirect if no session). Server APIs trust spoofable headers.
- Files: `public/js/auth.js` (`BOOTSTRAP_ADMIN`, `isBootstrapAdmin`, `seedAdmin`), `public/js/auth-guard.js`, `public/js/auth-session.js`, `public/js/phuglee-session-headers.js`, `server.js` (`/js/auth-config.js` injection), `lib/config.js` (`AUTH_DISABLED`), `README.md` (publishes credentials)
- Why: Local operator stack MVP; multi-user was layered via headers + filesystem scopes without server sessions.
- Impact: Anyone who can open DevTools (or curl) can set `X-Phuglee-User: admin` and read/write that scope’s filter lists / analyzer session. “Admin-only brain training” cannot be secure until server verifies identity. Credentials are in source and README.
- Fix approach: Short term for M7: `requireAdmin(req)` on all `/api/bridge/brain/*` writes using sanitized username === `admin`, plus tests for 403 `ADMIN_REQUIRED`. Medium term: server-side sessions/tokens, rotate bootstrap secret to env, stop documenting password in README for production deploys.

**Multi-tenant filter lists are header-scoped, not authenticated:**
- Issue: List CRUD in `lib/bridge-list-store.js` scopes by `resolveSessionScope({ username, plan })` from `X-Phuglee-User` / `X-Phuglee-Plan`. No cookie/JWT validation on `/api/bridge/lists*`. Missing headers fall through to `_anonymous`. Max plan collapses many users into shared `_vault` storage key.
- Files: `lib/bridge-list-store.js`, `lib/phuglee-user.js`, `modules/property-analyzer/lib/user-session.js` (`resolveSessionScope`, `VAULT_STORAGE_KEY`, `ANONYMOUS_STORAGE_KEY`), `lib/bridge-api.js` (`scopeFromReq`), `data/filter-lists/{alice,bob,testuser}/`
- Why: Analyzer multi-user path was reused for Filter lists without adding auth middleware.
- Impact: Cross-tenant read/write if headers are forged. Max users share one vault list namespace (intentional product choice but risky if plan header is spoofable). Anonymous bucket is a collision sink for unauthenticated clients.
- Fix approach: Bind list routes to verified session; never accept raw username headers alone in production. Document vault shared-scope behavior. Reject empty username when `AUTH_DISABLED` is false.

**Analyze learned-brain is a separate system (do not reuse as Filter brain):**
- Issue: Property Analyzer already has vision-tier training (`correctionEvents`, `learnedRules`, caps, session merge) under `modules/property-analyzer/lib/learned-brain.js` and client review flows. Filter has **no** equivalent. Specs explicitly forbid sharing stores.
- Files: `modules/property-analyzer/lib/learned-brain.js`, `modules/property-analyzer/public/js/imagery.js` (correction events), `modules/property-analyzer/tests/review-training-flow.test.js`, `docs/gsd/milestones/M7-filter-superpower-brain.md` (constraints), `docs/gsd/plans/2026-07-09-m7-audit-filter-brain.md`
- Why: Different domain — street-view tier scoring vs city-file violation text tags.
- Impact: Conflating systems would corrupt both products and break M7 scope. Engineers may “reuse Analyze brain” by mistake.
- Fix approach: Build Filter-native brain (global JSON under volume). Optionally copy **patterns** (atomic write, event caps, undo) from list store / learned-brain helpers — never the same file or API.

**Upload body fully buffered with no size cap:**
- Issue: `readBody` concatenates every request chunk into a single `Buffer`. Multipart parser converts the entire body to a latin1 string and re-buffers file parts. No `Content-Length` / max-bytes check on process, attach, or list create.
- Files: `lib/bridge-api.js` (`readBody`, `handleProcess`, `handleAttach`, `handleListCreate`), `lib/multipart.js` (`parseMultipart`), `lib/bridge-list-store.js` (`MAX_ROWS = 100000` only after parse)
- Why: Minimal custom multipart for local operator uploads.
- Impact: Large city Excel/PDF/OCR jobs can spike heap (buffer + string + parsed rows + JSON response). Concurrent uploads multiply pressure. Row cap only helps after successful parse.
- Fix approach: Enforce max upload bytes (e.g. 25–50MB) early in `readBody`. Stream or temp-file multipart for large files. Cap FN review payload separately when M7 returns full discard rows. Consider streaming JSON responses for huge kept sets.

**List index read-modify-write is not concurrency-safe:**
- Issue: Index updates read `index.json`, mutate array, write atomically per file — but concurrent saves can lose list entries (last writer wins on index).
- Files: `lib/bridge-list-store.js` (`saveList`, `renameList`, `deleteList`, `writeIndex`, `writeJsonAtomic`)
- Why: Single-operator local use assumed; atomic rename protects partial writes, not multi-writer races.
- Impact: Rare lost list metadata under parallel saves (admin tools, multi-tab, multi-user vault).
- Fix approach: File lock or version field on index; or append-only index with compaction.

**`tagRows` drops raw-row context:**
- Issue: `tagRows` calls `tagRow(row, uploadType)` without the third `rawRow` argument, so unmapped city columns never participate. Production path uses `normalizeRawRows` → `tagRow(mapped, uploadType, rawRow)` correctly.
- Files: `lib/bridge-distress-tagger.js` (`tagRows`), `lib/bridge-engine/normalizer.js` (correct call)
- Why: Convenience helper predates raw-column search.
- Impact: Any future caller of `tagRows` under-tags vs production pipeline (silent FN increase).
- Fix approach: Pass through raw rows or deprecate `tagRows` in favor of normalizer-only tagging.

## Known Bugs

**False negatives are invisible after process (by design today, product bug for training):**
- Symptoms: User sees “N generic code violation(s) dropped” but cannot open those rows, re-tag, or promote them. Kept table only shows strong-tagged (or water) rows.
- Files: `lib/bridge-engine/index.js`, `public/js/bridge.js` (`renderResults` / stub note), `lib/bridge-distress-tagger.js`
- Trigger: Upload a mixed code-violation file (weeds + fence permit + parking).
- Workaround: Re-run after manually expanding regex in `INDICATOR_CATEGORIES` (requires deploy).
- Root cause: `filterDistressOnly` hard-drops; discarded items store preview only.
- Blocked by: M7 phase 43 (`notDistressedRows` + grouping).

**Loose regex can keep non-distress / miss real distress:**
- Symptoms: Over-broad patterns (e.g. bare `blight`, `property maintenance`, `trash`) may keep weak admin rows; missing city jargon creates FN that never surface.
- Files: `lib/bridge-distress-tagger.js` (`INDICATOR_CATEGORIES`), `docs/bridge/TAGGING-RULES.md`
- Trigger: City-specific ordinance labels not covered by patterns.
- Workaround: Manual CSV edit after export; code change + redeploy.
- Root cause: Static keyword system without human feedback loop.
- Fix: M7 type suppress/promote + phrase rules after admin approval.

**Client search cannot find by matched indicator text:**
- Symptoms: Filtering results by keyword only checks address, issue type, tag, description — not `matchedIndicators`.
- Files: `public/js/bridge.js` (`getFilteredRows`)
- Trigger: Search for category phrase that appears only in indicators.
- Workaround: Export CSV and search offline.
- Root cause: Table/search never wired to indicator field.

## Security Considerations

**Spoofable multi-tenant headers:**
- Risk: Any client can send `X-Phuglee-User` / `X-Phuglee-Plan` and access that scope’s filter lists and influence import-index/analyze paths that honor the same headers.
- Files: `lib/phuglee-user.js`, `lib/bridge-api.js`, `lib/bridge-list-store.js`, `public/js/phuglee-session-headers.js`, `tests/bridge-api-handlers.test.js` (documents header-as-identity)
- Current mitigation: Client auth-guard hides pages from casual users; username sanitization strips path traversal characters.
- Recommendations: Server session cookie or signed token; map token → username server-side. Treat header-only identity as dev/test only.

**Hardcoded admin password in shipped client:**
- Risk: `admin` / `wunderhaus` is public in `public/js/auth.js` and `README.md`. On any reachable deploy, full operator access is trivial.
- Files: `public/js/auth.js`, `README.md`
- Current mitigation: Production sets `AUTH_DISABLED` false unless `PHUGLEE_AUTH_OPEN=1` (`lib/config.js`) — still weak because password is fixed client-side.
- Recommendations: Env-driven admin secret verified server-side; force password change; remove credentials from README for production docs.

**`AUTH_DISABLED` auto-establishes admin session:**
- Risk: When auth is disabled, `/js/auth-config.js` sets `sessionStorage.phuglee_session = 'admin'`, making every local browser admin.
- Files: `server.js` (auth-config generation), `lib/config.js`
- Current mitigation: Production refuses `AUTH_DISABLED` unless open staging flag.
- Recommendations: Keep production strict. For M7 brain writes, still require explicit admin header/session even in dev, or gate with `BRIDGE_BRAIN_OPEN=1` for tests only (per design spec).

**No server authorization on bridge list/process routes:**
- Risk: Unauthenticated HTTP clients can process uploads and read/write lists for any claimed user.
- Files: `lib/bridge-api.js` (`handle` router), `server.js` (mounts `/api/bridge` without auth middleware)
- Current mitigation: Network exposure assumed private/local or behind host firewall.
- Recommendations: Shared auth middleware for all mutating bridge endpoints before multi-tenant SaaS.

## Performance Bottlenecks

**In-memory multipart + full-row JSON round-trips:**
- Problem: Upload → full buffer → parse spreadsheet/PDF/OCR → normalize all rows → JSON.stringify entire kept set (and later list `rows.json` write).
- Files: `lib/bridge-api.js`, `lib/multipart.js`, `lib/bridge-engine/index.js`, `lib/bridge-engine/parsers/*`, `lib/bridge-list-store.js`
- Measurement: No formal p95 in-repo; `MAX_ROWS` allows up to 100k rows per list; city files commonly multi‑MB Excel.
- Cause: Synchronous fs JSON + single-process Node heap; OCR path (`tesseract.js`) is especially heavy.
- Improvement path: Byte caps, streaming parse, paginated process results, store rows on disk first and return summary + page 1.

**Import index force-refresh on every process:**
- Problem: `loadImportAddressIndex({ force: true })` runs every upload so Analyze purges are visible immediately.
- Files: `lib/bridge-engine/index.js`, `lib/analyzer-import-index.js`
- Cause: Correctness preferred over cache.
- Improvement path: Short TTL cache with explicit invalidate on analyzer purge/import events.

**Download-all materializes every list in memory:**
- Problem: `collectAllRows` loads all `rows.json` files into one array before CSV/XLSX encode.
- Files: `lib/bridge-list-store.js` (`collectAllRows`, `buildDownloadAll`)
- Improvement path: Stream CSV; cap combined export size; warn UI when recordCount is large.

## Fragile Areas

**Distress tagging order and discard mapping:**
- Files: `lib/bridge-engine/index.js`, `lib/bridge-distress-tagger.js`, `lib/bridge-engine/import-filter.js`, `lib/bridge-dedup.js`
- Why fragile: Pipeline order (normalize → dedupe → already-imported → distress filter) defines product meaning of counts. Reordering breaks KPIs and messages in `noUsableRowsMessage`.
- Common failures: Changing `filterDistressOnly` without updating discard reason tallies; water shut-off special cases.
- Safe modification: Keep water bypass; add brain apply **before** distress filter (per M7 design); expand tests in `tests/bridge-distress-tagger.test.js`, `tests/bridge-engine.test.js`, `tests/bridge-stress.test.js`.
- Test coverage: Strong unit coverage on tag patterns; weak coverage on end-to-end FN review payload (does not exist yet).

**Client-only admin UI gates:**
- Files: `public/js/settings-menu.js` (`isAdmin`), future train-brain UI in `public/js/bridge.js`
- Why fragile: Hiding UI ≠ authorization. Non-admin can still call APIs if endpoints lack `requireAdmin`.
- Safe modification: Pair every admin UI surface with server 403 tests (`tests/bridge-api*.test.js` pattern).
- Test coverage: Settings admin section has limited coverage; brain endpoints not implemented.

**Session scope rules (admin / vault / user / anonymous):**
- Files: `modules/property-analyzer/lib/user-session.js`
- Why fragile: Plan header `max` forces `_vault` regardless of username; empty user → `_anonymous`. Easy to mis-scope lists vs analyzer sessions.
- Safe modification: Always use `resolveSessionScope` / `scopeFromReq`; never invent path segments from raw headers.
- Test coverage: `tests/user-session-scope.test.js`, `tests/phuglee-user.test.js`, list isolation cases in `tests/bridge-api-handlers.test.js`.

## Scaling Limits

**Single Node process + filesystem list store:**
- Current capacity: Suitable for single operator / small team on one host (local or one Railway container with volume).
- Limit: Breaks under multi-instance horizontal scale (no shared DB; lists on local disk), large concurrent OCR uploads, 100k-row lists near memory ceiling.
- Symptoms at limit: OOM kills, slow process, lost index entries under races, volume disk full.
- Scaling path: Object storage or DB for lists; reverse proxy upload limits; queue OCR; sticky sessions or shared volume only as interim.

**Global Filter brain (planned) single-writer:**
- Current capacity: N/A (not shipped).
- Limit: One global JSON brain for all tenants — correct for product, but hot write path for admin decisions.
- Scaling path: Atomic RMW + version (409 on stale) as specified in M7 phase 45/47; keep brain small (type rules + phrases, not full row history).

## Dependencies at Risk

**`xlsx` (SheetJS community):**
- Risk: Older community build (`^0.18.5` in `package.json`); historically associated with prototype pollution / ReDoS advisories on untrusted workbooks.
- Impact: Bridge spreadsheet parse path (`lib/bridge-engine/parsers/spreadsheet.js` via dependency chain).
- Migration plan: Pin audited version, validate uploads, or switch to a maintained parser for untrusted city files.

**Custom multipart parser:**
- Risk: `lib/multipart.js` is minimal (boundary split, no size limits, latin1 round-trip).
- Impact: Malformed multipart or huge parts can throw or exhaust memory.
- Migration plan: Use `busboy`/`multiparty` with limits, or add hard caps and tests for adversarial bodies.

## Missing Critical Features

**Filter training loop (Approve / Deny → future uploads):**
- Problem: No `/api/bridge/brain*` routes, no decision events, no type suppress/promote, no phrase proposals, no admin train UI.
- Current workaround: Edit `INDICATOR_CATEGORIES` in code and redeploy.
- Blocks: Sellable “superpower brain”; consistent quality across cities; FN recovery.
- Implementation complexity: High but sequenced — M7 phases 42–47 already planned (`docs/gsd/plans/2026-07-09-phase-4*.md`).

**Reviewable not-distressed section:**
- Problem: UI has no “not marked distressed” train section; API does not return full FN rows.
- Current workaround: None in product.
- Blocks: Promote false negatives (M7 D6).
- Implementation complexity: Medium (phase 43 + 44).

**Server-enforced admin gate for brain writes:**
- Problem: Planned `requireAdmin` / `ADMIN_REQUIRED` 403 does not exist because brain API does not exist; list APIs also lack admin distinction.
- Current workaround: Client hides Analyze settings admin section only (`public/js/settings-menu.js`).
- Blocks: Safe global learning without non-admin corruption.
- Implementation complexity: Low once brain routes exist (phase 45).

**Real multi-user authentication:**
- Problem: localStorage passwords, fixed admin, header identity.
- Current workaround: Deploy on private network / trust operators.
- Blocks: Public multi-tenant SaaS, trustworthy per-user filter lists.
- Implementation complexity: High (auth service + migration of scopes).

## Test Coverage Gaps

**No tests for training / brain paths:**
- What's not tested: Brain apply, decisions, phrase miner, admin 403, undo/metrics (features absent).
- Files: Planned coverage described in `docs/gsd/plans/2026-07-09-phase-45-filter-brain-decisions.md` et al.; no `lib/bridge-brain*.js` yet.
- Risk: First implementation can ship without non-admin write protection.
- Priority: High (block M7 ship on these tests).
- Difficulty to test: Low–medium with filesystem temp roots (mirror `bridge-list-store` tests).

**Results UI column / indicator display:**
- What's not tested: That `renderResultsTable` shows (or intentionally hides) `matchedIndicators` / descriptions.
- Files: `public/js/bridge.js`, `public/bridge.html` — limited browser coverage beyond a11y/shell tests.
- Risk: UI regressions leave operators blind to tag rationale.
- Priority: Medium
- Difficulty to test: Medium (DOM unit or Playwright smoke).

**Upload size / memory limits:**
- What's not tested: Oversized multipart rejection, concurrent process memory.
- Files: `lib/bridge-api.js`, `lib/multipart.js`
- Risk: Production OOM under large city PDF/OCR.
- Priority: Medium
- Difficulty to test: Medium (synthetic large buffers).

**Header spoof isolation under “auth enabled”:**
- What's not tested: Production-like mode where unauthenticated callers cannot set arbitrary user scopes.
- Files: `lib/bridge-api.js`, `server.js`
- Risk: False confidence from tests that *use* headers as the identity mechanism.
- Priority: High for any public deploy
- Difficulty to test: Requires introducing real auth first.

**Cross-product regression (Filter vs Analyze brain):**
- What's not tested: Guarantee that Filter process never reads/writes `modules/property-analyzer` learned-brain fields.
- Files: `lib/bridge-engine/index.js`, `modules/property-analyzer/lib/learned-brain.js`
- Risk: Accidental coupling during M7.
- Priority: Medium (add explicit non-import lint/test when brain lands)
- Difficulty to test: Low

---

*Concerns audit: 2026-07-09*
*Update as issues are fixed or new ones discovered*
