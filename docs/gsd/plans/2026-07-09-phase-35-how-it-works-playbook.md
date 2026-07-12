# Phase 35 — How It Works Slim Playbook (REVISED)

> **GSD:** `/gsd:execute-phase 35`

**Goal:** `/heat` is a **slim playbook** (about one focused scroll), not a second marketing landing. Kill wireframes. Real frames. Cut essay bloat. Home owns the long story (Phase 34).

**Architecture:** `heat.html` + `hub.css`. Reuse story/preview patterns from Phase 34 (link CSS if needed).

---

## Quality bar

| Pass | Fail |
|------|------|
| No wireframe bars | `.hub-mockup-*` remains |
| ≤ ~1–1.5 viewport of core story before steps | Full second homepage |
| Real UI frames (same-address if possible) | Empty glass vs cards only |
| Each step one CTA | Long walls of prose without action |
| Complements home | Duplicates home edge + pipeline verbatim |

---

## Structure (slim)

1. **Hero** — keep strong title; short lead  
2. **Edge proof** — asymmetric Today vs Weeks (same address as home)  
3. **Three real frames** — Collect / Filter / Analyze (no wireframes)  
4. **Playbook steps** — keep 3 steps but **cut** each body to ~2 short paragraphs max; keep CTAs + filter tips box  
5. **Hotspot signals** — keep compact list  

Delete: decorative pipeline 01/02/03 rail if redundant with frames.

---

## Files
- `public/heat.html`
- `public/css/hub.css`
- `public/css/distress-heat-v2.css`
- optionally link `home-ui-preview.css`

---

## Tasks
- [ ] Delete wireframes
- [ ] Slim + restructure HTML
- [ ] Gritty CSS; real frames
- [ ] CTA links work
- [ ] `npm test` + screenshots
- [ ] Commit: `feat(heat): slim gritty playbook replaces wireframe landing`

## Done when
How It Works is a **training reel**, not a redundant brochure.
