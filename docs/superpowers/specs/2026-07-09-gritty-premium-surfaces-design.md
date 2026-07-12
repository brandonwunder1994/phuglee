# Design Spec — Gritty Premium Surfaces (5 upgrades)

**Date:** 2026-07-09  
**Product:** Phuglee Distress OS  
**Reference:** Live hero at `/` — Phuglee duck + distressed house  
**Milestone:** M5 / v1.4  

---

## Problem

M3/M4 shipped atmosphere and tokens, but five high-visibility surfaces still read as **generic dark SaaS**: equal feature tiles, empty hubs, macOS-style mockup grids, wireframe “product” previews, and a coverage section that often ends on a loading void.

## Design principle

**The hero is law.** If a section wouldn’t look at home behind the duck and the burned house, redesign it.

Emotional register: *after-hours ops room in a wrecked market* — not *Series A dashboard template*.

## The five targets

### 1. Dashboard → Mission Board
Replace step tile grid + quick-launch grid with a single **ops board**: status strip, next action, pipeline pulse, secondary tools as a slim strip.

### 2. Collect → Clerk Desk
Replace void + two cards with **immediate path to request** + recent/pending signal + coverage context. Title voice: “Hit the Clerk”, not “Request Your Data”.

### 3. Home pipeline → Story strip
Replace three equal monitors with one horizontal **transformation story**: clerk list → scrub → ranked dial, using real-looking dossier UI and optional distress photo proof.

### 4. How It Works → Playbook film
Replace vs-cards + wireframes with hero-matched atmosphere and **real step frames** (reuse home UI preview language or production screenshots), plus one clear CTA per step.

### 5. Coverage + close → Territory hero
Ensure map paints; treat map as the proof object; close with proof line + single fire CTA (not lonely button under empty panel).

## Shared components to prefer

- `premium-bg` / house photo layers (`premium-atmosphere.css`)
- `phuglee-btn` primary/secondary
- `tokens.css` `--phuglee-*`
- Existing coverage map JS (fix reliability, don’t invent new map stack)
- Home UI preview patterns only when **asymmetric** and proof-heavy

## Anti-slop checklist (implementer must pass)

- [ ] No new equal 3-card feature grid
- [ ] No macOS dots as primary chrome
- [ ] No section-eyebrow spam
- [ ] No wireframe bar mockups
- [ ] Contrast OK on photo scrims
- [ ] Feels like same brand as duck hero

## Approval

User requested full plans for all five before execution. Spec + plans = go/no-go gate per phase at execute time.
