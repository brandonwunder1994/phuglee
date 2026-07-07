# Phase 12: Shell Simplification - Research

**Researched:** 2026-06-30
**Domain:** Vanilla HTML/CSS/JS app shell refactor (progressive disclosure)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists.** Design contract is locked in `12-UI-SPEC.md` (approved 2026-06-30). All shell decisions below are NON-NEGOTIABLE per UI-SPEC.

### Locked Decisions (from 12-UI-SPEC.md)
- Remove fixed `.hud-bar`; move `#hudStatus` into `#commandBar` metadata cluster
- Sidebar: max 4 top-level items (Overview, Lead Rankings, Review, More overflow)
- Demote `#sidebarAdminNav` (Settings + Manage Data) into `#sidebarOverflowMenu`
- Command bar single row at 1280px: title + file · save · status left; Start/Stop right
- Hide `#commandWorkersStatus` and `#backupSizeIndicator` from command bar
- Branding: "Distress Analyzer" — no DistressOS / Intelligence Suite / SYS-OK theater
- Preserve all listed DOM IDs — move nodes, do not rename
- No tier/save/backup logic changes; `npm test` must pass (78 tests)
- No new npm UI dependencies

### Claude's Discretion
- Sidebar width: 220px vs keep 248px (UI-SPEC allows 220 if it fits; min 200px)
- Whether to `display:none` HUD bar vs delete HTML block (UI-SPEC allows either)
- `tickClock` interval: stop vs leave running on hidden `#hudClock`
- Overflow panel open/close animation timing (match palette ~150ms)

### Deferred Ideas (OUT OF SCOPE)
- Empty state CTA reduction (Phase 13)
- Scan panel slimming, summary KPI collapse (Phase 13)
- Results toolbar calm data view (Phase 14)
- Modal polish (Phase 15)
</user_constraints>

<research_summary>
## Summary

Phase 12 is a **DOM restructure + CSS reskin + minimal JS wiring** on an existing vanilla shell. No new libraries. The codebase already has the progressive-disclosure vehicle (`⌘K` command palette in `app.js` `cmdActions`) and sidebar toggle patterns in `session.js` (`toggleSidebarGroup`). The work is surgical: relocate admin submenus into an overflow panel, hide the HUD bar, flatten command bar metadata into one row, and restyle sidebar/command chrome to Phase 11 calm tokens.

**Key finding:** Most shell behavior is already ID-coupled in `config.js` (element refs) and `session.js` (sidebar listeners). Moving DOM nodes without renaming IDs keeps export, backup, and review flows intact. Missing ⌘K entries are the main functional gap: backup load/save/download commands are sidebar-only today.

**Primary recommendation:** Three-plan wave structure — (1) HTML restructure, (2) CSS calm shell in parallel with (3) JS overflow + ⌘K + status color tokens. Run `npm test` after each plan.
</research_summary>

<standard_stack>
## Standard Stack

### Core (already in project)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Vanilla HTML/CSS/JS | — | App shell | Project constraint — no React migration |
| `tokens.css` | Phase 11 | Calm design tokens | Single palette source |
| `app.css` | ~6,600 lines | Legacy + shell styles | Incremental migration pattern from Phase 11 |
| Node test runner | `npm test` | 78 unit tests | QA-01 gate |

### Supporting patterns (existing code)
| Pattern | Location | Use in Phase 12 |
|---------|----------|-----------------|
| Sidebar group toggle | `session.js` `toggleSidebarGroup` | Model overflow open/close |
| Command palette | `app.js` `cmdActions` | Add backup commands (SHELL-04) |
| Hidden action shims | `index.html` `#openSettingsBtn` etc. | Keep `data-action` delegation |
| `setHudStatus` | `render.js` | Update colors to `--accent` / `--muted-foreground` |

**No new installations required.**
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Current shell structure (`index.html`)
```
.app-shell
  aside#appSidebar
    .sidebar-brand (DistressOS / Intelligence Suite)
    nav.sidebar-nav
      Overview, Lead Rankings buttons
      #sidebarReviewGroup (submenu)
      #sidebarAdminNav
        #sidebarSettingsGroup
        #sidebarManageDataGroup
  .app-shell-main
    .hud-bar (#hudStatus, #hudClock)
    .app
      #commandBar (title, file, save, workers, backup)
      ... workspace sections
```

### Target shell structure (12-UI-SPEC)
```
.app-shell
  aside#appSidebar
    .sidebar-brand (Distress Analyzer, no sub)
    nav.sidebar-nav
      Overview, Lead Rankings
      #sidebarReviewGroup (collapsed default, label "Review")
      #sidebarOverflowGroup
        #sidebarOverflowToggle ("More")
        #sidebarOverflowMenu
          [moved #sidebarSettingsGroup contents]
          [moved #sidebarManageDataGroup contents]
  .app-shell-main
    .hud-bar (display:none OR removed; #hudClock hidden)
    .app
      #commandBar
        left: title · file · save · #hudStatus
        right: Start, Stop
```

### Pattern 1: Move DOM, preserve IDs
**What:** Physically relocate `#sidebarSettingsGroup` and `#sidebarManageDataGroup` inside `#sidebarOverflowMenu` without changing button IDs or `data-action` attributes.
**Why:** `config.js` refs and `session.js` listeners bind by ID at init — renaming breaks backup/export.
**Example:** Keep `id="sidebarExportExcelBtn"` on the Excel button after move.

### Pattern 2: Command bar metadata cluster
**What:** Wrap title + file + save + `#hudStatus` in `.command-bar-meta` flex row with muted separators.
**CSS:** `display:flex; align-items:center; gap:0.5rem; flex-wrap:nowrap; min-width:0` — file name gets `text-overflow:ellipsis`.
**Sticky:** `top: 0` (remove `--topbar-h` offset).

### Pattern 3: Overflow toggle (new)
**What:** Mirror `sidebarReviewToggle` pattern for `#sidebarOverflowToggle` / `#sidebarOverflowMenu`.
**JS location:** `app.js` `initAppShell()` or `session.js` alongside other sidebar toggles.
**A11y:** `aria-expanded`, `aria-controls="sidebarOverflowMenu"`, `aria-label="More actions"`.

### Pattern 4: ⌘K backup commands (SHELL-04 gap)
**Current `cmdActions` (app.js ~1202):** Has Upload, API Keys, AI Brain, Export, Review — **missing** Save Backup Now, Load Backup JSON, Download Session Backup.
**Add:**
```javascript
{ label: 'Save backup now', hint: 'Server + download JSON', run: () => saveBackupNowBtn?.click() },
{ label: 'Load backup JSON', hint: 'Restore from file', run: () => loadBackupBtn?.click() },
{ label: 'Download session backup', hint: 'Timestamped JSON export', run: () => sidebarSaveBackupBtn?.click() },
```
Use existing hidden shim buttons (`saveBackupNowBtn`, `loadBackupBtn`) where present.
</architecture_patterns>

<codebase_findings>
## Codebase Findings

### Files to modify
| File | Lines of interest | Change scope |
|------|-------------------|--------------|
| `public/index.html` | 15-128 | HUD hide, sidebar restructure, command bar cluster, branding copy |
| `public/css/app.css` | 96-126, 4981-5086, 5973-6144, 6202-6247 | HUD hide, calm sidebar/command bar, layout padding |
| `public/js/app.js` | 1202-1225, 1335-1339 | ⌘K commands, overflow toggle, optional tickClock guard |
| `public/js/render.js` | 1224-1228 | `setHudStatus` color tokens |
| `public/js/session.js` | 1215-1273 | Overflow toggle listener; mutual-exclude with review/settings groups |

### CSS offsets tied to HUD bar
- `:root --topbar-h: 2.65rem` (app.css line 6)
- `.app { padding: calc(var(--topbar-h) + 1.25rem) ... }` (line 6214)
- `.command-bar { top: calc(var(--topbar-h) + 0.35rem) }` (line 6236)
- `.hud-bar { left: var(--sidebar-w) }` (line 6209) — fixed under sidebar

**Phase 12 fix:** Set `.app` padding to `var(--space-xl) 1.75rem 4rem` (or `1.25rem` top); command bar `top: 0`.

### Neon shell styles to replace (sidebar section ~5973)
- `rgba(0, 240, 255, ...)` borders → `var(--border)`
- Active nav gradient → `--secondary` bg + `border-left: 3px solid var(--accent)`
- `.sidebar-logo` glow → flat `--secondary` background
- `.command-title span` gradient → single `--foreground` color

### `setHudStatus` label mapping (already calm-friendly)
```javascript
const labels = { STANDBY: 'Ready', SCANNING: 'Scanning', ACTIVE: 'Active' };
```
Update colors: active → `var(--accent)`, idle → `var(--muted-foreground)` per UI-SPEC.

### `body.home-empty` rule (line 6106)
Hides `.sidebar-admin-nav` on empty home. **Update** to hide `#sidebarOverflowGroup` or entire overflow when empty, OR show overflow with upload-only — UI-SPEC says upload reachable via ⌘K; keep overflow hidden on empty is acceptable if ⌘K works.

### Review mode HUD dimming (line 5465)
`body.review-mode-active .hud-bar { opacity: 0.35 }` — remove or noop when HUD hidden.
</codebase_findings>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Breaking ID coupling
**What goes wrong:** Export buttons stop enabling, backup hints don't update.
**Why:** `config.js` and `state.js` reference IDs like `sidebarExportExcelBtn`.
**How to avoid:** Grep for each ID before/after HTML move; never rename.

### Pitfall 2: Command bar wraps at 1280px
**What goes wrong:** SHELL-03 fails — workers/backup still visible or metadata stacks vertically.
**Why:** `flex-wrap: wrap` on `.command-bar` (line 4986).
**How to avoid:** Set `flex-wrap: nowrap` on command bar; hide workers/backup with `display:none !important` or `hidden` attribute.

### Pitfall 3: Sidebar toggle mutual exclusion
**What goes wrong:** Review + overflow menus both open, layout jumps.
**Why:** Existing pattern closes other groups on settings/manage toggle.
**How to avoid:** On overflow open, close review/settings/manage groups (mirror `session.js` lines 1215-1225).

### Pitfall 4: `tickClock` null reference
**What goes wrong:** Console error if `#hudClock` removed entirely.
**Why:** `tickClock()` runs unconditionally at module load (app.js 1338-1339).
**How to avoid:** Guard: `if (hudClock) hudClock.textContent = ...` or keep hidden `#hudClock` in DOM.
</common_pitfalls>

## Validation Architecture

### Test infrastructure
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` |
| Config | `package.json` → `"test": "node --test tests/"` |
| Quick run | `npm test` |
| Full suite | `npm test` (same — 78 tests, ~5-15s) |
| Estimated runtime | ~10 seconds |

### Automated verification per requirement
| Requirement | Automated command | Notes |
|-------------|-------------------|-------|
| QA-01 | `npm test` | Must pass 78 tests after every plan |
| QA-04 | `Select-String` / grep ID preservation | Check critical IDs in index.html |
| SHELL-01 | grep `#hudStatus` inside `#commandBar` | HTML structure check |
| SHELL-02 | grep `sidebarOverflowMenu` | Overflow container exists |
| SHELL-04 | grep backup labels in app.js cmdActions | ⌘K command entries |

### Manual-only verifications
| Behavior | Why manual | Steps |
|----------|------------|-------|
| 1280px single-row command bar | Visual layout | Resize browser to 1280px; confirm no wrap |
| Overflow panel reachability | Interaction | Click More → see Settings/Data/Export sections |
| ⌘K backup commands | Interaction | ⌘K → type "backup" → run each command |

### Wave 0 requirements
**None** — existing 78-test suite covers backend; shell changes are HTML/CSS/JS with ID grep checks. No new test files required.

### Sampling rate
- After every task: `npm test`
- After every plan wave: `npm test` + ID grep checklist
- Max feedback latency: 15 seconds

## RESEARCH COMPLETE

**Ready for planning:** yes
**Primary recommendation:** 3 plans — HTML (wave 1), CSS + JS (wave 2 parallel)