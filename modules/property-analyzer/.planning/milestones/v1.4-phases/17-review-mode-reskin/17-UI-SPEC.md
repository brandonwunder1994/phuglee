---
phase: 17
slug: review-mode-reskin
status: approved
created: 2026-06-30
---

# Phase 17 — Review Mode UI Contract

Full-screen cyber HUD for tier review. Keys 1–5 unchanged.

## Surfaces

| Element | Treatment |
|---------|-----------|
| Overlay | Void + 32px cyan grid + radial glows |
| Header | Sticky HUD strip, panel-chrome corners, Orbitron badge |
| Image stage | Neon corner brackets (::before/::after), mono labels |
| Meta panel | Glass card, Orbitron name |
| Shortcuts | Cyan mono kbd chips, tier-colored variants |
| Action bar | Floating sticky dock, tier neon hover glows |
| Complete panel | Cyber dialog style, cyan headline |
| Tier-pick | cyber-dialog + glowing tier buttons |

## File

`public/css/cyber-review.css` — all rules scoped `body.cyber-theme`