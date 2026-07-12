# Phase 32 — Dashboard Ops Desk (REVISED)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Checkbox steps for tracking.

**GSD:** `/gsd:execute-phase 32`

**Goal:** Replace the SaaS tile launcher with a **live ops desk** — status-driven mission, pipeline pulse, compact tools. Same grit world as the duck hero. Not cosplay: mission text reacts to Forge/Analyzer health + coverage counts.

**Architecture:** Restructure `command.html`; CSS in `command-center.css`; extend `command-center.js` with `updateMissionFocus()` after health + coverage. Preserve all status DOM IDs.

**Tech:** Vanilla HTML/CSS/JS, existing `/api/health`, `home-coverage` count patterns if present on page.

---

## Quality bar (must pass)

| Pass | Fail |
|------|------|
| One dominant mission panel + status stack | Three equal step tiles |
| Mission CTA href/copy changes when Forge/Analyzer offline | Static “Hit the Clerk” forever only |
| Pipeline as connected pulse (links) | Second grid of 4 equal tool cards |
| Tool links as chip/strip | Icon+title+desc card farm |
| Feels like ops after-hours | Feels like Notion/Linear dark template |

---

## Target layout

```
MISSION BOARD
Ops one-liner · [How it works] ghost

┌─ MISSION (dominant) ─────────────┐  ┌─ STATUS ────────────┐
│ RECOMMENDED                      │  │ 560 cities · 10 st  │
│ HIT THE CLERK / SCRUB / …        │  │ Forge · Online/Off  │
│ Why (from live rules)            │  │ Analyze · Online/Off│
│ [ Primary CTA ]                  │  └─────────────────────┘
└──────────────────────────────────┘
PIPELINE  Hit Clerk ── Scrub ── Rank & Dial
TOOLS     Tracker · Coverage · PDF · Playbook   (strip)
```

### Mission rules (JS)

```
default → Collect / Hit the Clerk / "Pull fresh lists at the clerk."
if forge offline → still Collect primary; note "Request tooling offline — tracker may fail"
if analyzer offline → Collect primary; note "Analyze offline — you can still collect & filter"
if both up → Collect primary with coverage: "X cities live — hit the clerk first."
```

Optional later: pending requests count — **out of scope** if no API; do not fake.

---

## Files

- `public/command.html`
- `public/css/command-center.css`
- `public/js/command-center.js`

---

## Tasks

### Task 1: HTML ops desk
- [ ] Rewrite hub: hero → mission+status → pulse → tool strip
- [ ] Keep IDs: `command-city-count`, `command-state-count`, `command-forge-*`, `command-analyzer-*`, `btn-how-it-works-dashboard`, `btn-how-it-works-quick`
- [ ] Add: `#command-mission-title`, `#command-mission-desc`, `#command-mission-cta`

### Task 2: CSS grit
- [ ] Asymmetric mission grid; no step-tile / quick-card grids
- [ ] Pulse as connected bar; tools as horizontal chips
- [ ] Hairline warm borders; no thick left stripe cliché
- [ ] Solid cream titles preferred; if gradient title retained, keep brand-consistent only on H1

### Task 3: Live mission JS
- [ ] After health poll + coverage numbers, call `updateMissionFocus`
- [ ] Never wipe status ID nodes with innerHTML

### Task 4: Verify
- [ ] `npm test`
- [ ] 1440/390 screenshots
- [ ] Toggle offline simulation if possible (devtools offline on health)
- [ ] Commit: `feat(command): live ops desk replaces SaaS tile launcher`

---

## Done when
Dashboard is an **ops desk with live mission logic**, not a rearranged card grid.
