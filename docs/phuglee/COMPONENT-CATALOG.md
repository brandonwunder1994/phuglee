# Phuglee shared component catalog

**v3.0 Filter makeover** · Short maintainer note for later Collect / Hub adoption.  
**Not Storybook.** Source of truth: `public/css/tokens.css` + `public/css/phuglee-components.css`.

---

## 1. Tokens

Reuse these from `public/css/tokens.css`. **Do not invent random hex** for status or desk chrome.

| Token group | Key names | Use |
|-------------|-----------|-----|
| Brand | `--phuglee-black`, `--phuglee-cream`, `--phuglee-orange`, `--phuglee-gold`, `--phuglee-terracotta`, `--phuglee-taupe`, `--phuglee-stone` | Surfaces, text, accents |
| Status (fg only) | `--phuglee-success`, `--phuglee-warn`, `--phuglee-danger` | Success / warn / danger text + status wraps |
| Status aliases | `--status-success-fg`, `--status-warn-fg`, `--status-danger-fg` | Prefer over raw hex in new paint |
| Glass | `--glass-bg`, `--glass-bg-elevated`, `--glass-bg-solid`, `--glass-border`, `--glass-border-hover`, `--glass-fill`, `--glass-shadow`, `--glass-shadow-float`, `--glass-shadow-featured` | Panels, modals, float elevation |
| Type | `--font-display` (Anton), `--font-body` (Outfit), `--text-display-*`, `--text-body*`, `--text-eyebrow` | Headings vs body |
| Desk density | `--desk-pad-y`, `--desk-pad-x` | Ops panels (not auth-modal roominess) |
| Chip selected | `--chip-bg-selected`, `--chip-fg-selected` | Selected type chips (gold→orange gradient) |
| Focus | `--phuglee-focus-ring` (fallback in components) | `:focus-visible` rings |

**Ban:** one-off `#hex` islands for kill/status/CTA paint when a `--phuglee-*` or `--status-*-fg` exists.

---

## 2. Classes

Shipped in `public/css/phuglee-components.css`. Dual-class on Filter (`bridge-*` + `phuglee-*`).

### Buttons

| Class | Role |
|-------|------|
| `.phuglee-btn` | Base (padding, radius, transition) |
| `.phuglee-btn-primary` | Raised gold/orange CTA |
| `.phuglee-btn-secondary` | Glass secondary |
| `.phuglee-btn-ghost` | Low emphasis |
| `.phuglee-btn-danger` | Destructive (tints via `--phuglee-danger`) |
| `.phuglee-btn-sm` | Desk density |

**States:** `:hover:not(:disabled)` lift capped (~`translateY(-2px)`); `:focus-visible` uses focus ring; `:disabled` / `[disabled]` opacity mute + no pointer events.

### Forms

| Class | Role |
|-------|------|
| `.phuglee-input` | Text / search |
| `.phuglee-textarea` | Multi-line |
| `.phuglee-select` | Native select |

Shared focus border + disabled mute. Filter densifies layout in `bridge.css`; paint lives here.

### Panels / cards

| Class | Role |
|-------|------|
| `.phuglee-panel` | Glass card base |
| `.phuglee-panel-featured` | Stronger border / featured hover |
| `.phuglee-panel--float` / `.distress-glass--float` | Elevated float shadow |
| `.phuglee-panel--static` | No hover lift (ops desk) |
| `.phuglee-panel--dense` | Desk pad tokens |
| `.phuglee-panel-exclusive` / `.phuglee-panel-vault` | Pricing / vault variants (home) |

### Modal

| Class | Role |
|-------|------|
| `.phuglee-modal-backdrop` | Dim layer (when used) |
| `.phuglee-modal-panel` | Glass dialog body (Filter: dual-class on native `<dialog>` cards) |

### Empty + loading

| Class | Role |
|-------|------|
| `.phuglee-empty-state` / `--compact` | Empty copy block |
| `.phuglee-loading-state` | Loading host |
| `.phuglee-loading-bar` | Indeterminate bar |
| `.phuglee-loading-copy` | Status line |

### Chips

| Class | Role |
|-------|------|
| `.phuglee-chip-group` | Radiogroup host |
| `.phuglee-chip` | Chip label wrapper |
| `.phuglee-chip-face` | Visible face (selected = auth-tab gradient DNA) |

Filter type radios: dual-class `bridge-type-chip` + `phuglee-chip` (code / water). **Not** essay cards (`bridge-type-card` banned).

### Type / chrome helpers

`.phuglee-eyebrow`, `.phuglee-hero-title`, `.phuglee-tagline`, `.phuglee-pattern-bg` (+ `--subtle` / `--medium` / `--strong`), `.phuglee-status` / `--error` / `--success` / `--warn`, `.phuglee-error-wrap`, `.phuglee-success-wrap`.

---

## 3. Do

- Dual-class Filter surfaces: keep `id="bridge-*"` + add `phuglee-*` classes.
- Extend `phuglee-components.css` / tokens — do not invent a parallel theme file per page.
- Honor HTML `hidden` and `:disabled` (JS owns show/hide; CSS styles only).
- Freeze `bridge-*` IDs and `data-action` / `data-mode` / `data-format` / `data-step` values (`docs/bridge/CONTRACT-FREEZE.md`).
- Cache-bust CSS with `?v=` bumps when shipping visual edits; hard-refresh (`Ctrl+Shift+R`).

---

## 4. Don't

- Invent hex islands in desk chrome when tokens exist.
- Rename `bridge-*` IDs or locked `data-*` contracts.
- Force Train open with CSS (`#bridge-train-wrap { display:flex !important }`).
- Wipe `data/filter-lists/` or `data/bridge-brain/` for screenshots or demos.
- Re-couple Analyze push chrome (`Send to Analyze`, etc.).
- Add Storybook / React for this catalog.

---

## Adoption (Collect / Hub later)

1. Link `tokens.css` + `phuglee-components.css`.
2. Dual-class buttons/panels/inputs to `phuglee-*`.
3. Keep page-local layout in the page CSS; shared paint stays here.
4. Status colors → `--phuglee-success|warn|danger` only.

*Phase 81 · SYS-01 · docs only*
