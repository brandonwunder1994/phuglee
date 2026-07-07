---
phase: 16
slug: cyber-design-system-formalization
status: approved
preset: cyber intelligence console
created: 2026-06-30
---

# Phase 16 — UI Design Contract

> Cyber intelligence console — single design contract for v1.4. Vanilla HTML/CSS/JS.

## Design System

| Property | Value |
|----------|-------|
| Token file | `public/css/tokens.css` (authoritative `:root`) |
| Theme layers | `cyber-theme.css` (shell), `cyber-ultra.css` (premium) |
| Legacy | `app.css` — migrate calm rules out incrementally |
| Body class | `body.cyber-theme` |
| Fonts | Orbitron (display), Outfit (body), JetBrains Mono (mono) |

## Typography

| Role | Font | Usage |
|------|------|-------|
| Display | Orbitron 500–800 | HUD labels, section headers, KPI numbers, command bar title |
| Body | Outfit 400–700 | Copy, meta, form labels, card text |
| Mono | JetBrains Mono 400–700 | Logs, timestamps, diagnostics, `<kbd>` hints |

CSS variables: `--font-display`, `--font-body`, `--font-mono` in `tokens.css`.

## Color (60/30/10)

| Role | Token | Hex |
|------|-------|-----|
| Void (60%) | `--background` | `#0a0c14` |
| Surface (30%) | `--card`, `--secondary` | rgba glass panels |
| Accent (10%) | `--neon-cyan` | `#00f0ff` |
| Secondary accent | `--neon-magenta` | `#ff00aa` |
| Tertiary | `--neon-purple` | `#a020f0` |

Tier semantics: `--tier-distressed`, `--tier-well`, `--review`, `--tier-land`, `--tier-blurred`.

## Spacing

4px grid via `--space-xs` through `--space-3xl`. Radius: `--radius` 12px, `--radius-sm` 10px.

## Components (Phase 16 scope)

### cyber-dialog

Replaces `calm-dialog`. Used on all modals.

- Background: `rgba(10, 14, 26, 0.95)` + `backdrop-filter: blur(24px)`
- Border: `1px solid rgba(0, 240, 255, 0.25)`
- Corner accents via `panel-chrome` optional on wide dialogs
- Header: Orbitron 18px; close button mono border
- Variants: `.cyber-dialog-wide` (860px), default (720px tool / 1100px property)

### Motion (see 16-MOTION.md)

Decorative only on: ambient orbs, command title shimmer, card entrance (capped), scan progress sheen, status dot pulse. All gated by `prefers-reduced-motion: reduce`.

## Out of Phase 16

- Review mode full reskin (Phase 17)
- Inspector interior reskin (Phase 18)
- cmd-palette full reskin (Phase 19)