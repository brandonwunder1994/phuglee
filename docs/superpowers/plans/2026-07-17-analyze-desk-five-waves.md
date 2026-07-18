# Analyze Desk Five Waves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Do not start execution until the operator says so.** Plans only until then.

**Goal:** Make Analyze a reliable scan → bucket → Review → Vault desk after Results rankings retirement — fix dead clicks, truthful KPIs, prune orphans, tighten the review loop, then harden 17k-scale paths.

**Architecture:** Keep `session.results` and Review overlay as the engine. Never restore the rankings workbench (`RESULTS_WORKBENCH_ENABLED` stays `false`). Rewire UI that still calls `setFilter` / card paint into `openReviewMode` or remove it. Prefer server-backed pending counts and export jobs over full client scans of 17k rows.

**Tech Stack:** Vanilla JS (`PDA.env`), Analyzer Express routes, Node test runner (`node --test`), existing Phuglee CSS (`analyze-desk-v2.css`, `phuglee-analyzer.css`, `cyber-review.css`), Playwright/prod verify scripts, `scripts/verify-live.ps1` + `verify-mobile.ps1`.

**Canvas (operator view):** `.cursor/projects/.../canvases/analyze-improvement-plan.canvas.tsx`

## Global Constraints

- Never wipe `data/filter-lists/`, `data/bridge-brain/`, analyzer session volumes, or Form Forge data.
- Do not re-enable Results rankings UI (`lib/analyze-visibility.js` `RESULTS_WORKBENCH_ENABLED === false`).
- Do not change tier scoring / brain training rules unless a task explicitly says so.
- After any Analyze UI edit: `scripts\verify-live.ps1` + `scripts\verify-mobile.ps1 -Pages "/analyzer"` before claiming local done.
- For production Analyze review claims: both `verify-prod-review-ready.js` and `verify-prod-review-ui.js` exit 0.
- Never claim live/fixed without same-turn proof (workspace rule).
- Commit only when the operator asks.

## Locked product decisions

| Decision | Lock |
|----------|------|
| KPI click | Normal click → `openReviewMode(filter)` (no Shift required) |
| Blocked KPI | Same as other buckets → `openReviewMode('blurred')` |
| Past markets / location hub | **Do not restore in these waves.** Delete orphan DOM wiring / dead listeners; leave `state.locationFilter` harmless if present |
| Rankings stub HTML | Remove in Wave 3 once listeners are null-safe |
| Export | Desk `···` overflow: Export Excel (full) + Export dial-ready; keep backup + API usage |
| Vault deep link | `/vault?leadType=distressed\|well_maintained\|land` (match Vault tab state) |
| Satellite Only | Add optional awaiting chip when count > 0 (Wave 2) |

## File map (all waves)

| File | Waves | Role |
|------|-------|------|
| `modules/property-analyzer/public/index.html` | 1–4 | Desk markup, KPI chips, mobile toggle, overflow export, pipeline, stub removal |
| `modules/property-analyzer/public/js/session.js` | 1–2, 4 | KPI clicks, awaiting counts, pipeline paint, vault hrefs, summary intro |
| `modules/property-analyzer/public/js/app.js` | 1 | Cmd palette prune |
| `modules/property-analyzer/public/js/scan-ready.js` | 1, 3 | Overflow export wiring; visibility cleanup |
| `modules/property-analyzer/public/js/render.js` | 1, 3, 5 | Export helpers; dead `enterReviewMode` / card paths |
| `modules/property-analyzer/public/js/imagery.js` | 4 | Review header totals, exit CTA, profile link |
| `modules/property-analyzer/public/js/premium-shell.js` | 1 | Already binds `#analyzeMobileNavToggle` — needs HTML |
| `modules/property-analyzer/public/js/location-hub.js` | 3 | Orphan — strip or no-op guard |
| `modules/property-analyzer/lib/analyze-visibility.js` | 3 | Keep workbench false; drop unused flags if safe |
| `modules/property-analyzer/routes/session.js` | 2, 5 | Awaiting counts + export job routes |
| `modules/property-analyzer/lib/review-queue-server.js` | 2, 5 | Reuse queue scan for counts / export |
| `public/js/vault-app.js` | 2 | Read `leadType` from URL on boot |
| `public/vault.html` | 2 | Cache-bust vault-app if needed |
| `modules/property-analyzer/public/css/analyze-desk-v2.css` | 1–2, 4 | KPI hints, satellite chip, CTA |
| `modules/property-analyzer/public/css/cyber-review.css` / `phuglee-analyzer.css` | 4 | Mobile action bar |
| Tests under `modules/property-analyzer/tests/` + `tests/` | 1–5 | Per-task |

---

# Wave 1 — Nothing dead clicks

**Goal:** Every visible control does what it looks like.  
**Done when:** Tap Distressed opens Review; Export works from desk `···`; Menu works on phone; Cmd+K has no dead search/filter/export-sidebar items; copy no longer says “rank.”

### Task 1.1 — KPI cards open Review

**Files:**
- Modify: `modules/property-analyzer/public/js/session.js` (`bindDistressedSummaryClick`, `sumWellMaintainedCard`, `sumVacantCard`, `sumReviewCard`, `sumBlurredCard` handlers ~L33–42 and ~L2098–2127)
- Test: `modules/property-analyzer/tests/analyze-kpi-review-click.test.js` (pure helper if extracted) OR document manual + playwright smoke

**Steps:**

- [ ] **1.1.1** Extract a small helper (same file or tiny lib used by session):

```js
function openBucketReviewFromKpi(filter) {
  if (typeof openReviewMode !== 'function') return;
  if (state.reviewMode && state.reviewFilter === filter) return;
  openReviewMode(filter);
}
```

- [ ] **1.1.2** Replace Shift+click branches: normal click → `openBucketReviewFromKpi(...)`. Remove `setFilter(...)` from these KPI handlers.
- [ ] **1.1.3** Wire `#sumBlurredCard` → `openBucketReviewFromKpi('blurred')`.
- [ ] **1.1.4** Update titles/aria: e.g. `title="Open Distressed review"` (already close).
- [ ] **1.1.5** Verify locally: with results present, click each awaiting KPI → overlay opens with matching `#reviewFilterTag`.
- [ ] **1.1.6** Commit when operator asks: `fix(analyze): KPI cards open Review on click`

### Task 1.2 — Desk overflow export

**Files:**
- Modify: `modules/property-analyzer/public/index.html` (`#scanDeskOverflow`)
- Modify: `modules/property-analyzer/public/js/scan-ready.js` or `session.js` (click handlers)
- Reuse: `exportResults` in `render.js`

**Steps:**

- [ ] **1.2.1** Add menu items inside `#scanDeskOverflow`:

```html
<button type="button" class="scan-desk-overflow-item" id="deskExportExcelBtn" role="menuitem">Export Excel (all)</button>
<button type="button" class="scan-desk-overflow-item" id="deskExportDialReadyBtn" role="menuitem">Export dial-ready</button>
```

- [ ] **1.2.2** Wire clicks:

```js
$('deskExportExcelBtn')?.addEventListener('click', () => {
  if (!state.results?.length) return;
  exportResults('xlsx', { scope: 'all', profile: 'full' });
});
$('deskExportDialReadyBtn')?.addEventListener('click', () => {
  if (!state.results?.length) return;
  void exportResults('xlsx', { scope: 'all', profile: 'dial_ready' });
});
```

- [ ] **1.2.3** Disable buttons when `!state.results.length` (mirror `updateExportButtons` or call from summary update).
- [ ] **1.2.4** Cache-bust `scan-ready.js` / `index.html` script tags.
- [ ] **1.2.5** Manual: import/session with results → ··· → Export Excel downloads.
- [ ] **1.2.6** Commit when asked: `feat(analyze): export from scan desk overflow`

### Task 1.3 — Mobile nav toggle

**Files:**
- Modify: `modules/property-analyzer/public/index.html` (before `#main` or top of main)
- Confirm: `modules/property-analyzer/public/js/premium-shell.js` `bindAnalyzeMobileNav`
- Confirm CSS: `phuglee-analyzer.css` `.analyze-nav-open` rules exist

**Steps:**

- [ ] **1.3.1** Add button (match existing CSS expectations):

```html
<button type="button" class="analyze-mobile-nav-toggle" id="analyzeMobileNavToggle"
  aria-expanded="false" aria-controls="appSidebar">Menu</button>
```

- [ ] **1.3.2** Ensure `premium-shell.js` init runs on load (already should).
- [ ] **1.3.3** `verify-mobile.ps1 -Pages "/analyzer"` — no overflow; toggle opens sidebar at 375px.
- [ ] **1.3.4** Commit when asked: `fix(analyze): restore mobile nav toggle`

### Task 1.4 — Prune Cmd+K dead commands

**Files:**
- Modify: `modules/property-analyzer/public/js/app.js` (~L2076–2094 command list)

**Steps:**

- [ ] **1.4.1** Remove or gate `when: () => false` for:
  - Search leads (`resultSearch` focus)
  - Filter-by-tier commands that only `setFilter`
  - Sidebar export commands that require missing `sidebarExport*` nodes
- [ ] **1.4.2** Keep: Review Distressed/WM/Land/Blocked/Needs Review via `openReviewMode`, Export database Excel if `state.results.length`, backup/API if present.
- [ ] **1.4.3** Manual: Cmd+K list shows only live actions.
- [ ] **1.4.4** Commit when asked: `fix(analyze): prune dead command palette entries`

### Task 1.5 — Copy pass (rank → buckets)

**Files:**
- Modify: `modules/property-analyzer/public/index.html` meta, `#sidebarTagline`, `#summaryIntro` default, hero if needed
- Modify: `session.js` dynamic `#summaryIntro` string (~L711)

**Steps:**

- [ ] **1.5.1** Replace “rank” / “ranks” in `<meta>` and sidebar tagline with bucket/review language.
- [ ] **1.5.2** Intro copy: `Tap a bucket to review · Vault totals below` (or equivalent).
- [ ] **1.5.3** Grep `index.html` + sidebar for `rank` — zero user-facing leftovers on Analyze chrome.
- [ ] **1.5.4** Commit when asked: `docs(analyze): drop rank copy after Results retirement`

### Wave 1 verification gate

- [ ] `powershell -File scripts\verify-live.ps1` → LIVE ok
- [ ] `powershell -File scripts\verify-mobile.ps1 -Pages "/analyzer"` → MOBILE ok
- [ ] Manual: KPI click opens Review for Distressed, WM, Land, Blocked, Needs Review
- [ ] Manual: ··· Export Excel works with session results
- [ ] Manual: Cmd+K has no Search leads / dead filter items

---

# Wave 2 — One desk, truthful numbers

**Goal:** Bucket numbers and pipeline state tell the truth; Vault links land on the right tab.

### Task 2.1 — Server awaiting-bucket counts

**Files:**
- Modify: `modules/property-analyzer/lib/review-queue-server.js` (or adjacent helper)
- Modify: `modules/property-analyzer/routes/session.js`
- Create: `modules/property-analyzer/tests/awaiting-bucket-counts.test.js`
- Modify: `session.js` `getAwaitingReviewBucketCounts` / `updateSummaryStats`

**Interface:**

```http
GET /api/session-awaiting-counts
→ { ok: true, awaiting: { distressed, well_maintained, vacant, blurred, review, satellite_only }, scanned: number }
```

**Steps:**

- [ ] **2.1.1** Write unit test for pure count function over fixture results + reviewed keys (same exclusion rules as `scanReviewFilterSnapshot`).
- [ ] **2.1.2** Implement server scan-once counts (reuse review-queue identity rules).
- [ ] **2.1.3** Mount GET route next to `/api/session-review-queue`.
- [ ] **2.1.4** Client: fetch on summary paint; cache ~15–30s; fallback to client snapshot if fail.
- [ ] **2.1.5** `node --test modules/property-analyzer/tests/awaiting-bucket-counts.test.js`
- [ ] **2.1.6** Commit when asked: `feat(analyze): server awaiting bucket counts`

### Task 2.2 — Client single-pass pending snapshot

**Files:**
- Modify: `modules/property-analyzer/public/js/session.js` (`getAwaitingReviewBucketCounts`, `scanReviewFilterSnapshot`)

**Steps:**

- [ ] **2.2.1** Add `scanAllReviewFilterSnapshots()` that walks `state.results` once and returns all six pending counts.
- [ ] **2.2.2** Make `getAwaitingReviewBucketCounts()` use that (when not using server cache).
- [ ] **2.2.3** Unit test: N results → one pass equals six independent snapshots.
- [ ] **2.2.4** Commit when asked: `perf(analyze): single-pass awaiting KPI counts`

### Task 2.3 — Dynamic pipeline steps

**Files:**
- Modify: `index.html` `#analyzePipeline` (ensure step data attributes)
- Modify: `scan-ready.js` or `session.js` — `paintAnalyzePipeline(state)`
- Modify: `analyze-desk-v2.css` if needed for complete/active

**State matrix:**

| Condition | Active step |
|-----------|-------------|
| No records & no results | Upload |
| Records pending / ready, not scanning, no results | Upload or Scan |
| `state.running` | Scan |
| Has results, not scanning, review closed | Buckets |
| `state.reviewMode` | Review |

**Steps:**

- [ ] **2.3.1** Implement `paintAnalyzePipeline()` toggling `is-complete` / `is-active` on the four `<li>`s.
- [ ] **2.3.2** Call from `applyAnalyzeVisibility`, scan start/stop, review open/exit.
- [ ] **2.3.3** Manual: walk upload→scan→buckets→review and confirm pipeline tracks.
- [ ] **2.3.4** Commit when asked: `feat(analyze): dynamic pipeline step state`

### Task 2.4 — Vault KPI deep links + Vault URL boot

**Files:**
- Modify: `index.html` `#sumVault*Card` hrefs
- Modify: `session.js` `paintVaultSummaryRow` if it rewrites hrefs
- Modify: `public/js/vault-app.js` — on init read `URLSearchParams` `leadType`
- Modify: `public/vault.html` cache-bust

**Steps:**

- [ ] **2.4.1** Set hrefs: `/vault?leadType=distressed`, `well_maintained`, `land`; Total → `/vault`.
- [ ] **2.4.2** In vault-app boot, if `leadType` query present and valid, set `state.leadType` and apply tab before first fetch.
- [ ] **2.4.3** Manual: from Analyze Vault Distressed card → Vault opens Distressed tab.
- [ ] **2.4.4** Commit when asked: `feat(vault): deep-link leadType from Analyze KPIs`

### Task 2.5 — Satellite Only chip

**Files:**
- Modify: `index.html` `#summaryHeroRow`
- Modify: `session.js` paint awaiting counts
- Modify: `analyze-desk-v2.css`

**Steps:**

- [ ] **2.5.1** Add `#sumSatelliteOnlyCard` button (hidden when 0), click → `openReviewMode('satellite_only')`.
- [ ] **2.5.2** Paint from awaiting counts.
- [ ] **2.5.3** Mobile: verify no horizontal overflow.
- [ ] **2.5.4** Commit when asked: `feat(analyze): satellite-only awaiting chip`

### Wave 2 verification gate

- [ ] Awaiting KPIs match review queue sizes (± hydrate lag documented)
- [ ] Pipeline moves with scan/review
- [ ] Vault deep link works for three types
- [ ] `verify-live.ps1` + `verify-mobile.ps1 -Pages "/analyzer,/vault"`

---

# Wave 3 — Prune legacy shell

**Goal:** Delete dead UI paths so the page matches the architecture.  
**Locked:** Do **not** restore Past markets / location hub in this wave.

### Task 3.1 — Null-safe then remove rankings stub

**Files:**
- Modify: `index.html` — remove `#analyzeDataZone` stub block
- Modify: `session.js`, `review.js`, `render.js`, `state.js`, `config.js` — optional chaining on `cardsGrid` / `resultsBody` / `resultSearch`
- Modify: `scan-ready.js` — stop referencing data zone

**Steps:**

- [ ] **3.1.1** Grep for `cardsGrid.`, `resultsBody.`, `resultSearch.` without `?.` — fix crash sites.
- [ ] **3.1.2** Delete stub HTML from `index.html`.
- [ ] **3.1.3** Load Analyze with large session — no console TypeError.
- [ ] **3.1.4** Commit when asked: `chore(analyze): remove retired rankings DOM stub`

### Task 3.2 — Remove hidden sidebar review bridge + orphan listeners

**Files:**
- Modify: `index.html` — delete `.sidebar-review-bridge` block
- Modify: `session.js` — remove listeners for `sidebarReview*Btn` / dead `sidebarExport*`
- Modify: `config.js` — drop unused `$()` refs if safe

**Steps:**

- [ ] **3.2.1** Delete HTML + JS for hidden bridge/export sidebar.
- [ ] **3.2.2** Grep `sidebarReview` / `sidebarExport` — only comments or gone.
- [ ] **3.2.3** Commit when asked: `chore(analyze): remove hidden sidebar review bridge`

### Task 3.3 — Location hub orphan cleanup

**Files:**
- Modify: `location-hub.js` — early return if `#locationHub` missing
- Modify: `scan-ready.js` — remove hub expand logic or no-op
- Modify: `app.js` `scrollToLeadRankingsOrHub` — scroll to `#summarySection` instead
- Optional: stop loading `location-hub.js` from `index.html` if fully unused

**Steps:**

- [ ] **3.3.1** Guard all hub entry points when DOM absent.
- [ ] **3.3.2** Confirm no errors on session load with geo server payload.
- [ ] **3.3.3** Commit when asked: `chore(analyze): no-op orphan location hub`

### Task 3.4 — Import path clarity

**Files:**
- Modify: `index.html` / upload modal trigger visibility
- Modify: cmd palette / admin only for `#openUploadModalBtn`

**Steps:**

- [ ] **3.4.1** Ensure primary import is scan desk drop only for normal operators.
- [ ] **3.4.2** Keep modal behind admin/cmd if still needed for lead-type edge cases — document in comment.
- [ ] **3.4.3** Commit when asked: `clarify(analyze): scan desk is primary import`

### Wave 3 verification gate

- [ ] No `#analyzeDataZone`, no sidebar review bridge
- [ ] Console clean on load + scan complete + review open
- [ ] `analyze-visibility` tests still pass
- [ ] verify-live + verify-mobile `/analyzer`

---

# Wave 4 — Review ↔ Vault loop

**Goal:** Finishing review feels like progress into Vault; queue truth; mobile review usable.

### Task 4.1 — Post-review / exit CTA

**Files:**
- Modify: `imagery.js` review exit path
- Modify: `index.html` or review overlay footer for CTA strip
- Modify: CSS

**Behavior:**
- Track session approvals during review (or read vault meta delta).
- On exit review (or empty queue): show `N approved → Open Vault` button linking `/vault?leadType=…` for the filter just worked.

**Steps:**

- [ ] **4.1.1** Add `#reviewVaultCta` in overlay header/footer (hidden by default).
- [ ] **4.1.2** Update count on Keep/approve paths that publish to vault.
- [ ] **4.1.3** On exit with count > 0, flash CTA on `#summarySection` as well.
- [ ] **4.1.4** Commit when asked: `feat(analyze): post-review open Vault CTA`

### Task 4.2 — Review header pending total

**Files:**
- Modify: `imagery.js` `reviewProgressLabel` / openReviewMode
- Prefer server queue `total` / awaiting counts from Wave 2

**Steps:**

- [ ] **4.2.1** Progress string always includes authoritative pending total, e.g. `3 / 153 · 150 left` (not lean page size alone).
- [ ] **4.2.2** Manual on prod-sized session: Distressed header shows full pending, not 500.
- [ ] **4.2.3** Commit when asked: `fix(analyze): review header shows full pending total`

### Task 4.3 — Browse lead / profile from Review

**Files:**
- Modify: `imagery.js` / review meta aside
- Reuse: existing `#propertyModal` / `showInspector` if still callable with a result object
- Or: `GET` session result profile by key if modal needs full row

**Steps:**

- [ ] **4.3.1** Add “Full profile” button in `#reviewBody` meta.
- [ ] **4.3.2** Open property modal with current review result; Esc returns to review (do not wipe queue).
- [ ] **4.3.3** Commit when asked: `feat(analyze): open property profile from Review`

### Task 4.4 — Mobile review action bar

**Files:**
- Modify: `cyber-review.css` / `phuglee-analyzer.css` `@media (max-width: 640px)` for `#reviewActionBar`

**Steps:**

- [ ] **4.4.1** Primary row: Keep + Change (large touch targets ≥44px).
- [ ] **4.4.2** Secondary overflow/details for Later / Blocked / Satellite / Undo.
- [ ] **4.4.3** `verify-mobile.ps1 -Pages "/analyzer"` after UI change.
- [ ] **4.4.4** Commit when asked: `fix(analyze): mobile review action bar hierarchy`

### Wave 4 verification gate

- [ ] `verify-prod-review-ready.js` + `verify-prod-review-ui.js` if shipping to Railway
- [ ] Mobile review usable with thumbs
- [ ] Profile open/close preserves queue index

---

# Wave 5 — 17k scale

**Goal:** Desk stays responsive with full admin sessions; export does not freeze the tab.

### Task 5.1 — Server-side export job

**Files:**
- Modify: `routes/session.js` or shell `server.js` export route
- Modify: `render.js` `exportResults` — prefer server download when `results.length > N` (e.g. 2000)
- Create: tests for export query/stream

**Interface (sketch):**

```http
POST /api/session-export
{ format: "xlsx", profile: "full"|"dial_ready" }
→ file download or { jobId } + GET status
```

**Steps:**

- [ ] **5.1.1** Implement server export using same column profiles as client.
- [ ] **5.1.2** Client: if large session, call API; else keep local path.
- [ ] **5.1.3** Test fixture export row count matches.
- [ ] **5.1.4** Commit when asked: `feat(analyze): server-side session export`

### Task 5.2 — Desk without full hydrate

**Files:**
- Modify: session load / `ensureSessionResultsLoaded` call sites on Analyze idle
- Prefer: summary + review queues from server; hydrate on demand for export/review fallback only

**Steps:**

- [ ] **5.2.1** Audit who forces full hydrate on page load; stop idle full crawl when awaiting counts + review queue APIs suffice.
- [ ] **5.2.2** Ensure Review + KPI still accurate (Wave 2 APIs).
- [ ] **5.2.3** Commit when asked: `perf(analyze): avoid full hydrate on desk idle`

### Task 5.3 — Perf budget test

**Files:**
- Create: `modules/property-analyzer/scripts/bench-summary-paint.js` or test
- Document budget in plan notes

**Steps:**

- [ ] **5.3.1** Measure `updateSummaryStats` / awaiting paint with 10k+ fixture or prod admin cookie.
- [ ] **5.3.2** Target: summary paint path < 100ms when using server counts (no full client scan).
- [ ] **5.3.3** Commit when asked: `test(analyze): summary paint budget for large sessions`

### Wave 5 verification gate

- [ ] Export 17k session without tab freeze
- [ ] Desk load does not pull all results before first paint
- [ ] Review still opens Distressed with queueLen >> 0 on prod

---

## Execution order (when operator says go)

1. Wave 1 → verify gate → (optional ship)
2. Wave 2 → verify gate → (optional ship)
3. Wave 3 → verify gate
4. Wave 4 → verify gate → prod review scripts if deploying
5. Wave 5 → verify gate → prod export smoke

## Out of scope

- Re-enabling Distress Rankings / cards workbench
- Restoring Past markets location hub (separate plan; see `2026-07-08-analyze-location-hub.md`)
- Changing Gemini models / scan scoring
- Vault redesign beyond `leadType` deep link

## Handoff

Plans are complete in this file. **Do not execute until the operator says which wave(s) to run and whether to use subagent-driven or inline execution.**
