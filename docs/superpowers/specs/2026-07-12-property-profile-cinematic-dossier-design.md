# Design Spec — Property Profile (Cinematic Dossier)

**Date:** 2026-07-12  
**Status:** Approved (brainstorming + Impeccable shape) — ready for implementation plan  
**Product:** Phuglee Distress OS — Analyze (`/analyzer/`)  
**Surface:** Property profile modal (`#propertyModal`)  
**Approach:** **A — Cinematic dossier**  
**Process:** Superpowers brainstorming → design approval → writing-plans → Impeccable craft  

**Related:**
- Parent redesign: `docs/superpowers/specs/2026-07-12-analyze-page-redesign-design.md` (modal was in-scope but under-delivered on organization / scroll / cut-off)
- Plan sibling (when written): `docs/superpowers/plans/2026-07-12-property-profile-cinematic-dossier.md`
- Code: `modules/property-analyzer/public/index.html`, `js/render.js`, `js/imagery.js`, CSS layers (`phuglee-analyzer.css`, `app.css`, residual cyber modal rules, shell `public/css/distress-analyzer-os.css`)

---

## 1. Problem

Opening a property card is the **dial moment** — operator trust peaks or dies here. Current profile fails that moment:

| Pain | Evidence |
|------|----------|
| Content cut off | Nested overflow on dialog/grid/details; last sections and field values clip or feel trapped |
| Bland / unprofessional | Flat section stack; residual cyber dialog DNA; no clear hierarchy between judgment, contact, and underwriting data |
| Scroll usability | Long unstructured dump; no way to jump to Values / Violations / Contact without scrubbing |
| Imagery wrong for the job | Dual Street View + Satellite panes compete; satellite chrome appears when it shouldn’t |
| Organization | Identity, badges, score, analysis, contacts, and enriched profile sections don’t read as one CRM brief |

User goal: make the property profile **badass** — cinematic Street View presence + a scannable **full deal dossier**, not a prettier dump.

---

## 2. Goals & success criteria

### Goals

1. **Dossier-first** — In the first ~3 seconds, the operator can scan the full deal (identity, contact, violations, values, property facts, flags), not only a score or a phone.
2. **Cinematic media** — One powerful Street View hero; professional, not HUD cosplay.
3. **Scroll that works** — Sticky section nav (scroll-spy + click-to-jump); one clear scroll owner; no clipped content.
4. **Satellite on demand** — Button **only if** that property has satellite imagery; default view is Street View only.
5. **Same product family** — Hybrid C: Filter glass + Analyze heat on judgment/tier; continuous with the Analyze redesign system.

### Success criteria

1. No visible clipping of title, action strip, or last dossier rows at typical desktop heights (≈900–1080p) and modal max-height ~92vh.
2. Only Street View (or calm empty placeholder) in the hero by default; **no** dual-pane default; **no** disabled satellite button.
3. Satellite control **renders only** when sat imagery exists for that property; opens as **lightbox** with explicit return path.
4. Sticky section chips for non-empty sections; click jumps; active chip tracks scroll.
5. Sticky chrome: header + Street View hero + action strip remain reachable while dossier scrolls.
6. Prev / Next / Esc / J·K / ↑↓, score change, category change, copy phone/email, Google listings — behavior preserved.
7. Bound IDs preserved or aliased without breaking `config.js` / `imagery.js` / tests that query them.
8. No REC / reticle / “NO SIGNAL” / scanline / dual “Satellite · D4D” cosplay.

---

## 3. Locked decisions

| Topic | Choice |
|-------|--------|
| Primary job (first 3s) | **Full deal dossier** |
| Dense-data organization | **Sticky section nav** (continuous scroll + scroll-spy) |
| Sticky chrome | **Header + Street View + action strip** |
| Layout approach | **A — Cinematic dossier** |
| Satellite UX | **Lightbox** over hero (not permanent dual pane; not in-place swap as primary) |
| Satellite visibility | **Only if property has sat imagery** — omit control otherwise |
| Default media | **Street View only** |
| Visual system | Hybrid C (glass + heat on tier/distress/primary actions) |
| Implementation | Unify in place — vanilla HTML/CSS/JS; no React/Tailwind |
| Scope breadth | Property profile modal only (not Review overlay full redesign this pass) |

### Non-goals

- Rewriting scan / tier / export / session engines  
- Review overlay redesign (separate pass)  
- New enrichment data sources  
- PRODUCT.md / full brand init (optional later via `/impeccable init`)  
- Parallel app shell  

---

## 4. Architecture (layout)

```
┌──────────────────────────────────────────────────────────────────┐
│ STICKY HEADER                                                     │
│  Street · city/state          Tier pill        ← n/m →     [×]  │
├──────────────────────────────────────────────────────────────────┤
│ STICKY STREET VIEW HERO                                           │
│  Single image (previewImg) · calm empty if none                   │
│  ACTION STRIP (sticky with hero / under hero):                    │
│   Copy phone · Copy email · Search listings · Change level        │
│   Satellite  ← only if sat available for this property            │
├──────────────────────────────────────────────────────────────────┤
│ STICKY SECTION NAV (horizontal chips, scroll-spy)                 │
│  Overview · Contact · Violations · Values · Property · Flags      │
│  (omit chips for empty sections)                                  │
├──────────────────────────────────────────────────────────────────┤
│ SCROLLING DOSSIER (sole overflow-y: auto region for body content) │
│  #overview · #contact · #violations · #values · #property · #flags│
│  Footer kbd hint (non-sticky)                                     │
└──────────────────────────────────────────────────────────────────┘
```

### Overflow model (anti-cutoff)

- Dialog: `max-height: ~92vh`; flex column; `overflow: hidden` on shell only.
- Header, hero, action strip, section nav: `flex-shrink: 0`.
- **One** scrollport: dossier body (`overflow-y: auto`; `min-height: 0`).
- No nested scroll traps that clip last rows or sticky children incorrectly.
- Mobile (`max-width: ~900px`): stack; hero max-height capped; same single scrollport may expand to include slightly more chrome if sticky becomes cramped — prefer keep header sticky, allow hero to shrink rather than dual nested scrolls.

### Satellite lightbox

- Trigger: **Satellite** button in action strip when `satellite` URL (or cached sat) exists for the open property.
- Content: large sat image (`previewSatImg` may live in lightbox container, or be moved/cloned — prefer reusing existing img id for minimal engine churn).
- Controls: Close / “Back to Street View” / Esc / click backdrop.
- Does **not** leave dual panes in the main layout.
- If sat load fails after open: error line in lightbox + keep close path; do not invent a permanent dual layout.

---

## 5. Information architecture (sections)

| Section | Chip label | Contents |
|---------|------------|----------|
| Overview | Overview | Owner/identity secondary line, category/tier badges, distress score display + Change level entry, short analysis HTML, needs-review callout, category change controls, absentee/mailing one-liner if relevant |
| Contact | Contact | Contact name/type, phone(s) + copy, email(s) + copy (top-level + profile stack) |
| Violations | Violations | Code violation history from Filter SCAN HISTORY / primary violation fields |
| Values | Values | Market/AVM/wholesale/tax/equity/LTV/mortgage/lender (existing profile money rows) |
| Property | Property | Beds/baths/sqft/year/type/county + amenities/HOA grid |
| Flags | Flags | Distress/motivation flag chips + auction/last notice |

**Rules:**
- Omit empty sections and their chips.
- Prefer existing field extractors in `formatPropertyProfileHtml` / `showInspector` — restructure presentation, don’t invent new domain fields.
- Contact actions in the sticky strip mirror primary phone/email when present (one-tap without scrolling to Contact).

---

## 6. Visual / interaction direction (Impeccable product register)

| Decision | Choice |
|----------|--------|
| Register | Product tool |
| Color strategy | Restrained glass overall; **committed heat** only on Distressed tier pill, distress score emphasis, and primary contact action when present |
| Scene sentence | Operator at a dim desk after hours; one tired house fills the hero; underwriting facts scroll under a clean rail — focused deal brief, not a command center |
| Typography | Outfit for UI chrome; JetBrains Mono (or existing mono token) for scores and money; **no Anton on section labels** |
| Motion | Modal open 200–250ms ease-out; smooth section scroll; lightbox fade; honor `prefers-reduced-motion` |
| Anchors | Filter glass panels; Linear density/hierarchy; existing Analyze prev/next power-user bones |

### Absolute bans (this surface)

- Side-stripe borders as accent  
- Gradient text  
- Glassmorphism as decorative default beyond existing product glass tokens  
- REC / reticle / NO SIGNAL / scanlines / “Satellite · D4D”  
- Nested cards inside cards  
- Always-visible dual Street View + Satellite panes  
- Disabled satellite button when sat is unavailable (omit instead)  
- Eyebrow spam on every subsection  

---

## 7. Behavior preservation

Must keep working after redesign:

| Behavior | Notes |
|----------|--------|
| Open from card / selection | `showInspector` / `openPropertyModal` |
| Close | Esc, backdrop, close button |
| Nav | Prev/Next buttons; J/K or ↑↓ as today |
| Imagery load | `getPropertyImageUrls`, `setPreviewImages`, cache background paths |
| Score edit | Change level → tier picker → save/cancel |
| Category change | Existing controls |
| Copy phone/email | Top-level and profile stack |
| Google listings link | External search |
| Session save on open | `scheduleSaveSession('inspector-open')` when not navOnly |

### Bound IDs (keep or keep + structural wrappers)

Required by current wiring (do not remove without migrating all references):

- `propertyModal`, `propertyModalBackdrop`, `propertyModalTitle`, `previewHeaderTitle`, `propertyModalTierPill`
- `prevPropBtn`, `nextPropBtn`, `inspectorPos`, `closePropertyBtn`
- `previewImg`, `previewSatImg`, `previewSatWrap`, `previewWrap`, `previewPlaceholder`, `previewImages`, `previewPaneLabel`
- `inspectorBody`, `gaugeNum`, `gaugeFill` (or map gauge into Overview while keeping ids for `updateGauge`)
- `liveDot`, `recBadge` may remain hidden for compatibility if still referenced

---

## 8. Component notes

### Header

- Primary title: street line (truncate with ellipsis; full address in `title` attribute).
- Tier pill: existing badge classes / heat for Distressed.
- Position: `n / m` of filtered list.
- Close: 44px-class touch target.

### Street View hero

- Single pane; large aspect-friendly crop (object-fit cover); no cyber frame ornaments.
- Empty: “No Street View for this address” + optional short hint (satellite may still be available via button when sat exists).

### Action strip

- Buttons as product secondaries; heat only where primary (e.g. call/copy phone when phone exists).
- Satellite: secondary/ghost; only if available.
- Do not wrap into a second scrollbar; wrap actions to two rows on narrow widths.

### Section nav

- Horizontal chips; overflow-x auto if many sections.
- `aria-current` on active section.
- Click: `scrollIntoView` on section root (smooth unless reduced motion).

### Dossier sections

- Section title + optional count (e.g. violations).
- Field grid: label / value 2-col desktop; stack mobile.
- Long values wrap; no mid-value ellipsis that hides equity numbers.

### Lightbox

- Elevated glass layer above modal content (or modal-level portal sibling); focus trap optional v1 if Esc already closes; document Esc priority: lightbox first, then property modal.

---

## 9. Implementation sketch (for plan — not code)

1. Restructure `#propertyModal` HTML: sticky regions + dossier scrollport + lightbox shell; keep ids.  
2. CSS: overflow model, hero, chips, grids, lightbox — prefer `phuglee-analyzer.css`; neutralize residual cyber modal identity for this dialog.  
3. `showInspector` / `formatPropertyProfileHtml`: emit sectioned markup with anchors; build chip list from non-empty sections.  
4. Imagery: default Street View only; gate Satellite button on real sat availability; wire lightbox open/close.  
5. Scroll-spy (IntersectionObserver) for active chip.  
6. Manual verify: long profile (rich enrichment), thin profile (minimal fields), no SV, SV+sat, sat-only edge if engine produces it, prev/next, score edit.  
7. `scripts/verify-live.ps1` after public/analyzer asset changes.

---

## 10. Testing & verification

- Manual matrix above on embedded `/analyzer/` at `http://127.0.0.1:3000/analyzer/`.  
- Preserve existing analyzer tests; add or extend UI-facing tests only if project already covers modal selectors (do not invent heavy browser suite unless plan says so).  
- Visual: no cut-off at 1280×800 and 1920×1080; narrow ~390 width stacks without horizontal page scroll.  
- Live verify script after ship.

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Imagery helpers always dual-layout | Explicitly set dual off for property target; button opens lightbox |
| Gauge/cyber CSS still wins specificity | Scope new classes under `.property-profile-dialog`; retire conflicting cyber rules for this dialog |
| Scroll-spy fighting programmatic jump | Ignore observer briefly after chip click |
| Sticky hero steals vertical space on short laptops | Cap hero height (`min`/`max` clamp); keep dossier min height usable |
| Encoding mojibake in HTML (Prev/Next/×) | Fix character entities when touching header markup |

---

## 12. Open implementation details (resolved defaults)

| Item | Default if plan doesn’t re-open |
|------|----------------------------------|
| Satellite interaction | Lightbox |
| Hero height | `clamp(180px, 28vh, 320px)` desktop |
| Section order | Overview → Contact → Violations → Values → Property → Flags |
| Gauge UI | Clean number + compact meter in Overview (keep `#gaugeNum` / `#gaugeFill`) |

No unresolved TBDs blocking the plan.

---

## 13. Approval record

- Brainstorming explore + Q&A: 2026-07-12  
- Approach **A — Cinematic dossier**: approved  
- Section 1 Goals & architecture: approved  
- Section 2 Layout & IA: approved  
- Section 3 Visual & interactions: approved  
- Next: user reviews this written spec → `writing-plans` → Impeccable craft implementation  
