# Design System — Phuglee Distress OS (Ops War Room)

Captured from existing tokens (`public/css/tokens.css`) and Filter desk patterns. Phase 3 unifies all surfaces to this contract.

## Theme scene sentence

A wholesaler at a dim desk at night, laptop open, running a live pipeline: clerk files on one side, scrub desk in the middle, Street View scans on the other. Calm, focused, high stakes — not a nightclub, not a SaaS demo.

## Color strategy

**Restrained** with **Committed** accents: dark earth body (~#0d0d0d / #121212), cream text (#f5f2e4), ember orange (#e58435) and gold (#eeb746) for primary actions and success/kill hierarchy only.

## Palette (existing tokens)

| Role | Token | Value |
|------|-------|-------|
| Background deep | `--phuglee-black` | #0d0d0d |
| Surface | `--phuglee-black-mid` | #121212 |
| Earth panel | `--phuglee-earth` | #24180a |
| Text primary | `--phuglee-cream` | #f5f2e4 |
| Text muted | `--phuglee-meta-text` | #b0a99c |
| Accent action | `--phuglee-orange` | #e58435 |
| Accent success/heat | `--phuglee-gold` | #eeb746 |
| Danger | `--phuglee-danger` | #f87171 |
| Success | `--phuglee-success` | #3dd68c |

## Typography

| Role | Family | Usage |
|------|--------|-------|
| Display / H1 | Anton | Left-aligned section titles, cream |
| Body | Outfit | UI copy, labels, paragraphs |
| Mono | JetBrains Mono | IDs, codes, HUD numbers sparingly |

Rules: no display font in dense data tables. Hero clamp max ≤ 6rem. Body line length ≤ 75ch on prose blocks.

## Components (canonical)

- **Primary button:** `phuglee-btn` (from Filter / phuglee-components)
- **Glass chrome:** `distress-glass--chrome` for nav only — not every card
- **Cards:** use sparingly; prefer open sections with spacing (Impeccable product register)
- **Status:** module pills in footer (`distress-status.js`) — subtle

## Layout

- App shell: top nav (`shell-nav.js`) + footer status
- Work surfaces: asymmetric desk (dominant work area + secondary drawer), per Filter v2.1 bible
- Spacing: use existing phuglee spacing tokens; one scale per page after distill pass

## Motion

150–250ms transitions. Motion conveys state (scan feed, kill report), not decoration. All theater respects `prefers-reduced-motion`.

## Reference surfaces (copy from)

1. **Filter `/bridge`** — best current product UI; desk + theater
2. **Home `/`** — brand photography + Anton hero (marketing register within product shell)
3. **NOT Analyze cyber stack** — remove `cyber-*` CSS from analyze layout

## Anti-patterns to remove (detect baseline)

- Stacked CSS eras on one page (10–15 stylesheets)
- `cyber-theme`, `cyber-modals`, `cyber-ultra` on Analyze
- Side-stripe accent borders
- Gradient text
- Vault mock table presented as live data

## Standard app `<head>` (Phase 3)

```html
<link rel="stylesheet" href="/css/tokens.css?v=shell1">
<link rel="stylesheet" href="/css/distress-glass.css?v=shell1">
<link rel="stylesheet" href="/css/phuglee-components.css?v=shell1">
<link rel="stylesheet" href="/css/phuglee-shell.css?v=1">
<link rel="stylesheet" href="/css/shell.css">
<link rel="stylesheet" href="/css/shell-nav.css?v=9">
<link rel="stylesheet" href="/css/settings-menu.css">
<link rel="stylesheet" href="/css/command-palette.css">
<link rel="stylesheet" href="/css/distress-status.css">
<!-- one page CSS -->
<link rel="stylesheet" href="/css/phuglee-a11y.css">
```

Body atmosphere: single `<div class="phuglee-shell-bg phuglee-shell-bg--{subtle|medium|strong}">` — no stacked premium-bg + heat-field.


| Wave | Commands |
|------|----------|
| Baseline | `critique`, `detect` per surface |
| Strip | `distill`, `quieter` on Analyze + Home |
| Unify | `layout`, `typeset`, `polish` on shell pages |
| Finish | `audit`, `detect` gate before ship |
