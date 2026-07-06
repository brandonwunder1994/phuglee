# v1.2 Premium Brand Experience — Requirements

> **Milestone:** v1.2  
> **Created:** 2026-07-06  
> **Research:** Skipped (visual elevation — login page is the reference)
> **Out of scope:** Login page (`/`) — locked and approved

---

## Premium Design System

- [ ] **PREM-01**: `premium-atmosphere.css` — distressed home photo, grain, wear, vignette layers (extracted from `landing.css`)
- [ ] **PREM-02**: `premium-components.css` — grain panels, ember hairlines, premium eyebrows, btn-heat variants
- [ ] **PREM-03**: Logo palette tokens in `tokens.css` (`--cream`, `--stone`, `--logo-charcoal`)
- [ ] **PREM-04**: Design spec at `.planning/v1.2-PREMIUM-BRAND.md` with per-page upgrade inventory
- [ ] **PREM-05**: `prefers-reduced-motion` — static backdrops, no shine/loop animations
- [ ] **PREM-06**: WCAG AA contrast maintained on all premium backdrops

## Shell & Navigation

- [ ] **PREM-07**: Nav bar premium chrome — glass blur, ember top hairline, cream text logo
- [ ] **PREM-08**: Active nav states match auth-modal accent treatment
- [ ] **PREM-09**: `rewrite.js` injects `premium-atmosphere.css` + `premium-components.css` on proxied pages
- [ ] **PREM-10**: Content padding / z-index stacking verified with photo layers

## Distress OS Shell Pages

- [ ] **PREM-11**: Command Hub (`/heat`) — premium backdrop, grain panels, auth-style pricing cards
- [ ] **PREM-12**: Command Hub hero — flame gradient headlines, text-shadow taglines
- [ ] **PREM-13**: Command Hub steps + CTA bar — oversized Anton numbers, ember glow, grain step cards
- [ ] **PREM-14**: Collect Records (`/collect`) — distressed hero, premium dialogs, auth-style choice cards
- [ ] **PREM-15**: Collect Records CTAs — btn-heat shine + wear-border secondary
- [ ] **PREM-16**: Collect Records modals — auth-modal backdrop blur + rise animation
- [ ] **PREM-17**: Data Bridge (`/bridge`) — premium panels, step badges, restrained photo layer (~15%)
- [ ] **PREM-18**: Data Bridge tables — dark inset rows, ember focus states, grain headers
- [ ] **PREM-19**: Data Bridge actions — btn-heat primary, auth-error danger panel

## Form Forge Premium Pass

- [ ] **PREM-20**: All 7 Forge pages use premium-atmosphere (no paper-grain remnants)
- [ ] **PREM-21**: Forge modals, tables, and cards match `premium-panel` + auth-checkbox patterns
- [ ] **PREM-22**: Map page chrome reskinned (controls only); Records Desk + Tracker get hero strips

## Property Analyzer Premium Pass

- [ ] **PREM-23**: Sidebar, command bar, KPIs, property cards use premium chrome
- [ ] **PREM-24**: Review overlay + modals match auth-modal treatment; tier colors preserved
- [ ] **PREM-25**: Analyzer in-app landing hero matches Hub flame gradient when accessed via shell

## Quality Assurance

- [ ] **PREM-26**: Visual audit — sign-in → every post-login page side-by-side
- [ ] **PREM-27**: Distress OS `npm test` + Forge `gsd.py verify` + Analyzer `npm test` all green
- [ ] **PREM-28**: Login page (`/`) visually unchanged — regression snapshot check

---

## Future Requirements (deferred)

- **PREM-29**: Animated mascot watermark on scroll
- **PREM-30**: Per-market custom distressed photography
- **PREM-31**: Sound design on CTA hover (wholesaler grit)

## Out of Scope

| Item | Reason |
|------|--------|
| Login page (`/`) redesign | User locked — already awesome |
| Auth flow / signup UX changes | Visual reference only |
| Backend/API changes | CSS/HTML only |
| New product features | Separate milestones |

---

## Traceability

| Requirement | Phase |
|-------------|-------|
| PREM-01–06 | 14 |
| PREM-07–10 | 15 |
| PREM-11–13 | 16 |
| PREM-14–16 | 17 |
| PREM-17–19 | 18 |
| PREM-20–22 | 19 |
| PREM-23–25 | 20 |
| PREM-26–28 | 21 |