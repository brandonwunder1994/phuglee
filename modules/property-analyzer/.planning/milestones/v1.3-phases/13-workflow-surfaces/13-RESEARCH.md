# Phase 13: Workflow Surfaces - Research

**Researched:** 2026-06-30
**Domain:** Vanilla HTML/CSS/JS workflow surface refactor (empty, scan, summary, toasts, log)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists.** Design contract is locked in `13-UI-SPEC.md` (approved 2026-06-30). All workflow decisions below are NON-NEGOTIABLE per UI-SPEC.

### Locked Decisions (from 13-UI-SPEC.md)
- FLOW-01: Empty state shows 2 visible buttons (`#emptyUploadBtn`, `#emptyRestoreBackupBtn`); hide settings/backup/reset; operational copy + ⌘K hint
- FLOW-02: Slim scan bar (~120px collapsed); remove HUD theater; agent grid collapsed by default on scan start
- FLOW-03: Summary shows 3 hero KPIs (Distressed, Needs Review, Scanned); secondary buckets in collapsible `#summaryBreakdown`
- FLOW-04: Re-enable `pushLiveTierAlert` as single bottom-right toast (4s auto-dismiss)
- FLOW-05: `#logPanel` hidden by default; `#scanLogToggle` reveals it
- Preserve all listed DOM IDs — no renames; new IDs allowed: `summaryBreakdown`, `summaryBreakdownToggle`, `sumScannedHeroCard`, `sumScannedHero`, `scanLogToggle`
- No save/tier/backup/review-mode logic changes; `npm test` must pass (78 tests)
- No new npm UI dependencies; inherit Phase 11 tokens + Phase 12 shell

### Claude's Discretion
- Whether to hide `#failStats` with `hidden` attribute vs CSS when counts are zero (UI-SPEC prefers hide when zero)
- Exact CSS selector strategy for disabling HUD animations outside `body.legacy-hud` (override vs remove rules)
- Whether `buildSummaryIntro` dynamic text stays alongside static default in HTML (UI-SPEC sets static intro; JS may override during scan)

### Deferred Ideas (OUT OF SCOPE)
- Results toolbar, filter pills, lead cards, bulk edit (Phase 14)
- Modal polish, review overlay visuals (Phase 15)
</user_constraints>

<research_summary>
## Summary

Phase 13 is a **DOM restructure + CSS calm reskin + targeted JS wiring** on workflow surfaces between Phase 12 shell and Phase 14 results. No new libraries. The codebase already has the primitives: `setAgentPanelCollapsed` / `isAgentPanelCollapsed` in `session.js`, tier alert stack DOM + disabled `pushLiveTierAlert` in `review.js`, `updateSummaryStats` in `session.js`, and extensive HUD scan CSS in `app.css` (~3816–4047).

**Key finding:** Most risk is ID preservation and not breaking scan/save flows. HTML changes are localized to `index.html` lines 140–280. JS changes are additive toggles + re-enabling toast function + default collapse on scan start in `app.js` after `updateScanRunningUi()`.

**Primary recommendation:** Three-plan wave structure — (1) HTML restructure, (2) CSS calm workflow styles in parallel with (3) JS wiring + toast re-enable. Run `npm test` after plan 03.
</research_summary>

<standard_stack>
## Standard Stack

### Core (already in project)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Vanilla HTML/CSS/JS | — | Workflow surfaces | Project constraint |
| `tokens.css` | Phase 11 | Calm design tokens | Palette source |
| `app.css` | ~6,600 lines | Legacy + workflow styles | Incremental migration |
| Node test runner | `npm test` | 78 unit tests | QA-01 gate |

### Supporting patterns (existing code)
| Pattern | Location | Use in Phase 13 |
|---------|----------|-----------------|
| Agent panel collapse | `session.js` `setAgentPanelCollapsed` | Default collapsed on scan start (FLOW-02) |
| Session storage prefs | `AGENT_PANEL_COLLAPSED_KEY` | Add `distressAnalyzerSummaryBreakdownOpen` |
| Tier alert stack | `review.js` `pushLiveTierAlert` | Re-enable with single-toast mode (FLOW-04) |
| Summary stats | `session.js` `updateSummaryStats` | Sync `#sumScannedHero`, hero/breakdown visibility |
| Progress update | `render.js` `updateProgress` | Unchanged; `#statTotal` shim preserved |

**No new installations required.**
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Current workflow structure (`index.html`)
```
#emptyWorkspace — 6 visible buttons, dashed border, desktop/localhost copy
#progressSection.command-hud-scan — HUD live tag, pct ring, sheen bar, metrics grid, visible #logPanel
#agentGridPanel — expanded by default (aria-expanded=true)
#summarySection — Intelligence Brief tag, 5 KPI cards + pipeline always visible
#liveTierAlertStack — top-right, pushLiveTierAlert disabled
```

### Target workflow structure (13-UI-SPEC)
```
#emptyWorkspace — 2 visible CTAs + hint; 4 buttons hidden
#progressSection — slim 3-row layout; #scanLogToggle; #logPanel hidden
#agentGridPanel — collapsed on scan start; button copy Show/Hide workers
#summarySection — 3 hero KPIs + #summaryBreakdownToggle + collapsed breakdown
#liveTierAlertStack — bottom-right single toast, 4s dismiss
```

### Pattern 1: Hide, don't delete
**What:** Add `hidden` attribute to demoted empty-state buttons and HUD decorative elements.
**Why:** `config.js` refs and click delegation bind by ID.
**Example:** Keep `id="emptySettingsBtn"` with `hidden`.

### Pattern 2: Collapse toggles (new)
**What:** Mirror `agentGridCollapseBtn` pattern for `#summaryBreakdownToggle` and `#scanLogToggle`.
**JS location:** `app.js` `initAppShell()` or `session.js` init block.
**Storage:** `sessionStorage` key `distressAnalyzerSummaryBreakdownOpen` for breakdown only; log toggle session-only OK.

### Pattern 3: Default agent collapsed on scan start
**What:** In `app.js` start handler (~line 1011), after `updateScanRunningUi()`, call `setAgentPanelCollapsed(true)`.
**Note:** UI-SPEC says first scan in session always collapsed; sessionStorage override applies only when user expands via button/⌘K during an active scan. Current `isAgentPanelCollapsed()` reads storage unconditionally — on scan start, force `true` then apply.

### Pattern 4: Single-toast tier alerts
**Current:** `pushLiveTierAlert` has `return;` at line 625; builds multi-line card with "Categorized" label.
**Target:**
```javascript
clearLiveTierAlertStack();
// append single slim toast: `${tierLabel} · ${addr}`
liveTierAlertStack.hidden = false;
```
Set `MAX_TIER_ALERT_STACK = 1`, `TIER_ALERT_LIFETIME_MS = 4000` in `config.js`.

### Pattern 5: Hero KPI grid reorder
**What:** Move `#sumDistressedKpiCard`, `#sumReviewCard`, new `#sumScannedHeroCard` into `.summary-hero-row`; wrap secondary cards + `#summaryPipeline` in `#summaryBreakdown`.
**CSS:** `.summary-hero-row { display:grid; grid-template-columns: repeat(3, 1fr); }` at ≥1024px.
</architecture_patterns>

<codebase_findings>
## Codebase Findings

### Files to modify
| File | Lines of interest | Change scope |
|------|-------------------|--------------|
| `public/index.html` | 140–280 | Empty, scan, summary DOM |
| `public/css/app.css` | 138–268, 3725–3800, 3816–4047, 5260–5286 | Toast position, KPI grid, HUD scan, empty state |
| `public/js/app.js` | 990–1015, 1320–1340 | Scan-start collapse, toggle listeners |
| `public/js/session.js` | 245–300, 488–513 | Summary hero sync, collapse button copy |
| `public/js/review.js` | 624–660 | Re-enable toast |
| `public/js/config.js` | 706–707 | Toast constants |

### HUD scan CSS to calm (app.css ~3816)
- `.command-hud-scan::before` sheen overlay — hide by default (keep under `body.legacy-hud`)
- `.hud-scan-live-tag`, `.hud-scan-live-dot` — `display:none` unless legacy-hud
- `.hud-scan-pct-ring` decorative ring — hide; keep `#progressPct` inline
- `.hud-scan-bar-frame::after` glint — hide unless legacy-hud
- `.command-hud-scan .progress-bar` gradient — single `--accent` fill

### Empty state current (index.html 140–150)
- 6 buttons visible; primary label "Choose Excel File" → **Upload spreadsheet**
- Body references desktop shortcut and localhost — remove per FLOW-01

### Summary intro
- HTML `#summaryIntro`: sci-fi copy
- JS `buildSummaryIntro()` overrides during active scan — keep function; update empty-state default in HTML to UI-SPEC copy

### Agent collapse button copy (session.js 500–501)
- Current: `'Expand workers'` / `'Collapse'`
- Target: `'Show workers'` / `'Hide workers'`

### Tier alert stack CSS (app.css 138)
- `top: 2.75rem; right: 1.5rem` → `bottom: 5rem; right: 1.5rem` (above toast stacks)
- `flex-direction: column` with max 1 child — slim pill styling
</codebase_findings>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Breaking ID coupling
**What goes wrong:** Upload, backup restore, KPI filter clicks stop working.
**Why:** `config.js` binds 40+ element refs by ID.
**How to avoid:** Grep UI-SPEC ID list before/after HTML edit.

### Pitfall 2: Accidentally changing tier/save logic
**What goes wrong:** QA-02 regression.
**Why:** Temptation to refactor `updateSummaryStats` or scan loop.
**How to avoid:** Only add DOM sync lines; no changes to `getTierCounts`, save hooks, or review mode.

### Pitfall 3: Toast blocks interaction
**What goes wrong:** Toast captures clicks over results.
**Why:** Missing `pointer-events: none`.
**How to avoid:** UI-SPEC requires `pointer-events: none` on stack.

### Pitfall 4: Log panel breaks scroll during scan
**What goes wrong:** Layout jump when log hidden but `appendLog` runs.
**Why:** `display:none` on `#logPanel` is fine — appendLog still works; just ensure toggle doesn't remove element.

### Pitfall 5: Hero KPI shows wrong count
**What goes wrong:** Scanned shows spreadsheet row count not analyzed count.
**Why:** `#statTotal` in `updateProgress` tracks `state.records.length`.
**How to avoid:** Sync `#sumScannedHero` from `getSummaryMetrics().total` (`state.results.length`) in `updateSummaryStats`.
</common_pitfalls>

## Validation Architecture

### Test infrastructure
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` |
| Config | `package.json` → `"test": "node --test tests/"` |
| Quick run | `npm test` |
| Full suite | `npm test` (78 tests, ~10s) |
| Estimated runtime | ~10 seconds |

### Automated verification per requirement
| Requirement | Automated command | Notes |
|-------------|-------------------|-------|
| QA-01 | `npm test` | Must pass after plan 03 |
| QA-04 | grep ID preservation | UI-SPEC ID list in index.html |
| FLOW-01 | grep `emptyUploadBtn` + `Upload spreadsheet` | 2-button empty state |
| FLOW-02 | grep `scan-log-toggle` OR `Show workers` | Slim scan + collapse copy |
| FLOW-03 | grep `summaryBreakdownToggle` + `sumScannedHeroCard` | Hero/breakdown split |
| FLOW-04 | grep -v `return; /* live scan` in review.js | Toast re-enabled |
| FLOW-05 | grep `scanLogToggle` + hidden logPanel | Log toggle |

### Manual-only verifications
| Behavior | Why manual | Steps |
|----------|------------|-------|
| Empty state calm card at 1280px | Visual | No dashed border; 2 buttons; accent only on primary |
| Scan bar ~120px collapsed | Visual | No live tag blink; progress bar 6px accent fill |
| Tier toast bottom-right | Interaction | Start scan; verify single toast fades in 4s |
| Breakdown/log toggles | Interaction | Expand/collapse; sessionStorage persists breakdown |

### Wave 0 requirements
**None** — existing 78-test suite covers backend; workflow changes are HTML/CSS/JS with grep checks.

### Sampling rate
- After every task: grep verify commands
- After plan 03: `npm test`
- Max feedback latency: 15 seconds

## RESEARCH COMPLETE

**Ready for planning:** yes
**Primary recommendation:** 3 plans — HTML (wave 1), CSS + JS (wave 2 parallel)