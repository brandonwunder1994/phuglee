# Feature Research

**Domain:** Full visual makeover / design-system-first page upgrade for Filter ops desk (`/bridge`)
**Researched:** 2026-07-11
**Confidence:** HIGH (codebase inventory of home/login + Filter surfaces + prior Phuglee brand system); MEDIUM (industry design-system adoption patterns)

## Context (locked behavior — visual only)

v3.0 is a **surface redesign**, not a product rewrite. Existing Filter functions stay frozen:

| Surface (already built) | Role | Visual dependency |
|-------------------------|------|-------------------|
| City select + quick search + dossier | Intake location | Forms, cards, empty states |
| Type chips (code / water) | List type | Chips / radio-face components |
| File dropzone + paste path | Upload | Dropzone, inputs, CTAs |
| Process scrub + loading feed | Climax action | Loading, feed, primary CTA |
| Kill report / KPI mission board | Results climax | Cards, stats, victory energy |
| Kept table + filters + pagination | Data review | Tables, forms, secondary chrome |
| Save list / download / inventory | Staging | Forms, buttons, lists panel |
| Train theater + Rules armory | Admin learning | Tabs, groups, buttons, status |
| Shift queue / inventory HUD | Session HUD | Chips, sticky chrome |
| Victory strip | Post-stage celebration | Banner + CTA pair |
| History / type-column confirm dialogs | Gates | Modals, forms, buttons |
| Empty / loading / error / status lines | Feedback | Shared state components |

**North star:** login modal (`auth.css`) + home premium (`home-premium.css` + glass/grain/Anton/Outfit) — not a new aesthetic.

**Shared system intent:** extract/normalize tokens + components so later pages (Collect, Hub, Analyze shell) can adopt without another ad-hoc patch layer. **This milestone applies fully only to Filter.**

## How design-system-first page upgrades work (industry pattern → Phuglee)

Opinionated sequence used by teams that ship makeovers without thrashing product logic:

```
1. TOKENS     Source of truth (color, type, space, radius, shadow, glass, motion)
2. PRIMITIVES Buttons, inputs, selects, chips, cards, tables, dialogs, states
3. PATTERNS   Desk layout, kill report, inventory, theater chrome (compose primitives)
4. PAGE WIRE  Map every /bridge control onto primitives/patterns (CSS/markup only)
5. QA GATE    Visual parity + a11y + reduced-motion + permanent suite bar
```

| Industry practice | Why it matters here | Phuglee application |
|-------------------|---------------------|---------------------|
| **Tokens before components** | Prevents “pretty once, drift forever” | Extend `tokens.css` + glass vars; deprecate one-off hex in `bridge.css` |
| **One page as showcase** | Proves system under real density before site-wide | Filter is densest ops desk → perfect pilot |
| **Adopt → Adapt → Create** (NN/g) | Don’t invent a second brand | **Adapt** existing Phuglee (`phuglee-*`) to match login/home energy; do not create “Filter brand 2.0” |
| **Markup-class migration, not rewrite** | Behavior locks survive | Prefer class swaps onto `phuglee-btn` / `phuglee-input` / etc.; keep IDs + data-actions |
| **Reduced-motion as first-class** | Ops desks run all day; motion fatigue + a11y | Honor `prefers-reduced-motion` on every new animation |
| **Visual regression at fixed widths** | Desk breaks at mobile + ultrawide differently | Lock **390** and **1440** (existing Playwright pattern) |

**Do not:** redesign workflow order, invent new panels for “cleaner IA,” or “simplify” Train/Save as part of the makeover. Visual parity with home/login is the job; desk cinema structure from v2.1–v2.2 stays.

---

## Feature Landscape

Features grouped for REQ-ID mapping: **TOKENS · BUTTONS · FORMS · CARDS · DESK · STATES · QA**.

### Table Stakes (Users Expect These)

Missing any of these = Filter still feels like “the old tool after a badass homepage.”

| REQ group | Feature | Why Expected | Complexity | Notes / existing dependency |
|-----------|---------|--------------|------------|----------------------------|
| **TOKENS** | Canonical Phuglee token set aligned to login/home | Visual continuity across app entry → desk | MEDIUM | Source: `tokens.css`, auth glass/grain, home cream/orange hierarchy. Gap: `bridge.css` still has local overrides and legacy heat residue |
| **TOKENS** | Typography hierarchy (Anton display / Outfit body / mono data) | Login/home signature; operators read denser data | LOW | Fonts already loaded on `bridge.html`; many bridge titles/labels still custom, not token-scale |
| **TOKENS** | Glass + grain + wear atmosphere parity | “Badass” = atmosphere, not only button color | MEDIUM | `premium-bg`, heat-field already on body; panels must *read* as same glass family as auth modal |
| **BUTTONS** | Primary / secondary / ghost / danger CTA system on every action | Home/login CTAs are the brand promise | MEDIUM | `phuglee-btn*` exists; residual non-system controls (browse links, mode tabs, drawer toggles, summary chrome) |
| **BUTTONS** | Disabled / hover / focus / active states consistent | Ops desk is click-heavy; inconsistent states feel broken | LOW–MEDIUM | Focus rings in `phuglee-a11y.css`; enforce on chips/tabs/dropzone too |
| **FORMS** | Inputs, selects, textareas, search fields match system | City search + save name + Train search are high-frequency | MEDIUM | `phuglee-input/select/textarea` exist but most bridge fields use bare or `bridge-*` styles |
| **FORMS** | Type chips + date chips as first-class chip components | Core intake UX; currently bespoke | MEDIUM | `.bridge-type-chip`, `.bridge-date-chips` — restyle to system chip, keep radio semantics |
| **FORMS** | Dropzone visual upgrade (idle / dragover / has-file / error) | Upload is the money moment of the desk | MEDIUM | Keep multi-file + accept list; no new formats; visual states only |
| **CARDS** | Panel/card system (`phuglee-panel` + variants) on all desk sections | Login modal panel is the north-star card | MEDIUM | Most sections already `bridge-panel phuglee-panel`; hover/overflow quirks (city search results) need system-safe fixes |
| **CARDS** | Dialogs / confirm sheets match auth-modal energy | Type-column confirm + history dialogs must not look like OS defaults | MEDIUM | History dialog card exists; confirm gates need same grain/glass treatment |
| **DESK** | Full pass on every visible Filter surface (no orphan chrome) | Partial makeovers read as unfinished | HIGH | Inventory: hero, pipeline, scrub stage, dossier, outcome drawer, import, loading feed, mission/kill report, save, train/armory, kept table, lists, shift HUD, victory strip, dialogs |
| **DESK** | Kill report + mission board still climax-first | v2.1–v2.2 theater is product DNA | MEDIUM | Restyle RAW→KILLED→KEPT + Stage CTA; do not demote Save or reintroduce Analyze push chrome |
| **DESK** | Tables (kept + inventory) readable on dark glass | Dense data is table stakes for ops tools | HIGH | Sticky header, zebra/hover, mono cells optional, horizontal scroll on 390 |
| **STATES** | Empty / loading / error / success status patterns | Operators need trust signals during long scrubs | MEDIUM | `phuglee-loading-state`, `phuglee-empty-state`, `phuglee-error` exist; bridge status lines still ad-hoc |
| **STATES** | Scrub feed + loading copy remain legible | Theater without readability is cosplay | LOW–MEDIUM | Client-staged feed (no SSE); visual only |
| **QA** | Reduced-motion safe animations | Permanent a11y bar from v2.1 | LOW | Extend `phuglee-a11y` + bridge motion media queries to any new shimmer/reveal |
| **QA** | 390 + 1440 layout QA (and suite + verify-live bar) | Desk is used on laptop + phone photos of sheets | MEDIUM | Existing Playwright/Edge pattern; no functional suite regressions (679+ bar) |

### Differentiators (Competitive Advantage)

Not required for “looks finished,” but make Filter feel like a premium war-room product vs generic dark SaaS.

| REQ group | Feature | Value Proposition | Complexity | Notes |
|-----------|---------|-------------------|------------|-------|
| **TOKENS** | Shared “design system package” documented for later pages | Site-wide rollout without redesign-from-scratch | MEDIUM | Tokens + component class catalog + usage do/don’t in `.planning` or short `docs/design/` note — not a Storybook app |
| **BUTTONS** | Gem/shimmer primary CTA energy matching home (contained) | Emotional continuity from marketing → work | LOW–MEDIUM | Use existing `phuglee-btn-primary` sheen; **cap** motion so all-day desk use doesn’t fatigue |
| **FORMS** | Chip “selected” state with gold/orange gradient face (auth-tab energy) | Type selection feels as deliberate as Sign In tab | MEDIUM | Mirror `.auth-tab.is-active` treatment on type chips |
| **CARDS** | Elevation hierarchy (desk primary vs scrap/secondary vs vault) | Operators scan importance without reading labels | MEDIUM | Map: scrub stage = elevated; attach/outcome scrap = quieter; victory = featured |
| **DESK** | Atmosphere depth that survives long sessions | Premium without arcade overload | MEDIUM | Grain/wear opacity tuned for desk (slightly calmer than home hero photo) while same DNA |
| **DESK** | Victory strip + kill report as brand-heat moments | Celebrate kills — product story is “delete the junk” | LOW–MEDIUM | Copy locked; visual intensity only |
| **DESK** | Train theater + armory as distinct visual modes | Admin power tools feel intentional, not bolted on | MEDIUM | Mode tabs → system segmented control; non-admin still hidden |
| **STATES** | Status toasts/lines with semantic color tokens (success/warn/danger) | Instant trust on save/train/attach | LOW | Use `--phuglee-success/warn/danger`; avoid random greens |
| **QA** | Side-by-side visual checklist: home/login vs Filter component pairs | Prevents “close enough” drift | LOW | Manual or screenshot matrix: button, input, panel, modal |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Behavior / workflow changes** (“simplify steps”, reorder pipeline, auto-save, hide Train) | Makeover chat often mutates product | Breaks v1.6–v2.2 locks; confounds visual QA | CSS/markup only; IDs, handlers, process path frozen |
| **New process/brain/list engines** | “While we’re in there…” | Accuracy + 679-test bar at risk; out of milestone scope | Visual pass only; engine work = later milestone |
| **Re-couple Analyze** (push buttons, “send to Analyze”, shared store UI) | Old product muscle memory | Explicitly out of scope (v2.0 IND) | Keep “Analyze stays separate” copy; no new Analyze affordances |
| **Excessive motion** (constant grain animation, parallax, infinite shimmer, auto-scroll feed thrash) | Feels “premium” in demos | Breaks a11y, causes fatigue on 8-hour shifts, fails reduced-motion | Short enter transitions; static grain; `prefers-reduced-motion: reduce` hard stop |
| **React / Tailwind / Framer migration for this milestone** | Modern stack aspiration | Parallel stack on vanilla Filter is a rewrite, not a makeover | Stay vanilla HTML/CSS/JS; optional React later (PROJECT backlog) |
| **Full site reskin in same milestone** | Consistency anxiety | Dilutes Filter showcase; multiplies regression surface | System designed for reuse; apply fully to `/bridge` only |
| **New IA / remove desk cinema** (kill report demotion, proof-rail return, hub-style cards) | Cleaner mockups | Undoes v2.1–v2.2 operator narrative | Restyle cinema; don’t replace it with generic dashboard |
| **Light theme / multi-theme switcher** | Accessibility argument | Brand is black/cream/orange; doubles QA surface | Improve contrast within dark Phuglee; keep single theme |
| **Custom icon font / illustration pack rebuild** | Polish | Scope explosion; emoji/ops slang already work | Reuse existing marks; optional SVG only if critical |
| **Pixel-perfect clone of login modal as every panel** | Literal parity | Auth is a small modal; desk needs denser data density | Same **tokens and components**, different **layout density** |
| **Inline style / one-off hex proliferation in bridge.css** | Fast local fixes | Kills the design system before it starts | Token or shared class only |
| **Wiping runtime data to “test the new look”** | Clean screenshots | Destroys real Filter lists / brain (AGENTS.md hard rule) | Use fixtures / screenshots; never clear `data/filter-lists` or brain |

---

## Feature Dependencies

```
TOKENS (color, type, space, glass, motion, focus)
    └──requires──> BUTTONS (primary/secondary/ghost/danger + states)
    └──requires──> FORMS (input/select/textarea/search/chip/dropzone)
    └──requires──> CARDS (panel/dialog/elevation)
    └──requires──> STATES (empty/loading/error/success)

BUTTONS + FORMS + CARDS + STATES
    └──requires──> DESK (page wire of every /bridge surface)

DESK
    └──requires──> QA (390/1440, reduced-motion, suite, verify-live)

DIFFERENTIATORS (shimmer, elevation map, theater modes)
    └──enhances──> DESK
    └──conflicts──> excessive motion anti-feature

BEHAVIOR FREEZE
    └──conflicts──> any DESK change that alters process/API/brain/Train logic
```

### Dependency Notes

- **DESK requires TOKENS + primitives:** Wiring page chrome before tokens guarantees a second rewrite when home parity is measured.
- **FORMS chips depend on BUTTONS state language:** Selected chip should feel related to primary CTA / auth active tab, not a random outline.
- **CARDS overflow vs city search:** Desk panels use `overflow: hidden` for glass; search results need a system pattern (portal/popout or overflow exception) already partially special-cased — preserve behavior, fix visually.
- **QA depends on DESK completeness:** Partial surface coverage fails the “full makeover” claim even if tokens are perfect.
- **Differentiators enhance, don’t gate MVP:** Ship parity first; gem energy and elevation map polish second.

### Existing surface → component map (wire targets)

| Filter surface | Primary component targets | Notes |
|----------------|---------------------------|-------|
| Hero + pipeline | type scale, eyebrow, slim step chips | Keep step semantics |
| Scrub desk (city/state/search) | forms + cards | Search listbox a11y preserved |
| City dossier + outcome drawer | cards + secondary chrome | Scrap drawer stays demoted |
| Type chips | chips | Radio group intact |
| Paste + dropzone + Process | forms + buttons + dropzone | SCRUB IT primary energy |
| Loading + scrub feed | states + list pattern | `aria-busy` preserved |
| Kill report / KPIs / save climax | cards + buttons + stats | Mission-first order frozen |
| Mode tabs (Kept / Train / Armory) | segmented control / chips | Admin gates unchanged |
| Train groups + pager | cards + buttons + status | No decision logic changes |
| Kept table + filters | forms + table | Sort/filter behavior frozen |
| Lists inventory | table + buttons + details | Collapse default preserved |
| Shift queue HUD | chips + sticky bar | sessionStorage behavior frozen |
| Victory strip | banner + button pair | Post-stage only |
| Dialogs (history, type confirm) | modal + forms + buttons | Confirm logic frozen |

---

## MVP Definition

### Launch With (v3.0 Filter Visual Makeover)

Minimum for “Filter matches login/home badass” without functional risk:

- [ ] **TOKENS** — Home/login-aligned token layer (glass, grain-aware surfaces, type scale, shadows, semantic status colors); bridge stops inventing local palettes
- [ ] **BUTTONS** — All actionable controls on `/bridge` use system button variants + states
- [ ] **FORMS** — Search, select, text, textarea, chips, dropzone share system form language
- [ ] **CARDS** — Panels, drawers, dialogs share glass elevation system
- [ ] **DESK** — Full surface pass (inventory above); no orphan pre-system chrome
- [ ] **STATES** — Empty / loading / error / success use shared patterns
- [ ] **QA** — Reduced-motion, 390 + 1440 layout, permanent suite + verify-live green
- [ ] **Behavior freeze** — No process/API/brain/keep-kill/list workflow changes

### Add After Validation (same milestone if time; else immediate follow-on)

- [ ] **Elevation map** — Explicit primary vs scrap vs featured panel roles documented + applied
- [ ] **Auth-tab energy on type chips** — Selected chip = gradient face parity
- [ ] **Component catalog note** — Short reuse guide for Collect/Hub later (not a full Storybook)
- [ ] **Screenshot parity matrix** — Login/home vs Filter paired components

### Future Consideration (later milestones)

- [ ] Site-wide application (Collect, Command Hub, Analyze chrome, Forge proxy skins)
- [ ] Optional Storybook / visual regression CI beyond Playwright smoke
- [ ] React/Framer migration (explicit backlog — not v3.0)
- [ ] Multi-theme / light mode

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Token alignment (TOKENS) | HIGH | MEDIUM | **P1** |
| Buttons everywhere (BUTTONS) | HIGH | MEDIUM | **P1** |
| Forms + chips + dropzone (FORMS) | HIGH | MEDIUM | **P1** |
| Cards/panels/dialogs (CARDS) | HIGH | MEDIUM | **P1** |
| Full desk surface wire (DESK) | HIGH | HIGH | **P1** |
| Empty/loading/error (STATES) | HIGH | LOW–MEDIUM | **P1** |
| Reduced-motion + 390/1440 + suite (QA) | HIGH | MEDIUM | **P1** |
| Auth-tab chip energy | MEDIUM | LOW–MEDIUM | **P2** |
| Elevation hierarchy map | MEDIUM | MEDIUM | **P2** |
| Contained CTA shimmer polish | MEDIUM | LOW | **P2** |
| Design-system reuse doc | MEDIUM (future) | LOW | **P2** |
| Screenshot parity matrix | MEDIUM | LOW | **P2** |
| Site-wide rollout | HIGH (later) | HIGH | **P3** |
| Storybook / visual CI suite | LOW–MEDIUM | HIGH | **P3** |
| React migration | LOW (now) | VERY HIGH | **P3** / anti for v3.0 |

**Priority key:**
- **P1:** Must have for v3.0 launch (parity + freeze + QA)
- **P2:** Should have if it strengthens parity without risk
- **P3:** Later milestones / explicit defer

---

## Competitor / Reference Feature Analysis

Not SaaS competitors — **reference surfaces** for this makeover:

| Concern | Login modal (`auth.css`) | Home premium | Filter today | v3.0 approach |
|---------|--------------------------|--------------|--------------|---------------|
| Atmosphere | Backdrop blur + grain overlay | Photo grain/wear + scrim | premium-bg + heat-field present; panels uneven | Unify panel glass to auth/home family; calm desk grain |
| Primary CTA | Gold→orange gradient, lift | Gem CTAs | Mix of `phuglee-btn` + residual chrome | System buttons only |
| Inputs | Auth field styling | Marketing forms rare | Bridge-specific fields | Adopt `phuglee-input*` + auth-grade focus |
| Cards | `phuglee-panel` + no hover thrash on modal | Chapter cards | `phuglee-panel` with overflow/hover edge cases | System cards + desk-safe overflow patterns |
| Density | Low (auth) | Medium (story) | **High (ops)** | Same tokens; denser spacing scale, not different brand |
| Motion | Modal rise, tab swap | Scroll/monitor accents | Feed + reveals + victory | Short, reduced-motion safe; no perpetual motion |

**Industry systems referenced (patterns, not to adopt wholesale):** Material / Carbon / Atlassian / USWDS — tokens → components → patterns → page templates; accessibility and state tables as first-class.

---

## Suggested REQ-ID skeleton (for requirements phase)

Use stable prefixes for roadmap/requirements drafting:

| Prefix | Scope |
|--------|--------|
| **TOKENS-*** | Color, type, space, radius, shadow, glass, motion, focus, semantic status |
| **BUTTONS-*** | Primary/secondary/ghost/danger; sizes; icon+label; disabled/hover/focus/active |
| **FORMS-*** | Input/select/textarea/search; labels; chips; dropzone states; checkbox/radio faces |
| **CARDS-*** | Panel, featured, scrap/secondary, dialog/modal, elevation rules |
| **DESK-*** | Per-surface wire: hero, pipeline, scrub, dossier, import, mission, train, table, lists, shift, victory, dialogs |
| **STATES-*** | Empty, loading, error, success/status, feed readability |
| **QA-*** | Reduced-motion, 390/1440, contrast, focus order, suite bar, verify-live, no behavior drift |

Each REQ should state: **visual acceptance + “no functional change” lock** + dependency on existing DOM ids/classes where relevant.

---

## Sources

- Codebase: `public/css/tokens.css`, `phuglee-components.css`, `phuglee-a11y.css`, `auth.css`, `home-premium.css`, `bridge.css`, `public/bridge.html`
- Product locks: `.planning/PROJECT.md` (v3.0), `.planning/STATE.md`, v2.1–v2.2 desk cinema constraints
- NN/g — Design Systems 101 (tokens/components/patterns; adopt/adapt/create): https://www.nngroup.com/articles/design-systems-101/
- Prior Phuglee brand system (v1.3) + Filter theater (v2.1–v2.2) as in-repo ground truth
- Agent rules: `AGENTS.md` (no data wipe; verify-live after site edits)

---
*Feature research for: Distress OS / Phuglee — v3.0 Filter Visual Makeover*
*Researched: 2026-07-11*
*Mode: ecosystem / visual design-system upgrade*
