---
phase: 76-tokens-layer-audit
plan: 02
subsystem: ui
tags: [css, design-tokens, bridge, z-index, cache-bust, phuglee, status]

requires:
  - phase: 76-01
    provides: Layer 0 z-scale, desk density/chip/row, status surface tokens in tokens.css
provides:
  - bridge.css desk chrome consumes --status-*-fg, --z-*, glass/surface tokens
  - Cache-bust glass3 on shared trio + bridge.css?v=45
affects:
  - 77-shared-components-expansion
  - 78-cascade-hooks-state-css
  - 79-desk-core-restyle
  - 80-theater-gates-motion

tech-stack:
  added: []
  patterns:
    - "Status lines: var(--status-*-fg, var(--phuglee-success|danger)) — never pastel hex islands"
    - "Stacking: var(--z-*) only; native dialog backdrop omits ad-hoc 9999"
    - "Shared trio cache tag synchronized (glassN) across all HTML consumers"

key-files:
  created: []
  modified:
    - public/css/bridge.css
    - public/bridge.html
    - public/index.html
    - public/collect.html
    - public/command.html
    - public/heat.html
    - public/vault.html

key-decisions:
  - "Dialog backdrop z-index 9999 dropped — native top-layer dialogs stack correctly without it"
  - "City typeahead keeps opaque solids via --glass-bg-solid / --bg-elevated (not frosted glass menu)"
  - "Train deny / list danger hover also mapped to status-danger (clear danger chrome, not theater)"

patterns-established:
  - "Pattern: Desk status chrome → semantic tokens; theater climax colors deferred to 79–80"
  - "Pattern: Cache bust tokens trio glassN site-wide + page CSS ?v= on owner HTML only"

requirements-completed: [TOKENS-01, TOKENS-02, TOKENS-03, TOKENS-04]

duration: 12min
completed: 2026-07-11
---

# Phase 76 Plan 02: Bridge Token Wire & Cache Bust Summary

**Filter desk chrome status/z-index/city-search hex islands wired to Layer 0 tokens; shared CSS trio shipped as glass3 with bridge.css?v=45**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-11T20:06:26Z
- **Completed:** 2026-07-11T20:18:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced outcome/save/attach/train/paste status success|error pastel hex with `--status-success-fg` / `--status-danger-fg` (fallback `--phuglee-success|danger`)
- Mapped `.bridge-main`, city typeahead, history dialog, and scanned toast stacking to `--z-main`, `--z-typeahead`, `--z-typeahead-menu`, `--z-dialog`, `--z-toast`
- Tokenized city search input/menu/options (opaque solids + cream text + row-hover); type hierarchy kept display/body/mono; eyebrow uses `--text-eyebrow`
- Cache-bust: tokens + distress-glass + phuglee-components `glass2→glass3` on all six consumers; `bridge.css?v=45` on bridge.html; `verify-live.ps1` exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace desk-chrome hex islands + wire z-index + type token hygiene** - `d7d6d4d` (feat)
2. **Task 2: Cache-bust ?v= for tokens trio + bridge.css** - `5adc3a7` (chore)

**Plan metadata:** `946a68c` (docs: complete plan)

## Files Created/Modified
- `public/css/bridge.css` — status tokens, z-scale, city search token solids, type hygiene
- `public/bridge.html` — glass3 trio + bridge.css?v=45
- `public/index.html`, `collect.html`, `command.html`, `heat.html`, `vault.html` — glass3 trio

## Decisions Made
- Dropped `::backdrop { z-index: 9999 }` with comment pointing at native top-layer — avoids inventing `--z-dialog-backdrop` this phase
- Prefer solid tokenized menu (`--bg-elevated` / `--glass-bg-solid`) over glass fill so typeahead options stay readable
- Extended danger tokens to train-deny and list danger hover (same hex family as status lines; not theater paint)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Tokenized train-deny + list danger hover**
- **Found during:** Task 1
- **Issue:** `#e8a0a0` / `#f0b8b8` remained on `.bridge-train-deny` and list danger hover — not in the required status-line table but same pastel danger island family
- **Fix:** Mapped to `var(--status-danger-fg, var(--phuglee-danger))`
- **Files modified:** `public/css/bridge.css`
- **Commit:** `d7d6d4d`

**2. [Rule 3 - Blocking] Server was down before verify-live**
- **Found during:** Task 2
- **Issue:** `verify-live.ps1` needed ensure/restart path
- **Fix:** Script auto-started headless; re-verified health=200 home=200
- **Files modified:** none (ops only)
- **Commit:** n/a

---

**Total deviations:** 2 auto-fixed (Rule 2 ×1, Rule 3 ×1)
**Impact on plan:** Small correctness extras only; no scope creep into theater paint or JS.

## Issues Encountered
None beyond transient local server down (auto-recovered by verify-live ensure).

## User Setup Required
None

## Known Stubs / Incomplete Items
None — plan scope complete. Full kill/Train/victory paint remains phases 79–80; cascade link-order flip remains Phase 78.

## Next Phase Readiness
- Phase 76 complete (01 + 02). Ready for Phase 77 shared components expansion consuming the same tokens.
- Hard-refresh (`Ctrl+Shift+R`) recommended after glass3 / bridge v=45.

## Self-Check: PASSED

- All 7 modified product files present
- Commits `d7d6d4d`, `5adc3a7` present on main
- `var(--z-toast|dialog|typeahead|main)` present in bridge.css
- bridge.html: `tokens.css?v=glass3`, `bridge.css?v=45`
