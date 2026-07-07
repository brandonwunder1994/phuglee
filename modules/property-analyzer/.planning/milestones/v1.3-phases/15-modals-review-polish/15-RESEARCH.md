# Phase 15: Modals & Review Polish - Research

**Researched:** 2026-06-30
**Domain:** Vanilla HTML/CSS/JS modal surfaces + review overlay calm refactor
**Confidence:** HIGH

<user_constraints>
## User Constraints

**No CONTEXT.md exists.** Design contract locked in `15-UI-SPEC.md` + `11-DESIGN-BRIEF.md` (Phase 15 = final v1.3 surface).

### Locked Decisions (from ROADMAP + REQUIREMENTS)
- MODAL-01: Settings/Upload/Brain modals use calm dialog pattern
- MODAL-02: Property inspector imagery-first; metadata secondary
- MODAL-03: Review overlay calm dark scrim; action bar clear tier colors without emoji overload
- MODAL-04: Score edit modal matches tier picker calm pattern
- QA-01: `npm test` 78 pass
- QA-02: No save/tier/backup logic changes
- Preserve all modal DOM IDs used by `config.js`, `session.js`, `state.js`, `imagery.js`, `render.js`

### Claude's Discretion
- Whether gauge ring stays in inspector (de-emphasize vs move to details column)
- Exact calm-dialog class naming (mirror Phase 14 `results-*` block pattern)
- Lightbox styling scope (touch only if blocking calm consistency)

### Deferred Ideas (OUT OF SCOPE)
- Migrate modals to native `<dialog>` element (future; current `.open` class pattern works)
- cmd-palette neon restyle (not in MODAL reqs)
- Backend learned-brain format changes
</user_constraints>

<research_summary>
## Summary

Phase 15 is the **final v1.3 UI milestone** — calm chrome on every overlay surface deferred from Phases 12–14. Five modal families share `glass hud-panel` classes and cyber backdrops:

1. **Tool modals** (`#settingsModal`, `#uploadModal`, `#brainModal`) — `openToolModal()` in `state.js`; `.tool-modal.open` display toggle
2. **Property inspector** (`#propertyModal`) — `showInspector()` / `closePropertyModal()` in `session.js`; grid media + details
3. **Score edit** (`#scoreEditModal`) — opened from cards/table; tier picker in modal
4. **Review overlay** (`#reviewModeOverlay`) — keyboard-driven; shortcuts in `session.js` L1413–1446 (**DO NOT CHANGE key bindings**)
5. **Review tier pick** (`#reviewTierPickOverlay`) — promise-based picker in `imagery.js`

**Key finding:** Review keyboard shortcuts (`1`–`5`, `Escape`) are hardcoded in `session.js`. Phase 15 may change button **labels/HTML** and **CSS** only — not the keydown handler logic or `reviewKeep()`/`reviewApplyChange()` functions.

**Brain import/export:** `exportLearnedBtn` / `importLearnedBtn` wired in `scan.js` (`exportLearnedBrain`, `importLearnedBrainFile`). Preserve button IDs and file input `#importLearnedFile`.

**Emoji hotspots:** `imagery.js` `updateReviewUi()` sets innerHTML with emojis for badges, action buttons, shortcut chips. `render.js` inspector uses `tierEmoji()` in score display. `index.html` static review buttons have emoji prefixes.

**Primary recommendation:** 3 plans — (1) HTML calm dialog DOM, (2) CSS calm modal/review styles, (3) JS label/copy + inspector hierarchy (no shortcut logic changes).
</research_summary>

<standard_stack>
## Standard Stack

| Tool | Purpose |
|------|---------|
| Vanilla HTML/CSS/JS | All modal surfaces |
| `tokens.css` | Calm palette (`--card`, `--border`, `--muted`, tier tokens) |
| `app.css` | Modal styles L1070–1215 (property), L2829–2900 (score), L5322–5377 (tool), L5493–5800 (review) |
| `state.js` | `openToolModal`, `closeToolModal` |
| `session.js` | Property modal, review keydown, score edit listeners |
| `imagery.js` | `updateReviewUi`, review actions |
| `render.js` | `showInspector` body HTML |
| `scan.js` | Brain export/import |
| `npm test` | QA-01 |

**No new installations.**
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Modal open/close contracts (preserve)

| Modal | Open | Close | Class |
|-------|------|-------|-------|
| Tool | `openToolModal(el)` | `closeToolModal(el)` | `.tool-modal.open` |
| Property | `showInspector()` sets `hidden=false`, `.open` | `closePropertyModal()` | `.property-modal.open` |
| Score | `openScoreEditModal()` | `closeScoreEditModal()` | `.score-edit-modal.open` |
| Review | `enterReviewMode()` | `closeReviewMode()` | `.review-mode-overlay.open` |
| Tier pick | `showReviewTierPicker()` | `closeReviewTierPicker()` | `.review-tier-pick-overlay.open` |

### Property inspector current grid
```
.property-modal-grid
  .property-modal-media — preview images + gauge side-by-side
  .property-modal-details — #inspectorBody (render.js innerHTML)
```

### Target imagery-first (MODAL-02)
```
.property-modal-grid.inspector-calm
  .property-modal-media — full-width imagery column (dominant)
  .property-modal-details — address/meta/tier below or narrow column
  .inspector-gauge-calm — de-emphasized score ring in details, not beside thumb
```

### Review shortcuts (FROZEN — session.js)
| Key | Action |
|-----|--------|
| 1 | `reviewKeep()` |
| 2 | `reviewApplyChange()` |
| 3 | `reviewLandKeep()` or `reviewUndo()` |
| 4 | `reviewDeferLater()` |
| 5 | `reviewApplyBlurred()` |
| Esc | `closeReviewMode()` |

### IDs that MUST NOT change
`settingsModal`, `uploadModal`, `brainModal`, `exportLearnedBtn`, `importLearnedBtn`, `importLearnedFile`, `propertyModal`, `inspectorBody`, `previewImg`, `previewSatImg`, `scoreEditModal`, `scoreEditTierPicker`, `reviewModeOverlay`, `reviewKeepBtn`, `reviewChangeBtn`, `reviewLandBtn`, `reviewDeferBtn`, `reviewBlurredBtn`, `reviewUndoBtn`, `reviewTierPickOverlay`
</architecture_patterns>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Breaking review keyboard shortcuts
Editing `session.js` keydown handler or renaming review action functions.
**Fix:** CSS + HTML labels + `imagery.js` display strings only.

### Pitfall 2: Brain import/export regression
Removing or renaming `#exportLearnedBtn`, `#importLearnedBtn`, `#importLearnedFile`.
**Fix:** Keep IDs; only restyle surrounding dialog.

### Pitfall 3: Inspector JS selector drift
`render.js` wires `#changeScoreBtn`, `#inspectorTierPicker`, `.copy-phone` after innerHTML.
**Fix:** Preserve class names and IDs in inspector template.

### Pitfall 4: open/close class contract
Removing `.open` class toggle breaks modal visibility.
**Fix:** Keep `.open` pattern; replace `glass hud-panel` with `calm-dialog`.
</common_pitfalls>

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` |
| Quick/full | `npm test` (~10s) |
| MODAL-03 | Manual: review mode keys 1–5 + Esc |
| Phase goal | Manual smoke: upload → scan → review → save → restore |

### Automated per requirement
| REQ | Command |
|-----|---------|
| QA-01 | `npm test` |
| MODAL-01 | grep `calm-dialog` in index.html + app.css |
| MODAL-02 | grep `inspector-calm` in index.html |
| MODAL-03 | grep review action buttons without emoji in imagery.js |
| MODAL-04 | grep `score-edit-dialog calm-dialog` |
| QA-02 | no changes under `lib/`, `routes/`, tier-engine |

### Wave 0
None — existing test suite sufficient.

## RESEARCH COMPLETE

**Ready for planning:** yes
**Primary recommendation:** 3 plans — HTML (wave 1), CSS + JS (wave 2 parallel)