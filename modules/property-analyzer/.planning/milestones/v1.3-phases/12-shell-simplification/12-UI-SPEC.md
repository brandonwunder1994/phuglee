---
phase: 12
slug: shell-simplification
status: approved
shadcn_initialized: false
preset: inherits Phase 11 — shadcn zinc dark (warm stone)
created: 2026-06-30
---

# Phase 12 — UI Design Contract

> Shell simplification: collapse HUD bar, slim sidebar, single-row command bar. Inherits Phase 11 tokens; no new design system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (inherits `public/css/tokens.css` from Phase 11) |
| Preset | Phase 11 calm stone — **no new colors** |
| Component library | none — native `<dialog>`, existing modal classes |
| Icon library | Existing Unicode nav icons + inline SVG on buttons |
| Font (display) | Newsreader 600 — product title in sidebar + command bar |
| Font (body) | IBM Plex Sans 400/600 — nav, labels |
| Font (mono) | JetBrains Mono 400 — file status, save status, scan status chip |

**Phase 12 rule:** Restyle shell chrome only. Do not introduce new npm UI dependencies.

---

## Spacing Scale

Inherits Phase 11 tokens (`--space-xs` through `--space-3xl`). Shell-specific usage:

| Token | Value | Shell usage |
|-------|-------|-------------|
| xs | 4px | Gap between save dot and save label |
| sm | 8px | Nav item vertical gap, command bar internal gap |
| md | 16px | Sidebar horizontal padding, command bar padding |
| lg | 24px | Sidebar brand block bottom margin |
| xl | 32px | Main content top offset after command bar |

Exceptions: **44px** minimum touch target for overflow `···` button and icon-only controls (accessibility).

**Layout constants (preserve or adjust minimally):**
- `--sidebar-w`: **220px** (slim from 248px — optional in execute if 220 fits; min 200px)
- `--topbar-h`: **removed** — no fixed HUD bar; command bar `sticky top: 0` with `padding-top: md` on `.app`

---

## Typography

Inherits Phase 11 scale. Shell-specific roles:

| Role | Size | Weight | Line Height | Font | Element |
|------|------|--------|-------------|------|---------|
| Product title | 18px | 600 | 1.25 | Newsreader | `.sidebar-title`, `.command-title` |
| Nav label | 14px | 500 | 1.4 | IBM Plex Sans | `.sidebar-nav-btn` |
| Status mono | 12px | 400 | 1.35 | JetBrains Mono | file status, save status, `#hudStatus` chip |
| Overflow hint | 12px | 400 | 1.4 | IBM Plex Sans | sidebar footer `⌘K` hint |

**Hierarchy rule:** Command bar title is not larger than section headings elsewhere — shell is quiet, not billboard.

---

## Color

Inherits Phase 11 60/30/10 split. Shell-specific application:

| Surface | Token | Usage |
|---------|-------|-------|
| Sidebar background | `--card` | Flat, `border-right: 1px solid var(--border)` — no neon glow |
| Command bar | `--card` | Same as cards; sticky; no gradient title text |
| Active nav item | `--secondary` bg + **3px left border `var(--accent)`** | One active state only |
| Status chip (idle) | `--muted-foreground` text | `#hudStatus` when Ready |
| Status chip (active) | `--accent` text | `#hudStatus` when Scanning/Active |
| Save OK | `#4ade80` (existing success) | `.command-save-status.ok` — keep semantic green |
| Save pending | `--warning-bright` | unchanged behavior |
| Save error | `#f87171` (existing danger) | unchanged behavior |

**Accent reserved for (shell scope only):**
1. Start button (filled)
2. Active sidebar nav left border
3. Scan-active status chip text
4. Focus rings (unchanged from Phase 11)

**NOT accent in shell:** Stop button uses `--destructive` fill; overflow `···` uses muted border; nav icons use `--muted-foreground`.

---

## Shell Layout Contract

### SHELL-01 — Remove HUD bar

| Current | Target |
|---------|--------|
| Fixed `.hud-bar` with clock, "Distress Intelligence", blinking dot | **Remove from layout** (`display: none` or delete HTML block) |
| `#hudClock` live clock | **Not visible** — hide element; stop `tickClock` interval in execute (or leave hidden shim) |
| `#hudStatus` in HUD bar | **Move into command bar** as inline mono chip after save status |
| `setHudStatus()` in `render.js` | **No logic change** — still writes to `#hudStatus` by ID |

**Command bar status row (left cluster, single line at 1280px):**
```
[Product title]  ·  [file status]  ·  [save status]  ·  [scan status chip #hudStatus]
```

Use `·` or `|` separators at `--muted-foreground` — not neon pipes.

### SHELL-02 — Slim sidebar

**Visible top-level nav (max 4 items):**

| # | Label | Icon | Behavior |
|---|-------|------|----------|
| 1 | Overview | ◈ | Scroll to `#summarySection` (existing) |
| 2 | Lead Rankings | ▣ | Scroll to `#dashboard` (existing) |
| 3 | Review | ◉ | Opens review submenu OR ⌘K hint — **keep `#sidebarReviewGroup` IDs**; submenu stays but collapsed by default |
| 4 | More | ··· | New overflow toggle — contains demoted admin items |

**Demote to overflow (`#sidebarOverflowMenu`):**
- Entire former `#sidebarAdminNav` contents (Settings submenu, Manage Data submenu)
- Flatten into one overflow panel with section labels: **Settings**, **Data**, **Export**

**Remove from always-visible sidebar:**
- `#sidebarSettingsGroup` and `#sidebarManageDataGroup` as top-level toggles
- `.sidebar-admin-divider` visible rule

**Preserve all submenu button IDs** (`sidebarExportExcelBtn`, `sidebarReviewDistressedBtn`, etc.) — move DOM nodes into overflow menu, do not rename IDs.

**Brand block (SHELL-05):**

| Element | Before | After |
|---------|--------|-------|
| `.sidebar-title` | DistressOS | **Distress Analyzer** |
| `.sidebar-sub` | Intelligence Suite | **Remove** (hide element or delete) |
| `.sidebar-logo` | Neon ◇ tile | Calm ◇ on `--secondary` bg, no glow |
| `<title>` | Property Distress Analyzer | unchanged |

### SHELL-03 — Command bar single row

**Visible at 1280px width (one visual row):**

| Zone | Contents |
|------|----------|
| Left | Title + metadata cluster (file · save · status) — **flex, nowrap, ellipsis on file name** |
| Right | Start + Stop only |

**Hide from command bar (move or defer):**
- `#commandWorkersStatus` — hidden in shell; workers remain in scan progress section
- `#backupSizeIndicator` — hidden; reachable via ⌘K / overflow
- `#heroCount` — stays `hidden` (already)

**Sticky position:** `top: 0` (was `top: 2.5rem` for HUD offset)

**Title copy:** `Distress Analyzer` — drop gradient span styling on "Distress"; single color `--foreground`.

### SHELL-04 — Progressive disclosure map

All demoted actions **must** remain reachable. Minimum coverage:

| Action | Primary path | Fallback |
|--------|--------------|----------|
| Upload spreadsheet | ⌘K | Overflow → Upload Spreadsheet |
| API Keys | ⌘K | Overflow → API Keys |
| AI Brain | ⌘K | Overflow → AI Brain |
| Save backup now | Overflow | ⌘K (add command in execute) |
| Load backup JSON | Overflow | ⌘K (add command in execute) |
| Download session backup | Overflow | ⌘K (add command in execute) |
| Export Excel/CSV/All | Overflow (when enabled) | ⌘K (existing export commands) |
| Review tier queues | Sidebar Review submenu | ⌘K (existing review commands) |

**Execute must add missing ⌘K commands** for backup actions currently sidebar-only.

### SHELL-05 — Branding tone

Replace sci-fi naming everywhere in shell chrome:

| Location | Avoid | Use |
|----------|-------|-----|
| Sidebar title | DistressOS, Intelligence Suite | Distress Analyzer |
| Command title | Property Distress Analyzer (gradient) | Distress Analyzer |
| HUD ticker | Distress Intelligence | *(removed with HUD bar)* |
| Status labels | SYS-OK theater | Ready / Scanning / Active |

---

## Visual Hierarchy (Phase 12 scope)

**Focal point:** Command bar Start button (when enabled) — only filled accent in the top chrome.

**Eye path:**
1. Command bar: file name + save status (operational trust)
2. Sidebar: active nav item (where am I)
3. Main workspace content (Phase 13+ — unchanged layout in Phase 12)

**Icon-only controls:** Overflow `···` must have `aria-label="More actions"` and `title="More actions"`.

---

## Copywriting Contract

Inherits Phase 11 workflow copy. Shell-specific additions:

| Element | Copy |
|---------|------|
| Product name (sidebar + command bar) | **Distress Analyzer** |
| Overflow button | **More** (visible label) or `···` with aria-label "More actions" |
| Overflow section: Settings | **Settings** |
| Overflow section: Data | **Data** |
| Scan status chip (idle) | **Ready** |
| Scan status chip (active) | **Scanning** |
| File status (empty) | **No file loaded** |
| File status (loaded) | `{filename}` (truncated with ellipsis) |
| Save status OK | **Saved** or **Saved to server** (keep existing `updateSessionSaveStatus` strings) |
| Sidebar footer | `⌘K` **Command palette** |

**Tone:** Operational, calm. No "Intelligence Suite", "HUD", or "SYS" prefixes.

---

## Motion

Inherits Phase 11. Phase 12 additions:

| Allowed | Removed in Phase 12 |
|---------|---------------------|
| Command bar sticky (no animation) | HUD bar blink dot |
| Overflow menu open (150ms opacity, same as palette) | Clock tick visibility |
| Sidebar submenu expand (existing height transition) | Gradient title text animation |

Remove `body.legacy-hud` gate dependency for shell — decorative HUD bar is gone, not gated.

---

## DOM ID Preservation (critical)

**Do not rename or remove these IDs** (JS coupling):

```
appSidebar, sidebarReviewGroup, sidebarReviewToggle, sidebarReviewMenu,
sidebarReviewDistressedBtn, sidebarReviewWellMaintainedBtn, sidebarReviewLandBtn,
sidebarReviewNeedsReviewBtn, sidebarSettingsGroup, sidebarSettingsToggle,
sidebarSettingsMenu, sidebarSettingsSaveBackupBtn, sidebarManageDataGroup,
sidebarManageDataToggle, sidebarManageDataMenu, sidebarLoadBackupBtn,
sidebarExportExcelBtn, sidebarExportCsvBtn, sidebarExportAllBtn, sidebarSaveBackupBtn,
hudStatus, hudClock, commandBar, commandFileStatus, commandSaveStatus,
commandWorkersStatus, backupSizeIndicator, startBtn, stopBtn,
openSettingsBtn, openBrainBtn, openUploadModalBtn, loadBackupBtn, saveBackupNowBtn
```

New IDs allowed: `sidebarOverflowToggle`, `sidebarOverflowMenu`, `sidebarOverflowGroup`.

---

## Phase 12 Deliverables Checklist

Executor must produce:

1. `index.html` — Remove/hide `.hud-bar`; restructure sidebar to 3 nav + overflow; move `#hudStatus` into `#commandBar`; demote admin submenus to overflow
2. `app.css` — Calm sidebar/command bar styles (flat `--card`, no neon); `top: 0` sticky command bar; adjust `.app` padding (no HUD offset); hide workers/backup from command bar
3. `app.js` — Add ⌘K commands for backup load/save; wire overflow toggle; optional: stop `tickClock` if `#hudClock` removed
4. **No tier/save/backup logic changes** beyond UI wiring
5. `npm test` passes (78 tests)

**Out of scope (Phase 13+):** Empty state button reduction, scan panel slimming, summary KPI collapse, results toolbar.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| Third-party | none | not applicable |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — product name, status labels, overflow sections specific; inherits Phase 11 CTAs
- [x] Dimension 2 Visuals: PASS — focal point (Start), eye path, icon-only overflow has aria fallback
- [x] Dimension 3 Color: PASS — inherits 60/30/10; accent list explicit for shell; destructive on Stop
- [x] Dimension 4 Typography: PASS — 4 shell roles, inherits Phase 11 body scale
- [x] Dimension 5 Spacing: PASS — 4px grid, 44px touch exception declared
- [x] Dimension 6 Registry Safety: PASS — no third-party registries

**Approval:** approved 2026-06-30

## UI-SPEC COMPLETE