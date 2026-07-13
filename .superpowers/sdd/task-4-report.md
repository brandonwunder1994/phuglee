# Task 4 Report: Wire imagery + showInspector + scroll-spy

**Status:** DONE  
**Branch:** `feat/property-profile-cinematic-dossier`  
**Worktree:** `C:\Users\brand\Projects\distress-os\.worktrees\property-profile-cinematic`  
**Date:** 2026-07-12

## Summary

Wired the cinematic property profile UI end-to-end:

1. **SV-only hero** — `setPreviewImages(..., 'property')` never dual-pane; satellite stashed on `previewSatImg.dataset.satSrc` for lightbox only.
2. **Sectioned dossier** — `buildProfileDossierParts(r)` returns presence flags + section HTML with `id="profile-section-{id}"`.
3. **Action strip** — phone/email copy, Google listings link, Change level (property category only), Satellite button gated by `propertyHasSatelliteMedia`.
4. **Section chips + scroll-spy** — chips from `getPresentProfileSections` / `buildProfileSectionNavHtml`; IntersectionObserver on `#profileDossierScroll` with 400ms ignore window after chip click.
5. **Removed preferSatellite hero swap** — always `setPreviewImages({ streetView, satellite }, 'property')`.

## Files modified

| Path | Role |
|------|------|
| `modules/property-analyzer/public/js/config.js` | Element refs for action strip, section nav, dossier scroll |
| `modules/property-analyzer/public/js/render.js` | `setPreviewImages` property branch; `buildProfileDossierParts`; `showInspector` rewrite; `wireProfileScrollSpy` |
| `modules/property-analyzer/public/js/session.js` | Disconnect `_profileSpy` on `closePropertyModal` |

## Behavior checklist

| Requirement | Implementation |
|-------------|----------------|
| Property target never dual | Early return in `setPreviewImages` when `target === 'property'`; removes `.dual`, forces `satWrap.hidden` |
| Stash sat URL | `previewSatImg.dataset.satSrc` when satellite provided |
| No SV → calm empty | Placeholder shown; sat never promoted to hero |
| Satellite button gate | `propertyHasSatelliteMedia({ hasSatelliteUrl, hasCachedSatellite, usedSatellite, skippedStreetView, preferSatellite })` |
| Satellite open | `openLightbox(satUrl, 'Satellite — …')` |
| Section anchors | `profile-section-overview\|contact\|violations\|values\|property\|flags` |
| Chip nav | Built from present sections only |
| Scroll-spy | `IntersectionObserver` root=`#profileDossierScroll`, thresholds 0.2/0.45/0.7 |
| Chip click ignore | `state._profileSpyIgnoreUntil = Date.now() + 400` |
| Score edit / category / copy / prev-next | Preserved wiring after innerHTML rebuild |
| Contact not duplicated | Sticky strip + Contact section; removed bottom-only contacts block from overview |

## Tests

```bash
cd modules/property-analyzer
node --test tests/property-profile-dossier.test.js
```

**Result:** 9/9 pass (0 fail).  
Also `node --check` on `render.js`, `config.js`, `session.js` — clean.

## Commit

```
feat(analyzer): wire cinematic dossier, SV-only hero, sat lightbox gate
```

Files in commit:

- `modules/property-analyzer/public/js/config.js`
- `modules/property-analyzer/public/js/render.js`
- `modules/property-analyzer/public/js/session.js`

## Concerns / follow-ups

1. **Manual browser pass still needed** — open a lead with SV + sat, one with no SV, one with violations/values; confirm chips scroll and sat lightbox.
2. **Cache-bust** — `index.html` still pins `render.js?v=20260712-harden` / `config.js?v=20260712-modal`; hard-refresh (`Ctrl+Shift+R`) after deploy until versions bump.
3. **Score strip vs overview** — gauge stays in fixed `#inspectorGaugePanel` between nav and dossier (Task 2/3 HTML); overview still has level display/edit controls.
4. **`formatPropertyProfileHtml`** kept as thin join of section HTML for any external callers; primary path is `buildProfileDossierParts`.
5. **Contact always section when phone/email/name** — even without rich `r.profile` payload.

---

## Post-review fix (aria-current + keepDossierScroll)

**Date:** 2026-07-12  
**Finding:** `toggleAttribute('aria-current', bool)` sets a boolean attribute (empty string value when present). CSS selectors use `[aria-current="true"]`, so scroll-spy / chip current state never matched.

### Fix

In `modules/property-analyzer/public/js/render.js`:

1. **`wireProfileScrollSpy` observer** — set `aria-current="true"` via `setAttribute` / `removeAttribute` instead of `toggleAttribute`.
2. **Chip click handler** — same pattern when marking the clicked chip current.
3. **Polish:** `changeScoreBtn` and `profileChangeLevelBtn` re-enter `showInspector` with `keepDossierScroll: true` so opening the score editor does not jump the dossier to top.

### Verification

```bash
cd modules/property-analyzer
node --check public/js/render.js
node --test tests/property-profile-dossier.test.js
```

**Result:** `node --check` clean; **9/9** dossier tests pass.

### Commit

```
fix(analyzer): profile section chip aria-current for scroll-spy
```
