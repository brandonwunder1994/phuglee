# Task 6 Report: Quieter / typeset / polish pass

**Status:** DONE  
**Branch:** `feat/property-profile-cinematic-dossier`  
**Worktree:** `C:\Users\brand\Projects\distress-os\.worktrees\property-profile-cinematic`  
**Date:** 2026-07-12

## Summary

Scoped quieter / typeset polish on the cinematic property profile. No architecture changes. Residual HUD chrome is force-hidden by ID; placeholder copy locked to “No Street View for this address”; section titles stay Outfit (no Anton); secondary action hover cooled to stone; dossier scrollbar recolored stone.

## Step 1 — Grep leftovers (modal surface)

Pattern: `NO SIGNAL|rec-badge|target-reticle|Satellite · D4D|inspector-cyber`

| Match location | Role on cinematic property modal |
|----------------|----------------------------------|
| `phuglee-analyzer.css` | **Kill rules** (`.rec-badge`, `.target-reticle`, `#recBadge`, `#previewMainReticle`) |
| `cyber-modals.css` | Legacy `.inspector-cyber` rules only — grid class **not** on cinematic shell |
| `app.css` | Shared `.target-reticle` base (hidden by default; phuglee kill overrides) |

**No `NO SIGNAL` string** on the property modal surface.  
**No `Satellite · D4D` pane label** on cinematic (hero label is “Street View”; satellite is action/lightbox only).

## Step 2 — Fixes applied

### CSS (`phuglee-analyzer.css`)

1. **HUD kill by ID** — `#recBadge` and `#previewMainReticle` join the existing class kill list (`display: none !important; visibility: hidden`).
2. **Secondary action hover (Hybrid C deferred)** — `.profile-action-btn:hover` uses stone/cream instead of orange heat; primary retains mild orange hover.
3. **Scrollbar stone** — `.property-profile-dossier` and `.inspector-body` `scrollbar-color: rgba(174, 163, 143, 0.38) transparent` (+ `scrollbar-width: thin`).
4. **Typeset** — dossier / profile section titles explicitly Outfit, `text-transform: none` (no Anton/display face).

### JS (`render.js`) — defensive only

1. Property `setPreviewImages`: reticle stays `hidden` + `display:none`; empty state forces placeholder title **“No Street View for this address”** and `display:flex`.
2. `showInspector`: forces `#recBadge` / `#previewMainReticle` hidden + `aria-hidden`.

### HTML

- Placeholder already correct; cache-bust bumped:
  - `phuglee-analyzer.css?v=20260712-cinematic-polish`
  - `render.js?v=20260712-cinematic-polish`

### Not changed (by design)

- **Anton on page hero / KPIs / results title** (outside property modal) left alone.
- **No money mono class exists** in dossier markup → skipped inventing one.
- **Legacy `cyber-modals` / `app.css` reticle rules** left for non-cinematic / scan contexts; killed under `body.analyze-phuglee`.

## Step 3 — verify-live

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
→ LIVE after ensure health=200 home=200
VERIFY_EXIT=0
```

Preview:

- http://127.0.0.1:3000/
- http://127.0.0.1:3000/analyzer/
- http://localhost:3000/

Hard-refresh (`Ctrl+Shift+R`) after open to pick up polish assets.

## Files modified

| Path | Change |
|------|--------|
| `modules/property-analyzer/public/css/phuglee-analyzer.css` | HUD ID kill, stone scrollbar, cooler secondary hover, Outfit titles |
| `modules/property-analyzer/public/js/render.js` | Force hide badge/reticle; lock placeholder copy |
| `modules/property-analyzer/public/index.html` | Cache-bust polish CSS/JS |
| `.superpowers/sdd/progress.md` | Task 6 complete |
| `.superpowers/sdd/task-6-report.md` | This report |

## Commit

```
style(analyzer): polish cinematic property profile dossier
```

## Concerns / follow-ups

1. **Manual visual QA** still needed on a real lead (no SV / with SV / primary vs secondary buttons / long dossier scroll).
2. **Money mono** not applied — no dedicated class in `profile-kv` rows; optional later via `val-money` if product wants tabular money.
3. **Legacy cyber CSS files** still contain inspector-cyber / reticle definitions for other surfaces; safe while cinematic uses `property-profile-cinematic` without `inspector-cyber`.
4. Optional: `/impeccable init` for PRODUCT.md (project has `NO_PRODUCT_MD`; not blocking scoped polish).
