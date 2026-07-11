# Screenshot parity matrix checklist

**Login / home vs Filter (`/bridge`)** · v3.0 Visual Makeover · SYS-02

North star: login modal + home page — glass, grain, Anton/Outfit, raised CTAs.  
Filter may be denser (ops desk) but must share the same brand DNA.

**Pass column:** filled Plan 02 ship gate (2026-07-11) via dual-class greps + headless layout metrics + visual north-star alignment from phases 75–80. No bulk screenshots required.

---

## Pair table

| Component | Login / home reference | Filter surface | Visual parity notes | Pass |
|-----------|------------------------|----------------|---------------------|------|
| Button primary | Home `.phuglee-btn.phuglee-btn-primary` (e.g. `#btn-heat`, landing CTAs); auth primary submit energy | `#bridge-process`, `#bridge-save-list`, `#bridge-victory-download`, `#bridge-download-all-csv`, paste SCRUB IT | Same raised gold/orange face, focus ring, disabled mute; desk may use denser height (≥44px when visible). Dual-class greppable in `bridge.html`. | **Pass** — dual-class static + CSS min-height 44px; download-all sample h=48 @390 |
| Button secondary / ghost | Home secondary / ghost CTAs (`.phuglee-btn-secondary`); auth cancel | `#bridge-victory-next`, `#bridge-clear-file`, `#bridge-paste-clear`, `#bridge-export-csv`, dialog Cancel, list secondary actions | Glass secondary border; hover uses `--glass-border-hover`; danger list actions keep secondary base + page danger tint | **Pass** — dual-class greps present |
| Input | Auth login fields (auth panel glass inputs); home form energy | `#bridge-city-search` (`.phuglee-input`), `#bridge-list-name`, `#bridge-train-search`, `#bridge-filter-search`, `#bridge-paste-text` | Shared `.phuglee-input` focus border + placeholder; Filter densifies width/layout only | **Pass** — greppable dual-class inputs |
| Panel / card | Home glass cards (`.phuglee-panel`, featured/pricing); auth `.auth-panel.phuglee-panel` | `.bridge-panel.phuglee-panel` desk sections (location, type, upload, mission, lists); `--static` / desk elev where applied | Same glass fill/border DNA; Filter denser pad (`--desk-pad-*` / `--dense`); no random hex panel backgrounds | **Pass** — dual-class panels throughout desk |
| Modal / dialog | Login modal glass/grain (auth panel float) | `#bridge-history-dialog` + `#bridge-type-column-confirm-dialog` cards: `.phuglee-panel.phuglee-modal-panel.distress-glass--float` | Native `<dialog>` kept; dual-class modal panel + float — never replace with div modal kit | **Pass** — freeze suite asserts native dialogs + control IDs |
| Chip | Auth tabs (`.auth-tab` / `.auth-tab.is-active` gold→orange selected energy) | Type chips: `.bridge-type-chip.phuglee-chip` + `.phuglee-chip-face` (code / water radios) | Selected face mirrors auth-tab gradient tokens (`--chip-bg-selected`); chips not essay cards; group dual-class `bridge-type-chips phuglee-chip-group` | **Pass** — dual-class chips + group; contract freeze dual-class match |

---

## How to capture (optional)

- Hard-refresh only (`Ctrl+Shift+R`) after CSS `?v=` bumps.
- **Never** delete Filter lists or brain data to stage demos (`data/filter-lists/`, `data/bridge-brain/`).
- Optional shots under `.planning/phases/81-visual-qa-lock-catalog/screenshots/` — prefer Pass notes over bulk images.
- Viewports for layout: **390** and **1440** (see `81-QA-CHECKLIST.md`).

---

## Evidence shortcuts (Plan 02)

- Dual-class greps: `phuglee-btn`, `phuglee-panel`, `phuglee-input`, `phuglee-modal-panel`, `phuglee-chip` in `public/bridge.html` — **confirmed present**.
- Contract freeze: `docs/bridge/CONTRACT-FREEZE.md` + `tests/bridge-contract-freeze.test.js` — **12/0 green** (dual-class type chips assertion).
- Layout: headless Chromium Playwright JS-off — 390 scrollWidth=390; 1440 scrollWidth=1440; no page-level overflow.
- Live: `http://127.0.0.1:3000/` (home) · `http://127.0.0.1:3000/bridge` (Filter) — both HTTP 200 via verify-live + explicit bridge check.
- Suite: `npm test` **755 pass / 0 fail** (≥679 v2.1 bar).

*Phase 81 · SYS-02 · parity checklist · Plan 02 ship gate Pass 2026-07-11*
