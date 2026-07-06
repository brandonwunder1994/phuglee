# Roadmap: Distress OS

## Milestones

- ✅ **v1.0 Shell & Integration** — Phases 1–6 (shipped 2026-07-01)
- 🔄 **v1.1 Unified Heat Design** — Phases 7–13 (in progress — superseded by v1.3 tokens)
- ✅ **v1.2 Premium Brand Experience** — Phases 14–21 (shipped 2026-07-06)
- 📋 **v1.3 Phuglee Signature Brand** — Phases 22–31 (active)

## Active Work

**Next milestone:** v1.3 Phuglee Signature Brand

Start with `/gsd:discuss-phase 22` or `/gsd:plan-phase 22`

**Design spec:** `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md`  
**Site audit:** `.planning/SITE-AUDIT.md`  
**Milestone doc:** `docs/gsd/milestones/M4-phuglee-signature-brand.md`

---

## v1.3 Phuglee Signature Brand

> **Full site** — including login (`/`). Logo SVG palette is ground truth. Premium · Edgy · Artistic.

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 22 | Phuglee Design System | Logo-ground-truth tokens + components + SVG injector | BRAND-01–06 | complete |
| 23 | Global Chrome & Motion | Nav/footer + motion primitives + proxy injection | BRAND-07–10 | complete |
| 24 | Home — Signature Rebuild | `/` full brand moment (unlocked) | BRAND-11–14 | complete |
| 25 | Auth Flows | Modal + pricing + success overlay | BRAND-15–17 | complete |
| 26 | Shell Pages | `/heat`, `/collect`, `/bridge` editorial pass | BRAND-18–20 | complete |
| 27 | Form Forge — Signature Pass | 7 pages `phuglee-forge.css` | BRAND-21–23 | complete |
| 28 | Analyzer — Signature Pass | All surfaces `phuglee-analyzer.css` | BRAND-24–26 | pending |
| 29 | States & Micro-interactions | Loading/empty/error + hover motion | BRAND-27–30 | pending |
| 30 | A11y, Performance, SEO | WCAG, Lighthouse, meta tags | BRAND-31–34 | pending |
| 31 | Cross-App Signature QA | Full brand audit + regression | BRAND-35–37 | pending |

### Phase 22: Phuglee Design System

**Goal:** Logo-ground-truth `--phuglee-*` tokens, component library, and reusable SVG integration.

**Success criteria:**
1. `tokens.css` exports full logo palette; Heat ember aliased to `--phuglee-orange`
2. `phuglee-components.css` exports `.phuglee-btn-primary`, `.phuglee-panel`, input/modal variants
3. `phuglee-logo.js` injects SVG via `data-phuglee-logo` attributes
4. `phuglee-pattern.svg` tile ready for hero/background use
5. `npm test` passing

**Repo:** `distress-os`

---

### Phase 23: Global Chrome & Motion

**Goal:** Floating brand bar nav, footer, and orchestrated stagger motion across shell + proxied apps.

**Success criteria:**
1. Nav: black glass, cream wordmark, orange active pill
2. `phuglee-motion.js` stagger on `[data-phuglee-reveal]` elements
3. `rewrite.js` injects phuglee CSS on `/forge/*` and `/analyzer/*`
4. `prefers-reduced-motion` disables stagger
5. `npm test` — rewrite tests updated

**Repo:** `distress-os`

---

### Phase 24: Home — Signature Rebuild

**Goal:** `/` is the signature brand moment — logo as art piece, logo-exact palette, pattern system.

**Page plan:**
- `#0D0D0D` ground, logo orange CTA, taupe secondary chrome
- `phuglee-logo.js` hero with float animation
- Deconstructed pattern layer at 3–8% opacity
- Hero stagger via motion.js
- SEO meta + OG tags

**Success criteria:**
1. Side-by-side with `phuglee-logo.svg` — one cohesive family
2. No CLS on logo load
3. `npm test` passing

**Repo:** `distress-os`

---

### Phase 25: Auth Flows

**Goal:** Auth modal matches wordmark energy — condensed headlines, logo orange CTAs.

**Success criteria:**
1. Pricing tiers use phuglee-panel-featured/exclusive
2. All `auth.js` hooks preserved
3. WCAG AA on form elements

**Repo:** `distress-os`

---

### Phase 26: Shell Pages — Hub, Collect, Bridge

**Goal:** Post-login shell reads editorial/streetwear brand, not SaaS dashboard.

**Per-page targets:**

| Page | Key upgrades |
|------|--------------|
| `/heat` | Cream-to-orange hero, pattern sidebar, orange CTA bar |
| `/collect` | Poster energy hero, pattern bleed, phuglee dialogs |
| `/bridge` | Orange step badges, designed error state |

**Success criteria:**
1. All three pages use phuglee tokens exclusively
2. Functionality unchanged
3. `npm test` passing

**Repo:** `distress-os`

---

### Phase 27: Form Forge — Signature Pass

**Goal:** All 7 Forge pages elevated to Phuglee signature brand.

**Success criteria:**
1. `phuglee-forge.css` on all pages
2. Mascot empty states on Portal Errors
3. `gsd.py verify` — document known lint-imports exception

**Repo:** `city-list-requests`

---

### Phase 28: Analyzer — Signature Pass

**Goal:** Analyzer feels like premium command center within Phuglee brand.

**Success criteria:**
1. Tier colors semantically distinct within phuglee chrome
2. Review shortcuts (1–5) unchanged
3. `npm test` — 190+ passing

**Repo:** `property-distress-analyzer`

---

### Phase 29: States & Micro-interactions

**Goal:** Every wait, fail, and zero-data moment feels designed.

**Success criteria:**
1. Loading/empty/error patterns consistent across all three repos
2. CTA/panel/modal hover motion in phuglee-components
3. `prefers-reduced-motion` respected

**Repos:** all three

---

### Phase 30: A11y, Performance, SEO

**Goal:** Technical excellence matches visual premium.

**Success criteria:**
1. WCAG AA audit pass
2. Lighthouse 90+ on shell pages
3. SEO meta on `/`, `/heat`, Analyzer landing

**Repos:** all three

---

### Phase 31: Cross-App Signature QA

**Goal:** Entire site feels like one high-end brand.

**Audit path:** `/` → auth → Hub → Collect → Bridge → 7 Forge → Analyzer → Hub

**Success criteria:**
1. Visual checklist in `v1.3-PHUGLEE-SIGNATURE-BRAND.md` §8–9 passes
2. No hardcoded Heat ember `#e85d04` remnants
3. All test suites green
4. M4 ready for `/gsd:complete-milestone`

**Repos:** all three

---

## v1.2 Premium Brand Experience (complete — reference)

Phases 14–21 shipped 2026-07-06. Post-login premium pass; login was locked (superseded by M4).

See `docs/gsd/milestones/M3-premium-brand-experience.md`

---

## v1.1 Unified Heat Design (reference — phases 7–13)

See `docs/gsd/milestones/M2-unified-heat-design.md`. Heat tokens superseded by `--phuglee-*` in Phase 22.

---

## Progress

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 22. Phuglee Design System | 1/1 | Complete | 2026-07-06 |
| 23. Global Chrome & Motion | 1/1 | Complete | 2026-07-06 |
| 24. Home Signature Rebuild | 1/1 | Complete | 2026-07-06 |
| 25. Auth Flows | 1/1 | Complete | 2026-07-06 |
| 26. Shell Pages | 0/1 | Pending | — |
| 27. Form Forge Signature | 0/1 | Pending | — |
| 28. Analyzer Signature | 0/1 | Pending | — |
| 29. States & Micro-interactions | 0/1 | Pending | — |
| 30. A11y, Perf, SEO | 0/1 | Pending | — |
| 31. Cross-App Signature QA | 0/1 | Pending | — |