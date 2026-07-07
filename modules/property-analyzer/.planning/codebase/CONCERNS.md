# Codebase Concerns — Deep Audit

**Analysis Date:** 2026-07-04  
**Scope:** Tech debt, bugs, security, performance, fragile areas, duplicate code, dead code, unwired exports, obsolete scripts  
**Test baseline:** 189 tests passing (`npm test`)

---

## Critical — Client/Server Classification Logic Drift

**Review routing parity:**
- Issue: `computeNeedsReview`, `isBlurredImagery`, `isLandHomeUncertain`, `inferCategory`, and `resultCategory` are implemented in both `public/js/session.js` and `lib/result-classify.js` — nearly identical logic, not shared
- Files: `public/js/session.js:492-617`, `lib/result-classify.js:17-76`
- Impact: Browser review queues, tier counts in UI, and export "Needs Review" column can disagree with server `buildSessionSummary` / `computeTierCounts` after one-sided edits. Tests cover server only (`tests/review-queue.test.js`, `tests/classification-confidence.test.js`); no client parity tests
- Fix approach: Bundle `lib/result-classify.js` for browser (like `tier-engine.js`) or generate client stubs from a single source; add cross-environment parity fixtures

---

## Critical — Satellite Fusion Only on Fallback Path

**Scan pipeline:**
- Issue: `reconcileSatelliteWithStreetView()` is wired, but only when `streetAnalysisNeedsSatellite()` returns true (blurred/unavailable/obstructed/low-confidence street). Clear street scans call `finalizePropertyDistress(analysis)` with `satelliteResult: null`
- Files: `public/js/app.js:586-647`, `lib/imagery-routing.js:16-28`
- Impact: Majority of successful street scans never fetch/classify satellite; `fuseStreetAndAerialScore`, manicured exemption (`qualifiesManicuredExemption`), and aerial thresholds in `looksVisuallyDistressed` are inactive on the happy path despite prompt support for `viewMeta.satellite` in `buildAnalysisPrompt()`
- Fix approach: Parallel satellite fetch on property scans (cache-first), or always attach cached `satelliteClassification` from `priorRecord` / imagery index before tiering

---

## High — Duplicate Tier Engine in `review.js` (Load-Order Fragile)

**Maintainability / drift:**
- Issue: `public/js/review.js` redefines `looksVisuallyDistressed` (lines 25-68) and `computeLeadTier` (lines 220-244) — full copies of `lib/tier-engine.js`. Script order: `config.js` wires tier-engine → `review.js` overwrites → `app.js` re-wires tier-engine. Runtime currently uses `lib/tier-engine.js`, but ~220 lines in `review.js` are misleading dead definitions
- Files: `public/index.html:688-695`, `public/js/review.js`, `public/js/app.js:12-21`, `lib/tier-engine.js`
- Impact: Any load-order change (or removing `app.js` re-wire) silently reverts to stale client tier logic. `review.js` copy uses `combinedTierReason()` for non-string `reason` args; `tier-engine.js` does not — subtle behavioral delta if dead code becomes live
- Fix approach: Delete duplicate functions from `review.js`; rely solely on `PDA.lib.tierEngine` like `app.js` does

---

## High — Score Downgrade Override Encodes False Negatives

**Tier engine:**
- Issue: `computeLeadTier` line 243: `if (s >= 6 && !looksVisuallyDistressed(...))` routes high AI scores without indicator combos to `well_maintained` (with s≥7 exception)
- Files: `lib/tier-engine.js:243-248`, mirrored dead copy in `public/js/review.js:237-242`
- Impact: AI scores 6-8 on visibly worn homes classified `well_maintained` when only single soft indicator present and satellite roof/yard unavailable
- Evidence: Fixture `score8_cosmetic_only` in `tests/fixtures/tier-cases.json` expects `well_maintained` — conservative behavior is test-locked
- Fix approach: Treat AI score ≥7 as distress prior when confidence ≥ threshold; require explicit manicured exemption to downgrade

---

## High — Manicured Exemption Inert on Street-Only Path

**Tier engine:**
- Issue: `qualifiesManicuredExemption()` requires `roof === 'good' && yard === 'good'` from satellite; street-only scans pass `null` satellite
- Files: `lib/tier-engine.js:141-155`, `public/js/app.js:646` (else branch)
- Impact: Exemption logic partially dead on main scan path; inconsistent promotion/demotion vs satellite-enriched records

---

## High — Incomplete AI Fallback Defaults to Maintained

**Error recovery:**
- Issue: `buildImageryConfirmedFallback()` sets `well_maintained` when partial score < 6 on incomplete Gemini response
- Files: `public/js/app.js:245-271`
- Impact: Truncated JSON / parse salvage on distressed-looking homes may land in well-maintained bucket with `confidence: 45` but `hasExplicitConfidence` may still gate review routing

---

## High — Unauthenticated GET Session Endpoints (PII Exposure)

**Security:**
- Issue: `GET /api/session-summary`, `/api/session-review-meta`, `/api/session-results`, `/api/session-backup` serve full session JSON without auth. Only `POST /api/*` requires token (`server.js:177-178`)
- Files: `routes/session.js:8-87`, `server.js:177-178`
- Impact: Any host on LAN (or mis-bound `0.0.0.0`) can download lead PII (names, phones, emails, addresses) without `PDA_AUTH_TOKEN`
- Fix approach: Require auth on all `/api/session*` routes or bind server to localhost only with explicit opt-in

---

## High — Auth Token Injected into HTML

**Security:**
- Issue: `routes/static.js:19-22` injects `window.__PDA_AUTH_TOKEN__` into every page load
- Impact: Full API write access if XSS ever introduced via `innerHTML` templates in `render.js`, `session.js`, `review.js` (many uses; most user data passed through `escapeHtml`)
- Fix approach: HttpOnly session cookie or short-lived token exchange; audit all `innerHTML` sinks

---

## Medium — `ensureSatelliteClassification` Dead Code

**Unwired export:**
- Issue: `R.ensureSatelliteClassification` defined in `public/js/app.js:220-238` but never called anywhere in codebase
- Impact: ~20 lines of retry logic unused; `finalizeStreetAnalysis` inlines its own satellite classify path
- Fix approach: Remove or wire into imagery-cache reuse path

---

## Medium — `matchesLowConfidenceReviewFilter` Unwired

**Dead export:**
- Issue: `matchesLowConfidenceReviewFilter()` defined in `public/js/session.js:596-599` but never referenced
- Related: `low_confidence` bucket exists in `reviewedKeysByFilter` (`public/js/config.js:475`) but `normalizeDeprecatedReviewState()` migrates `reviewFilter === 'low_confidence'` to `'all'` (`public/js/state.js:204`); no sidebar review mode for low-confidence lane
- Impact: Low-confidence routing works via general `review` queue (`computeNeedsReview`), but dedicated `low_confidence` bucket/filter is orphaned state
- Fix approach: Remove dead bucket/filter or add UI lane; delete unused helper

---

## Medium — Export Column Contracts Manually Duplicated

**Consolidation:**
- Issue: `lib/export-profiles.js` defines `FULL_EXPORT_COLUMNS` for tests only; `public/js/render.js:451-502` hardcodes the same column set inline. Comment says "keep in sync" — no automated check
- Files: `lib/export-profiles.js:1-44`, `public/js/render.js:464-500`, `tests/export-profiles.test.js`
- Impact: Column drift between export and test contract without CI failure on render side
- Fix approach: Import/generate columns from `export-profiles.js` in render path or shared JSON schema

---

## Medium — `lib/export-profiles.js` Not Browser-Bundled

**Unwired module:**
- Issue: `export-profiles.js` is Node-only; browser uses duplicate inline columns. `export-schema.js` is allowlisted (`routes/static.js:58`) but `export-profiles.js` is not
- Fix approach: Add to `LIB_ALLOWLIST` if client should consume it

---

## Medium — Duplicate Regex / Indicator Sets

**Consolidation:**
- Issue: `OBSTRUCTED_REASON` defined in `lib/imagery-routing.js:12` with copy-paste fallback in `lib/classification-confidence.js:10-11`. `MODERATE_INDICATORS` duplicated in `classification-confidence.js:16-18` vs `tier-engine.js`
- Impact: Pattern changes require multi-file edits; risk of divergent review routing vs satellite fallback triggers

---

## Medium — Learned Rules Asymmetric Distress Guard

**Learning loop:**
- Issue: `applyLearnedTierRules` blocks `toTier === 'distressed'` unless `looksVisuallyDistressed` unless promoting from `well_maintained` (`public/js/scan.js:812-819`)
- Impact: User corrections identifying missed distress may not propagate as aggressively as false-positive reductions
- Note: `tests/learned-rules.test.js` documents intentional behavior for well_maintained → distressed promotion

---

## Medium — Misnamed Migration Helper

**Tech debt:**
- Issue: `demoteFalseWellMaintainedToLight()` (`public/js/review.js:195`) demotes to **distressed**, not "light" tier (legacy name). Exposed as `demoteFalseWellMaintained` in `public/js/app.js:1247`
- Impact: Confusing maintenance; "light" tier fully migrated to distressed elsewhere (`migrateLightTierToDistressed`)

---

## Medium — `with(R)` Scope Pattern Across All Client Modules

**Fragile architecture:**
- Issue: All 8 `public/js/*.js` modules use `with (PDA.env) { ... }` IIFE pattern
- Files: `app.js`, `config.js`, `state.js`, `session.js`, `scan.js`, `review.js`, `render.js`, `imagery.js`
- Impact: Strict-mode incompatible, no static analysis/IDE refactors, implicit globals, load-order coupling (tier-engine override bug above)
- Fix approach: ES modules or explicit `PDA.env.fn = ...` without `with`

---

## Medium — One-Off Scripts Still in `scripts/`

**Obsolete tooling (safe to archive/remove after confirming no ops use):**
| Script | Purpose | Status |
|--------|---------|--------|
| `scripts/split-legacy-to-pda.js` | Split deleted `legacy-app.js` into modules | **Obsolete** — `legacy-app.js` gone |
| `scripts/fix-pda-init-order.js` | One-time load-order patcher | **Obsolete** — edits applied |
| `scripts/prune-app-css-phase20.py` | Phase-20 CSS cleanup | **Obsolete** one-shot |
| `scripts/analyze-needs-review-gap.js` | Session diagnostic | Ops/debug only |
| `scripts/analyze-well-maintained-review-gap.js` | Session diagnostic | Ops/debug only |
| `scripts/restore-well-maintained-unreviewed.js` | One-time migration fix | Ops only |
| `scripts/profile-10k-scroll.js` | Perf profiling | Dev only |
| `scripts/check-depth.js` | Unknown depth check | Verify then remove |
| `scripts/archive-root-sessions.js` | Session archival | Ops only |

**Recommendation:** Move ops scripts to `scripts/ops/`; delete migration scripts or gate behind `npm run` docs

---

## Medium — CSS Sprawl and Monolith

**Performance / maintainability:**
- Issue: `public/css/app.css` is **~135 KB** uncompressed; plus 7 `cyber-*.css` layers loaded in `public/index.html:12-18`
- Files: `public/css/app.css`, `cyber-theme.css`, `cyber-ultra.css`, `cyber-review.css`, etc.
- Impact: Large CSS parse on every load; `prune-app-css-phase20.py` suggests ongoing manual pruning debt
- Fix approach: Purge unused rules (Tailwind + component audit); consolidate cyber layers

---

## Medium — Large Client Modules (No Code Splitting)

**Performance:**
- Issue: `state.js` (~79 KB), `scan.js` (~76 KB), `session.js` (~72 KB), `imagery.js` (~68 KB), `config.js` (~65 KB) all load synchronously on every page
- Impact: Main-thread parse cost; no lazy load for review-only or export-only code paths
- Scaling path: Dynamic `import()` for review mode and export flows

---

## Low — CORS Wide Open

**Security:**
- Issue: `Access-Control-Allow-Origin: *` on all JSON responses (`lib/http.js:5`)
- Impact: Low risk for localhost-only tool; increases exposure if server bound beyond loopback

---

## Low — Export Omits Derived Confidence

**Data quality:**
- Issue: Full export includes raw `AI Confidence` (`r.confidence`) but not `classificationConfidence` or `reviewReason` from `enrichClassificationFields()`
- Files: `public/js/render.js:481`, `lib/classification-confidence.js:145-154`
- Impact: Dial-ready / CRM exports cannot filter by composite confidence used for review routing

---

## Low — `innerHTML` Usage

**Security / fragility:**
- Issue: Widespread `innerHTML` in `render.js`, `session.js`, `state.js`, `review.js` for cards, banners, alerts
- Mitigation: User addresses passed through `escapeHtml` in several paths (`render.js:1453`, `state.js:418`)
- Risk: Future template changes without escaping → XSS + token theft via `__PDA_AUTH_TOKEN__`

---

## Test Coverage Gaps

**Untested / under-tested areas:**
| Area | Gap | Risk |
|------|-----|------|
| `finalizeStreetAnalysis` E2E | No integration test for satellite fallback branches | Regression on fusion wiring |
| Client `computeNeedsReview` | Server tested; client copy not parity-tested | UI queue vs server summary mismatch |
| `review.js` tier duplicates | Tests hit `lib/tier-engine.js` only | Dead code could become live silently |
| Export column parity | `export-profiles` tested; `render.js` columns not | Silent export schema drift |
| Prompt distribution | No golden-set prompt regression in CI by default | Model drift undetected until manual `npm run test:golden` |
| `ensureSatelliteClassification` | Zero coverage | Dead code rots |

**Priority:** High for client/server parity; Medium for scan pipeline integration

---

## Scaling Limits

**100k leads target:**
- Current: `GEMINI_MAX_CONCURRENT = 8` (`routes/gemini.js:10`); satellite only on fallback path today
- Bottleneck: Adding universal satellite doubles Gemini calls unless `property_imagery/` cache hit rate is high
- Client: Full `state.results` in memory; virtual scroll helps DOM but not RAM (`lib/virtual-scroll.js`)
- Session JSON: `SIZE_WARN_BYTES` / localStorage pressure (`persistence.js:16`, `config.js`)
- Scaling path: Cache `satelliteClassification` on record; paginated session already exists server-side (`/api/session-results`); client should avoid loading full 100k into memory

---

## Dependencies at Risk

**Gemini model behavior:**
- Risk: Prompt-heavy rules in `config.js` / `scan.js` (`buildD4DIndicatorGuide`, `buildStaticTierRules`) interpreted inconsistently across fallback chain: `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-1.5-flash`
- Impact: Classification drift on 429/503 fallback
- Mitigation: `npm run test:golden`, `npm run test:metrics` exist but not in default `npm test`

**SheetJS CDN:**
- Risk: `public/index.html:678` loads `xlsx.full.min.js` from `cdn.sheetjs.com` — export breaks offline
- Fix: Vendor locally or npm dependency

---

## Backup & Workspace Hygiene

**Gitignored but present locally:**
- `backups/manual/` — many `session_manual_*.json` snapshots (PII)
- `backups/auto/`, `backups/offsite/` — runtime backup dirs
- `.env` — gitignored (`/.gitignore:2`) but exists in workspace; verify never committed

**Note:** No `*.bak`, `*.backup`, or `legacy-app.js` found in repo (good)

---

## Resolved / Improved Since 2026-06-30 Audit

| Prior concern | Current state |
|---------------|---------------|
| `reconcileSatelliteWithStreetView` never called | **Partially fixed** — called when `streetAnalysisNeedsSatellite` true |
| Confidence not used in routing | **Fixed** — `computeNeedsReview` uses `isLowConfidenceReview` / `isBorderlineDistressReview` (server + client) |
| Blurred vs unavailable conflation | **Improved** — `inferImageryQuality` separates dimensions; blurred still excluded from review queue by design |
| "CONSERVATIVE" prompt bias | **Softened** — prompts now say "list every visible indicator"; tier rules still bias via engine |
| Test count ~78 | **189 tests** passing |

---

*Concerns audit: 2026-07-04 — full codebase sweep (Glob, Grep, Read, npm test)*