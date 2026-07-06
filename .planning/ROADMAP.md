# Roadmap: Distress OS

## Milestones

- ✅ **v1.0 Shell & Integration** — Phases 1–6 (shipped 2026-07-01)
- 🔄 **v1.1 Unified Heat Design** — Phases 7–13 (in progress)
- 📋 **v1.2 Premium Brand Experience** — Phases 14–21 (planned)

## Active Work

**Next milestone:** v1.2 Premium Brand Experience

Start with `/gsd:discuss-phase 14` or `/gsd:plan-phase 14`

**Design spec:** `.planning/v1.2-PREMIUM-BRAND.md`

---

## v1.2 Premium Brand Experience

> Post-login only. Login page (`/`) is locked.

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 14 | Premium Design System | Extract login DNA into shared CSS | PREM-01–06 | pending |
| 15 | Shell & Navigation Polish | Premium nav chrome + injection | PREM-07–10 | pending |
| 16 | Command Hub — How It Works | `/heat` full premium pass | PREM-11–13 | pending |
| 17 | Collect Records | `/collect` hero + dialogs | PREM-14–16 | pending |
| 18 | Data Bridge | `/bridge` utility premium pass | PREM-17–19 | pending |
| 19 | Form Forge — Premium Pass | 7 pages grain + panels | PREM-20–22 | pending |
| 20 | Analyzer — Premium Pass | All Analyzer surfaces | PREM-23–25 | pending |
| 21 | Cross-App Premium QA | Audit + regression | PREM-26–28 | pending |

---

### Phase 14: Premium Design System

**Goal:** Extract distressed-home atmosphere and auth-modal panel treatment into reusable CSS shared across all apps.

**Success criteria:**
1. `premium-atmosphere.css` renders photo + grain + wear + vignette without copying login-page-only rules
2. `premium-components.css` exports `.premium-panel`, `.premium-eyebrow`, `.premium-bg`, btn variants
3. Logo palette tokens documented and aliased in `tokens.css`
4. `v1.2-PREMIUM-BRAND.md` complete with per-page inventory
5. Login page visually unchanged when new CSS files are added (not linked on `/`)

**Repo:** `distress-os`

---

### Phase 15: Shell & Navigation Polish

**Goal:** Global nav and shell chrome match login page premium feel.

**Success criteria:**
1. Nav has ember hairline, glass blur, cream logo — feels like login page header
2. Active states use auth-modal accent pattern
3. `rewrite.js` injects premium CSS on `/forge/*` and `/analyzer/*`
4. No z-index conflicts between fixed nav and photo layers
5. `npm test` — rewrite injection tests updated

**Repo:** `distress-os`

---

### Phase 16: Command Hub — How It Works

**Goal:** `/heat` is the flagship post-login page — full distressed atmosphere and auth-style panels.

**Page plan:**
- Premium backdrop behind existing heat-bg
- Hero: flame gradient headline + text-shadow lead
- Hotspot → `premium-panel` with grain
- Steps 01–03: oversized Anton numbers, ember glow
- Pricing → `auth-pricing-card` parity (featured badge, dashed exclusive)
- CTA bar: ember gradient strip with grain

**Success criteria:**
1. Side-by-side with login page — same brand family, clearly related
2. All hub sections readable at AA contrast
3. Pricing cards match auth signup tier cards
4. `npm test` passing

**Repo:** `distress-os`

---

### Phase 17: Collect Records

**Goal:** `/collect` hero feels like a battle cry; dialogs match auth modal.

**Page plan:**
- Distressed home hero (stronger than utility pages)
- btn-heat + shine on "Start Requests"
- Dialogs: grain panels, ember hairline, auth-checkbox radios
- Choice cards: auth-pricing-card hover slide

**Success criteria:**
1. Hero matches landing energy without touching `/`
2. Both dialogs (Start Requests, PDF Filler Info) premium styled
3. Workflow radio selection visually matches auth tier selection

**Repo:** `distress-os`

---

### Phase 18: Data Bridge

**Goal:** `/bridge` utility page gets premium chrome without overwhelming the workflow.

**Page plan:**
- Subtle photo layer (~15% opacity)
- Step panels with numbered ember badges
- Tables: dark inset, grain headers
- Primary download = btn-heat; errors = auth-error panel

**Success criteria:**
1. Three-step workflow visually clear and premium
2. Column mapping + preview tables readable
3. Bridge functionality unchanged

**Repo:** `distress-os`

---

### Phase 19: Form Forge — Premium Pass

**Goal:** All 7 Forge pages elevated to premium brand.

**Per-page targets:**

| Page | Key upgrades |
|------|--------------|
| Records Desk | Hero strip, premium status cards |
| Request Tracker | Grain table rows, premium filter bar |
| Coverage Map | Dark glass map controls, ember active |
| Request PDFs | Wear-bordered preview, btn-heat send |
| Submit Portals | Auth-style step wizard |
| Email-only | Premium composer, signal-pill templates |
| Portal Errors | Danger inset rows, empty state watermark |

**Success criteria:**
1. No paper-grain / stamp aesthetic remains
2. All modals match premium-panel
3. `python scripts/gsd.py verify` — 0 issues

**Repo:** `city-list-requests`

---

### Phase 20: Analyzer — Premium Pass

**Goal:** Analyzer feels like the premium command center for distressed deals.

**Surface targets:** Sidebar, command bar, KPIs, property cards, scan progress, review overlay, modals, settings, in-app landing

**Success criteria:**
1. Tier colors semantically distinct within premium chrome
2. Review keyboard shortcuts (1–5) unchanged
3. JetBrains Mono retained for HUD/scan log
4. `npm test` — 190+ passing

**Repo:** `property-distress-analyzer`

---

### Phase 21: Cross-App Premium QA

**Goal:** End-to-end brand consistency after login.

**Audit path:** Hub → Collect → Bridge → all Forge pages → Analyzer → Hub

**Success criteria:**
1. Every post-login page passes visual checklist in `v1.2-PREMIUM-BRAND.md`
2. Login page unchanged (snapshot/regression)
3. All three repo test suites green
4. M3 milestone ready for `/gsd:complete-milestone`

**Repos:** all three

---

## v1.1 Unified Heat Design (reference — phases 7–13)

See prior ROADMAP entries in git history. v1.1 establishes Heat tokens + global nav; v1.2 elevates to login-page premium on top.

---

## Progress

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 14. Premium Design System | 0/1 | Pending | — |
| 15. Shell & Nav Polish | 0/1 | Pending | — |
| 16. Command Hub | 0/1 | Pending | — |
| 17. Collect Records | 0/1 | Pending | — |
| 18. Data Bridge | 0/1 | Pending | — |
| 19. Form Forge Premium | 0/1 | Pending | — |
| 20. Analyzer Premium | 0/1 | Pending | — |
| 21. Cross-App QA | 0/1 | Pending | — |