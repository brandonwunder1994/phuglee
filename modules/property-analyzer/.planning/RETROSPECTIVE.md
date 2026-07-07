# Retrospective

Living document — append a section per shipped milestone.

---

## Milestone: v1.3 — Calm Premium Interface

**Shipped:** 2026-06-30  
**Phases:** 5 | **Plans:** 14

### What Was Built

- Tailwind 3.4 + `tokens.css` calm semantic palette with legacy aliases
- HUD removed; 4-item sidebar + overflow; ⌘K backup/brain/settings
- Empty/scan/summary workflow calm surfaces
- Results: search-first, segmented filters, calm cards/table, Edit bulk mode
- Modals: `calm-dialog` chrome, imagery-first inspector, emoji-free review

### What Worked

- **3-plan wave pattern** (DOM → CSS + JS) repeated across phases 12–15 — predictable and parallelizable
- **DOM ID preservation** — zero backend regressions; 78 tests held throughout
- **`body.legacy-hud` escape hatch** — safe incremental migration without breaking nostalgia/debug paths
- **UI-SPEC before PLAN** — concrete acceptance criteria reduced executor ambiguity

### What Was Inefficient

- **REQUIREMENTS.md checkboxes** lagged behind phase completion — traceability table stayed "Pending" until milestone close
- **`gsd-tools summary-extract`** path issues on Windows — accomplishments had to be gathered manually
- **`app.css` monolith** — each phase appends blocks; cmd-palette and other surfaces still legacy

### Patterns Established

- `calm-dialog` shared modal chrome
- Segmented control + overflow menu (sidebar, filters)
- Phase CSS blocks appended before `prefers-reduced-motion`
- Review shortcuts frozen in `session.js`; display strings in `imagery.js`

### Key Lessons

1. UI milestones should verify requirements file checkboxes at each `phase complete`, not only at milestone close
2. Windows path handling in gsd-tools needs forward-slash or quoted paths for summary extraction
3. Final milestone benefits from one manual smoke checklist even when automated tests pass

---

## Milestone: v1.7 — Lead Export

**Shipped:** 2026-07-01  
**Phases:** 2 | **Plans:** 4

### What Was Built

- `lib/export-schema.js` — 13-column dial-ready mapper with dual Street View URLs
- `lib/export-profiles.js` — full export column contract (28 columns)
- Export Database (Excel) UI + ⌘K command; imagery hydration before export
- 21 unit tests (export-schema + export-profiles); 188 total tests passing

### What Worked

- **Separate profiles (`dial_ready` vs `full`)** — user got clean dial export without breaking power-user detailed export
- **UMD lib modules** — `export-schema.js` testable in Node and browser like other shared libs
- **Phase 27 ship + Phase 28 verify** — feature first, proof second; matched user workflow (review leads → export)

### What Was Inefficient

- **gsd-tools milestone complete** counted all 19 phase dirs, not just 27–28 — stats/accomplishments needed manual fix in MILESTONES.md
- **PROJECT.md lagged** — Active section still listed partial EXPORT IDs until milestone close

### Patterns Established

- `profile: 'dial_ready' | 'full'` on `exportResults()` and `buildExportRows()`
- `prepareDialReadyExport()` — fetch imagery index + hydrate before database export
- Column contracts in `lib/` with regression tests in `tests/export-profiles.test.js`

### Key Lessons

1. Milestone-scoped phases (27–28) should be filtered explicitly when auto-gathering stats
2. User column spec captured in STATE.md during `new-milestone` — valuable for executor context
3. Dual URL columns (cached + Maps) worth the extra column — different use cases (local vs shareable)

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Tests | Theme |
|-----------|--------|-------|-------|-------|
| v1.2 Core Bones | 5 | — | 78 | Backend reliability |
| v1.3 Calm UI | 5 | 14 | 78 | Frontend calm minimalism |
| v1.7 Lead Export | 2 | 4 | 188 | Dial-ready database export |