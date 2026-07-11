# Requirements: Distress OS — v3.0 Filter Visual Makeover

**Milestone:** v3.0 Filter Visual Makeover  
**Defined:** 2026-07-11  
**Source:** GSD `/gsd:new-milestone` + research (STACK / FEATURES / ARCHITECTURE / PITFALLS / SUMMARY)  
**Constraint:** CSS/markup only — process, brain, keep/kill, lists, Train gates, and all `public/js/bridge*.js` / `lib/**` behavior frozen.

## v3 Requirements

### TOKENS

- [ ] **TOKENS-01**: Operator sees Filter surfaces using the same Phuglee color/glass/shadow/type tokens as login and home (no one-off hex islands in desk chrome)
- [ ] **TOKENS-02**: Operator reads hierarchy via Anton display / Outfit body / mono data using the shared type scale on Filter headings, labels, and dense cells
- [ ] **TOKENS-03**: Operator experiences glass + grain atmosphere on Filter panels that matches login/home DNA (desk density allowed; same brand family)
- [ ] **TOKENS-04**: Operator sees success / warn / danger status colors only via canonical semantic tokens (no random greens/reds)

### BUTTONS

- [ ] **BUTTONS-01**: Operator can use primary / secondary / ghost / danger system buttons for every actionable control on `/bridge`
- [ ] **BUTTONS-02**: Operator sees consistent hover, focus, active, and disabled states on all system buttons
- [ ] **BUTTONS-03**: Operator sees contained primary CTA energy (subtle shimmer/gem) matching home, capped so all-day desk use does not fatigue

### FORMS

- [ ] **FORMS-01**: Operator uses text inputs, selects, textareas, and search fields that share the system form language (city search, save name, Train search, filters)
- [ ] **FORMS-02**: Operator selects list type via system chip components (code / water) with radio semantics preserved
- [ ] **FORMS-03**: Operator sees selected type chips with auth-tab energy (gold/orange gradient face) while unselected chips stay calm
- [ ] **FORMS-04**: Operator uses the file dropzone with clear idle / dragover / has-file / error visual states (multi-file + accept list unchanged)

### CARDS

- [ ] **CARDS-01**: Operator sees all desk sections as glass panels from the shared card/panel system (auth-modal energy, desk density)
- [ ] **CARDS-02**: Operator opens history and type-column confirm dialogs that match system modal glass/grain treatment (confirm logic frozen)
- [ ] **CARDS-03**: Operator can scan elevation hierarchy — primary scrub stage elevated, scrap/secondary quieter, victory featured

### DESK

- [ ] **DESK-01**: Operator sees a full visual pass on every `/bridge` surface (hero, pipeline, scrub stage, dossier, outcome drawer, import, loading/feed, mission/kill report, save, train/armory, kept table, lists, shift HUD, victory strip, dialogs) with no orphan pre-system chrome
- [ ] **DESK-02**: Operator still experiences kill report + mission board as climax-first (RAW → KILLED → KEPT order and Save elevation preserved; visual only)
- [ ] **DESK-03**: Operator can read kept + inventory tables on dark glass (sticky header, hover/zebra, usable horizontal scroll at 390 width)
- [ ] **DESK-04**: Operator (admin) experiences Train theater + Rules armory as distinct visual modes; non-admin Train remains fail-closed/hidden
- [ ] **DESK-05**: Operator never loses locked workflow contracts — all `bridge-*` IDs, `data-action` / `data-mode` / `data-format` values, and cinema structure order remain intact

### STATES

- [ ] **STATES-01**: Operator sees empty states using shared system empty patterns (no ad-hoc blank boxes)
- [ ] **STATES-02**: Operator sees loading / scrub-in-progress feedback using shared loading patterns; scrub feed remains legible and populates without relying on animation end
- [ ] **STATES-03**: Operator sees error and success status lines using shared patterns + semantic tokens
- [ ] **STATES-04**: Operator with `prefers-reduced-motion: reduce` gets reduced/disabled motion twins for every new animation (feed, shimmer, reveal, flash)

### SYSTEM (differentiators / rollout)

- [ ] **SYS-01**: Maintainer has a short component catalog note (tokens + class names + do/don’t) so Collect/Hub can adopt later without a second ad-hoc redesign
- [ ] **SYS-02**: Maintainer has a screenshot parity matrix checklist pairing login/home vs Filter components (button, input, panel, modal, chip)

### QA

- [ ] **QA-01**: Operator on 390px and 1440px widths can complete the primary scrub path without broken layout (visual QA lock)
- [ ] **QA-02**: Full automated suite remains green at or above the pre-milestone bar (679+ tests; no intentional behavior regressions)
- [ ] **QA-03**: `scripts/verify-live.ps1` exits 0 (health + homepage HTTP 200) after Filter visual changes
- [ ] **QA-04**: Behavior freeze holds — no process/API/brain/keep-kill/list workflow changes; no Analyze re-coupling chrome

## Future Requirements

- Site-wide application of the design system (Collect, Command Hub, Analyze chrome, Forge skins)
- Optional Storybook / automated visual regression CI beyond Playwright smoke
- React / Framer migration (explicit backlog — not v3.0)
- Multi-theme / light mode

## Out of Scope

| Item | Reason |
|------|--------|
| Process / brain / keep-kill / list engine changes | Function freeze; accuracy bar |
| Analyze auto-push or shared store UI | v2.0 product decision |
| Full site reskin in this milestone | Filter is showcase; system enables later |
| React/Tailwind/PostCSS rewrite | Brownfield vanilla stack; rewrite ≠ makeover |
| Light theme switcher | Brand is dark Phuglee; doubles QA |
| Workflow / IA simplification under “makeover” | Cinema structure locked (v2.1–v2.2) |
| Wiping `data/filter-lists` or brain for screenshots | AGENTS.md hard rule |
| Renaming `bridge-*` IDs or `data-action` contracts | ~70 JS boot lookups |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOKENS-01 | Phase 76 | Pending |
| TOKENS-02 | Phase 76 | Pending |
| TOKENS-03 | Phase 76 | Pending |
| TOKENS-04 | Phase 76 | Pending |
| BUTTONS-01 | Phase 77 | Pending |
| BUTTONS-02 | Phase 77 | Pending |
| BUTTONS-03 | Phase 77 | Pending |
| FORMS-01 | Phase 78 | Pending |
| FORMS-02 | Phase 77 | Pending |
| FORMS-03 | Phase 77 | Pending |
| FORMS-04 | Phase 78 | Pending |
| CARDS-01 | Phase 77 | Pending |
| CARDS-02 | Phase 78 | Pending |
| CARDS-03 | Phase 79 | Pending |
| DESK-01 | Phase 80 | Pending |
| DESK-02 | Phase 80 | Pending |
| DESK-03 | Phase 79 | Pending |
| DESK-04 | Phase 80 | Pending |
| DESK-05 | Phase 75 | Pending |
| STATES-01 | Phase 77 | Pending |
| STATES-02 | Phase 78 | Pending |
| STATES-03 | Phase 77 | Pending |
| STATES-04 | Phase 80 | Pending |
| SYS-01 | Phase 81 | Pending |
| SYS-02 | Phase 81 | Pending |
| QA-01 | Phase 81 | Pending |
| QA-02 | Phase 81 | Pending |
| QA-03 | Phase 81 | Pending |
| QA-04 | Phase 81 | Pending |

**Coverage:** 29/29 v1 requirements mapped ✓

---
*Requirements defined 2026-07-11 for milestone v3.0 Filter Visual Makeover*  
*Traceability updated 2026-07-11 — roadmap phases 75–81*
