# Filter Desk Cinema (v2.2) Implementation Plan

> **For agentic workers:** Execute phases 69–73 sequentially on shared Filter surface files. Do not parallelize HTML/CSS/JS edits across agents.

**Goal:** Make `/bridge` feel like Collect/Command ops cinema — one scrub desk, live mission board, ops type chips, post-scrub mission hierarchy, war-room victory end — not a multi-step form wizard.

**Architecture:** Frontend-only upgrades on `public/bridge.html`, `public/css/bridge.css`, `public/js/bridge.js`. Preserve process engine, save/lists API, Train/Brain admin gates, Analyze independence. Static contract tests under `tests/bridge-desk-cinema.test.js`.

**Tech Stack:** Vanilla HTML/CSS/JS, existing Phuglee tokens, Node test runner (`node --test`).

## Global Constraints

- **Surface:** `/bridge` only; no Analyze auto-push; no wipe of `data/filter-lists` or brain.
- **Buttons:** `phuglee-btn` primary vocabulary.
- **Motion:** honor `prefers-reduced-motion`.
- **Independence:** no “Send/Push to Analyze” CTAs.
- **Server:** after edits, `scripts\verify-live.ps1` must pass.
- **Cache bust:** bump `bridge.css?v=` and `bridge.js?v=` on ship.

## Files

| File | Role |
|------|------|
| `public/bridge.html` | Structure: desk stage, mission board, type chips, mission results, victory strip |
| `public/css/bridge.css` | Hierarchy, chips, mission board, collapsible table, victory HUD |
| `public/js/bridge.js` | Reveal rules, idle mission, results hierarchy, post-save victory |
| `tests/bridge-desk-cinema.test.js` | Static locks for all 5 upgrades |
| `.planning/ROADMAP.md` + `STATE.md` | Milestone tracking |

---

## Phase 69 — One Scrub Desk (collapse wizard)

**Goal:** City + type + dropzone live as one dominant stage; pipeline demoted to slim progress.

### Tasks

- [ ] **69.1** Wrap city / type / upload into single visual stage shell in HTML (`bridge-scrub-stage`).
- [ ] **69.2** Demote pipeline: compact class `bridge-pipeline--slim`; optional hide labels on mobile.
- [ ] **69.3** JS: when city selected, reveal **type + upload together** (upload no longer waits for type pick). Process still requires type + files + date.
- [ ] **69.4** CSS: single elevated stage; remove equal “chapter” panel rhythm between steps.
- [ ] **69.5** Keep IDs used by tests: `bridge-dropzone`, `bridge-process`, `bridge-type-panel`, `bridge-upload-panel`, `bridge-state`, `bridge-city`.

**Done when:** First paint after city pick shows desk with dropzone; type is meta, not a separate chapter page.

---

## Phase 70 — Idle Mission Board

**Goal:** Idle strip becomes multi-facet mission board from `savedLists` (no new API).

### Tasks

- [ ] **70.1** Expand `#bridge-idle-proof` markup: title + facets (staged, records, last save, cities this inventory).
- [ ] **70.2** Extend `computeIdleProof` / `renderIdleProof` for multi-line / multi-facet render.
- [ ] **70.3** Empty state: “0 lists staged · Drop a clerk file when ready” + still live after lists load.
- [ ] **70.4** CSS: HUD strip matching inventory heat, not a thin admin status line.

**Done when:** Landing with lists shows board energy; empty is honest ops copy.

---

## Phase 71 — Type chips (kill peer cards)

**Goal:** CV / WS as segmented ops chips — no essay feature cards.

### Tasks

- [ ] **71.1** Replace `.bridge-type-grid` cards with `role="radiogroup"` chip row (same radio names/values).
- [ ] **71.2** CSS: selected chip gold/orange border; no icon+desc feature card layout.
- [ ] **71.3** Short labels only: “Code violation” / “Water shut-off”.
- [ ] **71.4** Preserve `input[name="bridge-upload-type"]` handlers.

**Done when:** No dual essay cards; type is a label control.

---

## Phase 72 — Post-scrub mission surface

**Goal:** Kill report + Stage CTA dominate; table secondary; train/rules deep; attach scrap.

### Tasks

- [ ] **72.1** HTML structure under results: `bridge-mission-surface` wrapping kill report + save; `bridge-results-details` for toolbar/table (details/summary or collapsible).
- [ ] **72.2** Demote workflow strip; elevate save panel as fire CTA after process.
- [ ] **72.3** Admin: train wrap after save block; brain tab remains armory.
- [ ] **72.4** Attach panel classed as scrap (`bridge-attach-panel--scrap`).
- [ ] **72.5** JS: default collapse table open when rows exist (summary “Kept table · N rows”); still functional filters.

**Done when:** After process, eye hits kill report → Stage, not a chrome pile.

---

## Phase 73 — War-room victory end

**Goal:** After save, victory strip with Download + Scrub next — not only a fading flash + form reset anxiety.

### Tasks

- [ ] **73.1** Add `#bridge-victory-strip` mount (hero victory) near lists/desk.
- [ ] **73.2** On successful save: populate city · kept N · shift totals · primary Download CSV · secondary “Scrub next city”.
- [ ] **73.3** Still reset import working set (city/type/files) so next city is clean — but **keep victory visible** until next process or dismiss.
- [ ] **73.4** Copy: “Staged for enrichment · Analyze stays manual”.
- [ ] **73.5** CSS: brand heat (ember/gold), not green SaaS.

**Done when:** Save ends on mission advanced, not admin complete.

---

## Phase 74 — Regression lock

- [ ] **74.1** Add `tests/bridge-desk-cinema.test.js` covering DESK/MISSION/TYPE/SURFACE/VICTORY contracts.
- [ ] **74.2** Run full `npm test` (or node --test on bridge suite).
- [ ] **74.3** `verify-live.ps1` green.
- [ ] **74.4** Update ROADMAP/STATE for v2.2 shipped.

---

## Spec coverage checklist

| Upgrade | Phase |
|---------|-------|
| 1 One Scrub Desk | 69 |
| 2 Idle Mission Board | 70 |
| 3 Type chips | 71 |
| 4 Post-scrub mission surface | 72 |
| 5 War-room victory | 73 |
| QA | 74 |
