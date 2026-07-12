# Task 3 Report — Wire visibility + auto workbench flag (distill IA)

**Status:** DONE  
**Branch:** `feat/analyze-page-redesign`  
**Worktree:** `C:\Users\brand\Projects\distress-os\.worktrees\analyze-page-redesign`

## Summary

Wired the pure `getAnalyzeZones` matrix (Task 1) into the Analyze UI so first paint is scan-desk-first: no empty Session KPIs, no rankings workbench, past markets demoted to a closed `<details>` control. Session restore with results auto-opens the workbench.

## Browser load discovery

`location-index.js` is already served via allowlisted static route:

- `modules/property-analyzer/routes/static.js` → `GET /lib/<name>` with `LIB_ALLOWLIST`
- Script tag in `public/index.html`: `/lib/location-index.js`

**Choice:** same pattern for Task 1–2 libs (no `public/js/analyze-ui.js` duplicate).

- Added `analyze-visibility.js` and `tier-labels.js` to `LIB_ALLOWLIST`
- Added deferred script tags after `location-index.js`
- Browser exposes `PDA.lib.analyzeVisibility.getAnalyzeZones` and `PDA.lib.tierLabels.tierUiLabel`
- Tests continue to `require('../lib/…')` as source of truth

## Changes

| File | Change |
|------|--------|
| `routes/static.js` | Allowlist `analyze-visibility.js`, `tier-labels.js` |
| `public/index.html` | `id="analyzePipeline"`; `#openResultsWorkbenchBtn`; FOUC `hidden` on `#summarySection` / `#dashboard`; lib + cache-bust scripts |
| `public/js/config.js` | `state.resultsWorkbenchOpen`, `state.pastMarketsOpen` defaults |
| `public/js/scan-ready.js` | `applyAnalyzeVisibility()`, Work results click, called from `updateScanReadyUi` |
| `public/js/session.js` | End of `updateSummaryStats` calls `applyAnalyzeVisibility`; no longer forces KPI strip visible |
| `public/js/state.js` | Auto `resultsWorkbenchOpen = true` on session restore / prime when results exist; clear on `clearSession` |
| `public/js/location-hub.js` | Stop owning `#dashboard` / hub hide; past markets `toggle` → `pastMarketsOpen`; open workbench when market selected; local KPIs only when workbench open |
| `public/js/render.js` | `enterReviewMode` sets `resultsWorkbenchOpen = true` + `applyAnalyzeVisibility` |

### `applyAnalyzeVisibility` call sites

- End of `updateScanReadyUi` (scan start/stop already call this)
- End of `updateSummaryStats` (session KPI refresh)
- `updateLocationHubUi`
- Work results button click
- Past markets details toggle
- `enterReviewMode`

### Work results button

Shown when `hasResults && !resultsWorkbenchOpen && !running`. Click sets `resultsWorkbenchOpen = true`, re-applies matrix, renders results, scrolls to dashboard.

### hasResults input (wiring)

Pure helper stays pure. Wiring treats results as present if any of:

- `state.results.length > 0`
- `sessionLoadState.total > 0`
- `state._tierCountsFromServer.all|total > 0`

so progressive/server-primed sessions still show KPIs + workbench correctly.

## Tests

```text
node --test tests/analyze-visibility.test.js tests/tier-labels.test.js
→ 8/8 pass

npm test (modules/property-analyzer)
→ 234/234 pass
```

## Manual checks (integration — not automated)

1. Empty `/analyzer/` → no Session buckets strip, no Rankings workbench; scan desk + pipeline visible; past markets control present but collapsed.
2. Session with results → KPIs + workbench visible (`resultsWorkbenchOpen` auto true).
3. Start scan → live section on; workbench hidden while `running`.
4. After scan → `enterReviewMode` opens workbench.
5. Close workbench path: only via flag (no close UI this task); Work results re-opens when flag false.
6. Past markets details open/close toggles expanded vs control mode.

## Concerns / follow-ups

1. **No close-workbench control** — only open via restore / Work results / location pick / enterReviewMode. Task 4 may add desk action-row cleanup.
2. **Past markets always unhidden in control mode** — matrix never returns `hidden`; empty session still shows collapsed historical control. May want `hidden` when no geo/results in a later polish.
3. **tier-labels loaded but unused in UI chrome** — available for Task 4+ label renames; not wired into filter buttons yet (out of scope).
4. **Encoding trap** — PowerShell `Set-Content` corrupted UTF-8 on first `index.html` edit; fixed via git restore + Node UTF-8 rewrite. Prefer Node for HTML with em-dashes/symbols.
5. **Did not start Task 4**; did not purge cyber identity (Task 5); did not push.

## Commit message (intended)

```
feat(analyzer): wire scan-first visibility matrix to zones
```
