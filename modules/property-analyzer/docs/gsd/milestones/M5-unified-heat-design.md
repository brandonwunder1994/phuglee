# M5 — Unified Heat Design (Distress OS v1.1)

> **Status:** `in_progress`  
> **Created:** 2026-07-06  
> **Parent milestone:** `distress-os` M2 / v1.1  
> **Supersedes:** v1.8 Aerial Command visual direction (functionality retained)

---

## Goal

Replace Property Analyzer's Aerial Command skin (Fraunces, amber `#e8a838`) with Command Hub Heat (Anton, ember `#e85d04`). Adopt global Distress OS navigation.

## What changes vs v1.8 Aerial Command

| Aspect | v1.8 (retired visually) | v1.1 Heat (new) |
|--------|-------------------------|-----------------|
| Display font | Fraunces (editorial serif) | Anton (bold uppercase) |
| Body font | DM Sans | Outfit |
| Primary accent | Amber `#e8a838` | Ember `#e85d04` |
| Background | Blue-gray `#0c0e12` | Warm brown `#080605` |
| Theme class | `aerial-theme` | `heat-theme` |
| CSS layer | `premium-aerial.css` | `heat-theme.css` |

**Unchanged:** Scan logic, tier engine, review shortcuts, export, 190+ tests.

## Analyzer phases (in parent roadmap)

| Phase | Name | Status |
|-------|------|--------|
| 11 | Tokens & Theme Layer | pending |
| 12 | All Surfaces | pending |

## Surfaces (22)

Sidebar, command bar, KPIs, property cards, scan progress, review overlay, modals, settings, ⌘K, table view, landing page.

## Verification

```bash
npm test
```

## Next step

Wait for distress-os Phase 8 (global nav), then `/gsd:plan-phase 11` in parent project