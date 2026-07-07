# Phase 16 Research — Cyber Design System Formalization

**Date:** 2026-06-30

## Current state

- `tokens.css` already has cyber palette; typography vars still `system-ui` in tokens but overridden in `cyber-ultra.css`
- `calm-dialog` used in 6 HTML locations; `cyber-theme.css` styles `.calm-dialog` under `body.cyber-theme`
- `app.css` has ~240 lines of Phase 15 calm modal/review rules + ~60 lines dead `card-calm` rules
- `render.js` uses `card-cyber` exclusively

## Approach

1. Consolidate typography into `tokens.css` (single source)
2. Rename `calm-dialog` → `cyber-dialog` in HTML + all CSS selectors
3. Move cyber-dialog base component styles into `cyber-theme.css`
4. Delete dead `card-calm` block from `app.css`
5. Document motion in `16-MOTION.md`

## Risks

- Specificity: update both `app.css` and `cyber-theme.css` selectors together
- `inspector-calm` deferred to Phase 18 — do not rename yet (functional layout rules)

## Validation

- `npm test` 78/78
- `grep calm-dialog public/` returns zero (except comments/docs if any)