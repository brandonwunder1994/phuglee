# Stack Research

**Domain:** Type Column Intelligence for Distress OS Filter (Data Bridge) — smart Violation Type column detection, per-city sheet format memory + confirm gate, display-only short labels  
**Researched:** 2026-07-09  
**Confidence:** HIGH  
**Milestone:** v1.8 (subsequent — extends shipped Filter pipeline; not greenfield)

## Recommended Stack

### Verdict (one line)

**Add zero npm packages.** Implement scoring, fingerprinting, confirm gate, and display short labels as pure CommonJS modules under `lib/`, wired into the existing `processUpload` / Train / brain-store patterns.

### Core Technologies (unchanged base)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 20+ (runtime 24.x local) | Shell + Filter pipeline | Already production stack; all new logic is in-process |
| JavaScript CommonJS | existing | `lib/bridge-*.js` modules | Matches every bridge module; no TS/build step |
| Vanilla browser JS | existing | Confirm UI + Train short labels in `public/js/bridge.js` / `bridge-train.js` | No React migration (locked); UI is already wizard-style |
| Node built-in `crypto` | built-in | Format fingerprint hash (SHA-1/SHA-256) | Already used in `bridge-review-groups.js` (`createHash('sha1')`) |
| Node built-in `fs` + atomic JSON | built-in | Per-city format memory persistence | Same pattern as `bridge-brain-store.js` (`writeJsonAtomic`) |
| `node --test` | built-in | Regression locks for wrong-column maps, reuse, labels | Existing suite (`tests/bridge-*.test.js`); keep parity |
| `xlsx` | ^0.18.5 (already) | Spreadsheet parse only | Headers/rows already available before scoring — do not re-parse |

### New modules (pure JS — no install)

| Module (proposed) | Purpose | Why not a library |
|-------------------|---------|-------------------|
| `lib/bridge-type-column-score.js` | Score every header by alias hit + value-shape features; return ranked candidates + single winner | Domain-specific city FOIA sheets; alias list already in `INTAKE_FIELD_ALIASES.violationIssueType` + `isCategoryLikeHeader` |
| `lib/bridge-format-fingerprint.js` | Fingerprint sheet format (ordered normalized headers + optional light shape digest); compare to last confirmed | Simple deterministic hash; no schema-registry product needed |
| `lib/bridge-city-format-store.js` | Load/save per-city confirmed Type column + fingerprint under volume-safe root | Mirror `bridge-brain-store` atomic JSON; city-scoped not global-brain rules |
| `lib/bridge-display-label.js` | Derive display-only short labels from long type/description text | Pure string heuristics; must never mutate export/distress fields |

### Supporting pieces (existing — extend, do not replace)

| Library / module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `lib/bridge-intake-schema.js` | existing | Aliases, `normalizeHeader`, `mapRawRow`, `detectIntakeColumnMap` | Keep aliases as **header feature source**; scoring layer sits *above* first-match |
| `lib/bridge-category-promote.js` | existing | Promote category when type empty | Keep as **fallback after** winner column is chosen and still empty — not as primary Type picker |
| `lib/bridge-engine/normalizer.js` | existing | `enhanceColumnMap` → `normalizeRawRows` | Inject scored winner for `violationIssueType` before `mapRawRow` |
| `lib/bridge-engine/index.js` | existing | `processUpload` | Confirm gate: pause/reuse format before full normalize (or re-normalize with confirmed map) |
| `lib/bridge-api.js` | existing | `/api/bridge/*` | New confirm/reuse endpoints; no Express |
| `lib/bridge-review-groups.js` | existing | Train group cards | Add `displayLabel` / `shortLabel` field; keep `violationTypeLabel` full for match keys |
| `lib/bridge-stable-text.js` | existing | Timestamp strip + stable keys | Reuse for fingerprint header cleanup and label prep (do not invent parallel strip logic) |
| `lib/bridge-brain-store.js` | existing | Global type/phrase rules | **Do not** fold format memory into `global-brain.json` (different domain: city sheet layout vs tag rules) |
| `lib/config.js` | existing | `BRIDGE_BRAIN_ROOT` / volume roots | Add optional `BRIDGE_CITY_FORMATS_ROOT` (or nest under brain/list volume) for durability |
| `public/js/bridge.js` | existing | Upload wizard | Confirm Type column step when format is new/changed |
| Node `crypto` | built-in | `sha1` hex digest for format id | Prefer same style as `groupIdFor` (stable join + hash) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node --test` + `tests/bridge-type-column-*.test.js` | Unit + fixture locks | Fixtures: wrong-column winner, alias-only trap, format reuse, short-label bounds |
| `scripts/verify-live.ps1` | Health after UI edits | Mandatory per Agents.md when `public/` changes |
| No bundler | Static UI | Confirm step is DOM in existing wizard |

## Installation

```bash
# No new runtime dependencies for v1.8 Type Column Intelligence.
# Existing bridge deps already cover parse/export:

# (already installed)
# npm install xlsx mammoth pdf-parse tesseract.js

# Dev: use built-in test runner only
npm test
```

If a future phase truly needs fuzzy header match beyond aliases (unlikely for FOIA municipal sheets), re-evaluate **then** — not at milestone start.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Pure JS multi-feature column score | LLM / embeddings column classifier | Only if pure heuristics fail on a measured set of real city files **after** alias+shape scoring ships |
| Atomic JSON per-city format store | SQLite / Redis / Postgres | Multi-tenant multi-writer at scale; not current single-tenant Filter shell |
| Display-only short labels in review groups | Truncate stored `violationIssueType` | Never — distress match + export need full raw |
| Confirm gate in process path | Silent auto-map always | Violates locked decision: first time / format change must confirm |
| Nested under `BRIDGE_BRAIN_ROOT/city-formats/` | Separate microservice | Unnecessary process boundary; keep in-process with brain durability |
| Header-only `detectIntakeColumnMap` (status quo) | — | Known gap: first-match aliases pick wrong Type; value shapes required |
| `fuse.js` / `string-similarity` | Pure alias exact/contains + shape score | Only if many near-miss headers appear in production samples |
| Client-only column pick | Server score + confirm | Server owns processUpload truth; client only presents candidates + confirmation |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| TensorFlow / ONNX / transformers.js | Heavy, offline model ops, no labeled training set, overkill for header+shape | Weighted pure-JS feature score |
| OpenAI / Gemini for Type column pick | Latency, cost, non-determinism, needs network; hard to regression-lock | Deterministic scorer + admin confirm |
| New npm “schema mapping” SaaS (e.g. commercial data-prep) | Vendor lock, privacy (FOIA lists), extra process | In-repo heuristics + city format memory |
| React / Vite / SPA rewrite | Explicitly out of milestone; doubles UI surface | Vanilla wizard step in `bridge.js` |
| Express / Fastify | Shell is raw `http` + `bridge-api.js` | Extend existing handlers |
| Blending multiple Type columns | Locked anti-feature (wrong Train groups) | Single winner column only |
| Mutating export fields to short labels | Breaks distress keyword match + customer export fidelity | Separate display field (`displayLabel` / `shortLabel`) |
| Storing format memory in `global-brain.json` | Mixes layout memory with tag rules; harder caps/metrics | Dedicated city-format store file(s) |
| `string-similarity` / Levenshtein packages at start | Extra dep for marginal gain over alias lists already curated | Extend `INTAKE_FIELD_ALIASES` + shape features first |
| Client-side only fingerprint | Easy to bypass / desync from process path | Server computes fingerprint + enforces gate |
| ML fine-tune without admin gate | Out of product scope (PROJECT.md) | Confirm gate + reuse |

## Stack Patterns by Variant

**If spreadsheet upload (xlsx/csv/tsv) — primary path:**
- Parse with existing `xlsx` / text parsers → headers + sample rows
- Score all columns → winner + runner-up scores
- Fingerprint ordered normalized headers (and optional coarse value-type vector)
- Lookup city format store by `cityId` (or city+state key consistent with process context)
- Same fingerprint → inject last confirmed Type header into columnMap, skip confirm
- New/changed fingerprint → return candidates, require admin confirm before continuing process

**If PDF/DOCX/OCR (document path):**
- Headers are synthetic / sparse; scoring still runs but confidence often low
- Prefer confirm more often; do not invent a second ML OCR stack
- Promote-from-raw remains fallback when type empty

**If no Type column can be identified (all scores below threshold):**
- Do **not** drop rows as “no category”
- Keep approve/review path; type may stay empty → existing review groups + promote logic
- Confirm UI may allow “None / review without type”

**If multi-file batch (`processUploadBatch`):**
- Fingerprint **per file** (or per sheet); reuse only when fingerprint matches city store
- Do not assume all batch files share one Type column name without checking fingerprint

## Integration Map (where stack attaches)

```
parse (existing)
  → scoreTypeColumns(headers, sampleRows)     [NEW pure module]
  → fingerprint(headers[, sampleShapes])      [NEW pure module]
  → cityFormatStore.lookup(cityKey, fp)       [NEW store]
       ├─ hit  → columnMap.violationIssueType = confirmedHeader
       └─ miss → API returns candidates; client confirm → store.save → re-process/continue
  → enhanceColumnMap / mapRawRow / promoteCategoryFromRaw (existing)
  → tag / brain / review groups
       → shortDisplayLabel(fullText) on group cards only [NEW pure helper]
```

| Concern | Integration point | Stack choice |
|---------|-------------------|--------------|
| Winner Type column | Replace/augment `detectIntakeColumnMap` Type pick inside `enhanceColumnMap` or pre-step | Pure scorer module |
| Format memory | New JSON under volume-safe root (mirror brain durability) | `fs` + atomic write |
| Confirm gate | `bridge-api` + `processUpload` response codes / two-step process | HTTP JSON only |
| Short labels | `buildReviewGroups` + Train render | Display field only |
| Tests | `tests/bridge-type-column-score.test.js`, format-store, display-label | `node --test` |

### Scoring feature stack (no external libs)

Implement as plain functions (opinionated defaults for roadmap):

| Feature family | Source | Notes |
|----------------|--------|-------|
| Header alias score | `INTAKE_FIELD_ALIASES.violationIssueType` + `CATEGORY_HEADER_RE` | Longer alias wins; exclude narrative headers via `NARRATIVE_HEADER_RE` |
| Anti-features | Date / address / zip / pure numeric id shapes | Prevent “Violation Date” / “Case Number” false winners |
| Value shape | Sample N rows (e.g. 50–200): median length, uniqueness ratio, alpha ratio, timestamp-only rate | Prefer short categorical labels over long narratives |
| Single winner | `argmax(score)`; optional margin vs #2 for auto-confidence | Never blend columns |
| Threshold | If best < min or margin tiny → “unknown type column” path | Feeds confirm / no silent discard |

### Fingerprint stack

| Piece | Recommendation |
|-------|----------------|
| Identity | `sha1` (or `sha256`) of canonical string: `normalizeHeader(h).join('\u0001')` |
| Optional | Append coarse per-column shape codes (`A`=address-like, `D`=date-like, `C`=categorical, `N`=narrative, `I`=id) for format-change sensitivity without full data hash |
| Do not | Hash full cell values (PII, volatility) |
| City key | Stable `cityId` from Form Forge when present; else normalized `city|state` string used by process context |

### Display short-label stack

| Piece | Recommendation |
|-------|----------------|
| Input | Full `violationIssueType` or group `violationTypeLabel` (already timestamp-stripped for groups) |
| Output | `displayLabel` / `shortLabel` ≤ ~40–60 chars (product-tunable constant) |
| Method | Prefer first clause / before `;` `|` ` - ` / ordinance code prefix; ellipsis only if needed |
| Storage | **Not** written into export row type; optional on group DTO only |
| Matching | Distress tagger + brain `violationTypeKey` continue on **full** raw/stable text |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node 20+ | All new pure modules | Use only APIs available in Node 20 (no experimental) |
| `xlsx@0.18.5` | Scoring samples | Read headers/rows only; scorer is parser-agnostic |
| Existing `bridge-intake-schema` exports | Scorer imports aliases/normalizeHeader | Prefer import over duplicating alias lists |
| `BRIDGE_BRAIN_ROOT` volume layout | City format files beside or under same volume parent | Railway: nest under `PDA_DATA_ROOT` like brain/lists |
| `node --test` | Fixture-driven pure functions | Keep modules pure for easy unit tests without HTTP |

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Zero new deps | HIGH | Verified against current `package.json` and codebase STACK; features are string/hash/IO |
| Integration points | HIGH | Read `normalizer.js`, `processUpload`, brain-store, review-groups |
| Scoring algorithm details | MEDIUM | Feature weights are product-tunable; stack does not require external lib |
| Persist path name | MEDIUM | Recommend volume-safe root; exact env var name is implementation choice |

## Sources

- Local codebase: `package.json` (deps: xlsx, mammoth, pdf-parse, tesseract.js only)
- Local: `.planning/codebase/STACK.md` (2026-07-09) — shell/Filter topology
- Local: `lib/bridge-intake-schema.js` — `detectIntakeColumnMap`, aliases
- Local: `lib/bridge-category-promote.js` — category-like / narrative regex
- Local: `lib/bridge-engine/normalizer.js`, `lib/bridge-engine/index.js` — process path
- Local: `lib/bridge-brain-store.js` — atomic JSON + volume root pattern
- Local: `lib/bridge-review-groups.js`, `lib/bridge-stable-text.js` — labels + crypto hash precedent
- Local: `.planning/PROJECT.md` — v1.8 locked decisions (single winner, confirm gate, display-only labels)
- Node.js docs — built-in `crypto.createHash`, `fs` (runtime standard; HIGH confidence)

---

*Stack research for: Distress OS Filter — Type Column Intelligence (v1.8)*  
*Researched: 2026-07-09*  
*Recommendation: pure JS heuristics + existing bridge stack; zero new npm packages*
