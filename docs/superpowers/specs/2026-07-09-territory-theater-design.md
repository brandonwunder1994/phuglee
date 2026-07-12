# Design Spec — Territory Theater (Live Coverage Upgrade)

**Date:** 2026-07-09  
**Product:** Phuglee Distress OS  
**Surface:** Homepage Live Coverage (`index.html` → `.home-chapter--territory`)  
**Milestone:** M6 / v1.5  
**Depends on:** M5 Phase 36 (map reliability + live close counts — complete)

---

## Problem

After M5, the rest of the homepage is gritty, cinematic, and product-proof. The **Live coverage** section still reads as a **generic dark SaaS choropleth**:

- Covered states paint **dashboard green** (`#2a8f5c` → `#45c47e`) against an amber brand world
- City/state proof lives in **tiny chips**; hierarchy is flat
- Nothing *moves* — signal feed feels alive; territory feels dead
- Explorer dock defaults to a **utility search bar**, not storytelling
- Close CTA sits **below** as a separate lonely beat instead of climaxing on the map

## Design principle

**Territory is the peak-end proof.**  
If the duck hero is the promise and the pipeline story is the method, Live coverage is the **receipt**: *we actually own this geography, right now.*

Emotional register: **after-hours war room watching a live ops board** — not “embedded MapLibre widget.”

## The five phases (execute in order)

| Phase | Codename | What ships | Why this order |
|-------|----------|------------|----------------|
| **37** | Heat palette | Brand-colored choropleth + legend | Visual foundation; every later phase inherits colors |
| **38** | War-room HUD | Large counts, glass HUD chrome, atmospheric map stage | Presence before content theater |
| **39** | Live ticker | Real-coverage city/state pulse feed | Energy + “live” claim earned |
| **40** | State spotlight | Dossier card on select; demote dock utility | Interaction = story, not admin |
| **41** | Entrance + fused close | Scroll cascade + map-as-closer | Peak-end; ships last so it composes all prior layers |

## Locked design tokens (map status)

Do **not** invent one-off hexes in JS. Add CSS custom properties (and mirror in MapLibre/SVG JS constants).

| Role | Token (proposed) | Value | Meaning |
|------|------------------|-------|---------|
| Covered low | `--territory-heat-low` | `#8a4a18` | Thin coverage (ember dark) |
| Covered mid | `--territory-heat-mid` | `#e58435` | Solid coverage (phuglee orange) |
| Covered high | `--territory-heat-high` | `#eeb746` | Dense coverage (phuglee gold) |
| Glow tip | `--territory-heat-glow` | `rgba(238, 183, 70, 0.35)` | Ambient bloom under land |
| Soon / no data | `--territory-soon` | `#3a4658` | Cold steel (keep) |
| Blocked | `--territory-blocked` | `#8f2a2a` | Blood base (keep) |
| Blocked accent | `--territory-blocked-accent` | `#c84848` | Hatch lines (keep) |
| HUD ink | cream / gold existing tokens | — | Type only |

Legend copy (locked short labels):

- **Live** — heat ramp  
- **Soon** — steel  
- **Blocked** — blood  

## Anti-slop checklist (every phase)

- [ ] No generic SaaS green on covered states
- [ ] No equal 3-card grid next to the map
- [ ] No macOS traffic-light chrome on territory
- [ ] No fake city names in the ticker (real coverage data only)
- [ ] `prefers-reduced-motion: reduce` kills cascade / scan / ticker marquee
- [ ] Map still loads (ready / branded error / retry) — Phase 36 reliability preserved
- [ ] Feels same grit world as duck hero (screenshot QA)
- [ ] Mobile: no horizontal overflow; search + CTA ≥ 44px touch targets
- [ ] Stack stays vanilla HTML/CSS/JS — no new map framework

## Shared files (touch map)

| File | Role |
|------|------|
| `public/index.html` | Territory markup (HUD, ticker, spotlight, fused close) |
| `public/css/tokens.css` | Territory heat tokens |
| `public/css/home.css` | Territory layout, HUD, legend, chips → HUD |
| `public/css/home-premium.css` | Live scan / premium overlays |
| `public/css/home-chronicle.css` | Full-bleed chapter spacing |
| `public/css/coverage/coverage-dock.css` | Dock / spotlight presentation |
| `public/js/home-coverage.js` | SVG fallback colors + stats + close proof |
| `public/js/home-coverage-explorer.js` | MapLibre fills, dock, select/hover |
| `public/js/coverage/coverage-shared.js` | Shared fetch/helpers if extracted |
| `public/js/home-below.js` | Below-fold helpers (chips/close if any) |

## Success criteria (milestone)

1. Covered states read as **Phuglee heat**, not green SaaS
2. Section hierarchy: **big counts + map theater** dominate
3. Something **moves** with real data (ticker or entrance cascade)
4. State select yields a **dossier-style spotlight**, not only a search list
5. Close CTA is **visually fused** to territory proof (not a void under the map)
6. Full homepage scroll QA: hero → thesis → pipeline → territory → enter feels one film
7. `npm test` green; `scripts/verify-live.ps1` exit 0 after public edits

## Out of scope

- Full Form Forge `/forge/map` redesign
- New map engine / WebGL particles
- Fake “live” metrics not backed by coverage API/bootstrap
- Auth, pricing, vault, analyzer engine

## Approval

User approved all five upgrades (2026-07-09). Plans first; execute 37 → 41 one phase at a time after plan review.
