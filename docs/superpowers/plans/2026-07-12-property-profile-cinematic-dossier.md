# Property Profile Cinematic Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Analyze property profile modal into a cinematic dossier — sticky Street View hero + action strip, sticky section nav, one-scroll dossier body, Street View only by default, Satellite button only when that property has satellite media (opens existing lightbox).

**Architecture:** Extract pure helpers for section presence and satellite gating (Node-tested). Restructure `#propertyModal` into sticky chrome + single dossier scrollport. Refactor `showInspector` / `formatPropertyProfileHtml` to emit anchored sections + chips. Force property preview path to never dual-pane; reuse `openLightbox` for satellite. CSS ownership in `phuglee-analyzer.css` under `.property-profile-dialog`.

**Tech Stack:** Vanilla HTML/CSS/JS (PDA.env / UMD lib pattern), Node `node --test`, existing glass/heat tokens. No React/Tailwind.

**Design spec:** `docs/superpowers/specs/2026-07-12-property-profile-cinematic-dossier-design.md`

**Impeccable command order (map to tasks):** layout → distill → quieter → typeset → adapt → harden → polish

## Global Constraints

- Do **not** change scan pipeline, tier engine scoring, export schema, or session persistence format.
- Preserve bound DOM **ids**: `propertyModal`, `propertyModalBackdrop`, `previewHeaderTitle`, `propertyModalTierPill`, `prevPropBtn`, `nextPropBtn`, `inspectorPos`, `closePropertyBtn`, `previewImg`, `previewSatImg`, `previewSatWrap`, `previewWrap`, `previewPlaceholder`, `previewImages`, `previewPaneLabel`, `inspectorBody`, `gaugeNum`, `gaugeFill`, and existing lightbox ids.
- Stack fidelity: vanilla only — edit live analyzer surface under `modules/property-analyzer/public/`.
- Hybrid C: restrained glass; heat only on Distressed tier, distress score, primary contact action when present.
- Imagery: default hero = Street View only (or calm empty). **No dual pane** for property modal. Satellite control **omitted** when property has no satellite media (never greyed-out fake button).
- Satellite open path: existing `openLightbox(src, label)` / Esc-closes-lightbox-first (already in `session.js`).
- After any edit under `public/` or analyzer `public/`: from distress-os root run  
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1`  
  before claiming done.
- TDD: pure helpers get failing tests first.
- Work in an isolated **git worktree** (using-git-worktrees skill) for implementation.
- Every task ends with a commit.

---

## File Map

| File | Responsibility |
|------|----------------|
| `modules/property-analyzer/lib/property-profile-dossier.js` | Pure: section order, which sections exist, satellite gate, chip list |
| `modules/property-analyzer/tests/property-profile-dossier.test.js` | Unit tests for pure helpers |
| `modules/property-analyzer/public/index.html` | Modal shell: sticky regions, action strip, section nav, dossier scrollport; load new lib script |
| `modules/property-analyzer/public/css/phuglee-analyzer.css` | Cinematic dossier layout, overflow model, chips, hero, action strip |
| `modules/property-analyzer/public/css/app.css` | Neutralize conflicting `.property-modal-*` dual/grid rules if they fight the new layout |
| `modules/property-analyzer/public/js/render.js` | `setPreviewImages` (property SV-only), `formatPropertyProfileHtml` sections, `showInspector` structure + scroll-spy + sat button |
| `modules/property-analyzer/public/js/config.js` | Wire new element refs (`profileActionStrip`, `profileSectionNav`, `profileDossierScroll`, etc.) if needed |
| `modules/property-analyzer/public/js/session.js` | Only if lightbox label/body-overflow needs property-modal-open awareness (likely already OK) |
| `public/css/distress-analyzer-os.css` | Shell-only overrides if embedded modal clips (only if verified needed) |

---

### Task 1: Pure dossier helpers (TDD)

**Files:**
- Create: `modules/property-analyzer/lib/property-profile-dossier.js`
- Create: `modules/property-analyzer/tests/property-profile-dossier.test.js`

**Interfaces:**
- Produces (UMD + CommonJS like `analyze-visibility.js`):
  - `PROFILE_SECTION_ORDER` = `['overview','contact','violations','values','property','flags']`
  - `PROFILE_SECTION_LABELS` = map id → chip label (`Overview`, `Contact`, …)
  - `propertyHasSatelliteMedia(input)` → `boolean`
  - `getPresentProfileSections(flags)` → ordered `string[]` of section ids that should render chips
  - `buildProfileSectionNavHtml(sectionIds)` → HTML string of chip buttons

**Satellite gate (spec: only if on the property):**

```js
/**
 * input: {
 *   hasCachedSatellite: boolean,  // disk/session cache has sat URL
 *   usedSatellite: boolean,       // r.usedSatellite
 *   skippedStreetView: boolean,   // r.skippedStreetView
 *   preferSatellite: boolean,     // recordUsedSatelliteOnly / urls.preferSatellite
 *   hasSatelliteUrl: boolean      // resolved sat URL non-empty
 * }
 * Show button only when we have a sat URL AND the property actually used/has sat media
 * (cache or engine flags) — not merely "Maps could build a static sat for any address".
 */
function propertyHasSatelliteMedia(input) {
  if (!input || !input.hasSatelliteUrl) return false;
  return !!(
    input.hasCachedSatellite ||
    input.usedSatellite ||
    input.skippedStreetView ||
    input.preferSatellite
  );
}
```

**Section flags input for `getPresentProfileSections`:**

```js
{
  hasOverview: true, // always true when inspector open with a record
  hasContact: boolean,
  hasViolations: boolean,
  hasValues: boolean,
  hasProperty: boolean, // facts or amenities
  hasFlags: boolean
}
```

- [ ] **Step 1: Write the failing tests**

```js
// modules/property-analyzer/tests/property-profile-dossier.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  propertyHasSatelliteMedia,
  getPresentProfileSections,
  PROFILE_SECTION_ORDER,
  buildProfileSectionNavHtml
} = require('../lib/property-profile-dossier.js');

describe('propertyHasSatelliteMedia', () => {
  it('returns false when no sat URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: false,
      hasCachedSatellite: true,
      usedSatellite: true
    }), false);
  });
  it('returns false when URL exists but no property-level sat signal', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      hasCachedSatellite: false,
      usedSatellite: false,
      skippedStreetView: false,
      preferSatellite: false
    }), false);
  });
  it('returns true when cached sat + URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      hasCachedSatellite: true
    }), true);
  });
  it('returns true when usedSatellite + URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      usedSatellite: true
    }), true);
  });
  it('returns true when skippedStreetView + URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      skippedStreetView: true
    }), true);
  });
});

describe('getPresentProfileSections', () => {
  it('always includes overview when hasOverview', () => {
    assert.deepEqual(
      getPresentProfileSections({ hasOverview: true }),
      ['overview']
    );
  });
  it('orders contact before violations before values', () => {
    const ids = getPresentProfileSections({
      hasOverview: true,
      hasContact: true,
      hasViolations: true,
      hasValues: true,
      hasProperty: false,
      hasFlags: false
    });
    assert.deepEqual(ids, ['overview', 'contact', 'violations', 'values']);
  });
  it('omits empty sections', () => {
    const ids = getPresentProfileSections({
      hasOverview: true,
      hasContact: false,
      hasViolations: false,
      hasValues: true,
      hasProperty: true,
      hasFlags: false
    });
    assert.deepEqual(ids, ['overview', 'values', 'property']);
  });
});

describe('buildProfileSectionNavHtml', () => {
  it('renders buttons with data-profile-section', () => {
    const html = buildProfileSectionNavHtml(['overview', 'values']);
    assert.match(html, /data-profile-section="overview"/);
    assert.match(html, /data-profile-section="values"/);
    assert.match(html, /Overview/);
    assert.match(html, /Values/);
    assert.doesNotMatch(html, /Violations/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd modules/property-analyzer
node --test tests/property-profile-dossier.test.js
```

Expected: FAIL (module missing or exports missing).

- [ ] **Step 3: Implement minimal module**

```js
// modules/property-analyzer/lib/property-profile-dossier.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.propertyProfileDossier = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function propertyProfileDossierFactory() {
  const PROFILE_SECTION_ORDER = ['overview', 'contact', 'violations', 'values', 'property', 'flags'];
  const PROFILE_SECTION_LABELS = {
    overview: 'Overview',
    contact: 'Contact',
    violations: 'Violations',
    values: 'Values',
    property: 'Property',
    flags: 'Flags'
  };

  function propertyHasSatelliteMedia(input) {
    if (!input || !input.hasSatelliteUrl) return false;
    return !!(
      input.hasCachedSatellite ||
      input.usedSatellite ||
      input.skippedStreetView ||
      input.preferSatellite
    );
  }

  function getPresentProfileSections(flags) {
    const f = flags || {};
    const present = [];
    for (const id of PROFILE_SECTION_ORDER) {
      const key = 'has' + id.charAt(0).toUpperCase() + id.slice(1);
      // overview uses hasOverview
      if (f[key]) present.push(id);
    }
    return present;
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function buildProfileSectionNavHtml(sectionIds) {
    const ids = Array.isArray(sectionIds) ? sectionIds : [];
    return ids.map((id, i) => {
      const label = PROFILE_SECTION_LABELS[id] || id;
      const current = i === 0 ? ' aria-current="true"' : '';
      return `<button type="button" class="profile-section-chip" data-profile-section="${escapeAttr(id)}"${current}>${escapeAttr(label)}</button>`;
    }).join('');
  }

  return {
    PROFILE_SECTION_ORDER,
    PROFILE_SECTION_LABELS,
    propertyHasSatelliteMedia,
    getPresentProfileSections,
    buildProfileSectionNavHtml
  };
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd modules/property-analyzer
node --test tests/property-profile-dossier.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add modules/property-analyzer/lib/property-profile-dossier.js modules/property-analyzer/tests/property-profile-dossier.test.js
git commit -m "feat(analyzer): pure property profile dossier helpers"
```

---

### Task 2: Modal HTML shell (cinematic structure)

**Files:**
- Modify: `modules/property-analyzer/public/index.html` (`#propertyModal` ~580–639, script includes ~749)

**Interfaces:**
- Consumes: existing bound ids (must remain)
- Produces: structure classes/ids:
  - `#profileActionStrip` — sticky actions container
  - `#profileSatelliteBtn` — optional button (hidden by default; JS unhides)
  - `#profileSectionNav` — chip rail
  - `#profileDossierScroll` — sole scrollport wrapping details + inspector body
  - Keep `#previewSatWrap` in DOM but **always hidden** in layout (sat loads into lightbox via URL, not dual pane). Keep `#previewSatImg` for any legacy setters; optional to set src before lightbox.

**Target structure (preserve ids):**

```html
<div class="property-modal" id="propertyModal" hidden aria-modal="true" role="dialog" aria-labelledby="previewHeaderTitle">
  <div class="property-modal-backdrop" id="propertyModalBackdrop"></div>
  <div class="property-modal-dialog cyber-dialog phuglee-dialog property-profile-dialog property-profile-cinematic">
    <div class="property-modal-header">
      <!-- existing heading + tier + nav + close; fix mojibake to ← → × if present -->
    </div>

    <div class="property-profile-sticky-media">
      <div class="property-modal-media property-profile-hero">
        <div class="preview-images inspector-images-primary" id="previewImages">
          <!-- keep previewSatWrap hidden permanently in CSS; do not dual -->
          <div class="preview-image-wrap preview-sat-pane satellite-target" id="previewSatWrap" hidden>
            <span class="preview-pane-label">Satellite</span>
            <img id="previewSatImg" alt="Satellite view" style="display:none;">
          </div>
          <div class="preview-image-wrap preview-sv-pane" id="previewWrap">
            <span class="preview-pane-label" id="previewPaneLabel">Street View</span>
            <div id="recBadge" class="idle" hidden aria-hidden="true"></div>
            <div class="preview-placeholder" id="previewPlaceholder">
              <!-- SVG + No Street View for this address -->
            </div>
            <img id="previewImg" alt="Street View preview" style="display:none;">
            <div id="previewMainReticle" hidden aria-hidden="true"></div>
          </div>
        </div>
      </div>
      <div class="property-profile-actions" id="profileActionStrip">
        <button type="button" class="profile-action-btn" id="profileCopyPhoneBtn" hidden>Copy phone</button>
        <button type="button" class="profile-action-btn" id="profileCopyEmailBtn" hidden>Copy email</button>
        <a class="profile-action-btn profile-action-link" id="profileGoogleLink" href="#" target="_blank" rel="noopener noreferrer" hidden>Search listings</a>
        <button type="button" class="profile-action-btn" id="profileChangeLevelBtn" hidden>Change level</button>
        <button type="button" class="profile-action-btn profile-action-sat" id="profileSatelliteBtn" hidden>Satellite</button>
      </div>
    </div>

    <nav class="property-profile-section-nav" id="profileSectionNav" aria-label="Profile sections"></nav>

    <div class="property-profile-dossier" id="profileDossierScroll">
      <div class="property-modal-details">
        <div class="property-distress" id="inspectorGaugePanel">
          <!-- keep gaugeNum / gaugeFill structure -->
        </div>
        <div class="inspector-body empty" id="inspectorBody">Select a property card to open its profile</div>
      </div>
    </div>
  </div>
</div>
```

Add script after tier-labels:

```html
<script src="/lib/property-profile-dossier.js?v=20260712-dossier" defer></script>
```

Note: Distress OS rewrite may need cache-bust via existing `lib/rewrite.js` patterns if query strings are rewritten — follow how `analyze-visibility.js` is versioned.

- [ ] **Step 1: Replace `#propertyModal` inner structure** as above without removing bound ids.
- [ ] **Step 2: Add lib script tag** for `property-profile-dossier.js`.
- [ ] **Step 3: Spot-check** page source loads script (open `/analyzer/` after server verify in later task).
- [ ] **Step 4: Commit**

```bash
git add modules/property-analyzer/public/index.html
git commit -m "feat(analyzer): cinematic property modal HTML shell"
```

---

### Task 3: CSS — overflow model + cinematic chrome

**Files:**
- Modify: `modules/property-analyzer/public/css/phuglee-analyzer.css` (property modal block ~1660+)
- Modify: `modules/property-analyzer/public/css/app.css` only where dual/grid rules force dual-pane or nested scroll that breaks the new model

**Interfaces:**
- Consumes: classes from Task 2
- Produces: usable modal at 1280×800 and 1920×1080 without clipping last dossier rows

**Required CSS rules (implement under `body.analyze-phuglee .property-profile-cinematic` or `.property-profile-dialog`):**

```css
/* Dialog column: one shell, children flex */
body.analyze-phuglee .property-modal-dialog.property-profile-cinematic {
  display: flex;
  flex-direction: column;
  width: min(96vw, 1180px);
  max-height: min(92vh, 920px);
  overflow: hidden;
}

body.analyze-phuglee .property-profile-cinematic .property-modal-header {
  flex-shrink: 0;
}

body.analyze-phuglee .property-profile-sticky-media {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid rgba(174, 163, 143, 0.12);
  background: #0a0908;
}

body.analyze-phuglee .property-profile-hero .preview-images {
  min-height: 0;
  height: clamp(180px, 28vh, 320px);
}

body.analyze-phuglee .property-profile-hero .preview-image-wrap {
  height: 100%;
  min-height: 0;
}

body.analyze-phuglee .property-profile-hero .preview-image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Never show dual sat pane in cinematic profile */
body.analyze-phuglee .property-profile-cinematic #previewSatWrap,
body.analyze-phuglee .property-profile-cinematic .preview-images.dual #previewSatWrap {
  display: none !important;
}

body.analyze-phuglee .property-profile-cinematic .preview-images.dual {
  grid-template-columns: 1fr;
}

body.analyze-phuglee .property-profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.55rem 0.85rem 0.65rem;
  background: rgba(0, 0, 0, 0.35);
  border-top: 1px solid rgba(174, 163, 143, 0.1);
}

body.analyze-phuglee .profile-action-btn {
  font-family: var(--font-body, 'Outfit', sans-serif);
  font-size: 0.78rem;
  font-weight: 600;
  min-height: 2.25rem;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(174, 163, 143, 0.22);
  background: rgba(0, 0, 0, 0.28);
  color: var(--phuglee-cream, #f5f2e4);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

body.analyze-phuglee .profile-action-btn:hover {
  border-color: rgba(229, 132, 53, 0.45);
  color: var(--phuglee-orange, #e58435);
}

body.analyze-phuglee .profile-action-btn.profile-action-primary {
  border-color: rgba(229, 132, 53, 0.5);
  background: rgba(229, 132, 53, 0.14);
  color: var(--phuglee-orange, #e58435);
}

body.analyze-phuglee .property-profile-section-nav {
  flex-shrink: 0;
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid rgba(174, 163, 143, 0.12);
  background: rgba(0, 0, 0, 0.18);
  scrollbar-width: thin;
}

body.analyze-phuglee .profile-section-chip {
  flex-shrink: 0;
  font-family: var(--font-body, 'Outfit', sans-serif);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(174, 163, 143, 0.2);
  background: transparent;
  color: var(--phuglee-stone, #9c968a);
  cursor: pointer;
}

body.analyze-phuglee .profile-section-chip[aria-current="true"] {
  border-color: rgba(229, 132, 53, 0.45);
  color: var(--phuglee-cream, #f5f2e4);
  background: rgba(229, 132, 53, 0.12);
}

/* Sole scroll owner */
body.analyze-phuglee .property-profile-dossier {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

body.analyze-phuglee .property-profile-cinematic .property-modal-details {
  overflow: visible;
  min-height: 0;
}

body.analyze-phuglee .property-profile-cinematic .inspector-body {
  overflow: visible;
  padding: 0.85rem 1.15rem 1.5rem;
}

body.analyze-phuglee .profile-dossier-section {
  scroll-margin-top: 0.5rem;
  padding-top: 0.75rem;
  margin-top: 0.35rem;
  border-top: 1px solid rgba(174, 163, 143, 0.1);
}

body.analyze-phuglee .profile-dossier-section:first-child {
  border-top: none;
  margin-top: 0;
  padding-top: 0;
}

body.analyze-phuglee .profile-dossier-section-title {
  font-family: var(--font-body, 'Outfit', sans-serif);
  font-size: 0.8rem;
  font-weight: 650;
  color: var(--phuglee-cream, #f5f2e4);
  margin: 0 0 0.55rem;
  letter-spacing: 0.02em;
}

body.analyze-phuglee .profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 0.85rem;
}

body.analyze-phuglee .profile-kv {
  display: grid;
  grid-template-columns: minmax(5.5rem, 38%) 1fr;
  gap: 0.35rem;
  align-items: start;
}

body.analyze-phuglee .profile-kv .val {
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (max-width: 900px) {
  body.analyze-phuglee .property-profile-hero .preview-images {
    height: clamp(140px, 22vh, 220px);
  }
  body.analyze-phuglee .profile-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  body.analyze-phuglee .property-modal-dialog.property-profile-cinematic {
    animation: none;
  }
}
```

Also **remove or override** any prior two-column `property-profile-grid` media-left / details-right rules for `.property-profile-cinematic` so the layout is single column cinematic (hero on top, dossier below).

Move gauge panel **into** overview section via JS in Task 4 OR keep gauge in sticky strip under actions if space is tight — **default per spec:** gauge lives in Overview inside `inspectorBody` HTML; hide empty `#inspectorGaugePanel` container in HTML if gauge is fully rendered inside overview, **but keep `#gaugeNum` / `#gaugeFill` ids live in DOM** for `updateGauge`. Prefer: leave `#inspectorGaugePanel` at top of dossier scroll (sticky-adjacent under nav) as compact distress strip:

```css
body.analyze-phuglee .property-profile-cinematic #inspectorGaugePanel {
  flex-shrink: 0;
  /* if panel stays outside scroll, put it between nav and dossier */
}
```

**Plan default:** place `#inspectorGaugePanel` **inside** `#profileDossierScroll` above `inspectorBody` (scrolls with overview feeling) OR between section nav and dossier as non-scrolling compact score. Spec Overview includes score — implement score block **inside** `inspectorBody` Overview HTML and keep `#gaugeNum`/`#gaugeFill` there by moving panel into Overview on render **or** leave panel fixed between nav and dossier (`flex-shrink: 0`). **Choose fixed strip between nav and dossier** so score always visible without scroll:

```html
<nav id="profileSectionNav"></nav>
<div id="inspectorGaugePanel" class="property-distress property-profile-score-strip">...</div>
<div id="profileDossierScroll">...</div>
```

Update Task 2 HTML if implementing this order (score strip between nav and dossier).

- [ ] **Step 1: Add cinematic CSS** to `phuglee-analyzer.css`.
- [ ] **Step 2: Override dual/grid conflicts** in `app.css` for cinematic class only.
- [ ] **Step 3: Commit**

```bash
git add modules/property-analyzer/public/css/phuglee-analyzer.css modules/property-analyzer/public/css/app.css
git commit -m "style(analyzer): cinematic property profile layout and scroll model"
```

---

### Task 4: Wire imagery + showInspector + scroll-spy

**Files:**
- Modify: `modules/property-analyzer/public/js/render.js` (`setPreviewImages`, `formatPropertyProfileHtml`, `showInspector`)
- Modify: `modules/property-analyzer/public/js/config.js` (element refs for new buttons/nav/scroll)

**Interfaces:**
- Consumes: `PDA.lib.propertyProfileDossier` helpers
- Consumes: `getPropertyImageUrls`, `getCachedImageryUrls`, `openLightbox`, `updateGauge`, copy helpers
- Produces: working profile UI matching spec

- [ ] **Step 1: config.js refs**

```js
R.profileActionStrip = $('profileActionStrip');
R.profileCopyPhoneBtn = $('profileCopyPhoneBtn');
R.profileCopyEmailBtn = $('profileCopyEmailBtn');
R.profileGoogleLink = $('profileGoogleLink');
R.profileChangeLevelBtn = $('profileChangeLevelBtn');
R.profileSatelliteBtn = $('profileSatelliteBtn');
R.profileSectionNav = $('profileSectionNav');
R.profileDossierScroll = $('profileDossierScroll');
```

- [ ] **Step 2: setPreviewImages — property target never dual**

In `setPreviewImages`, when `target === 'property'`:

```js
// Property cinematic profile: Street View only in hero.
// Satellite is offered via action button + lightbox, not dual pane.
if (target === 'property') {
  const imagesEl = previewImages;
  const satWrap = previewSatWrap;
  const satImg = previewSatImg;
  const mainImg = previewImg;
  const placeholder = previewPlaceholder;
  const wrap = previewWrap;
  const paneLabel = previewPaneLabel;
  const mainReticle = previewMainReticle;
  if (!imagesEl) return;

  imagesEl.classList.remove('dual');
  if (satWrap) satWrap.hidden = true;

  const setPreviewImg = typeof setReviewImgSrc === 'function' ? setReviewImgSrc : setImgSrc;
  // Prefer Street View for hero; do not put satellite in main hero
  if (streetView) {
    setPreviewImg(mainImg, streetView);
    if (satImg) {
      satImg.style.display = 'none';
      // stash sat URL for lightbox button if provided
      if (satellite) satImg.dataset.satSrc = satellite;
      else delete satImg.dataset.satSrc;
    }
    placeholder.style.display = 'none';
    wrap.classList.remove('satellite-target');
    paneLabel.textContent = 'Street View';
    if (mainReticle) mainReticle.style.display = 'none';
  } else {
    // No SV: calm empty (even if sat exists — sat is button/lightbox only)
    mainImg.style.display = 'none';
    mainImg.removeAttribute('src');
    if (satImg) {
      satImg.style.display = 'none';
      if (satellite) satImg.dataset.satSrc = satellite;
      else delete satImg.dataset.satSrc;
    }
    placeholder.style.display = 'block';
    wrap.classList.remove('satellite-target');
    if (paneLabel) paneLabel.textContent = 'Street View';
    if (mainReticle) mainReticle.style.display = 'none';
  }
  return;
}
// existing dual logic for target === 'scan' unchanged below
```

- [ ] **Step 3: Refactor `formatPropertyProfileHtml` to return structured parts**

Change return shape used by `showInspector` — either:

**Option A (preferred):** new function `buildProfileDossierParts(r)` returning:

```js
{
  flags: { hasContact, hasViolations, hasValues, hasProperty, hasFlags, hasOverview: true },
  sectionsHtml: {
    contact: '...',
    violations: '...',
    values: '...',
    property: '...',
    flags: '...'
  }
}
```

Keep field extractors (money, facts, amenities, violations) as they are today; wrap each non-empty block:

```html
<section class="profile-dossier-section" id="profile-section-values" data-profile-section="values">
  <h3 class="profile-dossier-section-title">Values</h3>
  <div class="profile-grid">...</div>
</section>
```

- [ ] **Step 4: Rewrite `showInspector` body HTML**

Outline:

```js
const dossierApi = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.propertyProfileDossier) || {};
const propertyHasSatelliteMedia = dossierApi.propertyHasSatelliteMedia || (() => false);
const getPresentProfileSections = dossierApi.getPresentProfileSections || (() => ['overview']);
const buildProfileSectionNavHtml = dossierApi.buildProfileSectionNavHtml || (() => '');

const urls = getPropertyImageUrls(r.address, r);
// Hero: Street View only
setPreviewImages({ streetView: urls.streetView, satellite: urls.satellite }, 'property');

const cached = typeof getCachedImageryUrls === 'function' ? getCachedImageryUrls(r) : {};
const satAvailable = propertyHasSatelliteMedia({
  hasSatelliteUrl: !!(urls.satellite || cached.satellite),
  hasCachedSatellite: !!cached.satellite,
  usedSatellite: !!r.usedSatellite,
  skippedStreetView: !!r.skippedStreetView,
  preferSatellite: !!urls.preferSatellite
});
const satUrl = cached.satellite || urls.satellite || '';

// Action strip
if (profileCopyPhoneBtn) {
  profileCopyPhoneBtn.hidden = !r.phone;
  // click → copyText(r.phone, ...)
}
// similar email, google link (getGoogleSearchUrl), change level (only cat===property)

if (profileSatelliteBtn) {
  profileSatelliteBtn.hidden = !satAvailable;
  profileSatelliteBtn.onclick = (e) => {
    e.stopPropagation();
    if (satUrl && typeof openLightbox === 'function') {
      openLightbox(satUrl, `Satellite — ${propertyLocationTitle(r)}`);
    }
  };
}

const parts = buildProfileDossierParts(r); // refactored
const sectionFlags = {
  hasOverview: true,
  hasContact: parts.flags.hasContact || !!(r.phone || r.email || contactName(r)),
  ...parts.flags
};
const sectionIds = getPresentProfileSections(sectionFlags);
if (profileSectionNav) {
  profileSectionNav.innerHTML = buildProfileSectionNavHtml(sectionIds);
  profileSectionNav.querySelectorAll('[data-profile-section]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.getAttribute('data-profile-section');
      const el = inspectorBody.querySelector(`#profile-section-${id}`) ||
        profileDossierScroll?.querySelector(`#profile-section-${id}`);
      el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      profileSectionNav.querySelectorAll('[data-profile-section]').forEach((c) => {
        c.toggleAttribute('aria-current', c === chip);
      });
    });
  });
}

inspectorBody.innerHTML = `
  <section class="profile-dossier-section" id="profile-section-overview" data-profile-section="overview">
    <h3 class="profile-dossier-section-title">Overview</h3>
    <div class="inspector-identity">...</div>
    <div class="inspector-badges">...</div>
    <!-- score display / adjust panel (existing) -->
    ${formatSimpleAnalysisHtml(r)}
    ${needs review / category change}
  </section>
  ${parts.sectionsHtml.contact || ''}
  ${parts.sectionsHtml.violations || ''}
  ${parts.sectionsHtml.values || ''}
  ${parts.sectionsHtml.property || ''}
  ${parts.sectionsHtml.flags || ''}
  <div class="inspector-hint">↑↓ or J/K to move between leads · Esc to close</div>
`;
```

Wire score buttons as today. Remove duplicate contact block from bottom if Contact section covers it; sticky strip still has copy.

- [ ] **Step 5: Scroll-spy**

```js
function wireProfileScrollSpy() {
  const root = profileDossierScroll;
  if (!root || !profileSectionNav) return;
  if (state._profileSpy) {
    state._profileSpy.disconnect();
    state._profileSpy = null;
  }
  const sections = inspectorBody.querySelectorAll('.profile-dossier-section[data-profile-section]');
  if (!sections.length) return;
  let ignoreUntil = 0;
  // set ignoreUntil = Date.now()+400 on chip click
  const obs = new IntersectionObserver((entries) => {
    if (Date.now() < ignoreUntil) return;
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.getAttribute('data-profile-section');
    profileSectionNav.querySelectorAll('[data-profile-section]').forEach((c) => {
      c.toggleAttribute('aria-current', c.getAttribute('data-profile-section') === id);
    });
  }, { root, threshold: [0.2, 0.45, 0.7] });
  sections.forEach((s) => obs.observe(s));
  state._profileSpy = obs;
}
```

Call after `innerHTML` assignment. Disconnect on `closePropertyModal` if easy (session.js) — optional if recreated each open.

- [ ] **Step 6: showInspector preferSatellite branch**

Remove:

```js
if (preferSatellite) {
  setPreviewImages({ streetView: null, satellite: ...}, 'property');
} else {
  setPreviewImages({ streetView, satellite }, 'property');
}
```

Replace with always:

```js
setPreviewImages({ streetView: urls.streetView, satellite: urls.satellite }, 'property');
```

(Hero never shows sat; sat is button-gated.)

- [ ] **Step 7: Run pure unit tests still pass**

```bash
cd modules/property-analyzer
node --test tests/property-profile-dossier.test.js
```

- [ ] **Step 8: Commit**

```bash
git add modules/property-analyzer/public/js/render.js modules/property-analyzer/public/js/config.js
git commit -m "feat(analyzer): wire cinematic dossier, SV-only hero, sat lightbox gate"
```

---

### Task 5: Close/nav hygiene + shell verify

**Files:**
- Modify: `modules/property-analyzer/public/js/session.js` only if needed (disconnect spy; ensure `closeLightbox` keeps `body` overflow when property modal still open — already handled)
- Modify: `public/css/distress-analyzer-os.css` only if embedded iframe/shell clips modal

- [ ] **Step 1: On `closePropertyModal`, disconnect scroll-spy if `state._profileSpy`**

```js
if (state._profileSpy) {
  state._profileSpy.disconnect();
  state._profileSpy = null;
}
```

- [ ] **Step 2: Confirm Esc order** (existing): lightbox open → close lightbox; else close property modal. Manual check.
- [ ] **Step 3: Live verify**

```bash
cd C:\Users\brand\Projects\distress-os
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Expected: exit 0.

- [ ] **Step 4: Manual matrix** (browser `http://127.0.0.1:3000/analyzer/`)

| Case | Expect |
|------|--------|
| Rich enriched lead | Sections + chips; scroll to Values/Violations works; no cut-off at bottom |
| Minimal lead | Fewer chips; no empty shells |
| Has SV + sat cache/flag | SV hero; Satellite button present; opens lightbox |
| No sat signals | No Satellite button |
| No SV | Placeholder; sat button only if gate true |
| Prev/Next | Updates dossier + hero |
| Change level | Works in Overview |
| Copy phone | Sticky strip + contact section |

- [ ] **Step 5: Commit**

```bash
git add modules/property-analyzer/public/js/session.js public/css/distress-analyzer-os.css
git commit -m "fix(analyzer): profile modal close hygiene and shell polish"
```

(If no shell CSS changes, commit only session.js.)

---

### Task 6: Quieter / typeset / polish pass

**Files:**
- `modules/property-analyzer/public/css/phuglee-analyzer.css`
- `modules/property-analyzer/public/js/render.js` (copy only if needed)

**Kill residual cosplay on this surface:**
- Ensure `#recBadge`, `#previewMainReticle` stay `hidden` / not displayed for property cinematic
- Placeholder copy stays “No Street View for this address”
- No Anton on section titles; Outfit only
- Mono for money values if class exists

- [ ] **Step 1: Grep for leftover HUD on modal**

```bash
rg -n "NO SIGNAL|rec-badge|target-reticle|Satellite · D4D|inspector-cyber" modules/property-analyzer/public
```

- [ ] **Step 2: Fix any remaining visual leftovers** scoped to property modal.
- [ ] **Step 3: verify-live.ps1 again**
- [ ] **Step 4: Commit**

```bash
git commit -m "style(analyzer): polish cinematic property profile dossier"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Dossier-first full deal brief | 4 |
| Sticky header + SV + actions | 2, 3 |
| Sticky section nav + scroll-spy | 2, 3, 4 |
| One scroll owner / no cut-off | 3 |
| Street View only default | 4 (`setPreviewImages`) |
| Satellite button only if property has sat media | 1 gate + 4 wire |
| Satellite lightbox | 4 (`openLightbox`) |
| Preserve ids / prev-next / Esc / score | 2, 4, 5 |
| No cyber HUD cosplay | 6 |
| Hybrid glass + heat | 3, 6 |
| verify-live | 5, 6 |

## Placeholder / consistency self-review

- No TBD steps; satellite gate fully specified.
- Section order constants match spec Overview → Contact → Violations → Values → Property → Flags.
- `propertyHasSatelliteMedia` name consistent across tests, lib, and render wiring.
- Reuses existing `openLightbox` — no second lightbox stack.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-property-profile-cinematic-dossier.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans + checkpoints  

Which approach?
