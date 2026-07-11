# Phase 61: Scrub Desk Foundation - Research

**Researched:** 2026-07-10  
**Domain:** Filter `/bridge` first-paint shell — asymmetric scrub desk, atmosphere, hero, slim teaching chrome, unified buttons/voice  
**Confidence:** HIGH

## Summary

Phase 61 is a **brownfield UI foundation pass** on Filter only. Goal: when an operator opens `/bridge`, first paint reads as an **asymmetric scrub desk in the same grit world as Collect/Command** — not a centered multi-step form wizard with a decorative equal 3-up proof rail and a marketing gradient H1.

The product already has the exact peer patterns to copy:

| Steal from | Pattern |
|------------|---------|
| **Collect** (`collect.html` + `distress-collect-hub.css`) | `premium-bg--strong` + `heat-field`; left Anton H1; **desk grid** `~1.7fr / ~0.85fr` primary + scrap; short ops lead; `phuglee-btn` CTAs |
| **Command** (`command.html` + `command-center.css`) | Left solid cream Anton; mission + status asymmetry (`~1.55fr / 1fr`); ops voice; `phuglee-btn` only |
| **Filter map** (`.planning/codebase/filter-page-ui-map.md`) | Inventory of what to kill (proof rail, dual buttons, subtle atmosphere) vs preserve (IDs, progressive panels, pipeline hook) |

**Primary recommendation:** Restructure first paint around a Collect-style **desk shell** in `bridge.html` + additive layout classes in `bridge.css`; **delete** the equal 3-up proof rail (do not invent a second fake grid); upgrade atmosphere to Collect-grade; restyle hero to solid cream left Anton; slim teaching chrome; unify CTAs onto `phuglee-btn` in HTML **and** JS-generated strings. Preserve every stable DOM ID and the progressive step panels (city → type → upload → results still work). **Do not** build city dossier, idle live metrics, process theater, kill report, train theater, or shift inventory — those are phases 62–67.

**Why this works without engine work:** DESK-01–06 are pure presentation/voice. D3 (v2.1 bible) locks vanilla HTML/CSS/JS on existing `bridge.*`. D5 locks DOM hooks. No API/schema changes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Layout
- Asymmetric dominant work surface + supporting scrap (Collect pattern), not centered 920px essay stack alone
- Remove equal 3-up decorative proof rail entirely (prefer remove over fake replacement)

#### Atmosphere
- Collect-grade: `premium-bg--strong` and/or heat field language vs current `premium-bg--subtle`

#### Hero / chrome
- Left-aligned solid cream Anton “Scrub the Mess”; short ops lead
- No centered gradient marketing H1
- Slim teaching chrome: no triple stack (rail + long lead + redundant essay); keep usable step orthography (slim pipeline OK)

#### Buttons / voice
- Prefer `phuglee-btn` primary vocabulary; unify dual `bridge-btn` systems
- Ops slang labels (not corporate “Select city profile” as primary voice)

### Claude's Discretion
- Exact grid fractions for desk vs scrap
- Whether slim pipeline remains horizontal chips or sticky micro-steps
- CSS structure (bridge.css refactor vs additive classes)

### Deferred Ideas (OUT OF SCOPE)
City dossier, idle metrics, live feed, kill report, train theater, shift desk — phases 62–67
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESK-01 | Filter opens as an **asymmetric scrub desk** (dominant work surface + supporting scrap), not a centered multi-step form wizard in a 920px essay stack | Copy Collect `.collect-desk` grid: wrap intake in `.bridge-desk` with `.bridge-desk-primary` (step panels + pipeline) + `.bridge-desk-side` scrap; widen hub if needed (Command uses 1040px; Collect hub stays 920 but desk is asymmetric *inside*) — fail condition is essay-wizard *metaphor*, not a pixel ban on 920 |
| DESK-02 | Equal 3-up decorative “proof rail” is **removed or replaced** so first paint never ships M5-forbidden equal feature grids | **Delete** `section.bridge-proof-rail` in `bridge.html` L54–85 + dead CSS (`.bridge-proof-*`); prefer remove (CONTEXT locked); no decorative equal-grid substitute |
| DESK-03 | Atmosphere matches product-step peers: Collect-grade intensity | Switch body wash to `premium-bg--strong`; add `heat-atmosphere.css` link + `.heat-field` markup (Collect/Command/vault pattern); keep/optional-tune `.bridge-bg` radial so it does not fight heat |
| DESK-04 | Teaching chrome is slim for veterans; progress orthography remains usable | Kill proof rail (already DESK-02); shorten H1 lead; keep `#bridge-pipeline` + `setPipelineStep` contract; optional visual slim of chips (discretion: horizontal chips vs sticky micro-steps) |
| DESK-05 | Hero: **left-aligned solid cream Anton** “Scrub the Mess,” short ops lead; no centered gradient marketing H1 | Mirror `.collect-hub-title` / `.command-title`: `text-align: left`; `color: var(--phuglee-cream)`; kill gradient + `background-clip` on `.bridge-hero h1`; lead left, shorter ops sentence |
| DESK-06 | Button systems + labels unified — prefer `phuglee-btn`; ops slang throughout | HTML: strip dual `bridge-btn`+`phuglee-btn`; JS templates (~L257–258, ~518–519, ~678–679) emit `phuglee-btn`; rewrite corporate H2/leads (“Select city profile” → desk voice); keep button **IDs** |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Vanilla HTML | `public/bridge.html` | Markup shell + progressive panels | D3 — no new framework |
| `public/css/bridge.css` | existing ~1.9k lines | Page-local layout, pipeline, panels, results | Keep local system; additive desk classes |
| `public/js/bridge.js` | existing ~3k lines | DOM hooks, pipeline steps, process, lists, train | Preserve IDs; only class strings / no behavior rewrite |
| `public/css/premium-atmosphere.css` | shared | `premium-bg--strong` / photo / grain / wear | Collect peer intensity |
| `public/css/heat-atmosphere.css` + `heat-base.css` | shared (already linked heat-base on bridge) | Heat field glows/grid/noise | Collect/Command already ship this pair |
| `public/css/phuglee-components.css` | shared | `.phuglee-btn` / primary / secondary | Site CTA vocabulary |
| `public/css/tokens.css` | shared | `--font-display` (Anton), cream/orange/gold | Same type system as Collect/Command |
| `public/js/phuglee-motion.js` | shared | `data-phuglee-reveal` | Existing motion; no new motion system |

### Supporting

| Module / Pattern | Purpose | When to Use |
|------------------|---------|-------------|
| Collect desk CSS (`distress-collect-hub.css` `.collect-desk*`) | Asymmetry recipe | Copy grid fractions / kicker / scrap card voice — do **not** import collect hub classes onto Filter |
| Command mission grid (`.command-mission`) | Alternate 1.55/1 asymmetry | If scrap is status-like rather than tracker-like |
| `scripts/verify-live.ps1` | Health + homepage 200 | Mandatory after any `public/` edit (AGENTS.md) |
| `npm test` | Regression suite | Must stay green; no new unit tests required for pure CSS if IDs stable |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Delete proof rail | Replace with live idle metric strip | **Out of scope** — IDLE-01 is phase 63; CONTEXT prefers remove over fake replacement |
| Collect-grade heat field | Only bump to `premium-bg--strong` without heat | Weaker peer match; Command/Collect both use heat-field — prefer both (DESK-03 “and/or” allows either; Collect uses both) |
| Full rewrite of `bridge.css` | Additive `.bridge-desk*` + hero overrides only | Safer brownfield; dead `.bridge-proof-*` can be deleted or left orphaned (prefer delete dead CSS) |
| Import `distress-collect-hub.css` on bridge | Copy patterns into bridge.css | Avoid cross-page class coupling; Filter keeps `bridge-*` namespace |
| Sticky micro-step pipeline | Keep slim horizontal chips | Discretion — chips already work with `setPipelineStep`; sticky is optional polish |
| Alias `.bridge-btn` → `.phuglee-btn` in CSS only | Change HTML/JS class attributes | CSS alias leaves dual systems in markup; DESK-06 wants vocabulary unify — change sources of truth |

**Installation:** none — no new npm packages.

```bash
# verify
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# manual first-paint check: http://127.0.0.1:3000/bridge
```

## Architecture Patterns

### Recommended Project Structure (phase 61 touch surface)

```
public/
├── bridge.html                 # MODIFY — atmosphere, hero, kill proof rail, desk shell, labels, buttons
├── css/
│   ├── bridge.css              # MODIFY — desk layout, hero solid cream, pipeline slim, dead proof CSS out, btn deprecation
│   ├── heat-atmosphere.css     # LINK from bridge.html (already used by Collect/Command)
│   ├── premium-atmosphere.css  # REUSE --strong
│   └── phuglee-components.css  # REUSE phuglee-btn
└── js/
    └── bridge.js               # MODIFY lightly — JS-built button class strings → phuglee-btn; preserve IDs/pipeline

.planning/
└── phases/61-scrub-desk-foundation/
    ├── 61-CONTEXT.md           # authority for locked decisions
    └── 61-RESEARCH.md          # this file
```

### Pattern 1: Collect asymmetric desk (copy structure, keep bridge namespace)

**What:** Dominant primary panel + secondary scrap in a 2-col grid; collapse to 1 col under ~720px.  
**When to use:** First-paint shell under hero (DESK-01).  
**Source of truth:**

```css
/* public/css/distress-collect-hub.css — collect-desk */
.collect-desk {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(200px, 0.85fr);
  gap: 1rem;
  align-items: stretch;
}
/* Mobile: grid-template-columns: 1fr */
```

Command alternate:

```css
/* public/css/command-center.css — command-mission */
.command-mission {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(260px, 1fr);
  gap: 1rem;
}
```

**Recommended Filter mapping (discretion on fractions):**

| Region | Contents in phase 61 | Not yet |
|--------|----------------------|---------|
| **Primary** | Slim pipeline + progressive step panels (city → type → upload → loading → results still sequential) | Process climax styling (63), kill report (65) |
| **Scrap** | Lightweight supporting panel: e.g. “Already staged?” pointing at saved lists / trust, or a quiet placeholder card that phase 62 will replace with dossier/exception path | City dossier (62), live idle counts (63), shift queue (67) |

**Important:** Scrap must not invent **fake** proof metrics. Empty/quiet scrap with ops voice is OK; invented numbers fail v2.1 “Theater with truth.”

### Pattern 2: Collect/Command atmosphere stack

**What:** Photo premium strong + heat field layers above body.  
**Current Filter (weaker):**

```html
<!-- bridge.html today -->
<body class="has-premium-bg bridge-page">
  <div class="premium-bg premium-bg--subtle" …>
  <div class="bridge-bg" …>
  <!-- no heat-field; no heat-atmosphere.css link -->
```

**Target peer (Collect):**

```html
<link rel="stylesheet" href="/css/heat-atmosphere.css">
…
<div class="premium-bg premium-bg--strong" aria-hidden="true">…</div>
<div class="heat-field" aria-hidden="true">
  <div class="heat-glow heat-glow-a"></div>
  <div class="heat-glow heat-glow-b"></div>
  <div class="heat-grid"></div>
  <div class="heat-noise"></div>
</div>
```

Bridge already loads `heat-base.css` but not `heat-atmosphere.css` — add the link. Keep `.bridge-bg` only if it still reads intentional under strong+heat; otherwise drop or soften so double-oranges do not mud.

### Pattern 3: Solid cream Anton hero (not gradient clip)

**Current Filter fail (DESK-05):**

```css
/* bridge.css .bridge-hero h1 */
text-align: center; /* via .bridge-hero */
background: linear-gradient(180deg, var(--phuglee-cream) 25%, var(--phuglee-orange) 100%);
-webkit-background-clip: text;
color: transparent;
```

**Peer pass:**

```css
/* collect-hub-title / command-title */
font-family: var(--font-display); /* Anton */
color: var(--phuglee-cream);
text-align: left;
/* no gradient clip */
font-size: clamp(2.2rem, 8vw, ~3.75–4rem); /* match peer scale discretionary */
```

Lead: short ops line (Collect ~1 sentence; Command “Clerk → scrub → dial. One board.”). Current Filter lead is multi-sentence product essay — **cut** teaching into panels/empty states if needed; do not triple-stack essay + rail + pipeline.

### Pattern 4: Slim teaching chrome (DESK-04)

**Triple stack today (kill the excess):**

1. Decorative proof rail (3 equal tiles) — **remove**  
2. Long H1 lead essay — **shorten**  
3. Pipeline chips — **keep slim** (usable orthography)

**Pipeline JS contract (must preserve):**

```js
// bridge.js
const pipeline = document.getElementById('bridge-pipeline');
function setPipelineStep(step) {
  const order = ['location', 'type', 'upload', 'results'];
  // toggles .is-active / .is-complete on .bridge-pipeline-step
}
```

- Keep `#bridge-pipeline`, `.bridge-pipeline-step`, `data-step="location|type|upload|results"`.  
- Discretion: restyle chips smaller / denser, or sticky micro-steps — **do not** rename step keys without updating `setPipelineStep`.

### Pattern 5: Desk wraps progressive disclosure (do not flatten wizard into one mega form)

Filter’s interaction model is still:

```text
City → Type → Upload → Process → Results → Save → Download
```

Phase 61 changes **chrome around** that model, not the state machine. Panels stay `hidden` until JS reveals them (`#bridge-type-panel`, `#bridge-upload-panel`, etc.). Putting the whole vertical stack inside `.bridge-desk-primary` is enough for “dominant work surface.”

Saved lists (`#bridge-lists-panel`) can remain below the desk (always-on inventory) or be lightly referenced from scrap — full inventory HUD is phase 67.

### Pattern 6: Button vocabulary unify (DESK-06)

**Sources of dual systems today:**

| Source | Examples |
|--------|----------|
| `bridge.html` dual-class | Process, Clear, Save list, Download all, Preview CSV, Attach (both `bridge-btn*` and `phuglee-btn*`) |
| `bridge.html` bridge-only | `#bridge-outcome-save` (`bridge-btn bridge-btn-primary` only) |
| `bridge.html` phuglee-only | History open, retry, type-confirm Cancel/OK |
| `bridge.js` templates | Train approve/deny, train pager, brain rule Activate/Disable |

**Target vocabulary:**

| Role | Classes |
|------|---------|
| Primary fire | `phuglee-btn phuglee-btn-primary` |
| Secondary / ghost | `phuglee-btn phuglee-btn-secondary` |
| List row micro-actions | Keep `bridge-list-action` (table chrome, not dual CTA system) unless visually broken |

Optional CSS safety: leave `.bridge-btn*` as thin aliases pointing at same look **or** delete once markup/JS clean — prefer clean sources so dual systems do not re-grow.

### Pattern 7: Ops slang (voice table for first paint)

| Today (corporate / form) | Ops direction (examples — planner may lock strings) |
|--------------------------|-----------------------------------------------------|
| Select city profile | Pick the city / Name the city |
| Label upload type | What did the clerk send? / Pick lead type |
| Upload city response file(s) | Drop the clerk file |
| Process upload | Run the scrub / Scrub it |
| Save filtered list | Stage the list |
| Save to City Tracker | Log city reply |
| Attachment history | Prior attaches |
| Results & save | Scrub results (or keep Results) |
| Long product lead under H1 | One short line: drop the mess → keep the distressed |

Do **not** change Analyze-boundary honesty (“Analyze stays separate / never auto-push”).

### Anti-Patterns to Avoid

- **Equal 3-card replacement strip** — M5 / v2.1 forbidden; removing proof rail then adding three “feature” cards fails DESK-02.  
- **Fake idle metrics in scrap** — phase 63 owns live proof; phase 61 scrap is structural + voice only.  
- **City dossier / demote no-list path** — phase 62; do not collapse city-outcome into scrap yet unless pure layout without dossier content (prefer leave outcome under city step for 61).  
- **Breaking DOM IDs** — `bridge-process`, `bridge-save-list`, train/brain nodes, selects, dropzone — tests + JS couple tightly (D5).  
- **Engine / API / brain rewrites** — out of milestone D1 scope for UI phases.  
- **Wiping filter-lists or brain data** — AGENTS.md hard rule.  
- **Importing Collect/Command page classes onto Filter** — copy CSS *patterns*, keep `bridge-*` namespace.  
- **Centered residual hero** — fixing color but leaving `text-align: center` still fails DESK-05.  
- **Green SaaS success flash redesign** — SHIFT-03 / phase 67 (optional note only).  
- **Claiming live without verify-live.ps1** — project mandatory after `public/` edits.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atmosphere grit | Custom full-page canvas/WebGL | `premium-bg--strong` + existing heat-field markup | Peer parity, zero new assets |
| Display type | New font or gradient trick | Anton via `--font-display` + solid cream | Command/Collect already pass bar |
| CTA chrome | Parallel `bridge-btn` redesign | `phuglee-btn` from `phuglee-components.css` | DESK-06 + site unity |
| Desk grid | CSS framework / subgrid experiment | 2-col CSS grid like Collect | Proven on product steps |
| Progress orthography | New stepper library | Existing `#bridge-pipeline` + `setPipelineStep` | Zero behavior risk |
| Live counts at idle | New dashboard endpoints | Defer to phase 63 + existing `/api/bridge/lists` | Scope lock |
| Proof rail “upgrade” | Icon+title equal grid v2 | Delete | CONTEXT locked prefer remove |
| Motion theater | New GSAP scrub animation | Existing reveal + later phases 64–65 | Phase boundary |

**Key insight:** Phase 61 is a **shell + atmosphere + voice** pass. The scrub engine, progressive panels, and admin train/brain already work. Success is visual/metaphor: side-by-side with Collect desk, Filter should feel like the same product world at first paint.

## Common Pitfalls

### Pitfall 1: Only deleting proof rail, leaving essay wizard
**What goes wrong:** DESK-02 passes; DESK-01 still fails — page remains 920px centered vertical form stack.  
**Why it happens:** Proof rail is the most obvious M5 anti-pattern; asymmetry is easier to skip.  
**How to avoid:** Ship desk primary+scrap structure in the same phase as rail removal.  
**Warning signs:** First paint still “one column of equal phuglee-panels forever.”

### Pitfall 2: Breaking `#bridge-pipeline` / step class names
**What goes wrong:** `setPipelineStep` stops highlighting; operator loses orientation.  
**Why it happens:** Restyling pipeline as “sticky micro-steps” renames classes or drops `data-step`.  
**How to avoid:** Preserve ID + `.bridge-pipeline-step` + `data-step` values; restyle only.  
**Warning signs:** Pipeline never leaves step 1 after city select.

### Pitfall 3: Dual buttons fixed in HTML only
**What goes wrong:** Static CTAs look unified; Train/Brain/pager still spawn `bridge-btn`.  
**Why it happens:** Dual system is also in `bridge.js` template strings (grep `bridge-btn`).  
**How to avoid:** Grep-clean HTML + JS; visual check admin train path.  
**Warning signs:** After process as admin, Approve/Deny look like a different design system.

### Pitfall 4: Heat field without stylesheet
**What goes wrong:** Empty heat markup, no glow; or wrong cascade order.  
**Why it happens:** Copy Collect body markup but forget `<link href="/css/heat-atmosphere.css">`.  
**How to avoid:** Match Collect head stack: heat-base (already) + heat-atmosphere.  
**Warning signs:** DOM has `.heat-field` but zero visual vs Collect side-by-side.

### Pitfall 5: Gradient H1 only partially killed
**What goes wrong:** `color: cream` set but `background-clip: text` + transparent color still active.  
**Why it happens:** Layered gradient rules; incomplete override.  
**How to avoid:** Explicitly unset background, background-clip, -webkit-text-fill if any; solid `color: var(--phuglee-cream)`.  
**Warning signs:** H1 still orange-fades or invisible on some browsers.

### Pitfall 6: Scope creep into 62–67
**What goes wrong:** Phase 61 balloons (dossier API, kill feed, train theater).  
**Why it happens:** UI map §8 lists many opportunities; ROADMAP order is deliberate.  
**How to avoid:** Checklist only DESK-01–06 success criteria; park the rest.  
**Warning signs:** PLAN.md tasks mention `/api/bridge/history` dossier content, live feed, or KPI HUD redesign.

### Pitfall 7: Changing IDs for “cleaner” markup
**What goes wrong:** Silent JS breakage (process, save, train, selects).  
**Why it happens:** Cosmetic rename during desk wrap.  
**How to avoid:** Wrap existing nodes; never rename stable IDs without test migration (D5).  
**Warning signs:** Console null reference on `#bridge-process` / `#bridge-state`.

### Pitfall 8: Scrap becomes equal second hero (peer tiles)
**What goes wrong:** Page becomes two equal cards in a void — M5 anti-pattern Collect already fixed.  
**Why it happens:** Grid set to `1fr 1fr` without visual weight difference.  
**How to avoid:** ~1.5–1.7fr primary vs ~0.85fr scrap; primary elevated glass; scrap quieter.  
**Warning signs:** Side-by-side screenshot looks like “two peer hubs.”

### Pitfall 9: Skipping live verify after public/ edits
**What goes wrong:** “Done” claim while server dead or static not served.  
**Why it happens:** Agent finishes CSS and stops.  
**How to avoid:** `scripts\verify-live.ps1` exit 0 same turn (AGENTS.md / Claude.md).  
**Warning signs:** No verify step in implementation notes.

### Pitfall 10: Mobile stack order wrong
**What goes wrong:** Scrap appears above primary on narrow screens.  
**Why it happens:** Grid collapse without source order / order CSS.  
**How to avoid:** DOM order primary then scrap (Collect pattern); test ~390 width.  
**Warning signs:** First mobile paint is the side card, work surface below fold.

## Code Examples

Verified patterns from this repo:

### Atmosphere head + body (from Collect)

```html
<link rel="stylesheet" href="/css/heat-base.css">
<link rel="stylesheet" href="/css/heat-atmosphere.css">
<link rel="stylesheet" href="/css/premium-atmosphere.css?v=distress3">
…
<div class="premium-bg premium-bg--strong" aria-hidden="true">
  <div class="premium-bg-photo"></div>
  <div class="premium-bg-grain"></div>
  <div class="premium-bg-wear"></div>
</div>
<div class="heat-field" aria-hidden="true">
  <div class="heat-glow heat-glow-a"></div>
  <div class="heat-glow heat-glow-b"></div>
  <div class="heat-grid"></div>
  <div class="heat-noise"></div>
</div>
```

### Desk shell sketch (Filter-namespaced)

```html
<header class="bridge-hero">
  <p class="bridge-step-label">Step 02 · Filter</p>
  <h1 class="bridge-title">Scrub the Mess</h1>
  <p class="bridge-lead">Drop the clerk file. Kill the junk. Stage clean distressed leads.</p>
</header>

<!-- NO bridge-proof-rail -->

<div class="bridge-desk">
  <div class="bridge-desk-primary">
    <nav class="bridge-pipeline" aria-label="Intake steps">
      <ol class="bridge-pipeline-list" id="bridge-pipeline">…</ol>
    </nav>
    <!-- existing bridge-panel sections keep IDs/hidden behavior -->
  </div>
  <aside class="bridge-desk-side">
    <!-- quiet scrap: e.g. jump to lists / ops note — no fake metrics -->
  </aside>
</div>
```

### Hero CSS target (mirror peers)

```css
.bridge-hero {
  text-align: left;
  margin-bottom: 1.35rem;
}
.bridge-hero h1,
.bridge-title {
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 8vw, 3.75rem);
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.05;
  color: var(--phuglee-cream);
  background: none;
  -webkit-background-clip: unset;
  background-clip: unset;
}
.bridge-lead {
  max-width: 36rem;
  margin: 0; /* not margin: 0 auto */
  color: var(--phuglee-taupe-mid);
}
```

### Desk grid (discretion: Collect-like)

```css
.bridge-desk {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(200px, 0.85fr);
  gap: 1rem;
  align-items: start;
  margin-bottom: 1.5rem;
}
@media (max-width: 720px) {
  .bridge-desk { grid-template-columns: 1fr; }
}
/* Optional: widen shell toward Command */
.bridge-main {
  max-width: 1040px; /* or keep 920 like Collect hub — metaphor > pixels */
  margin: 0 auto;
}
```

### Button string migrate (JS)

```js
// train card actions — today
'bridge-btn bridge-btn-primary bridge-train-approve'
// target
'phuglee-btn phuglee-btn-primary bridge-train-approve'

// brain rule actions — today
a.status === 'active' ? 'bridge-btn bridge-btn-primary' : 'bridge-btn bridge-btn-ghost'
// target
a.status === 'active' ? 'phuglee-btn phuglee-btn-primary' : 'phuglee-btn phuglee-btn-secondary'
```

### Preserve pipeline hook

```js
// Do not change step keys without updating this order array
const order = ['location', 'type', 'upload', 'results'];
pipeline?.querySelectorAll('.bridge-pipeline-step')…
```

## Exact Files to Create / Modify

| Action | Path | Why |
|--------|------|-----|
| **Modify** | `public/bridge.html` | Atmosphere classes + heat markup; kill proof rail; desk shell; hero/lead; panel labels; button classes |
| **Modify** | `public/css/bridge.css` | Desk grid; hero solid cream left; slim pipeline; remove/orphan proof-rail CSS; optional `.bridge-btn` deprecation; main max-width/padding tune |
| **Modify** | `public/js/bridge.js` | JS-generated button classes → `phuglee-btn*` only; **no** ID renames; no process/API changes |
| **Do not create** | New CSS framework file / React island | Vanilla only (D3) |
| **Do not modify** | `lib/bridge-engine/*`, brain store, list store | Out of scope |
| **Do not modify** | `public/collect.html`, `public/command.html` | Peers are reference only |
| **Do not modify yet** | Results KPI mission readout, train theater tabs hierarchy | Phases 65–66 |
| **Do not wipe** | `data/filter-lists/`, `data/bridge-brain/` | AGENTS.md |
| **Optional** | Bump `bridge.css?v=` / `bridge.js?v=` query if used for cache | Force clients to see shell |

**Stable IDs that must survive wrap (non-exhaustive — full map in filter-page-ui-map.md):**

`bridge-pipeline`, `bridge-state`, `bridge-city`, `bridge-history-open`, `bridge-city-outcome`, `bridge-outcome-save`, `bridge-type-panel`, `bridge-upload-panel`, `bridge-process`, `bridge-clear-file`, `bridge-dropzone`, `bridge-file-input`, `bridge-response-date`, `bridge-loading-panel`, `bridge-results-panel`, `bridge-kpi-grid`, `bridge-train-wrap`, `bridge-save-list`, `bridge-lists-panel`, `bridge-error-wrap`, dialogs, train/brain node IDs.

## State of the Art

| Old Approach | Current Approach (after phase 61) | When Changed | Impact |
|--------------|-----------------------------------|--------------|--------|
| Centered 920px essay wizard + equal proof rail | Asymmetric scrub desk + scrap | Phase 61 | First paint matches Collect metaphor |
| `premium-bg--subtle` + soft orange radial only | Strong premium + heat field language | Phase 61 | Same grit world as Collect/Command |
| Gradient clip marketing H1, centered | Solid cream Anton, left | Phase 61 | DESK-05 / M5 DO list |
| Dual `bridge-btn` + `phuglee-btn` | `phuglee-btn` primary vocabulary | Phase 61 | Visual system unity |
| Filter skipped M5 phases 32–36 | Filter enters v2.1 foundation | M8 start | Product step parity begins |

**Deprecated/outdated for this phase:**
- Treating filter-page-ui-map §8 as a single-phase backlog — **ordered** into 61–67; only §8 items 1,2,4,5(partial voice),10(partial chrome),12,13 map to DESK-*.  
- Any invented “admin dashboard Filter redesign” outside v2.1 bible.

## Open Questions

1. **What exactly fills the scrap in phase 61?**  
   - What we know: Collect scrap = “Already waiting? Track Requests.” Phase 62 owns dossier + demoted no-list path.  
   - What's unclear: Whether 61 scrap is (a) quiet “Saved lists” jump card, (b) static ops tip, or (c) minimal empty elevated panel reserved for 62.  
   - **Recommendation:** Quiet scrap with ops voice linking/scrolling to `#bridge-lists-panel` (“Already staged?”) — real navigation, no fake metrics; phase 62 upgrades scrap to dossier/exception.

2. **Hub max-width 920 vs 1040?**  
   - Collect hub = 920; Command = 1040.  
   - **Recommendation:** Prefer ~1040 if desk + scrap feel cramped; 920 is acceptable if asymmetry is clear (metaphor > pixels).

3. **Pipeline: chips vs sticky micro-steps?**  
   - CONTEXT leaves discretion.  
   - **Recommendation:** Keep horizontal chips first (lowest risk to `setPipelineStep`); slim visual weight; sticky only if chips still feel like “tutorial chrome.”

4. **Leave city-outcome block in primary for 61?**  
   - Full demotion is CITY-02 / phase 62.  
   - **Recommendation:** Yes leave functional block; optional visual mute only — do not redesign exception path yet.

5. **Delete vs alias `.bridge-btn` CSS?**  
   - **Recommendation:** Migrate HTML/JS classes; keep thin alias rules one release if any external/bookmark CSS depends on them, else delete dead rules to prevent dual-system revival.

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` + existing suite |
| Quick run | `npm test` |
| Live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| Manual visual | Authenticated `/bridge` first paint vs `/collect` side-by-side; 1440 + ~390 widths |
| Reduced motion | Spot-check reveal + heat (shared systems; no new theater motion in 61) |

### Phase Requirements → Verification Map

| Req ID | Behavior | Test Type | How to verify | Automated? |
|--------|----------|-----------|---------------|------------|
| DESK-01 | Dominant work + scrap at first paint | visual / manual | Open `/bridge` idle: 2-col desk (or stacked mobile), not essay-only | ❌ visual |
| DESK-02 | No equal 3-up proof rail | DOM / visual | No `.bridge-proof-rail` in HTML; no 3-col feature grid at top | ❌ grep HTML |
| DESK-03 | Collect-grade atmosphere | visual | `premium-bg--strong` + heat-field present; peer intensity vs Collect | ❌ visual |
| DESK-04 | Slim teaching; pipeline usable | manual interaction | Pick city → pipeline advances; no triple tutorial stack | ❌ + existing JS path |
| DESK-05 | Left solid cream Anton H1 | visual / CSS | No gradient clip; left align; short lead | ❌ visual |
| DESK-06 | `phuglee-btn` + ops slang | grep + visual | No dual-class CTAs; train/brain templates updated; labels ops-like | ❌ grep `bridge-btn` |
| Regression | Process/save/lists/admin still work | suite + manual | `npm test`; smoke process path if practical | ✅ `npm test` |
| Live server | Health after public edits | script | `verify-live.ps1` exit 0 | ✅ script |

### Sampling Rate

- **Per task commit:** visual first paint + `grep bridge-btn` cleanliness  
- **Per wave merge:** `npm test` + `verify-live.ps1`  
- **Phase gate:** All six ROADMAP success criteria TRUE + suite green + live OK + side-by-side Collect grit match  

### Wave 0 Gaps

- [ ] No dedicated visual regression harness for Filter first paint (manual side-by-side is the gate — same as M5 surface phases)  
- [ ] Optional: add a tiny DOM smoke test later if desired — **not required** for research; pure HTML class presence is greppable  
- [ ] Framework install: none  

## Sources

### Primary (HIGH confidence)

- `.planning/phases/61-scrub-desk-foundation/61-CONTEXT.md` — locked decisions + phase boundary  
- `.planning/REQUIREMENTS.md` — DESK-01–06  
- `.planning/ROADMAP.md` — Phase 61 goal + 6 success criteria  
- `.planning/v2.1-FILTER-SCRUB-THEATER.md` — milestone DO/DON’T, D1–D7, verification  
- `.planning/v1.4-GRITTY-PREMIUM.md` — quality bar (asymmetry, no equal grids, solid cream preference)  
- `.planning/codebase/filter-page-ui-map.md` — live inventory of `/bridge`  
- `public/bridge.html` — proof rail L54–85, hero L48–51, dual buttons, progressive panels  
- `public/css/bridge.css` — `.bridge-main` 920 center, gradient H1, proof grid, `.bridge-btn*`  
- `public/js/bridge.js` — `setPipelineStep`, `bridge-btn` template strings  
- `public/collect.html` + `public/css/distress-collect-hub.css` — desk + strong + heat  
- `public/command.html` + `public/css/command-center.css` — mission asymmetry + cream Anton  
- `public/css/phuglee-components.css` — `phuglee-btn` system  

### Secondary (MEDIUM confidence)

- M5 historical plans (phases 32–33) as pattern precedent only — Filter was out of M5 scope  
- UI map §8 upgrade opportunities — prioritized into phases; not all phase 61  

### Tertiary (LOW confidence)

- Exact scrap copy / final ops label strings — discretionary; lock in PLAN/implementation  
- Whether cache-bust query strings need bumps — env-dependent  

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — pure existing CSS/HTML/JS; zero new deps  
- Architecture: **HIGH** — CONTEXT + ROADMAP + peer Collect/Command code align  
- Pitfalls: **HIGH** — UI map constraints, pipeline ID coupling, dual-button JS sources verified by grep  

**Research date:** 2026-07-10  
**Valid until:** 2026-08-10 (re-check if `bridge.html` structure or pipeline step keys change before execution)

---

## RESEARCH COMPLETE

**Phase:** 61 - scrub-desk-foundation  
**Confidence:** HIGH

### Key Findings
- Phase 61 is shell/atmosphere/voice only: asymmetric Collect-style desk, kill proof rail, strong+heat atmosphere, solid cream left Anton, slim chrome, `phuglee-btn` + ops slang.
- Copy Collect/Command **patterns** into `bridge-*` namespace; do not import collect hub classes or invent live metrics/dossier (62–63).
- Preserve `#bridge-pipeline`, progressive panel IDs, and all process/save/train hooks; only lightly touch `bridge.js` for button class strings.
- DESK-01 fails if only the rail is deleted — must ship primary+scrap structure.
- Verify with side-by-side Collect, DESK success criteria, `npm test`, and `scripts\verify-live.ps1`.

### File Created
`.planning/phases/61-scrub-desk-foundation/61-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Existing premium/heat/phuglee stack; no new packages |
| Architecture | HIGH | Peer desk/mission code + CONTEXT locked decisions agree |
| Pitfalls | HIGH | Pipeline IDs, dual-btn JS templates, scope creep 62–67 documented |

### Open Questions
- Scrap content for 61 (recommend quiet “Already staged?” → lists; no fake metrics).
- Hub max-width 920 vs 1040 (discretion).
- Pipeline chips vs sticky (prefer chips first).

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
