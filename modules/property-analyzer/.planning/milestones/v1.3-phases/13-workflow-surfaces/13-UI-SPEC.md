---
phase: 13
slug: workflow-surfaces
status: approved
shadcn_initialized: false
preset: inherits Phase 11 — shadcn zinc dark (warm stone)
created: 2026-06-30
---

# Phase 13 — UI Design Contract

> Workflow surfaces: calm empty state, slim scan progress, hero summary KPIs, toast tier alerts, hidden-by-default scan log. Inherits Phase 11 tokens + Phase 12 shell. No new design system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (inherits `public/css/tokens.css` from Phase 11) |
| Preset | Phase 11 calm stone — **no new colors** |
| Component library | none — native `<dialog>`, existing modal classes |
| Icon library | Existing inline SVG on KPI cards + button SVGs |
| Font (display) | Newsreader 600 — section headings, empty-state title |
| Font (body) | IBM Plex Sans 400/600 — labels, hints, toggle copy |
| Font (mono) | JetBrains Mono 400 — progress counts, log lines, toast meta |

**Phase 13 rule:** Restyle workflow surfaces only (empty, scan, summary, tier toasts, log). Do not touch results toolbar/cards (Phase 14) or modals/review overlay (Phase 15). No new npm UI dependencies.

---

## Spacing Scale

Inherits Phase 11 tokens (`--space-xs` through `--space-3xl`). Workflow-specific usage:

| Token | Value | Workflow usage |
|-------|-------|----------------|
| xs | 4px | Toast internal gap, log line padding |
| sm | 8px | KPI stat row gap, slim scan metric gap |
| md | 16px | Empty state card padding, scan bar padding |
| lg | 24px | Empty state vertical padding, summary section gap |
| xl | 32px | Gap between workflow sections |
| 2xl | 48px | Empty state top/bottom breathing room |

Exceptions: **44px** minimum touch target for "Show scan log" toggle and breakdown expander.

---

## Typography

Inherits Phase 11 scale. Workflow-specific roles (max 4 sizes in this phase):

| Role | Size | Weight | Line Height | Font | Element |
|------|------|--------|-------------|------|---------|
| Body | 14px | 400 | 1.5 | IBM Plex Sans | Empty state body, KPI hints |
| Label | 14px | 600 | 1.4 | IBM Plex Sans | KPI labels, scan metric labels |
| Heading | 20px | 600 | 1.25 | Newsreader | Section titles (Scan, Summary) |
| Display | 28px | 600 | 1.2 | Newsreader | Empty state `h2` only |

**Hierarchy rule:** Empty-state primary CTA is the only filled accent in the empty view. Scan progress heading is quiet (20px), not billboard.

---

## Color

Inherits Phase 11 60/30/10 split. Workflow-specific application:

| Surface | Token | Usage |
|---------|-------|-------|
| Empty workspace card | `--card` | Flat card, `1px solid var(--border)`, dashed border removed |
| Scan progress panel | `--card` | Slim bar container — no HUD neon frame, no sheen |
| Progress bar fill | `--accent` | Single calm fill — no gradient glint |
| KPI hero cards | `--card` | Flat; tier semantic left border or icon color only |
| KPI breakdown (collapsed) | `--muted` bg hint | Subtle expander row, not a second card stack |
| Tier toast | `--card` + tier border token | Bottom-right stack; auto-dismiss |
| Scan log | `--secondary` | Monospace lines on muted surface when expanded |

**Accent reserved for (workflow scope only):**
1. Empty state primary CTA (**Upload spreadsheet**)
2. Progress bar fill during active scan
3. Expandable breakdown chevron focus ring (inherits `--ring`)

**NOT accent in workflow surfaces:** Secondary empty CTA, KPI numbers, tier badge colors (use tier semantics), log toggle, agent expand button.

**Destructive:** `emptyResetDataBtn` stays hidden — if surfaced via ⌘K, uses existing destructive confirmation pattern from Phase 11.

---

## Visual Hierarchy (Phase 13 scope)

**Empty state focal point:** Primary CTA button — only filled accent on screen.

**Empty state eye path:**
1. Heading ("Upload a spreadsheet to start")
2. One-line body hint
3. Primary CTA → secondary link below

**Active scan focal point:** Slim progress bar width — motion draws eye without HUD theater.

**Scan eye path:**
1. Progress bar + percentage (single row)
2. Inline metrics (done / remaining / workers)
3. Collapsed "Live workers" expander (de-emphasized)

**Summary focal point:** Distressed Homes hero KPI — largest numeral, tier-distressed semantic color on icon/border only.

**Summary eye path:**
1. Three hero KPIs (Distressed → Needs Review → Scanned total)
2. "Full breakdown" expander
3. Lead rankings below (Phase 14 scope — unchanged layout)

---

## FLOW-01 — Empty Workspace

### Current → Target

| Current | Target |
|---------|--------|
| 6 visible buttons | **2 visible** + ⌘K hint |
| Dashed copper border, sci-fi copy | Calm card, operational copy |
| Desktop shortcut in body | Remove localhost/desktop references from body |

### Visible actions

| Priority | Button ID | Label | Style |
|----------|-----------|-------|-------|
| Primary | `#emptyUploadBtn` | **Upload spreadsheet** | `btn-primary` (accent fill) |
| Secondary | `#emptyRestoreBackupBtn` | **Restore my last scan** | `btn-secondary` (outline) |

### Hidden (preserve IDs, `hidden` attribute)

| Button ID | Reachable via |
|-----------|---------------|
| `#emptySettingsBtn` | ⌘K → API Keys |
| `#emptySaveBackupBtn` | ⌘K → Download session backup |
| `#emptyLoadBackupBtn` | ⌘K → Load backup JSON |
| `#emptyResetDataBtn` | ⌘K → (add if missing) or overflow |

### Layout

```html
<section class="empty-workspace" id="emptyWorkspace">
  <h2>Upload a spreadsheet to start</h2>
  <p>Excel with address columns. Press <kbd>⌘K</kbd> for backup, settings, and more.</p>
  <div class="empty-workspace-actions">
    <!-- primary + secondary only -->
  </div>
  <p class="empty-workspace-hint">API keys required before scanning — configure in Settings.</p>
</div>
```

- `.empty-workspace-hint` uses `--muted-foreground`, 12px — only shown when API keys missing (existing logic or CSS default hidden).
- Remove inline `color:var(--copper-bright)` from `<code>` elements in body copy.

---

## FLOW-02 — Scan Progress

### Slim inline scan bar

**Remove or hide from visible scan UI:**
- `.hud-scan-live-tag` + blinking dot ("Active Scan" theater)
- `.hud-scan-pct-ring` decorative ring — keep `#progressPct` as inline text beside bar
- `.command-hud-scan::before` sheen overlay
- `.hud-scan-bar-frame::after` glint animation
- Neon gradient on `.progress-bar`

**Keep (functional):**
- `#progressBar`, `#progressPct`
- `#statDone`, `#statRemaining`, `#statWorkersActive`, `#statWorkersSet` (inline metrics row)
- `#failStats` — collapse to single-line summary or hide behind "Issues" toggle (prefer hide when zero)
- Hidden shims: `#statTotal`, `#statBatch`, `#statSuccess`, `#statSkipped`, `#statAvg`

### Target layout (single card, ~120px tall when log collapsed)

```
┌─ Scanning ─────────────────────────────── 42% ─┐
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ Done 84 · Remaining 116 · Workers 3/4  [Workers ▾] │
└──────────────────────────────────────────────────┘
```

| Zone | Contents |
|------|----------|
| Row 1 | `h2` "Scanning" (20px) + `#progressPct` right-aligned |
| Row 2 | Progress bar full width, 6px height, `--accent` fill |
| Row 3 | Metrics inline (`·` separators) + link to expand agent grid |

### Agent grid collapsed by default (FLOW-02)

| Behavior | Contract |
|----------|----------|
| On scan start | `setAgentPanelCollapsed(true)` — **default collapsed** |
| Session override | User expand via `#agentGridCollapseBtn` or ⌘K persists in `sessionStorage` |
| First scan in session | Always start collapsed regardless of prior expand |
| `#agentGridPanel` | Visible when `body.scan-running` but `.collapsed` by default |

**Copy for collapse button:**
- Collapsed: **Show workers**
- Expanded: **Hide workers**

Workers detail remains in `#agentGridBody` — no logic changes to worker rendering.

---

## FLOW-03 — Summary Dashboard

### Hero KPIs (always visible — exactly 3)

| # | Card ID | Label | Why hero |
|---|---------|-------|----------|
| 1 | `#sumDistressedKpiCard` | **Distressed Homes** | Primary outreach metric |
| 2 | `#sumReviewCard` | **Needs Review** | Requires human judgment |
| 3 | `#sumScannedHeroCard` | **Scanned** | Pipeline trust — total processed |

**`#sumScannedHeroCard`:** New wrapper allowed OR repurpose visible slot — display `#statTotal` value (synced from existing `updateSummary` logic). If new DOM needed:

```html
<div class="summary-kpi-card summary-hero-kpi" id="sumScannedHeroCard">
  <div class="summary-val" id="sumScannedHero">0</div>
  <div class="summary-lbl">Scanned</div>
  <div class="summary-hint">Properties analyzed this session</div>
</div>
```

Keep `#statTotal` hidden shim for JS compatibility; `#sumScannedHero` mirrors its value.

### Secondary breakdown (collapsed by default)

Wrap in `#summaryBreakdown` container:

| Card ID | Label |
|---------|-------|
| `#sumWellMaintainedCard` | Well Maintained |
| `#sumVacantCard` | Vacant Lot/Land |
| `#sumBlurredCard` | Blurred Imagery |

Plus `#summaryPipeline` (List Composition track) inside breakdown.

**Expander control:**

```html
<button type="button" class="summary-breakdown-toggle" id="summaryBreakdownToggle"
  aria-expanded="false" aria-controls="summaryBreakdown">
  Full breakdown <span class="sidebar-chevron" aria-hidden="true">▾</span>
</button>
```

- Default: `aria-expanded="false"`, `#summaryBreakdown` hidden
- Persist preference in `sessionStorage` key `distressAnalyzerSummaryBreakdownOpen`

### Summary chrome cleanup

| Remove/rename | Replacement |
|---------------|-------------|
| `.command-dash-tag` "Intelligence Brief" | Remove element or hide |
| `#summaryIntro` sci-fi copy | **"Lead counts by tier — click a card to filter."** |
| `#summarySection` HUD panel glow | Flat `--card` (inherits Phase 11 glass flattening) |

**KPI card styling:** Flat card, tier semantic color on icon only (no gradient KPI backgrounds). Hero row uses CSS grid `1fr 1fr 1fr` at ≥1024px; stacks at mobile.

---

## FLOW-04 — Tier Alert Toasts

### Current state

`pushLiveTierAlert()` in `review.js` is **disabled** (`return;` at function top). `#liveTierAlertStack` is a fixed top-right persistent card stack.

### Target: subtle toast pattern

| Property | Value |
|----------|-------|
| Container | Reuse `#liveTierAlertStack` repositioned to **bottom-right** above `#persistToastStack` / `#cmdToastStack` |
| Max visible | **1 toast at a time** (replace previous, don't stack 5 cards) |
| Lifetime | **4 seconds** auto-dismiss (keep `TIER_ALERT_LIFETIME_MS` or set 4000) |
| Animation | 150ms fade in, 200ms fade out — no slide stack |
| Pointer | `pointer-events: none` (informational only) |
| Content | `{tier label} · {street address}` — drop "Categorized" uppercase theater |

**Re-enable** `pushLiveTierAlert` with toast behavior:
- Remove early `return;`
- Clear stack before append (single toast mode) OR cap at 1 child
- Use calm tier border token per tier (existing `data-tier` rules)

**Hide persistent stack styling:** Remove `max-height` card stack appearance; each toast is a single slim pill:

```
┌─────────────────────────────┐
│ Distressed · 142 Oak St     │
└─────────────────────────────┘
```

---

## FLOW-05 — Scan Log Panel

### Target

| State | Behavior |
|-------|----------|
| Default | `#logPanel` **hidden** (`display: none` or `hidden` attribute) |
| Expanded | User clicks `#scanLogToggle` → reveals log, `aria-expanded="true"` |
| During scan | Log still appends in background (no behavior change to `appendLog`) |

**Toggle button** (inside `#progressSection`, below metrics row):

```html
<button type="button" class="scan-log-toggle" id="scanLogToggle"
  aria-expanded="false" aria-controls="logPanel">
  Show scan log
</button>
```

- Expanded label: **Hide scan log**
- Log panel max-height when open: **200px**, scrollable, `--font-mono` 12px
- Do not auto-expand on errors — user opts in (power-user feature)

---

## Copywriting Contract

Inherits Phase 11 + Phase 12 tone. Phase 13 workflow copy:

| Element | Copy |
|---------|------|
| Empty heading | **Upload a spreadsheet to start** |
| Empty body | **Excel with address columns. Press ⌘K for backup, settings, and more.** |
| Primary CTA | **Upload spreadsheet** |
| Secondary CTA | **Restore my last scan** |
| API keys hint | **API keys required before scanning — open Settings to configure.** |
| Scan section title | **Scanning** (not "Scanning Properties" / "Active Scan") |
| Agent grid collapsed | **Show workers** |
| Agent grid expanded | **Hide workers** |
| Summary title | **Scan Summary** |
| Summary intro | **Lead counts by tier — click a card to filter.** |
| Breakdown toggle (closed) | **Full breakdown** |
| Breakdown toggle (open) | **Hide breakdown** |
| Log toggle (closed) | **Show scan log** |
| Log toggle (open) | **Hide scan log** |
| Tier toast | **{Tier label} · {address}** (e.g. "Distressed · 142 Oak St") |
| Hero KPI: Scanned | **Scanned** / hint: **Properties analyzed this session** |
| Error (scan failed) | **Scan stopped — check API keys and rate limits. Press ⌘K for Settings.** |

**Tone:** Operational, calm. No "Intelligence Brief", "HUD", "Active Scan" live tags, or uppercase mono labels in workflow surfaces.

---

## Motion

Inherits Phase 11. Phase 13 additions:

| Allowed | Removed |
|---------|---------|
| Progress bar width transition (300ms ease) | `hud-scan-live-dot` blink |
| Breakdown expand (150ms height/opacity) | Progress bar sheen/glint (`::after` animations) |
| Toast fade in/out (150ms / 200ms) | KPI card hover glow |
| Log panel expand (150ms max-height) | Tier alert stack pile-up animation |

`prefers-reduced-motion: reduce` disables all of the above.

---

## DOM ID Preservation (critical)

**Do not rename or remove these IDs** (JS coupling):

```
emptyWorkspace, emptyUploadBtn, emptySettingsBtn, emptyRestoreBackupBtn,
emptySaveBackupBtn, emptyLoadBackupBtn, emptyResetDataBtn,
progressSection, progressBar, progressPct, statDone, statRemaining,
statWorkersActive, statWorkersSet, statTotal, statBatch, statSuccess,
statSkipped, statAvg, failStats, failSvCount, failGemCount, logPanel,
agentGridPanel, agentGridCollapseBtn, agentGridBody, agentGrid, agentGridSub,
agentWorkerSummary, liveTierAlertStack,
summarySection, summaryIntro, summaryPipeline, summaryPipelineTrack,
sumDistressedKpiCard, sumDistressedKpi, sumDistressedKpiPct, sumDistressedKpiHint,
sumReviewCard, sumReview, sumReviewPct,
sumWellMaintainedCard, sumWellMaintained, sumWellMaintainedPct,
sumVacantCard, sumVacant, sumVacantPct,
sumBlurredCard, sumBlurred, sumBlurredPct
```

**New IDs allowed:**
`summaryBreakdown`, `summaryBreakdownToggle`, `sumScannedHeroCard`, `sumScannedHero`, `scanLogToggle`

---

## Progressive Disclosure Map (Phase 13)

| Action | Primary path | Fallback |
|--------|--------------|----------|
| Upload spreadsheet | Empty state primary CTA | ⌘K → Upload spreadsheet |
| Restore last scan | Empty state secondary CTA | ⌘K (if added) |
| API Keys | ⌘K | Overflow → Settings |
| Backup save/load | ⌘K | Overflow (Phase 12) |
| Live workers detail | Scan row "Show workers" | ⌘K → Expand live workers |
| Full tier breakdown | Summary "Full breakdown" | — |
| Scan log | "Show scan log" toggle | — |
| Tier categorization alert | Toast (auto-dismiss) | — |

---

## Phase 13 Deliverables Checklist

Executor must produce:

1. `index.html` — Empty state 2-button layout; slim scan structure; summary hero/breakdown split; log toggle; optional scanned hero card
2. `app.css` — Calm empty/scan/summary/toast/log styles; remove HUD scan chrome; bottom-right toast positioning
3. `session.js` / `app.js` — Default agent collapsed on scan start; breakdown toggle; log toggle
4. `review.js` — Re-enable tier toast (single-toast mode)
5. `render.js` — Sync `#sumScannedHero` from totals; update summary intro copy if JS-driven
6. **No save/tier/backup/review-mode logic changes** beyond UI wiring
7. `npm test` passes (78 tests)

**Out of scope (Phase 14+):** Results toolbar, filter pills, lead cards, bulk edit, modals, review overlay visuals.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| Third-party | none | not applicable |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — specific CTAs (Upload spreadsheet, Restore my last scan); empty/scan/summary copy declared; error path included
- [x] Dimension 2 Visuals: PASS — focal points per surface; hierarchy eye paths; icon-only toggles have text labels
- [x] Dimension 3 Color: PASS — inherits 60/30/10; accent list explicit; tier semantics separate from accent; destructive on reset
- [x] Dimension 4 Typography: PASS — 4 roles (14/14/20/28); weights 400+600 only
- [x] Dimension 5 Spacing: PASS — 4px grid; 44px touch exception declared
- [x] Dimension 6 Registry Safety: PASS — no third-party registries

**Approval:** approved 2026-06-30

## UI-SPEC COMPLETE