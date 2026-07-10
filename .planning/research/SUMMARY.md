# Project Research Summary

**Project:** Distress OS — Filter / Data Bridge  
**Domain:** Type Column Intelligence (v1.8) — smart Violation Type column detection, per-city sheet format memory + confirm gate, display-only short labels  
**Researched:** 2026-07-09  
**Confidence:** HIGH

## Executive Summary

Distress OS Filter (Data Bridge) is a city-spreadsheet import pipeline that maps FOIA/municipal exports into Trainable violation rows and a global Filter brain. Experts build this class of product as **deterministic column scoring + human confirm on schema change + template memory** — the Flatfile/OneSchema pattern — not as ML classifiers or silent first-match aliases. v1.8 is a subsequent milestone on a shipped pipeline (v1.6 brain, v1.7 promote + stable groups); it closes the gap where `detectIntakeColumnMap` picks the wrong Type column by first alias match, poisoning Train groups and durable type rules.

**Recommended approach: zero new npm packages.** Implement pure CommonJS modules under `lib/` — type-column scorer, format fingerprint + per-city store, display short-label helper — wired into existing `processUpload` / normalizer / Train UI. Type resolution precedence is locked: **confirmed city map → scorer winner → alias map → promote-when-empty fallback → empty type kept for review**. Confirm gate sits **after parse + score, before normalize**; same fingerprint reuses last confirmed header without modal. Short labels are a parallel display field only — never mutate `violationIssueType`, export, brain keys, or group keys.

**Key risks:** (1) wrong column still wins under alias-first if scorer is “hint only,” (2) confirm hangs non-admins or every upload, (3) fingerprint too strict (fatigue) or too loose (silent wrong Type), (4) short labels written into stored type / decision DOM scrape, (5) promote vs scorer mixed winners mid-file. Mitigate by forcing scorer/confirm into `columnMap`, two-step score→confirm→process with admin-only persist, order-independent header fingerprints + light shape signature, display-only `shortLabel` with full text in decision payloads, and an explicit resolution order with v1.7 MAP regression locks.

## Key Findings

### Recommended Stack

Full detail: [STACK.md](./STACK.md)

**Verdict: add zero npm packages.** Scoring, fingerprinting, confirm gate, and short labels are pure JS on the existing Node 20+ CommonJS bridge stack (`xlsx` already parses sheets; `crypto`/`fs` already used for hashes and atomic JSON).

**Core technologies:**
- **Node.js 20+ / CommonJS** — in-process Filter pipeline; matches every `lib/bridge-*.js` module  
- **Pure modules** (`bridge-type-column-score`, `bridge-format-fingerprint` / city-format-store, `bridge-display-label` / short-label) — domain heuristics; no schema-SaaS or ML  
- **Node `crypto` + atomic JSON** — format fingerprints (SHA-1 style) + volume-safe city format memory (mirror `bridge-brain-store`)  
- **Vanilla `public/js/bridge.js` / `bridge-train.js`** — confirm wizard step + Train titles; no React  
- **`node --test`** — fixture locks for wrong-column, reuse, labels  

**Do not use:** TensorFlow/embeddings, LLM column pick, Express, React rewrite, multi-column blend, storing format memory in `global-brain.json`, mutating export type to short labels.

### Expected Features

Full detail: [FEATURES.md](./FEATURES.md)

**Must have (table stakes — P1):**
- **COL-score** — Score every column (header aliases + value shapes); pick **one** Type winner (never blend)  
- **COL-confirm** — Admin confirms Type column on first city format or fingerprint change  
- **COL-reuse** — Same fingerprint reuses last confirmed Type column (zero modal)  
- **COL-unresolved** — No identifiable Type → keep rows for review (no silent drop)  
- **LBL-display** — Display-only short labels in Train/groups; full raw for match + export + brain  
- **TEST-lock** — Automated cases: wrong alias beaten by shape; format reuse; short label ≠ stored mutation  

**Should have (competitive — P2):**
- Sample strip + ranked candidates + score rationale in confirm UI  
- `processingMeta` Type confidence / source (`auto_reuse` | `admin_confirm` | `unresolved`)  
- Admin “forget this city’s format mapping” (explicit only)  
- Close-score runner-up / tie-break UI; batch multi-file fingerprint policy polish  

**Defer (v2+ / anti):**
- Learned header synonyms / ML embeddings classifier  
- Multi-column blend, paraphrase stored type, short labels as group keys  
- Confirm every upload; per-user Type maps; silent drop when no Type  

### Architecture Approach

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md)

v1.8 plugs three pure concerns into known seams — **not** a new product surface. Gate after parse+score, before `normalizeRawRows` / tag / brain / groups so Train never learns from a wrong Type column.

**Major components:**
1. **Type column scorer** (`lib/bridge-type-column-score.js`) — rank headers by alias + value-shape samples; single winner or null  
2. **City format store** (`lib/bridge-city-format-store.js`) — per-cityId + uploadType fingerprint + confirmed header; volume-safe root separate from brain  
3. **Confirm gate** (`processUpload` early branch + API) — `TYPE_COLUMN_CONFIRM_REQUIRED` when new/changed format; resume with `confirmedTypeHeader` (re-upload preferred for v1.8)  
4. **Column map resolver** (normalizer) — force `columnMap.violationIssueType`; aliases become scorer features, not parallel winners  
5. **Short label helper** (`lib/bridge-short-label.js`) — `shortLabel` on review groups only; keys/export/brain stay full  

**Type resolution precedence (locked):**
1. Confirmed / reused city map for matching fingerprint  
2. Scorer top candidate (≥ threshold / margin)  
3. Alias-only `detectIntakeColumnMap`  
4. `promoteCategoryFromRaw` if still empty (v1.7 safety net)  
5. Empty type → keep for review  

### Critical Pitfalls

Full detail: [PITFALLS.md](./PITFALLS.md)

1. **Wrong column wins → brain poison** — Score headers **and** value shapes; demote narrative/date/address; force map from scorer/confirm; fixture-lock Status/Description/Date must not win  
2. **Confirm blocks non-admin / hangs process** — Split score → admin-only confirm write → process; same-format reuse without confirm; no infinite server wait  
3. **Fingerprint too strict or too loose** — Order-independent normalized header multiset + light shape signature; never full-file hash; per-file fingerprints in batch  
4. **Short labels replace stored type** — Parallel display field only; decision POST uses full `violationTypeLabel` from group metadata, not truncated DOM title  
5. **Promote vs scorer conflict** — Single resolution order; scorer/confirm marks headers used; promote only when type still empty and scorer claimed none  
6. **Alias-first still under scorer** — Do not ship scorer as UI hint; e2e must assert `columnMap.violationIssueType` equals scorer/confirm choice  
7. **Silent drop when no Type** — Never add `no_type_column` discard; empty type + description grouping remains valid  

## Implications for Roadmap

Based on research, suggested phase structure for **v1.8**, phase numbers continuing from **51** (v1.7 ended at 50):

### Phase 51: COL Scoring + Map Wire
**Rationale:** Correct Type selection is the foundation — do not persist or confirm garbage. Scorer must beat alias-first before any format memory ships. Wire into normalizer so behavior changes on process path, not only in pure unit tests.  
**Delivers:** `lib/bridge-type-column-score.js`; resolver forces single `columnMap.violationIssueType`; value-shape demotes narrative/date/address; promote remains empty-type fallback only; unit fixtures for wrong-column winners.  
**Addresses:** COL-score, COL-unresolved (no drop path), promote coexistence (FEATURES P1)  
**Avoids:** Pitfalls 1 (wrong column), 5 (silent drop), 6 (promote conflict), 8 (alias-first under scorer)  
**Stack:** Pure scorer module; import aliases/`normalizeHeader` from intake-schema; sample N rows only  

### Phase 52: Format Memory + Confirm Gate
**Rationale:** After scorer produces ranked candidates, persist per-city fingerprint + confirmed header and gate process before normalize. Store can be built in parallel with late Phase 51 but gate depends on both scorer output and store.  
**Delivers:** `lib/bridge-city-format-store.js` + `BRIDGE_CITY_FORMATS_ROOT`; fingerprint (normalized headers, order-independent); process early-return `TYPE_COLUMN_CONFIRM_REQUIRED`; resume with `confirmedTypeHeader`; admin-only persist; same-format auto-reuse; API + confirm modal in `bridge.js`; multi-file per-fingerprint policy.  
**Addresses:** COL-confirm, COL-reuse (FEATURES P1); sample strip / suggested column (P2 baseline UX)  
**Avoids:** Pitfalls 2 (confirm hang/non-admin), 3 (fingerprint strict/loose), 7 (batch format variance)  
**Architecture:** Gate after parse+score, before normalize; re-upload-on-confirm preferred for v1.8  

### Phase 53: LBL Display-Only Short Labels
**Rationale:** Orthogonal to COL path; needs correct type/description on groups to be valuable but can ship after map quality exists. Lowest risk if display-only contract is enforced early with tests.  
**Delivers:** `lib/bridge-short-label.js`; `shortLabel` on review groups; Train card titles use short label; expand/tooltip/detail show full; export + brain keys + decision payloads remain full text.  
**Addresses:** LBL-display (FEATURES P1)  
**Avoids:** Pitfall 4 (short labels replace stored type); short-label-as-group-key anti-feature  
**Stack:** Cheap first-clause / max-length heuristics; reuse `bridge-stable-text` strip — no LLM  

### Phase 54: TEST Regression Lock + Ship Hardening
**Rationale:** Integration locks prevent “looks done but isn’t” — pure scorer green while processUpload still alias-first is the failure mode called out across all four research files.  
**Delivers:** processUpload e2e locks (wrong-column map, format reuse, confirm pause, shortLabel display-only, promote MAP-01–03 still green, no-type kept for review, water shut-off not regressed); batch divergent-fingerprint case; `npm test` + `scripts/verify-live.ps1` green after UI wire.  
**Addresses:** TEST-lock (FEATURES P1); processingMeta confidence source if cheap (P2)  
**Avoids:** Entire “Looks Done But Isn't” checklist from PITFALLS  

### Phase Ordering Rationale

- **Score before confirm/persist** — confirming a bad suggestion trains ops to rubber-stamp garbage maps.  
- **Store + gate before short labels** — labels need stable correct groups; COL poison makes LBL polish theater.  
- **Wire scorer into normalizer in Phase 51** — architecture and pitfalls both flag “hint only” as the primary ship-fail mode.  
- **TEST last** — locks integration across scorer, store, gate, labels, promote, batch.  
- **Group confirm UI with server gate (52)** — client modal without server refuse is not a gate.  
- **No ML, no React, no brain-file mixing** — locked stack and anti-features across research.  

### Research Flags

Phases likely needing deeper research during planning (`/gsd:research-phase`):
- **Phase 51:** Scoring weights, thresholds, sample size N, margin vs #2 — heuristics are MEDIUM confidence until unit matrix  
- **Phase 52:** HTTP shape (409 vs soft flag), non-admin policy when format is new, batch pause-whole vs per-file, fingerprint version + soft-match on Type-column shape  

Phases with standard patterns (skip deep research-phase; implement from research):
- **Phase 53:** Display truncate / first-clause short labels — well-trodden; mirror v1.7 SHAPE “don’t mutate stored fields”  
- **Phase 54:** `node --test` + processUpload e2e patterns already established in v1.6/v1.7  

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against `package.json` and existing bridge modules; zero-deps recommendation solid |
| Features | HIGH | Locked PROJECT.md decisions + codebase gaps; industry confirm/template norms MEDIUM |
| Architecture | HIGH | Integration seams verified in processUpload/normalizer/API; scoring weight details MEDIUM |
| Pitfalls | HIGH | Pipeline interactions from code + v1.6/v1.7 post-mortems; fingerprint tradeoffs MEDIUM until implemented |

**Overall confidence:** HIGH

### Gaps to Address

- **Score weights / min threshold / sample N** — tune in Phase 51 with fixture matrix from real-ish city headers; do not block roadmap  
- **HTTP status for confirm gate** — research recommends **409** `TYPE_COLUMN_CONFIRM_REQUIRED`; confirm in requirements  
- **Non-admin on new format** — prefer pause for all + admin-only persist (architecture opinion); product copy in REQUIREMENTS  
- **Batch multi-file mixed fingerprints** — prefer confirm per distinct fingerprint or explicit `FORMAT_MISMATCH` / partial `fileFailures`; specify in Phase 52  
- **Fingerprint: sheet name / multi-sheet Excel** — optional; start with normalized header multiset  
- **Exact env path name** — `BRIDGE_CITY_FORMATS_ROOT` vs nest under brain volume parent; implementation choice, volume-safe required  
- **Re-upload vs server parse staging on confirm** — re-upload preferred for v1.8 simplicity  

## Sources

### Primary (HIGH confidence)
- Local codebase: `lib/bridge-intake-schema.js`, `lib/bridge-category-promote.js`, `lib/bridge-engine/normalizer.js`, `lib/bridge-engine/index.js`, `lib/bridge-api.js`, `lib/bridge-brain-store.js`, `lib/bridge-review-groups.js`, `lib/bridge-stable-text.js`, `public/js/bridge.js`, `public/js/bridge-train.js`  
- `.planning/PROJECT.md` — v1.8 locked decisions (single winner, confirm gate, reuse, display-only labels, no silent drop)  
- `.planning/milestones/v1.7-REQUIREMENTS.md` — MAP/GROUP contracts that must not regress  
- `.planning/debug/filter-singleton-no-category.md` — wrong/empty type → Train failure modes  
- Parallel research: [STACK.md](./STACK.md), [FEATURES.md](./FEATURES.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [PITFALLS.md](./PITFALLS.md)  

### Secondary (MEDIUM confidence)
- Import-platform UX norms (Flatfile / OneSchema-class template memory + human confirm on schema change)  
- Fingerprint strictness/looseness tradeoffs (no implementation yet; opinionated from multi-file city export variance)  
- Scoring feature weights (product-tunable; need Phase 51 unit matrix)  

### Tertiary (LOW confidence)
- None blocking roadmap — deferred items (ML classifier, learned synonyms) explicitly out of v1.8  

---
*Research completed: 2026-07-09*  
*Ready for roadmap: yes*  
*Suggested phases: 51 COL Scoring → 52 Format Memory + Confirm → 53 Short Labels → 54 TEST Lock*
