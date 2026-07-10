# Project Research Summary

**Project:** Distress OS — Filter Independence & Learning (v2.0)
**Domain:** Municipal FOIA list factory — Filter staging + HITL brain learning (subsequent milestone on shipped v1.6–v1.8 pipeline)
**Researched:** 2026-07-10
**Confidence:** HIGH

## Executive Summary

v2.0 makes Filter a **standalone list factory**: process city files → admin Train when needed → save multi-city lists → download for external enrich/skip-trace → **manual** Analyze import. It is not greenfield. Process already omits Analyze push; multi-list store, Type column gate, and global HITL brain all shipped. The real work is locking independence (including the residual `already_imported` hard-drop), elevating Save/Download as the hero path, fixing residual heterogeneous-city accuracy so Train is not thrashing, and instrumenting a learning bar so Approve/Deny volume falls for the right reason.

**Recommended approach: add zero npm packages.** Delete/quarantine dead push surfaces, extend pure CommonJS modules + atomic JSON stores, harden the existing brain loop. Phase order is opinionated and non-negotiable: **independence first** (so later work cannot re-couple), **list factory UX second** (destination for leads), **accuracy before learning strength** (bad Type/groups poison global rules), **learning metrics before pure perf**, **QA lock last**.

**Key risks:** (1) independence that only removes push while `already_imported` still silently empties re-work lists; (2) accuracy PRs that “clean” kept counts by silent-dropping leads; (3) learning KPI gamed by hiding Train groups instead of better rules; (4) Train-then-Save seam so downloads miss admin decisions. Mitigate with product default for import-filter, gold fixtures before keep/kill changes, paired learning metrics (decision ↓ **and** precision not ↓), and guided Process → Train → Save workflow.

## Key Findings

### Recommended Stack

**Add zero runtime dependencies.** All three capability areas (independence, multi-list staging, accuracy/learning) ship by retiring residual Analyze-push coupling, extending existing pure JS modules, and hardening the HITL brain already in `lib/bridge-brain-*`. Only re-evaluate a library after measured failure of pure heuristics on a curated multi-city fixture set.

Full detail: [STACK.md](./STACK.md)

**Core technologies:**
- **Node.js 20+ / CommonJS** — in-process Filter under `server.js`; every `lib/bridge-*.js` module is CJS; no TS/build step
- **Vanilla browser JS** — Filter UI in `public/js/bridge.js` + Train in `bridge-train.js`; no React rewrite
- **Node `http` + `fs` + atomic JSON** — `/api/bridge/*` via `bridge-api.js`; lists/brain/formats volume-safe on Railway
- **`xlsx@0.18.5` (locked)** — parse + list export; do not swap engines mid-milestone
- **`node --test`** — independence + learning + processUpload regression locks (~460 tests after v1.8)
- **HITL hybrid only** — type rules live on decision; phrases proposed-only until admin activate; no ML/LLM stack

**Optional pure modules (create only if phase proves need):** `bridge-learning-metrics.js`, `bridge-type-synonyms.js`, `bridge-tag-policy.js` — no install.

### Expected Features

Not greenfield MVP — **milestone-minimum** for independence + learning bar. Full detail: [FEATURES.md](./FEATURES.md)

**Must have (table stakes / P1):**
- **No automatic Filter → Analyze push** — process/UI/API never write Analyze; lock tests; retire/quarantine `bridge-analyzer-push.js`
- **Explicit Save list + multi-city persist** — lists accumulate until operator deletes; never wipe on process/restart/deploy
- **Per-list download (CSV/XLSX) + download-all** — external enrich handoff; freeze export contract
- **Independence messaging** — “Download → enrich outside → manual Analyze import”
- **Heterogeneous city process still works** — Type scorer + format gate + keep/kill + Train groups (accuracy pass)
- **Admin Train after process, before save** — learning remains primary accuracy path; customer path has no Train chrome
- **Regression: process never invents Analyze session writes**

**Should have (differentiators / P1–P2):**
- **Global HITL brain that reduces future Approve/Deny volume** — measured decline + rule hit rates
- **Learning health surface (admin)** — decisions-per-process, auto-applied hits, new-type vs known-type ratio
- **Cross-city rule reuse visible in meta/metrics**
- **Operator-time efficiency** — format reuse, stacked Train, bulk download (peer with runtime, not tradeoff)
- **Optional clarity on `alreadyImported`** — product default decision (research recommends off/opt-in)

**Defer (after v2.0 / never):**
- Richer time-series learning dashboard, list tags/folders, server-side sessions
- Skip-trace inside Filter, auto-push / “Send to Analyze”, per-user brains, Type blend, unsupervised ML live rules

**Requirement buckets for REQUIREMENTS.md:** IND · LIST · ACC · LRN · EFF · TEST

### Architecture Approach

v2.0 re-centers existing seams as a **standalone list factory** with an **in-Filter learning loop**. No new service boundary, shared DB, or top-level product folder. Process may **read** Analyze address index for de-dupe (soft coupling); process/save/Train must never **write** Analyze. Working set is single client `lastResult`; durability is only via multi-list store under `FILTER_LISTS_ROOT`.

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md)

**Major components:**
1. **`handleProcess` / `processUpload`** — parse → type gate → tag → import-filter (read) → brain apply → keep/kill → review groups; **no push**
2. **List store + lists API** — user-scoped multi-list CRUD, download, download-all, clear; primary product sink
3. **Filter UI (`bridge.js`)** — process results, Train, Save/Download CTAs, multi-list panel; working-set hygiene
4. **Brain stack** — store / apply / decisions / phrase miner; global rules; learning bar metrics
5. **Type column + city format memory** — v1.8 carry-forward; accuracy touch only if residual failures
6. **Analyzer push adapter** — **delete or quarantine**; not on process path
7. **Form Forge attach** — keep; independent of Analyze (city KPI only)

**Key patterns:** Independence write-ban · Ephemeral working set → durable lists · Brain apply before distress filter · Decision path mutates brain + client lists only (not list store, not Analyze) · Pure helper + thin engine wire

### Critical Pitfalls

Full detail: [PITFALLS.md](./PITFALLS.md). Top risks for roadmap:

1. **`already_imported` still hard-drops after independence** — purge/re-work workflows empty silently. **Avoid:** treat cross-ref as opt-in or soft-flag; prefer **off by default** for list factory; never leave “as is” without product decision in Independence phase.
2. **Re-introducing auto-push** — dead module still in tree; docs/agents may “restore” it. **Avoid:** quarantine/delete; negative tests that process/save never require push or hit bridge-import-records.
3. **Train decisions never land on saved list** — Save-before-Train or process-next-city without save loses trained rows. **Avoid:** Process → Train → Save pipeline; dirty/unsaved guards; optional warn on open Train groups.
4. **“Accuracy” that silently drops leads** — cleaner kept counts, real distress gone. **Avoid:** gold fixtures first; wrong keeps → Deny suppress; wrong drops → FN → promote; never auto-activate phrases.
5. **Brain poison from wrong Type vocabulary** — one bad Train session is product-wide. **Avoid:** preserve v1.8 locks; gate Train on trusted `typeResolution`; phrases proposed-only.
6. **Learning metric gamed** — fewer clicks ≠ better accuracy. **Avoid:** paired metrics (decision ↓ **and** precision/recall not ↓ on gold); never hide groups as “learning.”

## Implications for Roadmap

Phase numbering continues from **55**. Dependency rule: **decouple push + import hard-drop decision before list UX; accuracy/learning must not reintroduce Analyze writes.**

### Phase 55: Independence Lock
**Rationale:** Product definition of done for v2.0. Prevents every later phase from “temporarily” calling push or treating Analyze as the Filter sink. Must also decide `already_imported` default — push-only cleanup is incomplete independence.
**Delivers:** Process/save/Train write-isolated from Analyze; push module deleted or quarantined; UI/docs teach download → external enrich → manual import; export contract frozen; regression negative tests.
**Addresses:** IND table stakes; no-push anti-feature lock; export/enrich schema stability
**Avoids:** Pitfalls 1, 2, 7, 9 (import hard-drop, push resurrection, export drift, stale index)
**Stack:** Code delete + tests only — no new packages

### Phase 56: List Factory UX
**Rationale:** Store/API already exist; gap is workflow elevation. Operators need Save/Download as hero path and multi-city staging that cannot clobber unsaved work. Do this before deep accuracy so operators can stage correct-enough lists immediately.
**Delivers:** Multi-list Save → accumulate → download one/all as primary path; working-set hygiene (`processed_unsaved` vs saved vs downloaded); Process → Train → Save guidance; dirty-guard / optional draft; clear-all strong confirm only.
**Addresses:** LIST table stakes; multi-list differentiator polish; Train→Save seam
**Avoids:** Pitfalls 3, 8 (Train ≠ saved list; single-slot staging)
**Uses:** `bridge-list-store`, lists API, `bridge.js` / `bridge.html` CTAs — extend, don’t rewrite store

### Phase 57: Accuracy Structure Pass
**Rationale:** Wrong Type/groups poison global brain. Fix keep/kill, Type/format residual, Train grouping, and brain-apply structure **with gold fixtures** before strengthening learning automation. Implement, not audit-only.
**Delivers:** Residual heterogeneous-city failure modes fixed; gold distress kept + permit FN fixtures green; v1.8 locks preserved (no Type blend, no silent drop, empty-only promote, short labels display-only); water early-return intact.
**Addresses:** ACC accuracy pass; protects learning quality
**Avoids:** Pitfalls 4, 5, 10, 12 (silent drop, Type poison, water regression, batch schema blend)
**Implements:** tagger, review-groups, type scorer/format touch only if needed, engine accuracy hooks

### Phase 58: Learning Loop Strength
**Rationale:** Success bar is fewer **necessary** Approve/Deny actions because rules fire correctly — not fewer buttons. Instrument before “smart” automation. Depends on Phase 57 so training targets good groups/types.
**Delivers:** Decision → rule → apply coverage improved; learning health metrics (decisions-per-process, rule hits, trendable counters); phrase mining quality without auto-activate; admin can see brain getting smarter.
**Addresses:** LRN learning bar; cross-city reuse visibility
**Avoids:** Pitfall 6 (gamed metrics); Pitfall 11 if touching decisions (payload/409)
**Uses:** `bridge-brain-store/apply/decisions`, phrase-miner; optional `bridge-learning-metrics.js`

### Phase 59: Efficiency
**Rationale:** Operator time, process runtime, and cross-city reuse are peer goals — only meaningful after accuracy freezes and learning path is trustworthy. Do not “efficiency” away Type confirm or hard-drop accuracy.
**Delivers:** Shorter time-to-saved-list (format reuse, stacked Train, bulk download polish); process duration improvements only where profiled; no single-dimension tradeoff that tanks accuracy or reuse.
**Addresses:** EFF efficiency peer metrics
**Avoids:** Optimizing confirm/fingerprint into rubber-stamp or wrong-type reuse
**Depends on:** 57–58 for meaningful “reuse” claims

### Phase 60: Integration QA / Regression Lock
**Rationale:** Independence invariants must be permanent. Full suite + processUpload e2e + no-push require + water + export contract + verify-live.
**Delivers:** Green `npm test`; independence + multi-list + accuracy gold + learning metric locks; `scripts/verify-live.ps1` green after any `public/` touch.
**Addresses:** TEST regression suite
**Avoids:** All pitfalls reintroduced by later PRs; Agents.md data wipe

### Phase Ordering Rationale

- **Independence first** — product boundary; stops re-coupling and forces `already_imported` product call while context is fresh
- **Lists second** — destination for leads; store exists; UX is the gap; Train→Save seam is workflow not algorithm
- **Accuracy before learning strength** — bad groups/types → durable global poison; gold fixtures before keep/kill changes
- **Learning before pure perf** — success metric is fewer Approve/Deny actions; runtime secondary
- **QA last** — regression suite must include independence forever
- **Grouping** matches architecture seams (API lock → list UX → engine/tagger → brain → perf → test), not feature laundry lists

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 55:** Product default for `already_imported` (off / opt-in / soft-flag) — research recommends off/opt-in; confirm in requirements. Inventory all push references (docs, GSD-AUDIT, tests).
- **Phase 56:** Whether dirty-guard / “Save & next city” / draft autosave needs brief UX research (not architecture rewrite).
- **Phase 57:** Residual accuracy bugs on real city fixtures — **needs `/gsd:research-phase` with sample files** (tagger FPs, singleton noise, format edge cases).
- **Phase 58:** Concrete learning metrics formula (events per N processes vs absolute count; rule-hit schema) — medium research.
- **Phase 59:** Profile processUpload only after accuracy freezes — skip early research.

Phases with standard patterns (skip research-phase):
- **Phase 55 (mechanical half):** Push quarantine + negative tests — well-documented as-built path
- **Phase 56 (store half):** List store CRUD already complete — polish only
- **Phase 60:** Established test + verify-live patterns from v1.6–v1.8

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Process no-push verified; list store complete; brain HITL shipped; zero-dep pattern proven v1.7–v1.8 |
| Features | HIGH | Table stakes map to code + product locks; residual accuracy sizing MEDIUM until fixtures |
| Architecture | HIGH | As-built seams verified in `lib/` + `bridge.js`; UX gap vs greenfield is MEDIUM only on polish size |
| Pitfalls | HIGH | Coupling / Train seam / Type poison from live code; `already_imported` default MEDIUM (product call) |

**Overall confidence:** HIGH

### Gaps to Address

- **`already_imported` default under full independence** — Architecture “keep soft read”; Pitfalls “off/opt-in preferred.” **Resolve in requirements Phase 55 scope** before implement. Recommendation: **opt-in or off by default** for code_violation list factory; soft-flag alternative acceptable.
- **Exact residual accuracy bugs** — needs phase research with real heterogeneous city fixtures (not invent at roadmap).
- **Learning metrics formula** — define paired success bar in requirements (decision volume + precision proxy/gold).
- **Performance budget** for large multi-file batches — profile in Phase 59 only if operator pain.
- **Whether load-saved-list-into-Train** is in scope — longer-term; document “Train only on live process” unless product wants re-work.
- **Phase count 55–60** — may compress 59/60 if efficiency is light polish after accuracy/learning.

## Sources

### Primary (HIGH confidence)
- Codebase (2026-07-10): `lib/bridge-api.js`, `lib/bridge-engine/index.js`, `lib/bridge-list-store.js`, `lib/bridge-analyzer-push.js`, `lib/bridge-brain-*.js`, `lib/bridge-type-column-score.js`, `lib/bridge-city-format-store.js`, `public/js/bridge.js`, `public/bridge.html`
- Product locks: `.planning/PROJECT.md`, `.planning/STATE.md` — v2.0 goals, no auto-push, learning bar, phases from 55
- Shipped milestones: v1.6 brain/Train/decisions, v1.7 groups/promote, v1.8 Type column + format gate
- Docs: `docs/bridge/API.md`, `docs/bridge/DATA-STANDARDS.md` — Filter-only process; no auto-push
- Design: `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — HITL D6–D8
- Agents.md — never wipe `filter-lists` / brain volumes
- Research files: [STACK.md](./STACK.md), [FEATURES.md](./FEATURES.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [PITFALLS.md](./PITFALLS.md)

### Secondary (MEDIUM confidence)
- Industry workflow patterns: import confirm gates (Flatfile/OneSchema-class), HITL labeling loops, external enrichment before CRM ingest
- Suggested phase IDs 55–60 — roadmap may compress
- Fuzzy/ML re-evaluation threshold — only after measured multi-city fixture failure

### Tertiary (LOW confidence)
- None material — domain is in-repo, not speculative SaaS greenfield

---
*Research completed: 2026-07-10*
*Ready for roadmap: yes*
*Milestone: v2.0 Filter Independence & Learning*
