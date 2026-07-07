# v1.3 Calm UI — Design Brief

**Milestone:** v1.3 Calm Premium Interface  
**Phase 11 scope:** Design foundation (tokens, Tailwind, typography, retire cyber aesthetic)  
**Date:** 2026-06-30  
**Base:** `b51da2f`, 78 tests passing

---

## Step 1 — Research (2026 calm UI patterns)

### Reference products

| Product | Pattern to borrow | Avoid |
|---------|-------------------|-------|
| **Linear** | Single accent, tight hierarchy, command palette as power layer, muted borders | Over-minimalism that hides status |
| **Notion** | Warm-neutral surfaces, generous padding, soft shadows not glows | Slow dense tables |
| **shadcn/ui** | Semantic CSS variables (`--background`, `--foreground`, `--muted`, `--accent`), 8px radius, `border` not `box-shadow` glow | React component dependency |
| **Radix** | Focus rings, accessible dialog/sheet patterns | Full React primitive stack |

### 2026 trends relevant to this tool

1. **Quiet interfaces** — operational tools shed "dashboard theater"; status is subtle, not neon.
2. **Progressive disclosure** — power features behind ⌘K, overflow menus, or expandable sections.
3. **Token-first design** — one `:root` theme drives all surfaces; avoids 6,650-line CSS drift.
4. **Typography as hierarchy** — size/weight contrast replaces color chaos for tier distinction.
5. **Restrained motion** — progress indicators animate; decorative blink/pulse removed.

### Free stack approach (vanilla HTML/JS)

- **Tailwind CSS v4 CLI** — build step in `package.json`; no React required.
- **shadcn theme variables** — copy `:root` oklch/hsl token set into `tokens.css`; port button/input/dialog styles as utility compositions.
- **Native `<dialog>`** — replaces custom modal backdrop stack where possible.
- **Fonts (free):** `Fraunces` or `Newsreader` (display accent) + `IBM Plex Sans` (body) — distinctive, calm, not Inter/Space Grotesk.
- **No paid kits, no React migration.**

---

## Step 2 — Full project UI review

### Architecture

| Layer | Files | Notes |
|-------|-------|-------|
| Shell | `index.html` L13–363 | Sidebar + HUD bar + command bar + workspaces |
| Styles | `app.css` (6,650 lines) | Monolith; cyber tokens, glass, hud-*, neon-* |
| Runtime | `app.js`, `config.js`, `render.js`, `session.js`, `review.js`, `scan.js` | `PDA.env` module pattern; DOM ID coupling |
| Power UX | `initAppShell()` | ⌘K palette with 20+ commands — underused vs visible chrome |

### Clutter inventory (visible without user action)

1. **Fixed HUD bar** — clock, "Distress Intelligence", blinking status dot
2. **Sidebar brand** — "DistressOS / Intelligence Suite" + 4 nav + 2 admin submenu groups (10+ items)
3. **Command bar** — title + file + save + workers + backup size + Start/Stop
4. **Empty workspace** — 6 buttons (upload, API keys, restore, save, load, reset)
5. **Scan section** — HUD scan panel + agent grid + fail stats + log panel
6. **Summary** — 5 KPI cards + pipeline track + "Intelligence Brief" tags
7. **Results toolbar** — 6 filter pills + lead type select + bulk edit + view toggle + search
8. **Live tier alert stack** — persistent top-right cards during scan

### What must stay (hidden OK)

- 10k+ session save/hydration (`session.js`, `state.js`)
- Tier engine + learned brain (`review.js`, `scan.js`, `lib/tier-engine.js`)
- Backup tiers + honest save status
- Review mode overlay + keyboard shortcuts
- Virtual scroll + progressive render (`render.js`)
- Command palette actions (already the right progressive-disclosure vehicle)

### Risk areas

- **DOM ID stability** — JS uses `getElementById` extensively; HTML restructuring needs shim or preserve IDs
- **CSS specificity** — 6,650-line monolith; incremental token layer safer than big-bang delete
- **Tier color semantics** — distressed=green, well=blue, review=red must remain distinguishable in calm palette

---

## Step 3 — Five high-impact changes

### Change 1: Calm token foundation (retire cyber-HUD palette)

| Field | Detail |
|-------|--------|
| **Impact** | 🔴 Highest — every surface inherits; one change lifts entire app |
| **Current** | `--void`, `--neon-cyan`, `--neon-violet`, gradient meshes, glow text-shadows, hud-blink animations |
| **Target** | shadcn-style semantic tokens: warm stone dark OR soft zinc light base, single sage/amber accent, tier colors muted not neon |
| **Touches** | `app.css` `:root`, new `public/css/tokens.css`, `index.html` font links |
| **Backend risk** | None |

### Change 2: Collapse shell chrome (HUD bar + sidebar admin demotion)

| Field | Detail |
|-------|--------|
| **Impact** | 🔴 Highest — immediate calm; removes ~40% visible clutter |
| **Current** | Fixed HUD bar + 248px sidebar with Settings/Manage Data submenus always visible |
| **Target** | No HUD bar; slim sidebar: Overview · Leads · Review · ··· overflow; backup/brain/settings/export via ⌘K + overflow |
| **Touches** | `index.html` L14–76, L72–76; `app.css` hud-bar/sidebar-*; `app.js` initAppShell |
| **Backend risk** | None — rewire click handlers only |

### Change 3: Tailwind + shadcn-token build pipeline

| Field | Detail |
|-------|--------|
| **Impact** | 🟠 High — stops CSS monolith growth; enables phased migration |
| **Current** | Zero build step; 6,650-line hand-written CSS |
| **Target** | `npm run css:build` → Tailwind + `@theme` tokens; legacy `app.css` imports tokens, classes migrate incrementally |
| **Touches** | `package.json`, new `tailwind.config.js`, `public/css/input.css`, `index.html` link order |
| **Backend risk** | None |

### Change 4: Primary workflow simplification (empty + scan + summary)

| Field | Detail |
|-------|--------|
| **Impact** | 🟠 High — shapes first-run and daily-use experience |
| **Current** | 6-button empty state; HUD scan panel + expanded agent grid; 5 KPI cards always visible |
| **Target** | Empty: one CTA + "Restore last scan" link; Scan: slim progress bar, workers collapsed; Summary: 3 hero metrics + "Show breakdown" |
| **Touches** | `index.html` L131–271; `session.js` updateSummary*; `render.js` updateProgress; `app.css` progress/summary |
| **Backend risk** | None — display logic only |

### Change 5: Results toolbar → calm data view (segmented filters + deferred bulk edit)

| Field | Detail |
|-------|--------|
| **Impact** | 🟠 High — heaviest daily interaction surface after scan |
| **Current** | 6 filter pills + lead type + bulk edit bar + view toggle competing for attention |
| **Target** | Segmented control (All · Distressed · Review · More▾); search full-width; bulk edit behind "Edit" toggle; cards with quieter tier badges |
| **Touches** | `index.html` L273–355; `render.js` renderResults*; `imagery.js` updateBulkEditUi; `app.css` filter/cards |
| **Backend risk** | None |

---

## Final output requirements

1. **Phase 11 implements Change 1 + Change 3** (foundation); Changes 2, 4, 5 map to Phases 12–14.
2. **Preserve all DOM IDs** used by `public/js/*.js` or provide `id` shim in HTML.
3. **`npm test` must pass** after every phase; no save/tier/backup logic changes.
4. **Design contract** (`11-UI-SPEC.md`) produced via `/gsd:ui-phase 11` before `/gsd:plan-phase 11`.
5. **Manual smoke** after Phase 15: upload → scan → filter → review → save → restore.
6. **Free stack only** — document any new npm devDependency with license note.

---

*Brief author: discuss-phase 11 · 2026-06-30*