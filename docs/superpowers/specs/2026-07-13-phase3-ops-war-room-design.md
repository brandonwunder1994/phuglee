# Phase 3 — Whole-Site Ops War Room Visual Pass

**Date:** 2026-07-13  
**Direction:** 1 — Gritty field ops / war room (user confirmed)  
**Scope:** Entire Distress OS — visual + honest UX only. **No** scoring, bucket, brain, or data logic changes.  
**Tools:** Impeccable v3.9.1 installed (`.cursor/skills/impeccable/`), Superpowers for planning/verification  
**Impeccable context:** `PRODUCT.md`, `DESIGN.md` at repo root

---

## Plain-language goal

Make the **whole house** look like one badass ops war room — not six different AI websites. Filter is the template. Analyze loses the cyber junk. Vault stops pretending to be real data. Every page shares the same fonts, colors, and buttons.

**Not in Phase 3:** real paid multi-user login (that's Phase 4 when you sell). Phase 3 may add honest "coming soon" labels and prep work only.

---

## Success criteria (how we know Phase 3 is done)

| Check | Target |
|-------|--------|
| Impeccable `critique` on Analyze | ≥ 30/40 (was 22/40) |
| `detect.mjs` on each shipped surface | Zero P0 slop families (gradient-text, side-stripe, numbered eyebrows on every section) |
| CSS stack per page | ≤ 8 stylesheets after consolidate pass |
| Cyber CSS on Analyze | Removed from load order |
| Vault | Clear "Coming soon / Max plan" — mock data labeled or hidden |
| Operator feel | User confirms: "feels like one product" |

---

## What “Ops War Room” means here

- **Dark earth** backgrounds, not gray SaaS
- **Cream Anton** headlines, left-aligned
- **Ember/gold** only on actions and proof (scan progress, kill counts, CTAs)
- **Real proof** (your property photos, heat scores) — not fake dashboards
- **Filter desk energy** everywhere tools are used
- **Less decoration**, more authority (`distill` + `quieter`)

**Anchor references:** Filter scrub desk (in-repo), gritty ops tools (Linear density without looking like Linear), field-research aesthetic — not cyberpunk, not Notion pastel.

---

## Whole-site inventory (every room)

### Shell (shared)

| Surface | Path | Phase 3 work |
|---------|------|----------------|
| Nav + footer | `shell-nav.js`, `shell.css` | Unify labels, spacing, active states |
| Sign-in modal | `public/index.html` auth | Match app chrome after login |
| Command palette | `command-palette.js` | Token alignment |
| Status bar | `distress-status.js` | Quieter, less noise |

### Marketing / hub

| Surface | Path | Phase 3 work |
|---------|------|----------------|
| Home | `/` | `distill` hero, cut duplicate sections, fix em-dash slop, reduce CSS layers |
| How It Works | `/heat` | Merge story overlap with Dashboard guide or demote duplicate |
| Dashboard | `/command` | Mission board hierarchy, pipeline strip, match Filter tokens |
| Vault | `/vault` | Honest coming-soon; remove deceptive mock-as-product |

### Pipeline tools

| Surface | Path | Phase 3 work |
|---------|------|----------------|
| Collect | `/collect` | Desk layout parity with Filter; city picker polish |
| Filter | `/bridge` | **Reference** — light `polish` only, no behavior change |
| Analyze | `/analyzer/` | **Biggest pass** — remove cyber, scan-desk first paint, dossier modal |
| Forge (×7) | `/forge/*` | Align nav, buttons, type with shell (`phuglee-forge.css` pass) |

---

## Execution waves (order matters)

### Wave 0 — Baseline (no visual edits yet)

- [ ] Run `detect.mjs` on all HTML entry points; save report under `.impeccable/critique/`
- [ ] Run `critique` on Analyze, Home, Dashboard, Filter (record scores)
- [ ] Snapshot key pages (screenshots for before/after)

### Wave 1 — Design system lock

- [ ] `extract` shared patterns into documented token usage (buttons, headings, panels)
- [ ] Create `public/css/phuglee-shell.css` (or extend `phuglee-components.css`) as **single app chrome layer**
- [ ] Standard page `<head>` block: tokens → glass → shell → one page CSS (max)

### Wave 2 — Analyze (highest slop / highest impact)

Impeccable sequence: `distill` → `layout` → `quieter` → `polish` → `critique`

- [ ] Remove `cyber-theme.css`, `cyber-ultra.css`, `cyber-modals.css`, `cyber-review.css`, `cyber-data.css`, `cyber-polish.css` from `index.html`
- [ ] Remove `cyber-theme` body class; keep `analyze-phuglee` + heat tokens only
- [ ] First paint = Upload → Scan → 4 buckets (already partially built; finish IA)
- [ ] Property modal = cinematic dossier only (no HUD chrome)
- [ ] Fix UTF-8 mojibake in titles/meta
- [ ] Action row: one primary (Start Scan), secondary grouped in overflow
- [ ] Re-run critique — target ≥ 30/40

### Wave 3 — Shell app pages

Impeccable: `layout` + `typeset` + `polish` per page

- [ ] Dashboard `/command`
- [ ] Collect `/collect`
- [ ] Vault `/vault` (honest labeling)
- [ ] Heat `/heat` (trim or merge with guide)

### Wave 4 — Home (brand within system)

Impeccable: `distill` + `bolder` (selective) + `polish`

- [ ] Cut numbered section markers 01/02/03 (detect flagged)
- [ ] Reduce em-dash density in copy
- [ ] Fewer CSS layers; keep territory map + property carousel as proof
- [ ] Sign-in → Dashboard transition feels continuous

### Wave 5 — Form Forge alignment

- [ ] Pass `polish` on 7 forge pages — nav, headings, primary buttons match shell
- [ ] Remove dead `premium-forge.css` references if any remain

### Wave 6 — Ship gate

- [ ] `audit` accessibility + contrast on dark surfaces
- [ ] `detect.mjs` full `public/` + `modules/property-analyzer/public/`
- [ ] `verify-live.ps1` green
- [ ] User walkthrough: Home → sign in → Collect → Filter → Analyze → Forge

---

## Impeccable + Superpowers workflow

| Tool | Role in Phase 3 |
|------|-----------------|
| **Impeccable `distill`** | Strip Analyze cyber + Home clutter |
| **Impeccable `quieter`** | Tone down glows, redundant KPI boards |
| **Impeccable `layout`** | Desk hierarchy on Collect, Dashboard, Analyze |
| **Impeccable `typeset`** | Anton/Outfit consistency, kill em-dash slop |
| **Impeccable `polish`** | Final alignment pass per surface |
| **Impeccable `detect`** | CI-style slop gate (46 rules) |
| **Impeccable `critique`** | Score before/after |
| **Impeccable `live`** | Optional: iterate variants in browser with dev server |
| **Superpowers brainstorming** | This spec (approved before code) |
| **Superpowers verification** | `verify-live` + tests after each wave |

**Installed:** `.cursor/skills/impeccable/` (project) — run `npx impeccable update` periodically.

**Superpowers (obra):** Already available in Cursor (brainstorming, debugging, plans). Used for Phase 1–2; continues for Phase 3 execution discipline.

---

## Hard rules (non-negotiable)

1. **Do not change** Filter brain rules, Analyze tier scoring, scan queue logic, or saved lists/sessions.
2. **Do not delete** operator data (sessions, filter lists, forge city data).
3. **CSS/HTML/JS presentation only** unless explicitly labeled "Phase 4 prep."
4. Every wave ends with server verify + hard-refresh note for user.
5. Backup before touching Analyze session paths (already done for Phase 2).

---

## Phase 4 preview (NOT Phase 3 — for later)

When you sell access:

- Real accounts (not browser localStorage admin)
- Per-customer data isolation
- Vault becomes real or stays gated
- Stripe/plan tiers

Phase 3 may add a visible **"Accounts coming soon"** note in settings — no fake security theater.

---

## User approval

- [x] Direction: Ops War Room (#1)
- [x] Scope: Whole site visual pass
- [x] Impeccable installed before plan
- [ ] User confirms this spec → then Wave 0 begins

**Reply "approved — start Wave 1"** (or "start with Analyze") to begin execution. No code changes until you confirm.
