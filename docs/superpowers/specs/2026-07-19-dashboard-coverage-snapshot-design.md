# Dashboard → Coverage Snapshot — Design Spec

**Date:** 2026-07-19  
**Status:** Approved (direction: Approach A — twin hero numbers + quiet links)  
**Surface:** `/command` (nav label: **Dashboard**)

## Problem

`/command` is a “Mission Board”: recommended next action, module health dots, pipeline pulse, first-run checklist, and a tools chip strip. That answers *what should I do next?* and *are modules up?* It does **not** answer the operator’s first question when opening Dashboard:

> How big is the live footprint right now?

The page also carries marketing/coaching chrome (How It Works, mission copy) that belongs on Heat/home, not on an authenticated product home.

## Goals

1. **One job:** show live coverage as a SaaS-product snapshot — cities live and states covered — at first paint.
2. **Quiet navigation only** below the hero: Collect · Filter · Analyze · Contracts. No deal KPIs, no fundings strip, no Forge/Analyze health block on this page.
3. **Delete the mission board** and rebuild the main content from scratch. Keep shell nav, footer, auth, and real coverage data wiring.
4. **Honest numbers only** — same coverage source as today; never invent metrics.
5. **Visual system:** Phuglee product register (dark earth, cream, gold/ember accents). SaaS *density and calm*, not purple-gradient generic SaaS and not cyber HUD.

## Non-goals

- Mini US map or per-state breakdown (Approaches B/C — deferred)
- Deals in process, under contract, or fundings counts on this page
- Module online/offline status on this page (footer status remains the system pulse)
- First-run checklist / onboarding coaching
- Pipeline pulse theater (Collect → Filter → Analyze as a featured flow)
- New design tokens or a second CSS era
- Backend API changes unless coverage IDs/wiring break during the rewrite (prefer keep existing)

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Primary focus | Coverage footprint |
| Below hero | Quiet deep links only |
| Layout | Twin hero numbers (Approach A) |
| Deals / fundings | Out of page |
| Map / state list | Out of page for this ship |

## Solution — Coverage Snapshot Home

Replace the entire main hub content with a minimal product home.

### Information architecture

```
[ shell nav — unchanged ]

  Coverage                         ← quiet page label (Outfit), product not marketing

  ┌──────────────────────────────────────────────┐
  │   {cities}              {states}             │
  │   cities live           states               │
  │   Live clerk footprint  (optional one-liner) │
  └──────────────────────────────────────────────┘

  Collect · Filter · Analyze · Contracts         ← quiet text links / low-chrome pills

[ shell footer / distress-status — unchanged ]
```

### Visual layout

1. **Page label** — Short “Coverage” (or “Dashboard” if nav/label consistency requires; prefer **Coverage** as the content title so the job is obvious). Not Anton display marketing hero; product-scale Outfit/sans title.
2. **Twin metrics** — Side-by-side, dominant visual weight:
   - **Cities:** large mono number, gold accent (`--phuglee-gold` / existing gold number class pattern)
   - **States:** large mono number, cream
   - Muted unit labels under each (`cities live`, `states`)
3. **Proof line** — One muted sentence max, e.g. “Live clerk footprint.” No mission pitch.
4. **Link row** — Horizontal, low contrast vs metrics; hover/focus states from existing `phuglee` link/button patterns. Not an icon+title+desc card grid.

**Panel treatment:** At most one surface panel (hairline warm border / earth panel tokens). Prefer open spacing over nested cards. Absolute ban: side-stripe borders, gradient text, four equal KPI tiles, glassmorphism stack.

### Data

| Metric | DOM (preserve or rebind) | Source |
|--------|--------------------------|--------|
| Cities live | `#command-city-count` | Existing `home-coverage.js` path (`/forge/api/coverage` → fills command IDs) |
| States | `#command-state-count` | Same |

- Keep element IDs that `home-coverage.js` already targets so counts keep working without a new data layer.
- Loading: show `—` (or skeleton) until filled.
- Error / coverage unavailable: show “Coverage unavailable” (or leave `—`) and **still render the quiet links**.
- Zero is valid: show `0`, do not substitute marketing “500+” on this page.

### Quiet links

| Label | Href | Notes |
|-------|------|--------|
| Collect | `/collect` | Always |
| Filter | `/filter` | Canonical (not `/bridge`) |
| Analyze | `/analyzer/` | Always |
| Contracts | `/under-contract` | Keep existing admin/contract-desk gate if present (`data-admin-only` / settings role) |

Optional later (not this ship): How It Works → `/heat` as a fifth low-priority text link. Default: omit so the page stays pure snapshot.

### What is removed from current `/command`

- Mission focus panel (`command-mission-*` CTA theater)
- First-run checklist (`command-first-run`)
- System status block (Forge/Analyze dots) on this page
- Pipeline pulse nav (`command-pulse`)
- Tools chip strip (`command-tools`)
- Hero marketing lead (“Clerk → scrub → dial…”) and primary How It Works CTA
- Health-polling-driven mission copy in JS

### What is kept

- `body` shell classes + nav/footer mounts
- Auth guard scripts
- `home-coverage.js` (or equivalent) for real counts
- Title/meta: Dashboard framing is fine (“Phuglee — Dashboard”)
- `shell-nav` Dashboard → `/command`
- Role-gated Contracts visibility behavior

## Files (implementation scope)

| File | Change |
|------|--------|
| `public/command.html` | Rewrite `<main>` content to snapshot layout; drop removed sections |
| `public/css/command-center.css` | Replace mission-board styles with twin-hero + link-row layout |
| `public/js/command-center.js` | Slim: hide shell loading, role-gate Contracts, optional error copy. Remove health poll + mission focus + checklist |

Do **not** change: shell-nav, tokens, home-coverage count logic (except if IDs must move — prefer keep IDs), protected data stores.

## Loading / empty / error

| State | UI |
|-------|-----|
| Loading | `—` in both number slots; links visible |
| Success | Formatted counts (locale string as today) |
| Coverage fail | Numbers stay `—` or show unavailable line; links visible |
| Zero cities | `0` / honest empty footprint |

## Accessibility

- One main landmark; metric region with clear labels (not number-only for screen readers — use associated text or `aria-label` on the metric group)
- Focusable quiet links with visible focus rings (existing a11y CSS)
- Contrast AA on cream/muted over dark earth
- No motion theater; if any fade-in, honor `prefers-reduced-motion`

## Success criteria

1. Opening `/command` answers cities + states live in under ~5 seconds of attention (numbers dominant).
2. No mission board, checklist, pulse, tools strip, or module health block remain on the page.
3. Counts match the same coverage source as before (not static placeholders).
4. Quiet links navigate correctly; Contracts respects role gate.
5. Page feels like Phuglee product home (ops war room tokens), not a second marketing page and not a generic 4-KPI SaaS template.
6. Local ship gate: `scripts\verify-live.ps1` exit 0; UI change also `verify-mobile` scoped to `/command` when implementing.

## Out of scope follow-ups (explicit)

- Deal/funding snapshot strip (user deferred)
- Coverage map or state list (Approaches B/C)
- Mission/recommendation engine return
- Multi-tenant per-user coverage

## Handoff

- **Visual craft:** Impeccable product register + existing `DESIGN.md` / `tokens.css`
- **Implement:** scope-guard → rewrite three files → ship-gate (verify-live + mobile for `/command`)
- **Fair Housing:** N/A for pure coverage counts + nav links (no ranking/geo-targeting UI)
