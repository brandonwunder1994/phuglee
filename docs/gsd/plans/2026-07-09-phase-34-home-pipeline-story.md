# Phase 34 — Home Same-Address Story (REVISED)

> **GSD:** `/gsd:execute-phase 34`

**Goal:** Homepage pipeline is **one story about one lead** transforming Collect → Filter → Analyze — not three peer product windows. Also rewrite weak hero tagline to proof-forward copy.

**Architecture:** Pipeline chapter in `index.html` only + CSS. Hero tagline string update. No backend.

---

## Quality bar

| Pass | Fail |
|------|------|
| Same sample address threads all 3 stages | Three unrelated mock windows |
| One bezel / film strip | Equal 3-card mockup grid |
| macOS dots gone | Traffic-light chrome |
| Hero tagline proof-forward | “#1 Distressed Lead Source…” |
| Continues duck-house film | Separate SaaS product section |

---

## Story spine (locked sample)

**Address:** `1842 W Culver St` (already used site-wide)

| Stage | Proof |
|-------|--------|
| Collect | Row appears as **Violation · Today · New** |
| Filter | Same address **✓ Owner match** / scrub context |
| Analyze | Same address **#01 · score 94 · dial ready** |

Optional: small distress photo stamp on Analyze stage (`home-hero-distressed.jpg`).

---

## Hero tagline (locked draft)

**From:** `The #1 Distressed Lead Source for Wholesalers`  
**To:** `Same-day clerk lists. Before aggregators dilute them.`

---

## Files
- `public/index.html`
- `public/css/home-ui-preview.css`
- `public/css/home-premium.css`
- `public/css/home-chronicle.css` / `home.css` as needed

---

## Tasks
- [ ] Rewrite pipeline markup as one `.home-story-strip` with shared address
- [ ] CSS: single bezel, stage dividers, no peer cards
- [ ] Update hero tagline
- [ ] Scroll QA with hero
- [ ] `npm test` + screenshots
- [ ] Commit: `feat(home): same-address pipeline story + proof tagline`

## Done when
Visitor can **follow one lead** through the product on the homepage.
