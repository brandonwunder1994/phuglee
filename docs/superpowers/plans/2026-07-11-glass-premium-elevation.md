# Glass Premium Elevation Implementation Plan

> **For agentic workers:** Execute tasks in order. Shared tokens + components first, then surface polish, then cache-bust + deploy.

**Goal:** Raise cards and buttons sitewide to a frosted glass, shadow-lifted premium look without inventing a new brand language.

**Architecture:** Strengthen the existing Phuglee glass system (`tokens.css` → `phuglee-components.css` / `distress-glass.css` → page CSS). Filter (`bridge.css`) must not flatten elevation. Cache-bust all app shells so Railway/production clients pick up CSS.

**Tech Stack:** Static CSS tokens + vanilla HTML shells; Railway deploy via `git push origin main`.

## Global Constraints

- No wipe of filter-lists / brain data
- Keep Analyze independence (no push CTAs)
- Honor `prefers-reduced-motion` (no lift transforms when reduced)
- Phuglee palette only (cream / orange / gold / black)

---

### Task 1: Token foundation (raised glass)

**Files:** `public/css/tokens.css`

- [x] Deepen `--glass-shadow`, `--glass-shadow-float`, `--glass-shadow-featured` (multi-layer lift)
- [x] Slightly more translucent `--glass-bg` / stronger edge shine
- [x] Add `--shadow-cta-hover`, `--shadow-btn-glass`

---

### Task 2: Shared buttons + panels

**Files:** `public/css/phuglee-components.css`

- [x] Primary CTA: gem gradient + stacked ember shadow + hover lift
- [x] Secondary: frosted glass fill + blur + top hairline
- [x] Danger: glass-tinted raised control
- [x] Panels: default raised shadow; hover `translateY(-2px)` + float shadow
- [x] Reduced-motion: disable transforms

---

### Task 3: Filter surface (no flatten)

**Files:** `public/css/bridge.css`, `public/bridge.html`

- [x] Remove hover overrides that zeroed panel transform/shadow
- [x] Glass dropzone, type chips, pipeline steps, inventory HUD, row actions
- [x] Cache-bust bridge + tokens + phuglee-components

---

### Task 4: Sitewide cache-bust shells

**Files:** `public/index.html`, `collect.html`, `command.html`, `heat.html`, `vault.html` (+ bridge)

- [x] Append `?v=glass2` to `tokens.css`, `phuglee-components.css`, `distress-glass.css` on all shells

---

### Task 5: Verify + Railway

- [x] `scripts\verify-live.ps1` green
- [x] Commit glass elevation files only
- [x] `git push origin main` (Railway deploy source: phuglee.git)
