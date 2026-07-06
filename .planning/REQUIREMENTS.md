# Distress OS — Requirements

> **Active milestone:** v1.3 Phuglee Signature Brand  
> **Last updated:** 2026-07-06

---

## v1.3 Phuglee Signature Brand (active)

> **Research:** Skipped — logo SVG is ground truth  
> **Scope:** Full site including login (`/`) — supersedes M3 login lock  
> **Design spec:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`

### Phuglee Design System (Phase 22) — validated

- [x] **BRAND-01**: `--phuglee-*` logo-ground-truth token system in `tokens.css`
- [x] **BRAND-02**: Legacy Heat aliases migrate to logo orange (`--ember` → `--phuglee-orange`)
- [x] **BRAND-03**: `phuglee-components.css` — buttons, panels, inputs, modals
- [x] **BRAND-04**: `phuglee-logo.js` — vanilla SVG injector with `data-phuglee-logo`
- [x] **BRAND-05**: `phuglee-pattern.svg` — deconstructed logo path tile
- [x] **BRAND-06**: Design spec complete at `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`

### Global Chrome & Motion (Phase 23) — validated

- [x] **BRAND-07**: Shell nav retokenized — black glass, cream logo, orange active pill
- [x] **BRAND-08**: `phuglee-motion.js` — IntersectionObserver stagger fade-up
- [x] **BRAND-09**: `rewrite.js` injects phuglee CSS stack on proxied pages
- [x] **BRAND-10**: Global footer brand bar with earth-tone vignette

### Home — Signature Rebuild (Phase 24)

- [ ] **BRAND-11**: Landing page retokenized to logo palette (`landing.css`)
- [ ] **BRAND-12**: Hero pattern layer + logo float via `phuglee-logo.js`
- [ ] **BRAND-13**: CTA uses `.phuglee-btn-primary` with glow + shine
- [ ] **BRAND-14**: SEO meta description + OG tags on `/`

### Auth Flows (Phase 25)

- [ ] **BRAND-15**: Auth modal phuglee panels (`auth.css`)
- [ ] **BRAND-16**: Pricing tiers → `.phuglee-panel-featured` / exclusive dashed
- [ ] **BRAND-17**: Success overlay logo-gold pulse

### Shell Pages (Phase 26)

- [ ] **BRAND-18**: `/heat` editorial premium pass — pattern accent, orange CTA bar
- [ ] **BRAND-19**: `/collect` poster energy — pattern bleed, phuglee dialogs
- [ ] **BRAND-20**: `/bridge` refined tool — orange step badges, designed errors

### Form Forge Signature Pass (Phase 27)

- [ ] **BRAND-21**: `phuglee-forge.css` on all 7 pages
- [ ] **BRAND-22**: Logo palette on tables, modals, map controls
- [ ] **BRAND-23**: Mascot watermark empty states

### Analyzer Signature Pass (Phase 28)

- [ ] **BRAND-24**: `phuglee-analyzer.css` — sidebar, command bar, KPIs
- [ ] **BRAND-25**: Property cards + review overlay phuglee chrome; tier colors preserved
- [ ] **BRAND-26**: Analyzer landing hero cream-to-orange + pattern bg

### States & Micro-interactions (Phase 29)

- [ ] **BRAND-27**: Branded loading states (orange pulse bar + Anton microcopy)
- [ ] **BRAND-28**: Branded empty states (mascot watermark + orange CTA)
- [ ] **BRAND-29**: Branded error states (terracotta inset + retry ghost)
- [ ] **BRAND-30**: Micro-interactions — CTA hover, panel hover, modal rise, nav underline

### A11y, Performance, SEO (Phase 30)

- [ ] **BRAND-31**: WCAG AA contrast audit on all phuglee surfaces
- [ ] **BRAND-32**: `prefers-reduced-motion` respected globally
- [ ] **BRAND-33**: Lighthouse perf target 90+ on shell pages
- [ ] **BRAND-34**: SEO meta + OG on shell pages + Analyzer landing

### Cross-App Signature QA (Phase 31)

- [ ] **BRAND-35**: Visual audit — all 13+ pages side-by-side brand checklist
- [ ] **BRAND-36**: All test suites green (Forge lint-imports exception documented)
- [ ] **BRAND-37**: M4 ready for `/gsd:complete-milestone`

---

## v1.2 Premium Brand Experience (validated — 2026-07-06)

- [x] **PREM-01–06**: Premium design system — atmosphere + components + tokens
- [x] **PREM-07–10**: Shell nav premium chrome + rewrite injection
- [x] **PREM-11–13**: Command Hub (`/heat`) premium pass
- [x] **PREM-14–16**: Collect Records (`/collect`) premium pass
- [x] **PREM-17–19**: Data Bridge (`/bridge`) premium pass
- [x] **PREM-20–22**: Form Forge 7-page premium pass
- [x] **PREM-23–25**: Property Analyzer premium pass
- [x] **PREM-26–28**: Cross-app premium QA (login locked per M3 — superseded by M4)

---

## v1.1 Unified Heat Design (in progress — may overlap M3/M4)

- [ ] **HEAT-01–05**: Canonical Heat design system extracted from Command Hub
- [ ] **NAV-01–06**: Global navigation menu on every page
- [ ] **FORGE-01–06**: Form Forge visual reskin to Heat palette
- [ ] **PA-01–07**: Property Analyzer visual reskin to Heat palette
- [ ] **QA-01–03**: Cross-app visual audit + regression tests

> v1.1 Heat tokens are being superseded by v1.3 `--phuglee-*` tokens. Complete or archive v1.1 when M4 Phase 22 lands.

---

## v1.0 Shell & Integration (validated — 2026-07-01)

- [x] Landing page with heat aesthetic (`/`)
- [x] Command Hub dashboard (`/heat`)
- [x] Reverse proxy for Form Forge (`/forge/`) and Property Analyzer (`/analyzer/`)
- [x] Data Bridge spreadsheet converter (`/bridge`)
- [x] Health API with module status pills
- [x] Auto-start child processes via `launch-distressos.bat`
- [x] Unit tests for rewrite, bridge schema, proxy

---

## Future Requirements (deferred)

- **BRAND-38**: React/Framer Motion migration (optional spike in Phase 30)
- **BRAND-39**: Animated mascot watermark on scroll
- **BRAND-40**: Per-market custom distressed photography
- Embedded bridge workflow (upload without leaving Analyzer)
- Single sign-on / session sharing between modules

## Out of Scope (v1.3)

| Item | Reason |
|------|--------|
| E-commerce / cart / checkout | No shop exists |
| Backend/API changes | Visual + motion only |
| New product features | Separate milestones |
| Full TypeScript migration | JSDoc only in M4 |

---

## Traceability

| Requirement | Phase |
|-------------|-------|
| BRAND-01–06 | 22 |
| BRAND-07–10 | 23 |
| BRAND-11–14 | 24 |
| BRAND-15–17 | 25 |
| BRAND-18–20 | 26 |
| BRAND-21–23 | 27 |
| BRAND-24–26 | 28 |
| BRAND-27–30 | 29 |
| BRAND-31–34 | 30 |
| BRAND-35–37 | 31 |