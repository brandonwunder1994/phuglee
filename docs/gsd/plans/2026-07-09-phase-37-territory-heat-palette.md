# Phase 37 — Territory Heat Palette

> **GSD:** `/gsd:execute-phase 37`  
> **Milestone:** [M6 Territory Theater](../milestones/M6-territory-theater.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-territory-theater-design.md`

**Goal:** Covered states on the homepage map read as **Phuglee ember→gold heat**, not generic SaaS green — SVG fallback, MapLibre explorer, and legend all match.

**Architecture:** Centralize heat colors in CSS tokens; mirror exact hex constants in both map code paths (`home-coverage.js` SVG + `home-coverage-explorer.js` MapLibre). No markup restructuring yet.

**Tech stack:** CSS custom properties, existing MapLibre `interpolate` fill expression, SVG path fills.

---

## Quality bar

| Pass | Fail |
|------|------|
| Covered states are brown-ember → orange → gold | Any green `#2a8f5c` / `#45c47e` on home map |
| Legend Live swatch matches heat ramp | Green swatch, mismatched legend |
| Blocked stays blood; Soon stays steel | Status colors muddled into heat |
| Dense states brighter than thin | Flat single fill for all covered |
| SVG fallback + MapLibre both match | One path green, one path gold |
| Reduced motion N/A (static colors) | — |

---

## Locked color values

```css
/* tokens.css */
--territory-heat-low: #8a4a18;
--territory-heat-mid: #e58435;   /* --phuglee-orange */
--territory-heat-high: #eeb746;  /* --phuglee-gold */
--territory-heat-glow: rgba(238, 183, 70, 0.22);
--territory-soon: #3a4658;
--territory-blocked: #8f2a2a;
--territory-blocked-accent: #c84848;
```

JS constants (must match token hex, no `var()` in MapLibre paint):

```js
var COLOR_COVERED_LOW = '#8a4a18';
var COLOR_COVERED_MID = '#e58435';
var COLOR_COVERED_HIGH = '#eeb746';
var COLOR_NO_DATA = '#3a4658';
var COLOR_UNAVAILABLE = '#8f2a2a'; // or existing BASE/ACCENT pair
```

**Lerp strategy (SVG):**  
`stateFillColor(count, maxCount)` currently lerps LOW→HIGH. Change endpoints to heat-low → heat-high. Optionally three-stop: below 0.4 max use low→mid, above mid→high (nice but optional — two-stop OK if mid is the low endpoint).

**MapLibre strategy:**  
`buildStateFillColor(maxCount)` interpolate:

```js
['interpolate', ['linear'], ['get', 'count'],
  1, COLOR_COVERED_LOW,
  Math.max(2, Math.round(maxCount * 0.45)), COLOR_COVERED_MID,
  maxCount, COLOR_COVERED_HIGH
]
```

If `maxCount === 1`, collapse to solid `COLOR_COVERED_MID`.

**Hover/select stroke:** keep gold `#eeb746` (already good).

---

## Files

| Action | Path |
|--------|------|
| Modify | `public/css/tokens.css` — add `--territory-*` tokens |
| Modify | `public/css/home.css` — `.home-map-swatch--covered` gradient; optional map bg tint |
| Modify | `public/js/home-coverage.js` — `COLOR_COVERED_*`, `stateFillColor` |
| Modify | `public/js/home-coverage-explorer.js` — `COLOR_COVERED_*`, `buildStateFillColor` |
| Verify | Legend overlay in `index.html` (labels OK; swatch CSS only) |

Do **not** change dock layout, chips, or close in this phase.

---

## Tasks

### Task 1: Tokens + legend swatch

- [ ] Add territory tokens to `tokens.css` (see locked values)
- [ ] Update `.home-map-swatch--covered` to:

```css
.home-map-swatch--covered {
  background: linear-gradient(135deg, var(--territory-heat-low), var(--territory-heat-high));
}
```

- [ ] Keep `--pending` / `--blocked` swatches on steel / blood
- [ ] Optional: `.home-coverage-map` background stays `#080c14` or very subtle warm `#0a0c10` — do not cream-wash

### Task 2: SVG fallback path (`home-coverage.js`)

- [ ] Replace green constants with heat hexes
- [ ] Confirm `lerpHex` still works with new endpoints
- [ ] Grep project for `#2a8f5c` and `#45c47e` in **home** map paths — remove from explorer + home-coverage (Form Forge full map can stay for later; out of scope unless shared constants file)

### Task 3: MapLibre path (`home-coverage-explorer.js`)

- [ ] Replace `COLOR_COVERED_LOW` / `HIGH` (currently green)
- [ ] Update `buildStateFillColor` to 2- or 3-stop interpolate
- [ ] Visually check lift layer fill still uses same heat colors as base fill (lift should match selected state heat, not green)

### Task 4: Verify

- [ ] Cold load `http://127.0.0.1:3000/` — scroll to territory
- [ ] Covered states: amber/gold; no green
- [ ] Force SVG fallback if easy (block MapLibre) — same palette
- [ ] Blocked states still red hatch
- [ ] `npm test`
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1`
- [ ] Screenshot: map mid-viewport for phase evidence

### Task 5: Commit

```text
feat(home): territory heat palette (ember→gold choropleth)
```

---

## Done when

Homepage map + legend look **on-brand hot**. Green SaaS coverage is gone from both render paths.

## Out of scope

HUD typography, ticker, dock redesign, entrance animation, `/forge/map` global palette.
