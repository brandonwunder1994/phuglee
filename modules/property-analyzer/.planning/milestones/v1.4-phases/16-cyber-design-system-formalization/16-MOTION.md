# Phase 16 — Motion Contract

**Milestone:** v1.4 Cyber Premium Interface  
**Date:** 2026-06-30

## Rules

1. **Functional motion** (progress bar width, modal open/close, scroll) — always allowed.
2. **Decorative motion** — listed below; disabled when `prefers-reduced-motion: reduce`.
3. **Card stagger** — capped in Phase 20 perf work; entrance animation on first paint only.

## Decorative animations

| Name | File | Target | Duration | Reduced motion |
|------|------|--------|----------|----------------|
| `orb-drift` | cyber-ultra.css | `.ambient-orb` | 18s alternate | yes — `animation: none` |
| `title-shimmer` | cyber-ultra.css | `.command-title` | 6s linear | yes |
| `cyber-pulse` | cyber-theme.css | `.command-status-dot` | 2s ease-in-out | yes |
| `cyber-btn-pulse` | cyber-theme.css | `.btn-primary.command-btn` | 3s ease-in-out | yes |
| `cyber-sheen` | cyber-theme.css | `.progress-bar::after` | 2s ease-in-out | yes |
| `cyber-card-in` | cyber-ultra.css | `.prop-card.card-cyber` | 0.5s cubic-bezier | yes |

## Gating locations

- `cyber-theme.css` — `@media (prefers-reduced-motion: reduce)` disables pulse, btn-pulse, sheen
- `cyber-ultra.css` — same media query disables orbs, title-shimmer, card-in

## Phase 17+ additions

| Phase 17 review | cyber-review.css | hover box-shadows only | yes — gated in cyber-review.css |

New animations added in later phases MUST document here and include reduced-motion gate.