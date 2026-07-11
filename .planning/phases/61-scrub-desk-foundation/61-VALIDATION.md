---
phase: 61
slug: scrub-desk-foundation
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-10
---

# Phase 61 — Validation Strategy

> Scrub desk foundation is presentation/voice only. No new unit suite required if DOM IDs stay stable; gate with static greps + full `npm test` + live verify + manual first-paint.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` (existing suite) |
| **Full suite** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Static greps** | Plan-embedded `node -e` gates on HTML/CSS/JS |
| **Manual visual** | Authenticated `/bridge` idle vs `/collect`; 1440 + ~390 widths |
| **New packages** | none |
| **Wave 0 gaps** | none required — pure shell pass; optional DOM smoke later |

---

## Sampling Rate

| When | What |
|------|------|
| After each task | Plan `<automated>` static command |
| After plan 01 | HTML/CSS structure greps; optional visual shell |
| After plan 02 | `npm test` + `verify-live.ps1` |
| Phase gate | All DESK-01–06 + ROADMAP 6 criteria TRUE |

---

## Automated vs Manual

### Automated (must pass)

| Check | Command / method | Plans |
|-------|------------------|-------|
| Suite regression (v1.6–v2.0 locks) | `npm test` | 61-02 Task 3 |
| Live health + homepage 200 | `scripts\verify-live.ps1` | 61-02 Task 3 |
| No proof rail in HTML | static: no `bridge-proof-rail` | 61-01 |
| Strong + heat present | static: `premium-bg--strong`, `heat-field`, `heat-atmosphere.css` | 61-01 |
| Desk shell present | static: `bridge-desk`, `bridge-desk-primary`, `bridge-desk-side` | 61-01 |
| Pipeline contract | static: `#bridge-pipeline` + `data-step` location/type/upload/results | 61-01 |
| Stable IDs present | static: process, save, state, city, panels | 61-01 / 61-02 |
| No dual CTA classes | static: no `bridge-btn`+`phuglee-btn` dual in HTML | 61-02 |
| JS templates cleaned | static: no `bridge-btn` CTA strings; `phuglee-btn` + Scrub it | 61-02 |
| Ops slang | static: Pick the city / clerk file / Scrub it / Prior attaches | 61-02 |
| LIST-01 | static: Save list + Preview CSV strings | 61-02 |

### Manual (phase visual gate)

| Behavior | Req | How |
|----------|-----|-----|
| Asymmetric dominant + scrap at first paint | DESK-01 | Idle `/bridge` desktop: 2-col desk, not essay-only stack |
| No equal 3-up feature grid | DESK-02 | Top of page has no icon+title metric rail |
| Collect-grade atmosphere | DESK-03 | Side-by-side `/collect` — strong photo + heat intensity |
| Slim teaching; pipeline advances | DESK-04 | No triple stack; pick city → pipeline step moves |
| Left solid cream Anton H1 | DESK-05 | No gradient fade; left align; short lead |
| Unified buttons + ops voice | DESK-06 | CTAs match Collect; train approve/deny phuglee after process (admin) |
| Mobile stack | QA spirit | ~390: primary before scrap; no horizontal overflow |
| Process/save still work | regression | Smoke process → Save list if practical |

---

## Per-Requirement Map

| Req | Automated | Manual |
|-----|-----------|--------|
| DESK-01 | desk class presence | visual 2-col / scrap |
| DESK-02 | no proof rail HTML/CSS | no equal grid at top |
| DESK-03 | strong + heat markup/link | peer grit vs Collect |
| DESK-04 | pipeline IDs; short lead string | interaction + no triple stack |
| DESK-05 | CSS hero not clip-transparent | visual cream left Anton |
| DESK-06 | grep phuglee / no dual / ops strings | visual CTAs + train templates |
| Regression | `npm test` | optional process path |
| Live | `verify-live.ps1` | open `/bridge` 200 |

---

## Out of scope for this phase’s checks

- City dossier content (62)
- Live idle metrics (63)
- Live scrub feed / reduced-motion theater (64)
- Kill-rate hierarchy redesign (65)
- Train theater tab pivot (66)
- Shift inventory HUD / brand-heat success (67)
- Formal mobile/a11y lock of whole milestone (68)

---

## Validation Sign-Off

- [ ] 61-01 static HTML/CSS gates green
- [ ] 61-02 HTML voice/btn + JS template gates green
- [ ] `npm test` exit 0
- [ ] `verify-live.ps1` exit 0
- [ ] Manual DESK-01–06 first paint TRUE
- [ ] No filter-lists / bridge-brain data wiped
- [ ] No new equal 3-card feature grids introduced

**Nyquist:** static automated gates per task + full suite/live at wave merge; visual sampling for presentation requirements (acceptable for M5/M8 surface phases).
