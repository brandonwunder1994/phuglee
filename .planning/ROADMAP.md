# Roadmap: Distress OS

## Milestones

- ✅ **v1.0 Shell & Integration** — Phases 1–6 (shipped 2026-07-01)
- 🔄 **v1.1 Unified Heat Design** — Phases 7–13 (in progress)

## Active Work

**Phase 7** — Heat Design System (next)

Start with `/gsd:plan-phase 7` or `/gsd:discuss-phase 7`

---

## v1.1 Unified Heat Design

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 7 | Heat Design System | Extract canonical tokens + design doc | HEAT-01–05 | pending |
| 8 | Global Navigation Shell | Unified nav menu on all pages + injection | NAV-01–06 | pending |
| 9 | Form Forge — Tokens & Atmosphere | Token swap, topbar, hub bg | FORGE-01, FORGE-03, FORGE-04 | pending |
| 10 | Form Forge — All Surfaces | 7 pages + portal/map/request CSS | FORGE-02, FORGE-05, FORGE-06 | pending |
| 11 | Analyzer — Tokens & Theme Layer | Heat tokens, fonts, heat-theme.css | PA-01–03, PA-07 | pending |
| 12 | Analyzer — All Surfaces | Sidebar, cards, review, modals, landing | PA-04–06 | pending |
| 13 | Cross-App QA & Polish | Visual audit + all test suites | QA-01–03 | pending |

---

### Phase 7: Heat Design System

**Goal:** Formalize Command Hub as the authoritative design system with documented token mapping for child apps.

**Success criteria:**
1. `v1.1-HEAT-DESIGN.md` lists every token, font, and component primitive
2. Child-app alias table documents how Forge/Analyzer map legacy vars → Heat vars
3. `public/css/heat-components.css` (or expanded `hub.css`) exports reusable button/card/eyebrow classes
4. Landing + Hub + Bridge verified unchanged except token doc references

**Repo:** `distress-os`

---

### Phase 8: Global Navigation Shell

**Goal:** One navigation menu across every page — Distress OS shell pages and proxied module pages.

**Nav structure (locked):**

| Group | Links |
|-------|-------|
| **Core** | Home `/` · Command Hub `/heat` · Data Bridge `/bridge` |
| **Form Forge** | Records Desk `/forge/` · City Tracker `/forge/portal` · Coverage Map `/forge/map` · Request PDFs `/forge/request-pdfs` · Submit Portals `/forge/submit-portals` · Email-only `/forge/email-only-requests` · Portal Errors `/forge/portal-errors` |
| **Analyzer** | Property Analyzer `/analyzer/` |

**Implementation:**
- `public/js/shell-nav.js` — shared nav HTML builder + active-state logic
- `public/css/shell-nav.css` — two-row or grouped nav with Forge dropdown/section
- `rewrite.js` — inject nav + `tokens.css` + `shell.css` into proxied HTML `<body>`
- Update `heat.html`, `bridge.html`, `index.html` to use shared nav partial

**Success criteria:**
1. Every page at `:3000` shows the same nav with correct active highlight
2. Clicking any Forge subpage from Analyzer navigates correctly via proxy paths
3. Module status pills show Forge/Analyzer up/down on shell pages
4. `npm test` — rewrite tests cover nav injection

**Repo:** `distress-os` (+ `rewrite.js` only)

---

### Phase 9: Form Forge — Tokens & Atmosphere

**Goal:** Swap Form Forge foundation from stamp-theme to Heat.

**Success criteria:**
1. `style.css` `:root` uses Heat palette (ember, flame, deep brown surfaces)
2. Anton + Outfit loaded; Instrument Serif / IBM Plex retired
3. `bg-vignette` / `bg-paper-grain` replaced with hub-style glow + grid
4. Module topbar de-conflicted with injected shell-nav (single nav visible)
5. `python scripts/gsd.py test` still passes

**Repo:** `city-list-requests`

---

### Phase 10: Form Forge — All Surfaces

**Goal:** Complete Heat reskin on all 7 Form Forge pages.

**Pages:** `index.html`, `portal.html`, `map.html`, `request-pdfs.html`, `submit-portals.html`, `email-only-requests.html`, `portal-errors.html`

**Success criteria:**
1. All pages visually match Command Hub color/typography
2. Buttons, cards, modals use Heat component patterns
3. Map page chrome reskinned (MapLibre data layers unchanged)
4. `python scripts/gsd.py verify` — 0 issues

**Repo:** `city-list-requests`

---

### Phase 11: Property Analyzer — Tokens & Theme Layer

**Goal:** Replace Aerial Command (v1.8) with Heat design foundation.

**Success criteria:**
1. `tokens.css` uses Heat palette; Fraunces/DM Sans → Anton/Outfit
2. `heat-theme.css` created; `premium-aerial.css` superseded
3. `body` class `heat-theme` replaces `aerial-theme` as active theme
4. `npm test` — 190+ passing

**Repo:** `property-distress-analyzer`

---

### Phase 12: Property Analyzer — All Surfaces

**Goal:** Reskin all Analyzer UI surfaces to Heat.

**Surfaces:** Sidebar, command bar, KPIs, property cards, scan progress, review overlay, modals, settings, landing page

**Success criteria:**
1. First impression matches Command Hub warmth (ember accents, Anton headlines)
2. Tier colors remain semantically distinct within Heat palette
3. Review keyboard shortcuts (1–5) unchanged
4. Landing page hero matches Hub gradient title treatment

**Repo:** `property-distress-analyzer`

---

### Phase 13: Cross-App QA & Polish

**Goal:** End-to-end visual consistency and regression sweep.

**Success criteria:**
1. Side-by-side audit: Landing → Hub → every Forge page → Analyzer → Bridge
2. Nav active states correct on all 12+ surfaces
3. Distress OS `npm test`, Form Forge `gsd.py verify`, Analyzer `npm test` all green
4. `docs/gsd` milestone marked `in_progress` → ready for close after ship

**Repos:** all three

---

## Progress

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 7. Heat Design System | 0/1 | Pending | — |
| 8. Global Navigation Shell | 0/1 | Pending | — |
| 9. Form Forge Tokens | 0/1 | Pending | — |
| 10. Form Forge Surfaces | 0/1 | Pending | — |
| 11. Analyzer Tokens | 0/1 | Pending | — |
| 12. Analyzer Surfaces | 0/1 | Pending | — |
| 13. Cross-App QA | 0/1 | Pending | — |