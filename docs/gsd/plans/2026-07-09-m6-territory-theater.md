# M6 — Territory Theater (milestone init)

> **GSD:** Execute phases **37 → 41** in order. Plans are written; do not re-plan unless scope changes.

**Goal:** Homepage Live coverage becomes a war-room territory proof matching the rest of the front page.

**Architecture:** Layered upgrades on existing MapLibre explorer + SVG fallback. No new map stack. Each phase ships independently and is screenshot-verifiable.

**Tech:** Vanilla HTML/CSS/JS, MapLibre (existing), coverage API + bootstrap JSON.

---

## Why five phases (not one mega-PR)

| Reason | Detail |
|--------|--------|
| **Visual compounding** | Palette must land before HUD/ticker or they fight green fills |
| **Risk isolation** | MapLibre paint bugs stay in 37; motion bugs in 39/41; dock UX in 40 |
| **Reviewable diffs** | Each phase is a clear “before/after” on the same section |
| **Rollback** | Can ship 37–38 alone if later phases need another pass |
| **QA focus** | Verify one quality bar at a time |

## Phase dependency graph

```text
37 Heat palette ──► 38 War-room HUD ──► 39 Live ticker
                           │                  │
                           └──────► 40 Spotlight
                                        │
                           37–40 ──────► 41 Entrance + fused close
```

- **37** has no code dependency on later phases (foundation).
- **38** restructures markup chips → HUD (39/40/41 hang off that structure).
- **39** needs HUD shell (or at least a stable stage region) for ticker placement.
- **40** reworks dock; should not race 39 on the same DOM if avoidable — after 39 is fine.
- **41** composes everything; must run last.

## File ownership (avoid thrash)

| Phase | Primary files |
|-------|----------------|
| 37 | `tokens.css`, `home-coverage.js`, `home-coverage-explorer.js`, legend CSS |
| 38 | `index.html` territory header/stage, `home.css`, `home-premium.css` |
| 39 | `index.html` ticker region, new CSS block, explorer/shared JS for feed rows |
| 40 | dock CSS/HTML, explorer select/render, optional spotlight panel markup |
| 41 | motion CSS/JS, close section markup merge, `home-coverage.js` close proof |

## Global verification (every phase)

```powershell
cd C:\Users\brand\Projects\distress-os
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Manual: http://127.0.0.1:3000/ — scroll to Live coverage
```

Screenshot targets per phase: map colors, HUD, ticker, spotlight open, fused close.

## Done when (milestone)

All five phase plans checked complete; M6 status → `complete`; homepage peak-end is territory theater.
