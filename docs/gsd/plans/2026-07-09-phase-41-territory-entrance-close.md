# Phase 41 — Entrance Cascade + Fused Close

> **GSD:** `/gsd:execute-phase 41`  
> **Milestone:** [M6 Territory Theater](../milestones/M6-territory-theater.md)  
> **Depends on:** Phases 37–40 complete (section is fully dressed)

**Goal:** Territory becomes the homepage **peak-end**: states cascade from cold steel into heat on scroll-in, and **Enter the Platform** is fused to the map proof so the page never dies in a lonely CTA void.

**Architecture:** CSS/JS entrance on the territory section (IntersectionObserver already used for map init — extend carefully). Restructure close markup so proof line + primary CTA sit **inside or immediately tight under** the territory stage, visually one climax. Preserve `#btn-heat-footer` behavior (platform entry).

**Tech stack:** CSS keyframes / transitions, existing observer patterns, `home-coverage.js` close proof text.

---

## Quality bar

| Pass | Fail |
|------|------|
| First scroll-into-view feels cinematic (or instant if reduced-motion) | Hard cut, no intentional entrance |
| Cascade / wash uses heat colors from phase 37 | Green flash or rainbow junk |
| Close CTA visually part of territory climax | Lonely button in empty black below |
| Live counts still drive proof copy | Stale “Territory live…” only |
| Auth/platform entry still works via `#btn-heat-footer` | Broken enter flow |
| No layout jump that covers map mid-interaction | Cascades re-fire every scroll bounce |

---

## Part A — Entrance cascade

### Desired beat (full motion)

1. Section enters viewport (existing ~160px rootMargin OK).
2. Map container already loading or ready.
3. Once map is **ready** (`is-live` or layers mounted):  
   - Option **preferred (CSS-friendly):** overlay mask / opacity wash on a decorative layer, **or**  
   - Option **MapLibre:** briefly set all covered fills to steel then transition paint to heat (harder; only if CSS overlay insufficient).
4. HUD stats count-up optional (nice-to-have): animate from 0 → N once; skip if reduced-motion.
5. Ticker starts after cascade (~300–600ms delay) if marquee exists.
6. **Fire once** per page load (`data-territory-entered="1"` on section).

### Reduced motion

```text
Skip cascade, count-up, and delayed ticker start.
Show final heat state immediately when map ready.
```

### Implementation recommendation (lowest risk)

Do **not** thrash MapLibre paint properties on every frame.

Use a **CSS veil** over the map:

```html
<div class="home-territory-cascade" aria-hidden="true"></div>
```

```css
.home-territory-cascade {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, #080c14 78%);
  opacity: 1;
  transition: opacity 1.1s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 2;
}
.home-territory-monitor.is-live.is-entered .home-territory-cascade {
  opacity: 0;
}
```

Plus optional soft gold bloom fade-in on `.home-territory-screen::before` (phase 38 glow).

If you want state-level cascade without MapLibre thrash: SVG fallback path can stagger `opacity` on `.home-map-state` groups — **only SVG**. MapLibre path uses veil.

**Observer:** extend explorer or `home-below.js` to add `is-entered` when section ≥15% visible **and** map live — avoid adding second IntersectionObserver if one can gain a second callback.

---

## Part B — Fused close

### Current (problem)

```text
[ territory section ]
[ close section: proof + Enter button ]  ← feels detached
[ footer ]
```

### Target

```text
[ territory section
    map + HUD + ticker + dock
    ┌─ territory close band ─────────────────┐
    │  560 cities across 10 states.          │
    │  Same-day lists.                       │
    │  [ Enter the Platform ]                │
    └────────────────────────────────────────┘
]
[ footer ]
```

**Markup options (pick one):**

**A (preferred):** Move close content **into** `.home-chapter--territory` as `.home-territory-close` footer of the chapter; remove empty `home-chapter--close` or leave it empty and hidden.

**B:** Keep separate section but pull it up with negative margin / shared background so it reads as one unit.

Prefer **A** for DOM honesty.

**Preserve IDs:**

- `#home-close-proof` — still updated by `updateCoverageStats`
- `#btn-heat-footer` — still wired by auth/home-below

**Proof copy** (already partially dynamic):

```text
{N} cities across {S} states. Same-day lists.
```

Optional second line (static grit): `Lists while they're still premium.` — only if it doesn’t fight the dynamic line. Prefer **one strong line**.

**CTA:** existing primary button classes `phuglee-btn phuglee-btn-primary`. Full width on mobile; centered max-width on desktop.

---

## Files

| Action | Path |
|--------|------|
| Modify | `public/index.html` — cascade layer; relocate close into territory |
| Modify | `public/css/home.css` / `home-chronicle.css` / `home-premium.css` |
| Modify | `public/js/home-coverage-explorer.js` — `is-entered` once map live |
| Modify | `public/js/home-coverage.js` — proof text if copy changes |
| Check | `public/js/home-below.js` / `auth.js` — footer button still found |

---

## Tasks

### Task 1: Fuse close markup

- [ ] Move proof + CTA into territory chapter as `.home-territory-close`
- [ ] Remove orphan empty close chapter or keep for a11y landings — prefer single section `aria-labelledby` still valid
- [ ] Confirm `#btn-heat-footer` click still enters platform (manual + existing tests if any)

### Task 2: Close band CSS

- [ ] Tight padding under dock; shared monitor/atmosphere continuity
- [ ] Proof line: display font or strong cream; CTA fire
- [ ] No giant empty void between map and button
- [ ] Mobile spacing: thumb-friendly CTA

### Task 3: Entrance cascade

- [ ] Add cascade veil element
- [ ] Add `is-entered` once on first eligible intersection + live map
- [ ] Reduced-motion: set `is-entered` immediately on live
- [ ] Ensure cascade doesn’t block clicks (`pointer-events: none`)
- [ ] Do not re-trigger on scroll up/down

### Task 4: Full-page film QA

- [ ] Scroll hero → thesis → pipeline → territory → enter
- [ ] Peak-end: territory should feel like the emotional high point before footer
- [ ] Screenshot desktop + mobile close band
- [ ] `npm test` + verify-live

### Task 5: Milestone wrap

- [ ] Commit:

```text
feat(home): territory entrance cascade and fused platform close
```

- [ ] Mark phases 37–41 complete in M6 milestone doc
- [ ] Update `docs/gsd/README.md` M6 status when all done
- [ ] Optional: note M6 complete in STATE/ROADMAP if project tracks there

---

## Done when

Territory is the **climax of the homepage film**: heat, HUD, life, interaction, and a single earned door into the platform.

## Out of scope

New marketing pages, pricing, vault, forge map redesign, autoplay video.

## M6 complete definition

All of:

1. No green SaaS choropleth  
2. War-room HUD counts  
3. Real-data ticker  
4. State spotlight dossier  
5. Entrance + fused close  
6. Tests + live verify green  
7. Full-page scroll feels one brand world  
