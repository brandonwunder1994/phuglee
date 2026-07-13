# Final Fixes Report — Whole-branch review

**Status:** DONE  
**Branch / worktree:** `property-profile-cinematic`  
**Date:** 2026-07-12  
**Commit message:** `fix(analyzer): profile scroll-spy edge cases and primary contact heat`

## Summary

Three small UX fixes from the whole-branch review, all in `modules/property-analyzer/public/js/render.js`. No CSS/HTML changes required (primary heat class already styled).

## Fixes

### 1. Scroll-spy short/last sections (`wireProfileScrollSpy`)

- IntersectionObserver now uses `rootMargin: '0px 0px -40% 0px'` so the active chip biases toward the upper viewport (short sections no longer lose to tall overview).
- Near-bottom guard: when `root.scrollTop + root.clientHeight >= root.scrollHeight - 4`, force the last present section as `aria-current`.
- Scroll listener (passive) re-runs the bottom guard; `state._profileSpy.disconnect()` also removes the listener.

### 2. Primary heat on phone

- When `profileCopyPhoneBtn` is shown and `r.phone` exists: add `profile-action-primary`.
- When hidden / no phone: remove via `classList.toggle('profile-action-primary', hasPhone)`.

### 3. Cancel score keeps dossier scroll

- `#cancelScoreBtn` re-call to `showInspector` now passes `keepDossierScroll: true` (same as Change Level / profileChangeLevelBtn paths).

## Verification

```text
cd modules/property-analyzer
node --test tests/property-profile-dossier.test.js
→ 9 pass, 0 fail
```

```text
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
→ LIVE after ensure health=200 home=200
VERIFY_EXIT=0
```

Preview:
- http://127.0.0.1:3000/
- http://127.0.0.1:3000/analyzer/
- Hard-refresh (`Ctrl+Shift+R`) for render.js

## Files modified

| Path | Change |
|------|--------|
| `modules/property-analyzer/public/js/render.js` | Scroll-spy rootMargin + bottom pin; phone primary class; cancel keep scroll |
| `.superpowers/sdd/final-fixes-report.md` | This report |
