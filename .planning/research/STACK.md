# Stack Research

**Domain:** CSS/markup-only visual redesign of Filter (`/bridge`) + shared Phuglee design system (v3.0)  
**Researched:** 2026-07-11  
**Confidence:** HIGH  
**Milestone:** v3.0 Filter Visual Makeover (subsequent — brownfield surface redesign; process/brain/keep-kill locked)

## Recommended Stack

### Verdict (one line)

**Add zero npm packages and zero CSS tooling.** Ship the makeover by extending the existing vanilla cascade — `tokens.css` → `distress-glass.css` → `phuglee-components.css` → page CSS (`bridge.css`) — with query-string cache busts. Match login/home glass by **reusing** those primitives, not inventing a parallel Filter skin.

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla CSS3 (custom properties + cascade) | browser-native (Chromium/Edge primary) | All visual system + Filter desk layout | Already powers home, auth, glass, and Filter; no build step; edits go live via static serve |
| CSS custom properties (`:root` tokens) | existing `public/css/tokens.css` (~8.8 KB) | Brand, glass, type, shadow, spacing | Single source of truth already shared by `/`, auth, `/bridge`; light theme via `[data-theme="light"]` |
| Glass elevation primitives | existing `public/css/distress-glass.css` (~7.9 KB, `?v=glass2`) | Frosted cards, chrome, solid zones, pipeline rail | Home/login “badass” look lives here + tokens; Filter already loads it — use classes, don’t re-skin in bridge.css |
| Phuglee component classes | existing `public/css/phuglee-components.css` (~16.5 KB, `?v=glass2`) | Buttons, panels, inputs, empty/loading/error, pattern bg | Filter already uses `phuglee-btn` / `phuglee-panel` in markup; extend here for chips/tables/selects |
| Auth surface as visual north star | existing `public/css/auth.css` (`?v=3`) | Login modal glass density, field chrome, CTA energy | Best compact-control reference for desk density (not marketing hero scale) |
| Home premium atmosphere | existing `premium-atmosphere.css` + home CSS | Photo grain/wear backdrop, heat field | Bridge already uses `premium-bg` + `heat-field`; keep; tune intensity tokens if needed |
| Page orchestration CSS | existing `public/css/bridge.css` (~85 KB, `?v=44`) | Desk layout, scrub theater, train, lists, kill report | **Keep as page layout only** — stop growing shared look rules here; demote one-offs into system files |
| Vanilla HTML markup classes | existing `public/bridge.html` | Class swaps / structure for glass hierarchy | Function freeze = CSS + class/markup only; no new JS frameworks |
| Manual `?v=` query cache bust | existing convention | Force clients past 24h CSS cache | `lib/static-cache.js` sets CSS `max-age=86400`; query string is the established bust mechanism across all pages |
| Google Fonts (Anton / Outfit / JetBrains Mono) | existing link in `bridge.html` | Display / body / mono | Already aligned with home; do not add new typefaces for “redesign energy” |
| Node static serve | existing `server.js` + `lib/static-cache.js` | Serve `/css/*` with cache headers | No asset pipeline; HTML query params own busting |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none — runtime)* | — | — | **Do not add** runtime CSS/JS deps for this milestone |
| *(none — build)* | — | — | **Do not add** PostCSS, Sass, Tailwind, Lightning CSS, Vite, esbuild for distress-os shell |
| Playwright + Edge (existing QA path) | existing project practice | Layout QA at 390 / 1440 widths | Visual regression of desk after CSS pass — not a stack addition |
| `node --test` suite (~679) | existing | Permanent behavior bar | Must stay green; stack must not touch process/brain |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **None required** | Ship vanilla CSS | Matches how home/auth/glass already ship |
| Manual `?v=` bumps in HTML | Cache invalidation | Documented protocol below — no content-hash build |
| Optional: browser DevTools contrast + reduced-motion | A11y spot-check | Prefer over adding stylelint for a one-milestone reskin |
| **Do not add stylelint / PostCSS** this milestone | Consistency tooling | Only revisit if site-wide multi-page design system becomes a multi-month program with many contributors |

## Architecture of the CSS stack (integration points)

### Load order on `/bridge` (do not reorder carelessly)

Current `bridge.html` head (authoritative):

```
theme.js
fonts (Anton, JetBrains Mono, Outfit)
tokens.css?v=glass2
distress-glass.css?v=glass2
heat-base.css
heat-atmosphere.css
premium-atmosphere.css
premium-components.css
shell.css
shell-nav.css?v=9
settings-menu.css
command-palette.css
distress-status.css
bridge.css?v=44          ← page layout / desk theater
phuglee-components.css?v=glass2   ← AFTER bridge (can win on equal specificity)
phuglee-a11y.css
```

**Rule for v3.0:** Shared look lives in `tokens` + `distress-glass` + `phuglee-components`. `bridge.css` owns **structure, density, desk-specific composition**, and only thin overrides that cannot be generic.

### Layer responsibilities

| File | Owns | Must not own |
|------|------|--------------|
| `tokens.css` | Colors, glass fills/shadows, type scale, spacing, radii, motion durations, **new desk density tokens** | Selectors for components |
| `distress-glass.css` | `.distress-glass*`, glass-card, icon chip, pipeline rail, solid zone | Filter-specific IDs / train theater |
| `phuglee-components.css` | Buttons, panels, inputs, **chips, tables, badges, segmented controls, empty/loading/error** | Bridge layout grids |
| `auth.css` | Login modal only | Do not import auth into bridge; **copy patterns** into phuglee primitives instead |
| `premium-atmosphere.css` | Photo / grain / wear backdrop | Component chrome |
| `bridge.css` | Desk grid, scrub feed, kill report, train theater, lists HUD, step pipeline | Re-declaring full glass fills that already exist on `.phuglee-panel` |

### Token extensions (extend, don’t fork)

Already present (reuse):

- Brand: `--phuglee-*`
- Glass: `--glass-blur`, `--glass-fill`, `--glass-shadow*`, `--glass-border*`
- Type: `--font-display|body|mono`, `--text-display-*`, `--text-body*`
- Motion: `--card-duration`, `--card-ease`
- Shadows: `--shadow-cta`, `--shadow-panel`, `--shadow-btn-glass`

**Add only if missing after audit (proposed names — implement when first consumer needs them):**

| Token group | Examples | Why |
|-------------|----------|-----|
| Desk density | `--desk-gap`, `--desk-pad`, `--control-h`, `--control-h-sm` | Auth fields are roomy; Filter desk is dense — one place to tune |
| Chip / pill | `--chip-pad-y/x`, `--chip-radius`, `--chip-bg`, `--chip-border` | Type chips + proof chips currently bespoke in bridge.css |
| Table / feed row | `--row-pad-y`, `--row-border`, `--row-hover-bg` | Scrub feed + list tables need shared row chrome |
| Status surfaces | map kill/keep/warn to `--phuglee-danger|success|warn` only | Ban ad-hoc greens/reds in bridge |

**Do not invent a second palette.** If Filter looks “off,” fix token values or component classes, not new hex in `bridge.css`.

### Component system gaps to fill in `phuglee-components.css`

| Primitive | Status today | v3.0 action |
|-----------|--------------|-------------|
| `.phuglee-btn` + primary/secondary/ghost/danger | Shipped; Filter uses | Adopt everywhere; no new button families |
| `.phuglee-panel` + featured/exclusive/vault | Shipped; Filter uses | Prefer over custom panel skins |
| `.phuglee-input` / `.phuglee-select` / `.phuglee-textarea` | Basic shipped | Align bridge selects/inputs to these classes; extend glass-field styling once |
| Glass cards / icons | `distress-glass-card`, `distress-glass-icon` | Use for elevated mission cards |
| Chips / badges | **Missing as shared** | Add `.phuglee-chip` (+ variants) — absorb bridge type/proof chips |
| Tables | **Missing as shared** | Add `.phuglee-table` / row / header — absorb list + preview tables |
| Segmented control / tabs | Auth-local only | Promote pattern to `.phuglee-seg` if Filter needs it |
| Empty / loading / error | Shipped | Wire Filter empty/error panels to these classes |

### Cache-bust protocol (mandatory for /bridge)

**Server behavior** (`lib/static-cache.js`):

| Asset | Cache-Control |
|-------|----------------|
| `.css`, `.js` | `public, max-age=86400` (1 day) |
| Images / fonts / video | `immutable` 1 year |
| HTML | `no-store` |

HTML itself is never long-cached → **query strings on CSS/JS links are the bust mechanism.**

**Bump matrix for visual work:**

| When you change… | Bump these query params |
|------------------|-------------------------|
| `tokens.css` only | `tokens.css?v=` on **all pages that load it** (bridge, index, collect, command, heat, …) — currently shared tag `glass2` |
| `distress-glass.css` or `phuglee-components.css` | Same shared tag (`glass2` → `glass3` or monorepo-wide `v=glassN`) on every consumer |
| `bridge.css` only | `bridge.css?v=44` → next integer **only on `bridge.html`** |
| `premium-atmosphere.css` / shell-nav / page-local | That file’s `?v=` on pages that include it |
| Behavior JS (out of scope for pure visual) | Existing `bridge.js?v=`, etc. — do not touch for CSS-only |

**Recommended convention for v3.0:**

1. Keep **shared system trio** on one synchronized version string:  
   `tokens.css?v=glassN` + `distress-glass.css?v=glassN` + `phuglee-components.css?v=glassN`
2. Keep **page CSS** on its own integer: `bridge.css?v=45`, `home.css?v=…`
3. After every visual ship that users might still have cached, bump at least the files you touched; when in doubt, bump the shared `glassN` trio + `bridge.css`.
4. **Do not** introduce content-hashed filenames or a bundler for this milestone.

### Markup strategy

| Approach | Use? | Why |
|----------|------|-----|
| Add/remove shared classes on existing nodes | **Yes** | Primary lever — e.g. ensure controls are `phuglee-btn phuglee-btn-primary` |
| Minimal wrapper divs for glass structure | **Yes, sparingly** | Only when hierarchy needs a grain/edge layer the class alone can’t provide |
| Rewrite IDs / data-action / JS hooks | **No** | Function freeze |
| New JS components / framework | **No** | Locked process UI |

## Installation

```bash
# No new packages. Working tree already has everything.

# Verify after CSS/HTML edits (mandatory per AGENTS.md):
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1

# Behavior bar (must remain green):
npm test
```

There is **no** `npm install` step for v3.0 visual work.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vanilla CSS files + tokens | PostCSS + nesting / Autoprefixer | Multi-team design system with CI lint; **not** this brownfield reskin |
| Extend `phuglee-components.css` | New `filter-design-system.css` parallel package | Never for v3.0 — forks the brand; later site rollout needs one system |
| Query-string `?v=` | Content-hash filenames via Vite/esbuild | Only if you introduce a real frontend build for the whole shell (backlog) |
| Manual cascade layering via link order | `@layer` system-wide rewrite | Optional later polish; high conflict risk with 85 KB bridge.css |
| Reuse glass tokens as-is | Tailwind (Analyzer child uses 3.4.17) | Analyzer is a **different app**; do not Tailwind the shell `/bridge` |
| Pure CSS motion (`transition` + reduced-motion) | Framer Motion / GSAP | Explicit backlog; violates CSS/markup-only freeze |
| Class-based components | Web Components / React | Out of scope; React migration is backlog only |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React / Preact / Vue | Function freeze + dual runtime; PROJECT backlog only | Class swaps on existing HTML |
| CSS-in-JS (styled-components, emotion) | Runtime cost, build, fights static cache model | Static CSS files |
| Tailwind in distress-os shell | Analyzer-only; utility soup vs established token system | Phuglee tokens + component classes |
| Sass/Less/SCSS | Build step for zero payoff on already-working cascade | Plain CSS + custom properties |
| PostCSS / Lightning CSS / cssnano pipeline | Adds CI/tooling debt; static files already small enough | Hand-authored CSS |
| stylelint **as a gate this milestone** | Setup cost > benefit for one surface makeover | Visual QA + a11y checklist |
| New icon font / icon library | Another asset + style fight | Existing SVG / unicode / current icon chips |
| New typefaces | Breaks Phuglee DNA vs home/login | Anton + Outfit + JetBrains Mono |
| Second glass palette in `bridge.css` | Divergence from home “badass” look within days | Token + `distress-glass` + `phuglee-panel` |
| Changing `lib/bridge-engine/*`, brain, keep/kill JS | Product lock; 679-test bar | CSS/markup only |
| Express/static asset fingerprint middleware | Unnecessary for single-operator deploy | HTML `?v=` bumps |
| `@import` chains for system CSS | Extra RTTs; current multi-link pattern is fine | Keep explicit `<link>` tags |

## Stack Patterns by Variant

**If work is pure visual parity with home/login:**
- Extend tokens + glass + phuglee-components first
- Replace bridge-local chrome that duplicates glass
- Bump `glassN` + `bridge.css?v=`

**If a control has no shared primitive yet (chip, table row):**
- Add to `phuglee-components.css` with token vars
- Switch Filter markup to the new class
- Delete redundant bridge rules once parity proven

**If something needs motion:**
- Use existing `--card-duration` / `--card-ease` and `prefers-reduced-motion` blocks already in glass/components
- Do not add animation libraries

**If cache looks stale after deploy:**
- Confirm HTML served `no-store`
- Bump the `?v=` on the CSS file that changed
- Hard-refresh once (`Ctrl+Shift+R`)

**If later site-wide rollout (post-v3.0):**
- Same stack — apply `phuglee-*` + glass to Collect/Command/Heat
- Still no React/Tailwind required for shell pages

## Version Compatibility

| Piece | Compatible With | Notes |
|-------|-----------------|-------|
| `tokens.css` glass vars | `distress-glass.css`, `phuglee-components.css`, `auth.css` | All consume `--glass-*` / `--phuglee-*` |
| `phuglee-components.css?v=glass2` after `bridge.css?v=44` | Filter markup using dual classes (`.bridge-panel.phuglee-panel`) | Components load **after** bridge so shared button/panel rules can win; bridge may still override with equal/higher specificity — prefer lowering bridge specificity over fighting with `!important` |
| `[data-theme="light"]` token block | Glass fills/shadows | Any new tokens must define light counterparts |
| `backdrop-filter` | Chromium/Edge/WebKit; Firefox OK modern | Always pair `-webkit-backdrop-filter`; solid fallback already via `--glass-bg` |
| `lib/static-cache.js` 86400 on CSS | `?v=` query bust | Without `?v=` bump, users can see stale CSS for up to 24h |
| Analyzer Tailwind 3.4.17 | **Not linked** from `/bridge` | Child app isolation; do not couple |
| Fonts link | Display CTAs (Anton) + UI (Outfit) | Match home weights; Filter already loads full set |

## Sources

- Repo ground truth — `public/css/tokens.css`, `distress-glass.css`, `phuglee-components.css`, `auth.css`, `bridge.css` (~85 KB), `bridge.html` / `index.html` link tags — **HIGH**
- `lib/static-cache.js` — CSS `max-age=86400`, HTML `no-store` — **HIGH**
- `package.json` (distress-os root) — no CSS tooling; only xlsx/pdf/ocr runtime deps — **HIGH**
- `.planning/PROJECT.md` v3.0 decisions — CSS/markup only; home/login north star; shared system for later rollout — **HIGH**
- Child Analyzer `modules/property-analyzer` Tailwind — **not** for shell Filter — **HIGH**
- Ecosystem default for brownfield vanilla redesigns (2025–2026): prefer design tokens + component classes over introducing a build for a single-page reskin — **MEDIUM** (practice consensus; not a library version claim)

---
*Stack research for: Distress OS v3.0 Filter Visual Makeover (CSS/markup-only)*  
*Researched: 2026-07-11*
