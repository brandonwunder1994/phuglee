---
phase: 11
slug: calm-design-foundation
status: approved
shadcn_initialized: false
preset: manual — shadcn zinc dark (warm stone variant)
created: 2026-06-30
---

# Phase 11 — UI Design Contract

> Visual and interaction contract for Calm Design Foundation. Vanilla HTML/CSS/JS — shadcn tokens ported manually, no React components.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn CSS variable reference only) |
| Preset | Manual port of shadcn **zinc dark**, warmed toward stone (`hue ~40–50`) |
| Component library | none — native `<dialog>`, existing modal classes until Phase 15 |
| Icon library | Existing inline SVG (no new icon dep in Phase 11) |
| Font (display) | Newsreader 600 — headings, product title |
| Font (body) | IBM Plex Sans 400/600 — UI, body, labels |
| Font (mono) | JetBrains Mono 400 — save status, diagnostics, log lines |
| CSS build | Tailwind CSS 3.4 CLI (`tailwindcss` npm devDep) |
| Token file | `public/css/tokens.css` (authoritative `:root`) |
| Legacy shim | `app.css` imports `tokens.css`; `--neon-*` / `--void` alias to new tokens |

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge padding |
| sm | 8px | Compact button padding, inline gaps |
| md | 16px | Default card padding, form field padding |
| lg | 24px | Section padding, modal body padding |
| xl | 32px | Layout gaps between major blocks |
| 2xl | 48px | Empty-state vertical breathing room |
| 3xl | 64px | Page-level top/bottom margin (future phases) |

Exceptions: **44px** minimum touch target for icon-only buttons (accessibility, not grid spacing).

---

## Typography

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Body | 14px | 400 | 1.5 | IBM Plex Sans |
| Label | 14px | 600 | 1.4 | IBM Plex Sans |
| Heading | 20px | 600 | 1.25 | Newsreader |
| Display | 28px | 600 | 1.2 | Newsreader |

**Hierarchy rule:** Size + weight carry hierarchy; color is secondary. Muted text uses `--muted-foreground`, never opacity hacks below 0.7.

**Phase 11:** Remap `--font-display`, `--font-body`, `--font-mono` in `tokens.css`. Update `index.html` Google Fonts link (drop Syne, DM Sans).

---

## Color

### 60 / 30 / 10 split

| Role | Hex | HSL (reference) | Usage (60/30/10) |
|------|-----|-----------------|------------------|
| Dominant (60%) | `#1c1917` | stone-900 | Page background (`--background`), base canvas |
| Secondary (30%) | `#292524` | stone-800 | Cards, sidebar, command bar, modals (`--card`, `--secondary`) |
| Muted surface | `#44403c` | stone-700 | Borders, dividers, disabled backgrounds (`--muted`, `--border`) |
| Foreground | `#fafaf9` | stone-50 | Primary text (`--foreground`) |
| Muted text | `#a8a29e` | stone-400 | Hints, timestamps, secondary labels (`--muted-foreground`) |

### Accent (10% — restricted)

| Role | Hex | Usage |
|------|-----|-------|
| Accent | `#6b9b7a` | Sage green — **only** items listed below |
| Accent foreground | `#fafaf9` | Text on accent-filled buttons |

**Accent reserved for:**
1. Primary CTA buttons: **Start scan**, **Choose Excel File** (filled background)
2. Keyboard focus ring (`--ring`: accent at 2px, offset 2px)
3. Save-success pulse dot on command bar (single 6px circle, no glow)
4. Active sidebar nav item left border (3px solid accent)

**NOT accent:** filter pills, tier badges, secondary buttons, links, icons, HUD elements — those use muted/border or tier semantic colors.

### Destructive

| Role | Hex | Usage |
|------|-----|-------|
| Destructive | `#e5484d` | Stop scan button, destructive confirmations only |
| Destructive foreground | `#fafaf9` | Text on destructive filled buttons |

### Tier semantics (recalibrated, not accent)

| Tier | Hex | Background | Border |
|------|-----|------------|--------|
| Distressed | `#4d9e6a` | `rgba(77,158,106,0.12)` | `rgba(77,158,106,0.35)` |
| Well maintained | `#5b8fd9` | `rgba(91,143,217,0.12)` | `rgba(91,143,217,0.35)` |
| Needs review | `#d45d6a` | `rgba(212,93,106,0.12)` | `rgba(212,93,106,0.35)` |
| Vacant / land | `#c4843a` | `rgba(196,132,58,0.12)` | `rgba(196,132,58,0.35)` |
| Blurred | `#78716c` | `rgba(120,113,108,0.12)` | `rgba(120,113,108,0.35)` |

**Phase 11:** Remap `--tier-*`, `--review-*`, `--warning-*` to table above. Remove `--neon-*` glow vars; alias to muted equivalents for legacy class compatibility.

### Surfaces & elevation

- **No** gradient mesh on `body::before` — solid `--background` only
- **No** `text-shadow` glow on metrics or HUD text
- Cards: `1px solid var(--border)`, `border-radius: 8px`, shadow `0 1px 2px rgba(0,0,0,0.24)` max
- Glass morphism (`.glass`): replace with flat `--card` + border; keep class name, change rules in Phase 11 token pass

---

## Motion

| Allowed | Forbidden |
|---------|-----------|
| Scan progress bar width transition (300ms ease) | `hud-blink`, step-end infinite animations |
| Save dot fade-in (200ms) | Pulse dots on live tags |
| `prefers-reduced-motion: reduce` disables all motion | Gradient glint/sheen on progress frames |
| Command palette open (150ms opacity) | `body::before` animated gradients |

**Phase 11:** Add global `@media (prefers-reduced-motion: reduce)` guard. Gate remaining legacy HUD animations behind `body.legacy-hud` until Phase 12 removes them.

---

## Visual Hierarchy (Phase 11 scope)

**Focal point:** Calm readable canvas — background + body text establish trust before any accent appears.

**Eye path (after token apply):**
1. Foreground text on stone background (contrast ≥ 7:1 for body)
2. Secondary surfaces (cards) via border, not glow
3. Accent appears only on primary CTA when visible (Phase 12+ layout may hide some; tokens ready now)

**Icon-only controls:** Must retain `title` + `aria-label` (existing pattern preserved).

---

## Copywriting Contract

Phase 11 does not change layout copy yet; tokens and future phases use this locked copy:

| Element | Copy |
|---------|------|
| Primary CTA (empty state) | **Choose Excel File** |
| Primary CTA (loaded) | **Start scan** |
| Secondary CTA (empty) | Restore my last scan |
| Empty state heading | Upload a spreadsheet to start |
| Empty state body | Drop an Excel file with addresses — or press ⌘K for more options. |
| Error state (save failed) | Save didn't reach the server. Your work is still in this browser — try again or download a backup. |
| Error state (no API keys) | API keys missing — open Settings and check your .env file. |
| Destructive confirmation (stop scan) | Stop scan: progress is saved; remaining addresses stay in the queue. |
| Destructive confirmation (reset data) | Reset saved data: clears this browser's session. Server backup is not deleted. |

**Tone:** Calm, direct, no sci-fi ("Intelligence Brief" → deferred to Phase 12 rename).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (token reference only, no CLI init) | not required |
| Third-party | none | not applicable |

---

## Phase 11 Deliverables Checklist

Executor must produce:

1. `public/css/tokens.css` — full `:root` semantic + tier tokens from this spec
2. `public/css/input.css` — `@tailwind base/components/utilities` + `@import "./tokens.css"`
3. `public/css/tailwind.css` — built output (git-tracked or build-on-start; planner decides)
4. `package.json` — `"css:build": "tailwindcss -i ./public/css/input.css -o ./public/css/tailwind.css --minify"`
5. `tailwind.config.js` — content: `["./public/**/*.{html,js}"]`, theme extends tokens
6. `index.html` — stylesheet order: `tailwind.css` → `app.css`; new font links
7. `app.css` — `@import url("/css/tokens.css")` at top; remap `:root` to import; add `body.legacy-hud` gate for blink/glow rules
8. **No DOM ID changes.** **No JS logic changes.** `npm test` passes.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — specific CTAs, empty/error with solution paths
- [x] Dimension 2 Visuals: PASS — focal point and eye path declared
- [x] Dimension 3 Color: PASS — 60/30/10 split, accent list explicit, destructive declared
- [x] Dimension 4 Typography: PASS — 4 sizes, 2 weights, line heights declared
- [x] Dimension 5 Spacing: PASS — 4px grid, one justified exception (44px touch)
- [x] Dimension 6 Registry Safety: PASS — no third-party registries

**Approval:** approved 2026-06-30