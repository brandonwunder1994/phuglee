# Pitfalls Research

**Domain:** Brownfield visual-only restyle of Filter desk (`/bridge`) — CSS/markup makeover matching login/home without functional change (v3.0)  
**Researched:** 2026-07-11  
**Confidence:** HIGH on selector/DOM contracts (current `bridge.html` + `bridge.js` + `bridge-train.js` + 45+ `tests/bridge*.test.js`); HIGH on CSS layering (3.3k-line `bridge.css` with v2.1 theater + v2.2 cinema strata); MEDIUM on exact phase IDs (roadmap not finalized)

> **Supersedes** the prior `.planning/research/PITFALLS.md` (v2.0 independence / list factory).  
> Functional traps from v1.6–v2.2 (brain apply, type column gate, already_imported default-off, Train admin gate, keep/kill engine) remain **active regression locks** — do not re-open them during a surface makeover. This file covers **visual-restyle-specific** failure modes only.

---

## Critical Pitfalls

### Pitfall 1: Renaming or Nesting Locked IDs / `data-action` Contracts

**What goes wrong:**
A “cleaner” markup pass renames `#bridge-process`, moves `#bridge-train-wrap` outside results, drops `data-action="approve"|"deny"|"download"|"rename"|"delete"|"flash-download"`, or changes `data-mode` / `name="bridge-upload-type"` values. JS boot fails silently (`getElementById` → null), Train clicks no-op, list bulk actions die, victory download does nothing, type chips stop binding. Suite still may pass if only string-presence tests remain green while live desk is dead.

**Why it happens:**
- `bridge.js` caches **~70+** elements by fixed `id` at load time (state/city, dossier, panels, process, train, lists, type-confirm dialog, victory strip).
- Delegation uses **exact** contracts: `[data-action]`, `button[data-action="approve"]`, `[data-mode]`, `[data-action="flash-download"]`, `data-format="csv"|"xlsx"`.
- Structure tests lock **order**: e.g. `#bridge-train-mission` must sit **inside** `#bridge-train-wrap` **before** toolbar (`bridge-train-theater.test.js` THTR-03).
- Cinema tests lock **banned copy** and required IDs (`bridge-desk-cinema.test.js`: victory strip, type chips, scrub stage, mission surface).

**How to avoid:**
- **ID freeze list:** treat every `id="bridge-*"` and every `data-action` / `data-mode` / `data-format` / `data-step` / `name="bridge-upload-type"` as API.
- Restyle via **class** and wrapper chrome only; never rename IDs for aesthetics.
- If a wrapper is needed for glass/layout, wrap **outside** the locked node — do not replace the node.
- Before merge: `rg 'id="bridge-' public/bridge.html` vs `getElementById('bridge-` in `public/js/bridge*.js` — zero orphans.

**Warning signs:**
- Console: null access / “Cannot set properties of null”.
- Process button never enables after file drop.
- Train Approve/Deny visible but no network / no card exit.
- Victory “Filter Data” click does nothing.
- Tests that `assert.match(html, /id="bridge-…"/)` still pass while manual desk fails (string present, tree wrong).

**Phase to address:**
**Phase 1 — Contract inventory & freeze** (before any visual token work). Emit locked ID/`data-*` checklist from HTML+JS+tests.

---

### Pitfall 2: Breaking `hidden` / `disabled` Semantics With CSS Display Hacks

**What goes wrong:**
Restyle uses `display: none` / `opacity: 0` / `visibility` / `pointer-events: none` on classes instead of (or in conflict with) the `hidden` attribute and `.disabled` property that JS toggles. Panels that should be invisible still take space or remain clickable; Process stays clickable when `disabled`; Train wrap “looks hidden” for non-admin but is still in tab order / exposed to assistive tech; type-confirm dialog backdrop styles fight `<dialog>`.

**Why it happens:**
- Core pattern is `setHidden(el, hidden)` → `el.hidden = …` (and some explicit `[hidden] { display: none }` rules).
- Process, paste convert, outcome save, attach, undo, save list all use **property** `disabled`, not a CSS-only “is-disabled” class.
- Theater/non-admin gate: `#bridge-train-wrap` starts with HTML `hidden`; non-admin `renderResults` forces `setHidden(trainWrap, true)`. CSS that forces `display:flex !important` on train chrome **overrides** the attribute.
- Toast/error already need `!important` on `[hidden]` in places (`.bridge-scanned-toast[hidden]`).

**How to avoid:**
- Never restyle visibility of workflow panels with class-only show/hide that bypasses `[hidden]`.
- If customizing hidden presentation, always pair: `.foo[hidden] { display: none !important; }` (or leave UA `[hidden]` alone).
- Disabled CTAs: style `button:disabled` / `:disabled` — do not invent `.is-disabled` without JS wiring.
- Do not set `pointer-events: none` on parents of live controls (dropzone, type chips, train actions).
- Manual gate: non-admin session → Train/Brain tabs and mission must not appear or receive focus.

**Warning signs:**
- Empty “ghost” panels after clear/reset.
- Process fires with no city/file (disabled style only).
- Non-admin sees Train mission copy or armory.
- Playwright/layout at 390px shows stacked invisible blocks eating scroll height.

**Phase to address:**
**Phase 2 — State matrix CSS** (after contract freeze): document every JS-toggled state (`hidden`, `disabled`, `is-theater`, `is-active`, `is-pending`, `has-file`, `is-dragover`, `is-open`, `is-success`/`is-error`) and restyle those states only.

---

### Pitfall 3: CSS Stratigraphy — Milestone Layers Fight the New System

**What goes wrong:**
v3.0 dumps a new “home/login parity” layer on top of ~3.3k lines of `bridge.css` that already encode v2.1 theater (THTR), scrub feed (FEED), kill report (KILL), shift flash (SHIFT), and v2.2 cinema (desk stage, type chips, victory strip, mission surface). Result: double borders, wrong z-index (city typeahead under selects, dialogs under nav), glass cards that clip dropdowns, `!important` arms race, and “works on idle hero / broken on results theater.”

**Why it happens:**
- File is **chronologically layered**, not componentized: comments still say Phase 69–73, DESK/FEED/KILL/THTR.
- Existing `!important` already fights shared systems: dropzone borders, reduced-motion kill, toast hide, city-search `z-index: 40 !important` vs `.phuglee-panel > * { z-index: 1 }`, overflow:visible exception on `.bridge-panel--desk`.
- Load order: `tokens` → glass → heat → premium → shell → **bridge.css** → **phuglee-components** → **phuglee-a11y**. Components loaded *after* bridge can override; a11y must win on focus/motion.
- Shared `phuglee-panel` uses `overflow: hidden` — desk typeahead and dropdowns required local exceptions (already fragile).

**How to avoid:**
- **Do not append a 4th milestone block** at the bottom that redefines everything. Prefer:
  1. Extract shared tokens/components into design-system files (tokens + `phuglee-*`), then
  2. Thin `bridge.css` to layout/composition only, preserving state selectors.
- Map z-index scale once (bg → main → sticky HUD → typeahead → dialog → toast) before restyle.
- Ban new `!important` except reduced-motion kill-switches and known clip fights (document each).
- Restyle one **surface cluster** at a time (idle desk → upload → loading/feed → results/kill → train theater → lists/shift) with visual QA after each.

**Warning signs:**
- City search results appear under state/city row.
- Dialog open but unclickable (under shell nav / heat field).
- Glass panel clips date chips or typeahead.
- Same button looks different in hero vs results vs train card.
- Cache: `bridge.css?v=44` — bump version or hard-refresh fails make “CSS not applied” look like bugs.

**Phase to address:**
**Phase 3 — Design system extraction + z-index/token audit** before full component pass.

---

### Pitfall 4: Selector Surgery That Unlocks Admin / Train / Type-Confirm Gates

**What goes wrong:**
Markup “simplification” moves `#bridge-train-mission` outside `#bridge-train-wrap`, removes default `hidden` on train wrap, restyles mode tabs so non-admin chrome is visible, or breaks type-column confirm `<dialog id="bridge-type-column-confirm-dialog">` structure/IDs. Product gates fail open or closed incorrectly; admin-only training becomes public; format-confirm never shows and process hangs; water path accidentally gated.

**Why it happens:**
- THTR-03 is **fail-closed by structure**: wrap `hidden` by default; mission only inside wrap; non-admin branch `setHidden(trainWrap, true)` + clears containers; `isBridgeAdmin()` gates clicks.
- Theater chrome is class-coupled: `wrap.classList.toggle('is-theater')` + `.bridge-results-mode--theater` on tab rail — CSS must target those, not invent parallel “admin skin.”
- Type confirm is a separate `<dialog>` with fixed control IDs (`…-ok`, `…-cancel`, `…-candidates`, `…-samples`). Visual dialog kits that replace `<dialog>` with a div modal break `.showModal()` / focus trap.
- Tests lock banned strings and admin copy paths; they do not fully simulate every CSS leak of admin UI.

**How to avoid:**
- Never restyle “Train looks better outside results” by relocating mission/toolbar.
- Keep `<dialog>` elements; skin `.bridge-history-dialog-card` / glass classes only.
- Admin visibility = JS `hidden` + session, not CSS `display` on role.
- After markup touch: run `bridge-train-theater.test.js` + manual admin vs non-admin smoke.

**Warning signs:**
- Non-admin sees “Train mission” / Rules armory / undo.
- Process stuck after upload with no confirm UI (dialog unstyled `display:none` from global reset).
- `is-theater` class present in DOM but no visual emphasis (selector drifted).

**Phase to address:**
**Phase 4 — Gate-sensitive surfaces** (Train theater, type confirm, history dialog) as a dedicated restyle slice with dual-role QA.

---

### Pitfall 5: Motion / Feed / Flash Restyle That Ignores `prefers-reduced-motion`

**What goes wrong:**
Home/login energy brings grain, glow, staggered reveals, feed enter animations, lists flash, toast in/out. Operators with reduced motion get nauseating scrub feed; tests fail FEED-02; or worse, motion-gated JS still *depends* on animationend and reduced-motion users never see feed completion / victory strip.

**Why it happens:**
- `bridge-scrub-feed.js` + CSS use `prefers-reduced-motion: reduce` (tests assert both JS gate and CSS `animation: none !important`).
- Multiple `@media (prefers-reduced-motion: reduce)` islands already exist (feed, train exit, inventory flash, date chips) — easy to add a new animation without a reduce twin.
- `phuglee-motion.js` / `data-phuglee-reveal` on main can reintroduce motion outside bridge.css.
- Flash download / lists flash use timed `hidden` + CSS classes (`.bridge-lists-flash`, `.bridge-flash-download`) locked by shift tests.

**How to avoid:**
- Every new `@keyframes` / transition > 150ms gets a reduce media query (or global reduce block).
- Feed and process climax: reduced-motion path must still populate final DOM (summary + remainder), not skip content.
- Prefer opacity/color transitions over large layout motion on tables and train cards.
- QA with OS “reduce motion” on + off at 390 and 1440.

**Warning signs:**
- FEED-02 test red after CSS rewrite.
- Feed empty under reduced motion while loading panel stuck `aria-busy`.
- Train cards stuck `.is-exiting` / `.is-pending` forever.

**Phase to address:**
**Phase 5 — Motion & process theater restyle** (loading feed, kill report climax, victory, lists flash).

---

### Pitfall 6: “Visual Only” Drift Into Behavior / Copy / DOM-Scrape Regressions

**What goes wrong:**
Makeover PR “just tweaks” button labels, removes banned cinema strings, changes type chip values, scrapes short labels from DOM, or “simplifies” process flow in JS. v2.2 banned copy reappears or required slogans vanish; short-label LBL locks break; 679-bar suite flakes; product behavior changes under a visual ticket.

**Why it happens:**
- Cinema tests **ban** strings (`Shift board`, `bridge-type-card`, etc.) and **require** others (`DELETE THE JUNK`, `Filter Data`, `Scrub next city`, chip labels).
- Train button **visible copy** may change but `data-action` must stay `approve`/`deny`.
- Historical footgun: short Train labels are display-only — never scrape DOM for match/export (LBL-02/03).
- Temptation to “fix” process disabled logic while restyling CTAs.

**How to avoid:**
- **Hard scope:** CSS + presentational class names + non-behavioral wrapper markup only. No `bridge.js` / engine / API changes unless a pure class-name mirror is required (prefer not).
- Copy changes require updating **both** HTML and string-locked tests in the same PR — treat as product change, not visual.
- Diff discipline: if `public/js/**` or `lib/**` appears in a visual PR, stop and split.

**Warning signs:**
- Diff includes `lib/bridge-engine` or process handlers.
- Button text changes without test updates → red suite.
- New “helper” that reads `textContent` from train cards for decisions.

**Phase to address:**
**Every phase** — enforce in PR checklist; full `npm test` + `scripts/verify-live.ps1` as permanent bar.

---

### Pitfall 7: Accessibility Regression (Focus, Contrast, Skip Link, Live Regions)

**What goes wrong:**
Glass/grain aesthetic drops contrast below usable on taupe-on-dark; focus rings removed as “ugly”; skip link lost; `aria-live` regions restyled to `display:none` when not hidden; custom controls (type chips, date chips, dropzone `role="button"`) lose `:focus-visible` affordances. Brand/a11y tests may still pass (string includes) while real keyboard ops fail.

**Why it happens:**
- Focus tokens live in `phuglee-a11y.css` (`--phuglee-focus-ring`, `:focus-visible`, reduced-motion) — easy to override with higher-specificity bridge rules.
- Many custom widgets: radio-styled type chips (`input:focus-visible + .bridge-type-chip-face`), date chips `aria-pressed`, dropzone tabindex, mode tabs `aria-selected`.
- Grain/photo overlays can sit above content if z-index wrong (clicks + focus illusion).
- Status nodes use `role="status"` + `hidden` toggles — opacity hacks break SR announcement.

**How to avoid:**
- Never remove `phuglee-a11y.css` or skip link from `bridge.html`.
- After glass restyle, keyboard-tab the full happy path: city search → type chip → dropzone → process → train approve → save → download.
- Contrast check cream/orange/taupe on glass fills (not just solid `#0D0D0D`).
- Keep live regions in DOM; toggle `hidden`, don’t `display:none` via unrelated class.

**Warning signs:**
- Focus outline missing on chips/tabs after click styling.
- Overlay intercepts clicks on dropzone.
- Screen reader silent on process errors / save status.

**Phase to address:**
**Phase 6 — A11y & responsive QA gate** (with layout Playwright 390/1440 if used).

---

## Technical Debt Patterns

Shortcuts that seem reasonable during a makeover but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Append “v3.0 block” at end of `bridge.css` with overrides | Fast visual win | 4th strata; specificity war; impossible deletes | Never for full makeover — extract system first |
| New `!important` to beat phuglee-panel | Fixes one clip | Cascades; reduced-motion and state rules lose | Only documented clip/z-index/reduced-motion cases |
| Rename classes to “design system” names mid-milestone | Cleaner naming | Breaks string-locked tests + JS classList toggles | Only with full renames in HTML+JS+tests same PR |
| Restyle by editing `bridge.js` class strings | Matches new BEM | Behavior PR disguised as visual; review noise | Avoid; keep JS class tokens stable |
| Copy-paste home/login CSS wholesale into bridge | Instant parity | Wrong selectors; double atmosphere; unused rules | Port **tokens + patterns**, not whole files |
| Skip cache-bust query (`?v=`) on CSS | Lazy | Operators see old desk; false “bug” reports | Never — bump `bridge.css?v=` / components on ship |
| Delete “legacy” KPI equal-grid CSS | Smaller file | Kill-report class toggles may share rules; surprise | Delete only with coverage + visual proof |

## Integration Gotchas

Internal “integrations” for this surface (not third-party SaaS).

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `phuglee-components.css` / tokens | Redefine buttons only in bridge; drift from home | Extend shared button/input/chip tokens; bridge = layout |
| `phuglee-a11y.css` | Override focus-ring to none for “clean look” | Keep focus tokens; style ring color to match brand |
| `premium-atmosphere` / heat / grain | Stack another full-page overlay | Reuse body classes already on `bridge-page`; don’t duplicate layers |
| `shell-nav.js` / settings menu | Higher z-index glass cards cover nav or vice versa | Respect shell z-scale; dialogs above content, below or coordinated with nav modals |
| Auth guard / session headers | Unauthenticated Playwright redirected home — “layout broken” | Layout QA must use authed session; don’t “fix” by removing guard |
| `verify-live.ps1` | Claim visual ship without health 200 | Always verify health + homepage after static edits |
| Cache (`bridge.css?v=44`, `bridge.js?v=64`) | Forget bump → stale CSS | Bump query on every shipped CSS/JS surface change |
| Train module split (`bridge-train.js` live path) | Restyle only bridge.js templates | Train cards render from **both** paths — skin both class names |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Heavy backdrop-filter + grain on large results tables | Scroll jank on 1k-row previews | Limit blur to chrome/panels; tables solid/simple | Mid-tier laptops during Train + table |
| Animating `filter`/`box-shadow` on every feed row | Loading panel stutter | Animate opacity/transform only; cap staged feed DOM | Process with large staged feed |
| Huge box-shadows on sticky inventory HUD | Composite layer thrash | Simpler borders; contain paint | Mobile 390 width |
| Loading multiple webfont weights already on page | FOIT/FOUT on title | Stick to existing Anton/Outfit/JetBrains set | Slow networks |
| Unbounded `transition: all` on panels | Unexpected layout animation | Transition specific properties | Any JS `hidden` toggle |

## Security Mistakes

Visual milestone is low-risk but still has domain-specific traps.

| Mistake | Risk | Prevention |
|---------|------|------------|
| CSS/JS that reveals admin Train for non-admin | Training surface / brain UI exposure | Keep fail-closed `hidden` + `isBridgeAdmin`; CSS never sole gate |
| “Preview” bypass of auth for easier screenshots | Unauthenticated desk on shared hosts | Use real session; don’t disable `auth-guard` |
| Inline styles from unsanitized list names in templates | XSS if templates regress | Don’t touch escaping in list/train render while restyling |
| Shipping debug outlines / admin-only badges in CSS content | Info leak in screenshots | No `content:` with env/user secrets |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Pretty idle, ugly/broken results & train | Trust dies mid-shift (high-stakes moment) | Prioritize process climax + train theater parity, not only hero |
| Glass low contrast on KPI / kill stats | Can’t read RAW→KILLED→KEPT | Cream numbers, stronger hierarchy; test on grain bg |
| Oversized mobile chrome | City search + process below fold | 390px Playwright; slim pipeline already intentional — don’t fatten |
| Removing ops slang for “polished” enterprise copy | Product voice + test locks break | Keep cinema slogans; polish chrome around them |
| Focus rings removed | Keyboard operators stranded | Brand-colored focus, never none |
| Dropzone looks disabled when enabled (or reverse) | Failed uploads / rage clicks | Clear `has-file` / `:disabled` / dragover states |

## "Looks Done But Isn't" Checklist

Things that appear complete after a visual pass but are missing critical verification.

- [ ] **ID contract:** Every `getElementById('bridge-*')` still resolves; no renamed/missing nodes
- [ ] **data-action contract:** approve/deny/download/rename/delete/select/flash-download still present and delegated
- [ ] **State matrix:** `hidden` / `disabled` / `is-theater` / `is-active` / `has-file` / `is-pending` still drive visibility correctly
- [ ] **Non-admin gate:** Train wrap + brain armory not visible or operable
- [ ] **Admin theater:** process with open groups → train mode + `is-theater` chrome + mission counts
- [ ] **Type confirm dialog:** still `<dialog>` with ok/cancel IDs; shows on format gate path
- [ ] **Reduced motion:** feed + train exit + flash still correct with OS reduce on
- [ ] **Focus path:** full keyboard happy path without mouse
- [ ] **Contrast:** kill report + chips + inputs readable on glass/grain
- [ ] **Z-index:** city typeahead above selects; dialogs usable; toast not under nav
- [ ] **Cache bust:** CSS/JS query params bumped
- [ ] **Suite bar:** full `npm test` (679 baseline) green
- [ ] **Live bar:** `scripts/verify-live.ps1` exit 0
- [ ] **Layout QA:** 390 and 1440 (Edge/Playwright if available) on idle, upload, results, train, lists
- [ ] **No engine drift:** diff excludes `lib/bridge-engine` and process/brain API behavior
- [ ] **String locks:** cinema required/banned copy still satisfied
- [ ] **phuglee-a11y + skip link** still wired on `bridge.html`

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Renamed IDs / broken data-action | HIGH | Revert markup to last green; re-apply classes only; re-run theater + cinema + list tests |
| CSS stratigraphy / z-index meltdown | MEDIUM | Delete v3 override block; restore desk overflow/z-index exceptions; reintroduce tokens surgically |
| Admin gate fail-open | HIGH | Immediate revert of train-wrap markup; confirm `hidden` default + non-admin tests; dual-role manual check |
| Reduced-motion feed stuck | MEDIUM | Restore FEED-02 CSS/JS gates; ensure final DOM paint without animationend |
| Specificity / !important war | MEDIUM | Freeze new !important; extract shared component layer; lower bridge specificity |
| Accidental JS behavior change | HIGH | Split PR; restore `bridge.js` from main; visual-only re-apply |
| Cache confusion | LOW | Bump `?v=`; hard refresh; verify Network panel shows new CSS |
| Suite red after class rename | LOW–MED | Align HTML+CSS+JS+tests in one commit or full revert of rename |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. (Phase names are recommendations for roadmap authors.)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Locked IDs / data-action breakage | **P1 Contract freeze & inventory** | Checklist from HTML↔JS; cinema/theater/list string tests |
| hidden/disabled CSS hacks | **P2 State-matrix styling rules** | Manual toggle matrix; non-admin session; disabled process |
| CSS stratigraphy / z-index | **P3 Design tokens + layer audit** | Typeahead/dialog/toast z-smoke; no new unscoped !important |
| Train / type-confirm gates | **P4 Gate-sensitive surfaces** | `bridge-train-theater` + dual-role QA + type-confirm path |
| Motion / reduced-motion | **P5 Process theater motion** | FEED-02; OS reduce on/off; train card exit |
| Behavior drift under “visual” | **All phases + PR policy** | Diff gate on `lib/` + process JS; full suite |
| A11y / contrast / focus | **P6 Visual QA gate** | Keyboard path; contrast spot-check; a11y CSS still linked |
| Cache / verify-live | **P6 ship checklist** | `verify-live.ps1`; query bump; hard-refresh note |

**Suggested phase ordering rationale:**
1. Freeze contracts first — without them every visual edit is roulette.
2. State matrix before pretty idle — pretty UI that can’t hide panels is worse than old UI.
3. Tokens/layers before full paint — prevents a fourth CSS archaeology layer.
4. Gate surfaces as their own slice — highest product risk in a “CSS-only” milestone.
5. Motion after structure — animations amplify broken DOM.
6. QA bar last but mandatory — 679 tests + verify-live + 390/1440.

## Sources

- Current surface: [`public/bridge.html`](../../public/bridge.html), [`public/css/bridge.css`](../../public/css/bridge.css) (~3349 lines; layered Phase 69–73 / DESK–THTR comments)
- JS contracts: [`public/js/bridge.js`](../../public/js/bridge.js) (`getElementById` boot list, `setHidden`, `is-theater`, list/train delegation), [`public/js/bridge-train.js`](../../public/js/bridge-train.js), [`public/js/bridge-scrub-feed.js`](../../public/js/bridge-scrub-feed.js)
- Test locks: `tests/bridge-desk-cinema.test.js`, `tests/bridge-train-theater.test.js`, `tests/bridge-scrub-feed.test.js` (FEED-02 reduced-motion), `tests/bridge-shift-staging.test.js` (flash CSS + data-action), `tests/bridge-city-dossier.test.js`, `tests/a11y-seo.test.js`, `tests/brand-audit.test.js`
- Product constraints: [`.planning/PROJECT.md`](../PROJECT.md) v3.0 (CSS/markup only; login/home north star; 679 suite; verify-live)
- Agent rules: [`AGENTS.md`](../../AGENTS.md) (no data wipe; verify-live after site edits)
- Prior theater design: `.planning/v2.1-FILTER-SCRUB-THEATER.md`, `.planning/v2.2-FILTER-DESK-CINEMA.md` (if present)
- Known fragile CSS: city-search `z-index: 40 !important` vs `phuglee-panel` overflow/stacking; multi `prefers-reduced-motion` islands; stylesheet order ends with `phuglee-a11y.css`

---
*Pitfalls research for: Filter desk visual-only makeover (v3.0)*  
*Researched: 2026-07-11*
