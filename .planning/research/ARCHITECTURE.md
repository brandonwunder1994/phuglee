# Architecture Research

**Domain:** Filter visual makeover — CSS/markup system integration (v3.0)
**Researched:** 2026-07-11
**Confidence:** HIGH (as-built cascade + class inventory verified in `public/`); MEDIUM (exact token gaps until surface inventory pass)

## Standard Architecture

### System Overview

v3.0 is **surface-only**. Process, brain, keep/kill, lists API, and all `public/js/bridge*.js` behavior stay frozen. The visual system is a **layered CSS cascade** with one source of truth for brand tokens and shared primitives; Filter applies them via markup hooks + a page-scoped stylesheet.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  NORTH STAR (look reference only — do NOT load home.css on /bridge)          │
│  public/index.html + home.css / home-premium.css / auth.css                  │
│  glass cards · grain · raised CTAs · cream Anton hierarchy · photo atmosphere│
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ visual DNA only
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 0 — TOKENS                                                            │
│  public/css/tokens.css                                                       │
│  --phuglee-* · --glass-* · --shadow-* · type scale · space · radius          │
│  [data-theme="light"] overrides                                              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ CSS custom properties (runtime inheritance)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — SHARED ELEVATION + COMPONENTS                                     │
│  distress-glass.css   → .distress-glass* · glass-card · monitor primitives   │
│  phuglee-components.css → .phuglee-btn* · .phuglee-panel* · inputs · empty   │
│  phuglee-a11y.css     → skip-link, focus, reduced-motion helpers             │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ class hooks on DOM
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — APP SHELL (authenticated pages)                                   │
│  heat-base · heat-atmosphere · premium-atmosphere · premium-components       │
│  shell · shell-nav · settings-menu · command-palette · distress-status       │
│  body.has-premium-bg · .premium-bg photo/grain stack                         │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ page composition
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — FILTER PAGE (isolate domain layout + theater)                     │
│  public/bridge.html  — structure + dual classes (bridge-* + phuglee-*)       │
│  public/css/bridge.css (~85KB) — desk layout, kill HUD, Train theater, feed  │
│  public/js/bridge*.js — LOCKED (no architecture rewrite)                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Opinionated rule:** tokens and shared components own *how things look*; `bridge.css` owns *how Filter is laid out and which ops surfaces exist*. If a style would look correct on Collect, Command, or Vault tomorrow, it belongs in Layer 1 — not in `bridge.css`.

### Component Responsibilities

| Component | Responsibility | New vs modified | Typical implementation |
|-----------|----------------|-----------------|------------------------|
| `tokens.css` | Brand + glass + type + spacing custom properties | **Modified** (extend only if shared gaps found) | `:root` + `[data-theme="light"]` |
| `distress-glass.css` | Elevation primitives (glass, card, solid zone) | **Mostly keep**; light extend if needed | utility classes |
| `phuglee-components.css` | Buttons, panels, forms, empty/loading/error | **Modified** (primary shared expansion) | `.phuglee-*` API |
| `phuglee-a11y.css` | Focus, skip, reduced-motion | **Keep** (touch only if makeover breaks a11y) | last in cascade |
| `premium-atmosphere.css` | Photo + grain backdrop for app pages | **Keep** (already on bridge) | `.premium-bg*` |
| `bridge.css` | Filter layout, theater, domain widgets | **Modified heavily** (restyle + dedupe) | `.bridge-*` |
| `bridge.html` | Markup hooks / dual-class composition | **Modified lightly** (classes only) | no structure rewrite |
| `bridge*.js` | Behavior, process, Train, lists | **Frozen** | zero visual-system rewrites |
| Home/auth CSS | North-star reference | **Read-only** this milestone | do not import into Filter |

## Recommended Project Structure

```
public/
├── css/
│   ├── tokens.css                 # Layer 0 — brand + glass tokens (extend carefully)
│   ├── distress-glass.css         # Layer 1 — elevation utilities
│   ├── phuglee-components.css     # Layer 1 — shared controls (expand here)
│   ├── phuglee-a11y.css           # Layer 1 — a11y last
│   ├── heat-base.css              # Layer 2 — reset/type base
│   ├── heat-atmosphere.css        # Layer 2 — ambient heat
│   ├── premium-atmosphere.css     # Layer 2 — photo/grain stack
│   ├── premium-components.css     # Layer 2 — premium chrome helpers
│   ├── shell.css / shell-nav.css  # Layer 2 — authenticated chrome
│   ├── bridge.css                 # Layer 3 — Filter-only (layout + theater)
│   ├── home.css / home-premium.css / auth.css  # North star ONLY (not on /bridge)
│   └── …page sheets…              # collect, vault, hub — later consumers of Layer 1
├── bridge.html                    # class hooks; keep ids/roles for JS
└── js/
    └── bridge*.js                 # LOCKED — no visual architecture work
```

### Structure Rationale

- **No new CSS build step / bundler.** Distress OS serves plain CSS. Prefer extending existing files over inventing a design-system package.
- **Do not create `bridge-v3.css` or `phuglee-filter.css` as a parallel universe.** A second Filter sheet guarantees cascade fights. Expand shared + restyle `bridge.css`.
- **Optional new file only if `phuglee-components.css` exceeds ~25–30KB of true shared primitives** (e.g. `phuglee-forms.css` or `phuglee-data.css`). Default: keep one shared components file.
- **Home CSS stays isolated.** Pull DNA (tokens, glass, buttons), not homepage layout selectors.

## Architectural Patterns

### Pattern 1: Token → Primitive → Composition

**What:** Visual values live in `tokens.css`. Primitives (`.phuglee-btn-primary`, `.phuglee-panel`) consume tokens. Page sheets compose primitives with domain layout.

**When to use:** Always for v3.0 surface work.

**Trade-offs:** Slightly more class names on elements (`bridge-panel phuglee-panel`); wins reuse and theme consistency. Avoids hardcoding `#e58435` in page CSS.

**Example:**
```html
<!-- Composition: domain layout class + shared look class -->
<section class="bridge-panel phuglee-panel bridge-panel--desk">
  <select id="bridge-state" class="phuglee-select">…</select>
  <button type="button" class="phuglee-btn phuglee-btn-primary" id="bridge-process">Scrub it</button>
</section>
```

```css
/* bridge.css — layout only; look comes from .phuglee-panel */
.bridge-panel--desk {
  display: grid;
  gap: var(--space-md);
}
/* BAD: re-declare glass fill/shadow already on .phuglee-panel */
```

### Pattern 2: Shared System Wins; Page Overrides by Specificity (not !important)

**What:** Cascade order should be:

```
tokens → glass → heat/premium shell → phuglee-components → bridge.css → phuglee-a11y
```

**When to use:** For the makeover load-order fix. **Today** `bridge.html` loads `bridge.css` *before* `phuglee-components.css`, so shared components override equal-specificity bridge rules. That is inverted from normal page composition.

**Trade-offs:** Flipping order is the right long-term model (page composes system), but requires a deliberate pass: any bridge rule that *accidentally* depended on loading first must be rewritten as intentional higher-specificity override (`.bridge-panel.phuglee-panel { … }`) or deleted as dead duplicate.

**Recommended target order in `bridge.html`:**
```html
<link rel="stylesheet" href="/css/tokens.css?v=…">
<link rel="stylesheet" href="/css/distress-glass.css?v=…">
<link rel="stylesheet" href="/css/heat-base.css">
<link rel="stylesheet" href="/css/heat-atmosphere.css">
<link rel="stylesheet" href="/css/premium-atmosphere.css">
<link rel="stylesheet" href="/css/premium-components.css">
<link rel="stylesheet" href="/css/shell.css">
<link rel="stylesheet" href="/css/shell-nav.css?v=…">
<link rel="stylesheet" href="/css/settings-menu.css">
<link rel="stylesheet" href="/css/command-palette.css">
<link rel="stylesheet" href="/css/distress-status.css">
<link rel="stylesheet" href="/css/phuglee-components.css?v=…">  <!-- shared system -->
<link rel="stylesheet" href="/css/bridge.css?v=…">              <!-- page last -->
<link rel="stylesheet" href="/css/phuglee-a11y.css">             <!-- a11y final -->
```

### Pattern 3: Dual-Class Hooks (no JS rewrite)

**What:** Keep stable `id`s and `bridge-*` classes that JS queries. Add or align `phuglee-*` / `distress-glass*` classes for look.

**When to use:** Every control restyle.

**Trade-offs:** Markup is slightly noisier; behavior stays zero-risk. Prefer class adds over selector rewrites in JS.

**Example:**
```html
<!-- ids and data-action stay; visual classes upgrade -->
<button type="button"
  class="phuglee-btn phuglee-btn-primary"
  id="bridge-process"
  disabled>Scrub it</button>
```

### Pattern 4: Promote Once, Specialize in Bridge

**What:** When three+ Filter surfaces need the same control look (select, chip, table row, empty state), promote the primitive to `phuglee-components.css`. Keep Filter-only semantics (kill-rate HUD, Train theater modes, dossier stamp, scrub feed) in `bridge.css`.

**When to use:** During component inventory in Phase 2 of the roadmap.

**Promote (shared):**
| Primitive | Exists? | Action |
|-----------|---------|--------|
| Buttons primary/secondary/ghost/danger | Yes | Polish to home CTA energy; already used on Filter |
| Panels / featured / float | Yes | Ensure Filter panels drop local glass re-declarations |
| Inputs / textarea / select | Partial | Expand + **apply** on Filter (today many raw `<select>` use `.bridge-row select` only) |
| Empty / loading / error | Yes | Wire Filter error/loading panels to shared classes |
| Eyebrow / hero title utilities | Yes | Align Filter hero with `phuglee-eyebrow` / cream Anton DNA |
| Chips (ops type / filter chips) | No shared | **Promote** generic `.phuglee-chip` if used beyond Filter; else keep `.bridge-type-chip` |
| Data tables | No shared | **Promote** dense `.phuglee-table` if Collect/Vault will need it; else Filter-only for v3.0 |

**Stay isolated in `bridge.css`:**
| Surface | Why Filter-only |
|---------|-----------------|
| `.bridge-desk` / scrub stage layout | Product layout, not a brand primitive |
| Kill-rate report / victory strip | Scrub theater domain |
| Live scrub feed | Process climax UI |
| Train theater modes / Rules armory | Admin ops chrome |
| City dossier / outcome drawer | City Tracker adjacency |
| Shift queue / staging inventory HUD | Session workflow |
| Type column confirm dialog layout | Format-memory gate UX |
| Type chips (violation vs water) | Domain choice control |

## Data Flow

### Token Data Flow (not app state)

```
tokens.css (:root custom properties)
    │
    ├─► distress-glass.css     uses --glass-fill, --glass-blur, --glass-shadow*
    ├─► phuglee-components.css uses --phuglee-*, --glass-*, --shadow-cta*, --card-*
    ├─► premium-atmosphere.css uses opacity vars; photo stack
    ├─► shell / nav            uses chrome glass tokens
    └─► bridge.css             MUST prefer var(--phuglee-*) / var(--glass-*)
                               over raw rgba(#e58435) duplicates

theme.js → document [data-theme="light"|"dark"]
    └─► tokens.css [data-theme="light"] redefines the same property names
         (components need no theme forks if they only use tokens)
```

### Markup → Look Flow

```
bridge.html element
  classes: bridge-* (structure/JS) + phuglee-* (look)
       │
       ▼
cascade resolves:
  tokens provide values
  phuglee-components paint shared look
  bridge.css positions, densifies, and paints domain-only theater
       │
       ▼
browser paint (no build step, no CSS-in-JS)
```

### Key Data Flows (visual system only)

1. **Brand change:** edit `tokens.css` once → every surface on tokens updates (home + Filter + shell).
2. **Shared control change:** edit `.phuglee-btn-primary` → Filter process CTA + home CTAs stay aligned.
3. **Filter layout change:** edit `bridge.css` only → no risk to home/auth.
4. **Filter behavior change:** **out of scope** — `bridge*.js` / `lib/bridge-*` frozen.

### Request Flow (unchanged product path)

```
Operator → bridge.html UI → bridge.js → /api/bridge/* → engine/brain/lists
                ▲
                └── visual makeover touches only the first box (HTML classes + CSS)
```

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| tokens ↔ all CSS | CSS variables | Single write surface for palette/type/glass |
| phuglee-components ↔ bridge.html | Class names | Dual-class composition; no JS contract |
| distress-glass ↔ phuglee-panel | Shared tokens + optional dual class | `.phuglee-panel.distress-glass--float` already exists |
| premium-atmosphere ↔ body | `has-premium-bg` + `.premium-bg` stack | Already on bridge; keep as atmosphere source |
| bridge.css ↔ bridge.js | Class/id/aria selectors | **Do not rename** ids, `data-action`, `data-mode`, `data-step`, role hooks without JS work (forbidden) |
| home/auth CSS ↔ Filter | **None (reference only)** | Copy DNA via tokens/components, not `@import` |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google Fonts (Anton / Outfit / JetBrains Mono) | `<link>` in HTML head | Already on bridge + home; keep parity |
| Static images (`home-hero-distressed.jpg`, grain SVG, wear) | CSS `url()` via premium-atmosphere | Already wired; do not re-home into bridge.css |

### New vs Modified Files (explicit)

| File | Action | Scope |
|------|--------|-------|
| `public/css/tokens.css` | **Modify** | Add missing density/form/table tokens only if shared need is proven |
| `public/css/phuglee-components.css` | **Modify** | Expand forms, chips (if shared), tables (if shared), polish buttons/panels to home energy |
| `public/css/distress-glass.css` | **Modify lightly or keep** | Only if elevation primitive missing; prefer reuse |
| `public/css/bridge.css` | **Modify heavily** | Restyle surfaces; delete duplicate glass; densify ops chrome with tokens |
| `public/bridge.html` | **Modify lightly** | Add/align `phuglee-*` classes; fix stylesheet order; **no id/role churn** |
| `public/css/phuglee-a11y.css` | Touch only if needed | Focus/reduced-motion after restyle |
| `public/css/premium-atmosphere.css` | Keep | Atmosphere already correct class of system |
| `public/js/bridge*.js` | **Do not modify** for visual system | Function freeze |
| `lib/**` | **Do not modify** | Function freeze |
| **New** `public/css/phuglee-forms.css` (optional) | Only if components file bloats | Prefer not |
| **New** parallel Filter theme sheet | **Do not create** | Cascade debt |

## Build Order for Roadmap Phases

Dependency order is non-negotiable. Later phases assume earlier layers are stable.

```
1. Tokens foundation
       ↓
2. Shared components expansion
       ↓
3. Cascade order + markup hooks
       ↓
4. Bridge application (layout-preserving restyle)
       ↓
5. Surface-by-surface theater polish
       ↓
6. Visual QA lock (no process tests rewrite beyond smoke)
```

| Phase | Name | Depends on | Deliverables | Avoids |
|-------|------|------------|--------------|--------|
| **A** | Token audit & gaps | — | Inventory home vs Filter token usage; add only missing shared vars; document aliases | Inventing a second palette |
| **B** | Shared components | A | Upgrade `phuglee-components` (buttons/panels/forms/empty) to home-grade; expand select/input | Filter-only hacks in shared file |
| **C** | Cascade + hooks | A, B | Flip load order to components→bridge; add `phuglee-select`/`phuglee-input` classes in HTML | Renaming JS-bound ids |
| **D** | Bridge restyle core | B, C | Strip duplicate glass from `.bridge-panel*`; hero/desk/dropzone/process CTA parity | Structural HTML rewrite |
| **E** | Theater surfaces | D | Kill report, feed, Train, lists, victory, dossier — still CSS/markup only | Promoting theater to shared |
| **F** | QA | E | 390 + 1440 visual, reduced-motion, contrast, `verify-live`, full suite green | “Looks fine on my laptop” only |

**Phase ordering rationale:**
1. **Tokens first** — every later rule should read variables; changing tokens after component polish causes thrash.
2. **Shared components before Filter application** — Filter should *consume* the system, not invent one-off CTAs that later get copy-pasted to shared.
3. **Cascade/hooks before mass restyle** — wrong load order makes “why didn’t my override win?” debugging dominate the milestone.
4. **Core desk before theater chrome** — operators live in city + dropzone + process; victory/Train are secondary surfaces.
5. **QA last** — visual lock after surfaces stabilize; suite remains the function freeze bar (no intentional behavior change).

**Research flags:**
- Phase A: Low research — tokens already rich; mostly inventory.
- Phase B: Medium — form control styling across browsers (native `<select>` limits).
- Phase C: Low research, high care — cascade flip regression risk.
- Phase D–E: Low research — execution against existing structure.
- Phase F: Standard patterns (Playwright widths already used in prior milestones).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Filter-only (this milestone) | Extend tokens + phuglee-components; restyle bridge.css |
| Site-wide later (Collect, Vault, Hub, Heat) | Reuse Layer 0–1 unchanged; each page sheet becomes a thin composition layer |
| Design drift at 5+ pages | Add a short `docs/brand/PHUGLEE-SYSTEM.md` inventory of primitives — still no bundler |

### Scaling Priorities

1. **First bottleneck:** `bridge.css` size + duplicated glass rules → fix by promotion + deletion, not by splitting into 10 Filter partials without a shared system.
2. **Second bottleneck:** Unstyled native form controls after button pass → expand shared form primitives early (Phase B).
3. **Non-bottleneck:** CSS file count / HTTP — local + Railway static serve is fine; do not introduce a CSS pipeline for this milestone.

## Anti-Patterns

### Anti-Pattern 1: Parallel Theme Sheet

**What people do:** Add `bridge-makeover.css` loaded after everything “just for v3”.
**Why it's wrong:** Permanent cascade debt; next milestone adds `bridge-makeover-2.css`.
**Do this instead:** Modify `tokens` / `phuglee-components` / `bridge.css` in place; bump `?v=` cache query.

### Anti-Pattern 2: Import Home CSS on Filter

**What people do:** `<link href="/css/home.css">` to “get the badass look.”
**Why it's wrong:** Homepage layout, chronicle, map preview, and marketing selectors leak; specificity wars; dead weight.
**Do this instead:** Treat home as visual reference; port DNA into tokens + shared components.

### Anti-Pattern 3: Hardcoded Palette in bridge.css

**What people do:** Re-declare `rgba(229, 132, 53, …)` and custom shadows on every Filter widget.
**Why it's wrong:** Light theme and future brand tweaks miss half the page; file bloats.
**Do this instead:** `var(--phuglee-orange)`, `var(--glass-shadow-float)`, `var(--shadow-cta)`.

### Anti-Pattern 4: Restyle via JavaScript

**What people do:** Inject styles, rebuild DOM for “prettier” chips, swap class names JS depends on.
**Why it's wrong:** Breaks function freeze; flaky Train/process selectors; out of scope for v3.0.
**Do this instead:** CSS + additive HTML classes only; preserve ids/`data-*`/roles.

### Anti-Pattern 5: Promote Theater to Shared

**What people do:** Move `.bridge-kill-report` into `phuglee-components` “for the system.”
**Why it's wrong:** Shared layer becomes Filter dump; other pages never use it; system loses meaning.
**Do this instead:** Shared = reusable controls. Theater = `bridge.css`.

### Anti-Pattern 6: Equal-Card Marketing Layout on Ops Desk

**What people do:** Force home-style large marketing cards onto dense Train/lists HUD.
**Why it's wrong:** v2.1/v2.2 already learned asymmetric ops density; marketing lift on every row kills scan speed.
**Do this instead:** Home energy on hero/CTAs/panels; keep dense ops chrome for tables, chips, Train.

### Anti-Pattern 7: Rename Classes JS Selects

**What people do:** Rename `.bridge-mode-tab` or strip `id="bridge-process"` for cleaner BEM.
**Why it's wrong:** Silent behavior regressions; suite may not cover every DOM query.
**Do this instead:** Additive classes; if a class must go, grep `public/js/bridge*.js` first — and still prefer not.

## Current Cascade Snapshot (as-built 2026-07-11)

### `/bridge` (authenticated Filter)

```
tokens → distress-glass → heat-base → heat-atmosphere → premium-atmosphere
→ premium-components → shell → shell-nav → settings-menu → command-palette
→ distress-status → bridge.css → phuglee-components → phuglee-a11y
```

**Issue:** page sheet before shared components (inverted composition). Fix in Phase C.

### `/` (home — north star)

```
tokens → heat-base → heat-atmosphere → heat-components → distress-glass
→ distress-heat-v2 → landing → home → home-chronicle → home-ui-preview
→ home-premium → coverage-dock → auth → phuglee-components → phuglee-a11y
```

**Note:** Home does not use shell/premium-atmosphere the same way; atmosphere is embedded in home layers. Filter correctly uses premium-atmosphere for the app-shell photo stack — keep that split.

### Already-good integration (do not undo)

- CTAs largely on `phuglee-btn` / `phuglee-btn-primary|secondary` (DESK-06 killed dead `.bridge-btn*`).
- Major panels dual-class: `bridge-panel phuglee-panel`.
- Pattern bg on main: `phuglee-pattern-bg phuglee-pattern-bg--subtle`.
- Dialogs use `phuglee-panel distress-glass--float`.
- Body atmosphere: `has-premium-bg` + `.premium-bg`.

### Gaps the makeover must close

| Gap | Evidence | Fix layer |
|-----|----------|-----------|
| Raw selects/inputs | `#bridge-state` / `#bridge-city` lack `phuglee-select` | HTML hooks + shared forms |
| Local glass re-declarations | `.bridge-panel.phuglee-panel` re-sets blur/shadow; pipeline steps hand-roll glass | bridge.css dedupe → tokens |
| Hero not home-grade | `.bridge-title` forces cream solid, strips gradient clip | bridge.css type hierarchy |
| Cascade inversion | bridge before phuglee-components | link order |
| Domain widgets still “pre-home” | kill HUD, chips, feed, Train — v2.1 theater without full home energy | bridge.css Phase E |

## Sources

- `public/bridge.html` — CSS includes + dual-class markup (verified 2026-07-11)
- `public/index.html` — home north-star includes
- `public/css/tokens.css` — full token surface including glass + light theme
- `public/css/distress-glass.css` — elevation primitives inventory
- `public/css/phuglee-components.css` — shared component API inventory
- `public/css/bridge.css` — section map (~85KB, 40+ theater/layout sections)
- `public/css/premium-atmosphere.css` — photo/grain stack
- `.planning/PROJECT.md` — v3.0 goal: CSS/markup only, home as north star, shared system for later site-wide
- Prior shipped visual work: v1.3 tokens, v2.1 scrub theater, v2.2 desk cinema (layout constraints to preserve)

---
*Architecture research for: Filter visual makeover (v3.0) — CSS system integration*
*Researched: 2026-07-11*
*Supersedes prior `.planning/research/ARCHITECTURE.md` content scoped to v2.0 product/engine seams*
