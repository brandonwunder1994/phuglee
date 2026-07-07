---
phase: 15
slug: modals-review-polish
status: approved
shadcn_initialized: false
preset: inherits Phase 11 — calm stone tokens
created: 2026-06-30
---

# Phase 15 — UI Design Contract

> Modals & review polish: calm dialog chrome, imagery-first inspector, emoji-free review actions. Inherits Phases 11–14. Final v1.3 surface.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (inherits `public/css/tokens.css`) |
| Preset | Phase 11 calm stone — **no new colors** |
| Component library | none — extend `.calm-dialog` pattern |
| Font (display) | Newsreader 600 — modal titles only |
| Font (body) | IBM Plex Sans 400/600 |
| Font (mono) | JetBrains Mono 400 — review progress, shortcuts |

**Phase 15 rule:** Restyle modals and review overlay only. Do not change keyboard shortcut bindings, tier logic, save/backup, or learned-brain file format.

---

## MODAL-01 — Calm Tool Dialogs

### Applies to
`#settingsModal`, `#uploadModal`, `#brainModal`

### Current → Target

| Current | Target |
|---------|--------|
| `.tool-modal-dialog.glass.hud-panel` | `.tool-modal-dialog.calm-dialog` |
| Heavy blur backdrop `rgba(6,7,10,0.82)` | Calm scrim `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)` |
| Copper neon close hover | `--border` hover, `--foreground` text |
| Inline `color:var(--copper-bright)` on `<code>` | `var(--muted-foreground)` |

### Dialog chrome

```
┌─ API Keys & Scan Settings ─────────────────────────────── [×] ─┐
│  (flat --card surface, 1px --border, 8px radius)              │
│  body content unchanged functionally                          │
└───────────────────────────────────────────────────────────────┘
```

**Preserve:** All field IDs, diag panel IDs, brain export/import buttons.

---

## MODAL-02 — Property Inspector (Imagery-First)

### Layout target

| Zone | Priority | Content |
|------|----------|---------|
| Media column | **Primary** | Street View + Satellite panes, full width, 16:9 |
| Details column | Secondary | Address, tier badge, analysis, contacts |
| Gauge | Tertiary | Small distress ring in details header — not beside imagery |

### Remove/quiet on inspector chrome

| Element | Action |
|---------|--------|
| `.live-dot` in title | Hide via `.inspector-calm .live-dot { display: none }` |
| `.rec-badge`, `.scan-line` | Hide on calm inspector |
| `.target-reticle` | Hide (HUD theater) |
| `.preview-pane-label` neon | Muted 11px mono |

### DOM change
Add `inspector-calm` class to `.property-modal-grid`.

**Preserve:** `#previewImg`, `#previewSatImg`, `#inspectorBody`, nav buttons, all `showInspector` IDs.

---

## MODAL-03 — Review Mode Overlay

### Scrim
- Background: `rgba(0, 0, 0, 0.72)` (calm dark, not neon void)
- Remove copper badge glow; use flat `--card` header bar

### Action bar (footer)

| Button | Label (no emoji) | Tier color |
|--------|------------------|------------|
| `#reviewKeepBtn` | `Keep` + `<kbd>1</kbd>` | sage green muted |
| `#reviewChangeBtn` | `Change` + `<kbd>2</kbd>` | amber muted |
| `#reviewLandBtn` | `Land` + `<kbd>3</kbd>` | land tier token |
| `#reviewDeferBtn` | `Later` + `<kbd>4</kbd>` | review red muted |
| `#reviewBlurredBtn` | `Blurred` + `<kbd>5</kbd>` | neutral muted |
| `#reviewUndoBtn` | `Undo` + `<kbd>3</kbd>` | neutral outline |

**FROZEN:** Keyboard keys 1–5 and Esc — do not change `session.js` handler.

### Review badge (`#reviewModeBadge`)
Text-only: `Distressed Review`, `Well Maintained Review`, `Land Review`, `Needs Review` — no emoji prefixes.

### Tier pick overlay (`#reviewTierPickOverlay`)
- Remove `glass` class
- Buttons: `Distressed` and `Well Maintained` (no ⚠️/✨)

---

## MODAL-04 — Score Edit Modal

### Target
- `.score-edit-dialog.calm-dialog` (remove `glass hud-panel`)
- Tier picker uses same flat button style as review tier pick
- Hint text: `The system reviews this change automatically — approve proposed rules in AI Brain.` (no 🧠 emoji)

**Preserve:** `#scoreEditTierPicker`, `#scoreEditSave`, `#scoreEditCancel`, open/close class contract.

---

## QA-04 — DOM ID Preservation

All modal IDs listed in `15-RESEARCH.md` architecture table must remain in `index.html`.

---

## Manual Smoke (Phase 15 sign-off)

1. Upload spreadsheet via modal
2. Run scan (or load session)
3. Open property inspector — imagery dominant
4. Enter review mode — keys 1–5 work; visuals calm
5. Export brain JSON → re-import
6. Save session → restore

---

*Approved: 2026-06-30 — generated for /gsd:plan-phase 15*