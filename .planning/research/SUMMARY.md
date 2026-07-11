# Project Research Summary

**Project:** Distress OS / Phuglee — v3.0 Filter Visual Makeover  
**Domain:** Brownfield CSS/markup-only design-system restyle of Filter ops desk (`/bridge`)  
**Researched:** 2026-07-11  
**Confidence:** HIGH

## Executive Summary

v3.0 is a **surface redesign, not a product rewrite**. Filter (`/bridge`) must catch up to the login/home “badass” look — glass, grain, cream Anton hierarchy, raised CTAs — while process, brain, keep/kill, lists, Train gates, and all `public/js/bridge*.js` behavior stay frozen. Experts ship this class of makeover with a design-system-first sequence: **tokens → shared primitives → page composition**, using one page (Filter) as the dense showcase before site-wide rollout.

**Recommended approach:** add **zero npm packages and zero CSS tooling**. Extend the existing vanilla cascade (`tokens.css` → `distress-glass.css` → `phuglee-components.css` → page CSS) with dual-class markup hooks (`bridge-*` structure + `phuglee-*` look). Promote reusable controls (buttons, inputs, chips, tables, empty/loading/error) into the shared system; keep desk cinema (kill report, scrub feed, Train theater, victory strip) in `bridge.css` as Filter-only layout. Bump manual `?v=` query params for cache bust — no bundler.

**Key risks:** (1) renaming locked IDs/`data-action` contracts that ~70+ JS boot lookups depend on; (2) CSS stratigraphy — dumping a 4th milestone layer on ~3.3k lines of layered `bridge.css`; (3) `hidden`/`disabled` semantics broken by display hacks that fail-open admin Train; (4) motion that ignores `prefers-reduced-motion` and sticks the scrub feed. Mitigate by freezing contracts first, styling only JS-toggled state classes, extracting shared look before full paint, and gating every ship with the 679-test suite + `verify-live.ps1` + 390/1440 layout QA.

## Key Findings

### Recommended Stack

**Add nothing.** Ship by extending the vanilla cascade already powering home, auth, and Filter. Full detail: [STACK.md](./STACK.md).

**Core technologies:**
- **Vanilla CSS3 + custom properties** — all visual system; no build step; edits go live via static serve
- **`tokens.css`** — single brand/glass/type/space source of truth; extend density tokens only when needed
- **`distress-glass.css` + `phuglee-components.css`** — elevation + shared controls; expand chips/tables/forms here
- **`bridge.css` (~85 KB)** — page layout + desk theater only; stop growing shared look rules here
- **Manual `?v=` cache bust** — CSS `max-age=86400`; HTML `no-store`; query string is the established bust mechanism
- **Anton / Outfit / JetBrains Mono** — already aligned with home; do not add typefaces
- **Playwright + Edge (existing)** — layout QA at 390 / 1440; not a stack addition

**Do not use:** React/Tailwind/Framer, Sass/PostCSS, parallel `filter-design-system.css`, content-hash bundler, second glass palette in `bridge.css`, any touch to `lib/bridge-engine/*` or brain/keep-kill JS.

### Expected Features

Full landscape: [FEATURES.md](./FEATURES.md). Sequence: TOKENS → PRIMITIVES → PATTERNS → PAGE WIRE → QA GATE.

**Must have (table stakes — P1):**
- **TOKENS** — Home/login-aligned glass, grain, type scale, shadows, semantic status colors; no local hex in `bridge.css`
- **BUTTONS** — Every actionable control on system primary/secondary/ghost/danger + full states
- **FORMS** — Search, select, text, chips, dropzone share system form language
- **CARDS** — Panels, drawers, dialogs share glass elevation (auth-modal energy, desk density)
- **DESK** — Full surface pass (hero, pipeline, scrub, dossier, import, mission/kill, train, table, lists, shift, victory, dialogs); no orphan chrome
- **STATES** — Empty / loading / error / success via shared patterns; scrub feed stays legible
- **QA** — Reduced-motion, 390 + 1440, permanent suite + verify-live; behavior freeze absolute

**Should have (differentiators — P2):**
- Elevation hierarchy map (primary scrub vs scrap drawer vs featured victory)
- Auth-tab energy on selected type chips (gold/orange gradient face)
- Contained CTA shimmer (capped for all-day desk use)
- Short component catalog note for later Collect/Hub reuse
- Screenshot parity matrix (login/home vs Filter pairs)

**Defer (P3 / later milestones):**
- Site-wide reskin (Collect, Command Hub, Analyze chrome)
- Storybook / visual CI beyond Playwright smoke
- React/Framer migration (explicit backlog)
- Multi-theme / light mode switcher

**Anti-features (never this milestone):** workflow/IA changes, Analyze re-coupling, excessive perpetual motion, wiping runtime data for screenshots, pixel-cloning auth modal density onto ops tables.

### Architecture Approach

Layered CSS cascade with frozen JS. Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md).

```
Layer 0  tokens.css              → brand/glass/type values
Layer 1  glass + phuglee-*       → shared elevation + controls
Layer 2  shell + premium-atm     → authenticated app chrome
Layer 3  bridge.html + bridge.css → Filter layout + theater only
```

**Major components:**
1. **`tokens.css`** — extend carefully (desk density, chip, row tokens if gaps proven)
2. **`phuglee-components.css`** — primary shared expansion (forms, chips, tables, polish buttons/panels)
3. **`bridge.css`** — restyle + dedupe glass; own desk grid, kill HUD, Train theater, feed
4. **`bridge.html`** — dual-class hooks only; **no id/role/`data-action` churn**
5. **`bridge*.js` + `lib/**`** — frozen; visual system never rewrites behavior

**Critical cascade fix:** today `bridge.css` loads *before* `phuglee-components.css` (inverted composition). Target: components → bridge → a11y last. Home/auth CSS stay **read-only north star** — port DNA via tokens/components, never `@import` home into Filter.

### Critical Pitfalls

Top failure modes from [PITFALLS.md](./PITFALLS.md):

1. **Locked ID / `data-action` breakage** — ~70+ `getElementById` boot caches; restyle via classes/wrappers only; never rename `bridge-*` IDs or `data-action`/`data-mode`/`data-format` values
2. **`hidden`/`disabled` CSS hacks** — never force `display:flex !important` on Train wrap; style `button:disabled` and `[hidden]`, not invented `.is-disabled` without JS
3. **CSS stratigraphy war** — do not append a 4th “v3.0 block” at end of 3.3k-line `bridge.css`; extract system first, thin bridge to layout, ban unscoped `!important`
4. **Admin / type-confirm gate fail-open** — keep Train mission inside wrap with default `hidden`; keep `<dialog>` elements; dual-role QA mandatory
5. **Reduced-motion / feed stuck** — every new keyframe gets a reduce twin; feed must populate final DOM without `animationend`; FEED-02 stays green
6. **“Visual only” drift** — if `public/js/**` or `lib/**` appears in a visual PR, stop and split; cinema string locks (required + banned copy) stay intact

## Implications for Roadmap

Based on combined stack + features + architecture + pitfalls, suggested phase structure:

### Phase 1: Contract Freeze & Surface Inventory
**Rationale:** Without a locked ID/`data-*` checklist, every visual edit is roulette against ~70 JS boot lookups and cinema/theater tests.  
**Delivers:** Frozen contract list (IDs, `data-action`, `data-mode`, structure order locks); surface inventory mapped to component targets; state matrix doc (`hidden`, `disabled`, `is-theater`, `has-file`, …).  
**Addresses:** QA readiness foundation; DESK inventory from FEATURES.  
**Avoids:** Pitfall 1 (renamed IDs), Pitfall 6 (behavior drift under “visual”).

### Phase 2: Tokens & Layer Audit
**Rationale:** Every later rule should read variables; changing tokens after component polish causes thrash. Map z-index once before paint.  
**Delivers:** Home/login vs Filter token gap audit; density/chip/row tokens only if missing; semantic status colors canonical; z-index scale (bg → main → sticky HUD → typeahead → dialog → toast).  
**Addresses:** TOKENS (P1).  
**Uses:** `tokens.css` extensions; shared `glassN` cache-bust convention.  
**Avoids:** Pitfall 3 (stratigraphy), second palette, hardcoded hex.

### Phase 3: Shared Components Expansion
**Rationale:** Filter must *consume* the system, not invent one-off CTAs that later get copy-pasted.  
**Delivers:** Home-grade `.phuglee-btn*` polish; expanded `.phuglee-input/select/textarea`; new `.phuglee-chip` (+ variants); optional `.phuglee-table`; empty/loading/error wired for desk use.  
**Addresses:** BUTTONS, FORMS (partial), CARDS (panel polish), STATES primitives.  
**Uses:** `phuglee-components.css` as sole shared expansion surface.  
**Avoids:** Parallel theme sheet; promoting kill-report theater into shared.

### Phase 4: Cascade Order, Markup Hooks & State CSS
**Rationale:** Wrong load order makes “why didn’t my override win?” dominate the milestone; state CSS before pretty idle prevents ghost panels.  
**Delivers:** Target load order (components → bridge → a11y); dual-class hooks on selects/inputs/buttons; state-matrix CSS rules that honor `[hidden]` and `:disabled`; city-search overflow/z-index exceptions preserved.  
**Addresses:** FORMS wire, BUTTONS wire start, CARDS overflow patterns.  
**Avoids:** Pitfall 2 (display hacks), cascade inversion regressions.

### Phase 5: Desk Core Restyle
**Rationale:** Operators live in city + dropzone + process; win parity on high-frequency chrome before theater polish.  
**Delivers:** Hero/type hierarchy, pipeline chips, scrub desk forms, dropzone states, Process CTA energy, panel glass dedupe, dossier/outcome scrap hierarchy — layout-preserving.  
**Addresses:** DESK core surfaces (hero, pipeline, scrub, dossier, import).  
**Avoids:** Structural HTML rewrite; equal-card marketing density on ops chrome.

### Phase 6: Theater, Gates & Motion
**Rationale:** Highest product risk in a “CSS-only” milestone lives in Train/type-confirm/admin; motion amplifies broken DOM — restyle after structure.  
**Delivers:** Kill report / mission board climax restyle; scrub feed readability; Train theater + armory modes; lists/shift HUD; victory strip; history + type-confirm dialogs (still `<dialog>`); reduced-motion twins for all new motion.  
**Addresses:** DESK theater surfaces, STATES feed, P2 elevation/chip energy if time.  
**Avoids:** Pitfalls 4–5 (gates + motion); demoting Save; reintroducing Analyze chrome.

### Phase 7: Visual QA Lock & Ship
**Rationale:** Full makeover claim fails without complete surface coverage + permanent bars.  
**Delivers:** 390 + 1440 layout QA (idle/upload/results/train/lists); keyboard happy path; contrast on glass/grain; full `npm test` (679+); `verify-live.ps1` exit 0; CSS `?v=` bumps; hard-refresh note.  
**Addresses:** QA (P1); optional P2 screenshot matrix + component catalog note.  
**Avoids:** Cache-stale false bugs; shipping without dual-role (admin/non-admin) smoke.

### Phase Ordering Rationale

- **Contracts before paint** — ID freeze prevents silent dead desk while suite string-matches still pass.
- **Tokens before components before page** — industry design-system sequence; prevents second rewrite when parity is measured.
- **Cascade/hooks before mass restyle** — inverted load order is a known as-built bug; fix once early.
- **Core desk before theater** — high-frequency operator path first; cinema is secondary surface.
- **Gate surfaces as dedicated slice** — Train/type-confirm are fail-closed product locks, not decoration.
- **Motion after structure; QA last** — animations amplify broken DOM; suite + verify-live are permanent freeze bars.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Shared components):** Medium — native `<select>` styling limits across Chromium/Edge; chip selected-state parity with `.auth-tab.is-active` needs careful token mapping
- **Phase 4 (Cascade flip):** Low research, **high care** — any bridge rule that accidentally depended on loading before components must become intentional dual-class override or deleted

Phases with standard patterns (skip research-phase):
- **Phase 1 (Contract freeze):** Inventory from HTML + JS + existing tests — mechanical
- **Phase 2 (Tokens):** Tokens already rich; mostly gap audit
- **Phase 5–6 (Desk + theater restyle):** Execution against known structure; v2.1–v2.2 layout constraints documented
- **Phase 7 (QA):** Existing Playwright widths + suite + verify-live patterns

## Watch Out For

Hard constraints for every phase (from pitfalls + product locks):

| Watch-out | Rule |
|-----------|------|
| **Function freeze** | CSS + presentational classes + non-behavioral wrappers only. No process/brain/API/keep-kill changes. |
| **ID / data-action API** | Every `id="bridge-*"` and `data-action`/`data-mode`/`data-format`/`data-step` is locked. Wrap outside, never replace. |
| **Admin fail-closed** | Non-admin must never see/operate Train mission or Rules armory. CSS is never the sole gate. |
| **Keep `<dialog>`** | Type-confirm and history stay native dialogs; skin cards only. |
| **No 4th CSS strata** | Extract to tokens/components; thin `bridge.css`; ban unscoped `!important`. |
| **Reduced-motion** | Every new animation gets a reduce path; feed must complete without `animationend`. |
| **Cache bust** | Bump shared `glassN` trio and/or `bridge.css?v=` on every visual ship. |
| **No data wipe** | Never clear `data/filter-lists/` or brain for screenshots (AGENTS.md). |
| **Permanent bars** | `npm test` green + `scripts/verify-live.ps1` exit 0 after site edits. |
| **Cinema copy locks** | Required slogans stay; banned strings stay banned; copy change = product change + tests. |
| **Desk density ≠ auth modal** | Same tokens/components; denser spacing — do not clone modal roominess onto tables. |
| **Filter-only application** | System designed for reuse; full wire this milestone is `/bridge` only. |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Repo ground truth: existing CSS files, `static-cache.js`, no CSS tooling in package.json; PROJECT.md freezes CSS/markup-only |
| Features | HIGH | Full surface inventory from `bridge.html` + prior v2.1–v2.2 theater; industry token→component sequence well established |
| Architecture | HIGH | As-built cascade verified; cascade inversion and dual-class patterns confirmed; MEDIUM only on exact token gaps until inventory pass |
| Pitfalls | HIGH | Selector/DOM contracts from bridge.js + 45+ bridge tests; layered CSS strata documented; phase mapping opinionated and actionable |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact token gaps:** Until Phase 2 surface inventory, proposed desk-density / chip / row token names are provisional — add only when first consumer needs them
- **Cascade flip regressions:** Phase 4 needs a deliberate pass for any bridge rule that depended on loading before components (equal-specificity fights)
- **Native select polish limits:** Phase 3 may need browser-specific form styling research for full home parity on `<select>`
- **Elevation map (P2):** Primary vs scrap vs featured roles not yet formalized — define during Phase 5–6 if time, else immediate follow-on
- **Component catalog location:** Whether short reuse guide lives in `.planning/` vs `docs/design/` — decide at P2 ship, not a blocker

## Sources

### Primary (HIGH confidence)
- Repo CSS cascade — `public/css/tokens.css`, `distress-glass.css`, `phuglee-components.css`, `auth.css`, `bridge.css` (~85 KB / ~3.3k lines), `bridge.html` link order
- JS contracts — `public/js/bridge.js` (~70+ id boots), `bridge-train.js`, `bridge-scrub-feed.js`
- Test locks — `tests/bridge-desk-cinema.test.js`, `bridge-train-theater.test.js`, `bridge-scrub-feed.test.js` (FEED-02), `bridge-shift-staging.test.js`, a11y/brand audits
- `lib/static-cache.js` — CSS `max-age=86400`, HTML `no-store`
- `.planning/PROJECT.md` — v3.0 decisions (CSS/markup only; home/login north star; Filter showcase; 679 suite)
- `AGENTS.md` — no data wipe; verify-live after site edits
- Prior milestones — v1.3 brand tokens; v2.1 scrub theater; v2.2 desk cinema layout DNA

### Secondary (MEDIUM confidence)
- NN/g Design Systems 101 — tokens → components → patterns; adopt/adapt/create
- Industry brownfield vanilla redesign practice (2025–2026) — prefer tokens + classes over introducing a build for a single-page reskin
- Auth-tab energy → type chip selected state mapping (pattern transfer; exact tokens TBD in Phase 3)

### Research files synthesized
- [STACK.md](./STACK.md) — CSS-only stack, cache-bust protocol, what not to use
- [FEATURES.md](./FEATURES.md) — table stakes, differentiators, anti-features, REQ-ID skeleton
- [ARCHITECTURE.md](./ARCHITECTURE.md) — layer model, cascade fix, promote-vs-isolate, phase build order
- [PITFALLS.md](./PITFALLS.md) — contract/state/stratigraphy/gate/motion/a11y traps + recovery

---
*Research completed: 2026-07-11*  
*Ready for roadmap: yes*
