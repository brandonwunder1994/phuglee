# Phase 66: Superpower Train Theater - Research

**Researched:** 2026-07-10  
**Domain:** Filter post-process admin Train elevation — theater pivot, live kept-count, brain demotion, non-admin hide  
**Confidence:** HIGH (mode tabs, open-group math, decision UX, admin gate verified in `bridge.js` / `bridge-train.js` / HTML / tests)

## Summary

Phase 66 is a **presentation pivot**, not a brain/engine rewrite. After process, when an **admin** has **open undecided Train groups**, the results surface should enter **Train theater** (mission header with open-group count; Distressed / Not Distressed decisions with live kept-count feedback) instead of treating **Kept | Train | Brain** as equal peer tabs by default. Filter brain becomes a **secondary rules armory**. Non-admins never see train/brain chrome (v1.6 TRAIN-03 preserved). Decision APIs and optimistic client list moves stay as-built.

**As-built gap vs THTR:** Most decision plumbing already ships (optimistic promote/demote, KPI refresh, status line with kept + remaining). What does **not** ship is the **default pivot into theater**, a **mission header**, and **brain demotion** out of the equal three-up tab rail.

**Primary recommendation:** Client-only chrome changes in `public/bridge.html`, `public/js/bridge.js`, `public/css/bridge.css` (+ light pure helper in `bridge-train.js` if counting is extracted). Do **not** touch `POST /api/bridge/brain/decisions`, processUpload keep/kill, or review-group generation. Preserve `isBridgeAdmin` fail-closed.

---

## User Constraints (from CONTEXT.md / product locks)

### Locked decisions

| Topic | Lock |
|-------|------|
| Theater pivot | Open groups > 0 → **Train theater default** (not peer Kept \| Train \| Brain equal tabs) |
| Mission header | Open-group count visible in theater chrome |
| Live kept-count | Feedback on Approve/Deny via **existing mutation** (no new decision semantics) |
| Brain | **Secondary armory** — not a third equal-weight peer tab |
| Admin gate | **THTR-03:** non-admin never sees train/brain chrome; preserve `isBridgeAdmin` |
| APIs | **No decision API rewrites** beyond presentation; preserve train/decision behavior |
| Stack | Vanilla `public/` + existing helpers; no React / new packages |
| Data | Never wipe `data/filter-lists/` / `data/bridge-brain/` |

### Claude's discretion (planner/executor)

- How **Kept list** remains reachable during theater (tab demotion, “View kept” escape hatch, secondary control)
- Exact tab vs full-page pivot chrome (class names, hierarchy under `#bridge-results-panel`)
- Whether brain is a demoted tab, link, drawer, or armory button — must not compete with scrub win / Train mission

### Deferred (out of scope)

- New ML
- Non-admin train
- Phrase auto-activate
- processUpload keep/kill rewrite
- Multi-city shift desk (Phase 67)
- Kill-rate report redesign (Phase 65 owns KILL)

---

## Phase Requirements

| ID | Description | Research support |
|----|-------------|------------------|
| **THTR-01** | Admin + open train groups after process → **Train theater** (mission header w/ open-group count; Distressed / Not Distressed with **live kept-count** feedback) — not peer equal tabs with Kept / Brain by default | Gap: `renderResults` always `setResultsMode(resultsMode \|\| 'kept')`. Open-count tip only in meta. Kept feedback **already** on decision status + KPIs. Need pivot + mission header. |
| **THTR-02** | Filter brain panel is **secondary** (rules armory), not third equal peer tab | Gap: HTML equal three tabs `Kept list` / `Train brain` / `Filter brain`. Demote chrome only; keep `#bridge-brain-panel` + `loadBrainPanel`. |
| **THTR-03** | Non-admin never sees train/brain chrome (v1.6 TRAIN-03) | **Already solid:** wrap `hidden`, clear containers, click/hotkey gates, server 403. Do not regress; prefer fail-closed if theater adds new chrome. |

---

## As-Built Inventory (verified 2026-07-10)

### 1. Mode tabs today (equal peer rail)

**HTML** (`public/bridge.html` ~241–290):

```html
<div id="bridge-train-wrap" hidden>
  <div class="bridge-results-mode" role="tablist" aria-label="Results mode">
    <button role="tab" id="bridge-mode-kept" data-mode="kept" class="bridge-mode-tab is-active" …>Kept list</button>
    <button role="tab" id="bridge-mode-train" data-mode="train" …>Train brain</button>
    <button role="tab" id="bridge-mode-brain" data-mode="brain" …>Filter brain</button>
  </div>
  <p id="bridge-train-status" …></p>
  <div id="bridge-train-panel" hidden role="tabpanel" …>… Distressed / Not Distressed …</div>
  <div id="bridge-brain-panel" hidden role="tabpanel" …>… type/phrase rules …</div>
</div>
```

**State machine** (`public/js/bridge.js`):

| Piece | Behavior |
|-------|----------|
| `resultsMode` | `'kept' \| 'train' \| 'brain'`; module default **`'kept'`** |
| `setResultsMode(mode)` | Coerces unknown → `'kept'`; toggles `is-active` / `aria-selected` on three tabs; shows train **or** brain panel **or** kept table/toolbar |
| Train mode | Hides table/toolbar/pagination; **Save/attach stay visible** (commented discretion) |
| Brain mode | Hides table; calls `loadBrainPanel()` → `GET /api/bridge/brain` |
| Tab click | `.bridge-results-mode` click → `closest('[data-mode]')` → admin-only `setResultsMode` |
| After process | `renderResults` → admin: unhide wrap + `setResultsMode(resultsMode \|\| 'kept')` → **always kept-first** on fresh process (`resultsMode` reset only on save, not on process — but process path does not set train) |
| After save | `resetImportAreaAfterSave` forces `resultsMode = 'kept'` and clears train session |

**CSS:** `.bridge-results-mode` + `.bridge-mode-tab` (+ `.is-active`) in `public/css/bridge.css` ~1848–2001 — equal visual weight three-up.

**Tests locked to equal labels:** `tests/bridge-train-ux.test.js` asserts ids `bridge-mode-kept` / `bridge-mode-train`, labels “Kept list” / “Train brain”, `role="tablist"`. Theater work may re-skin or demote but should keep stable ids or migrate tests with them (design bible D5).

**THTR-01 implication:** Default after process with open groups must become **train theater**, not peer tabs with kept selected. Zero open groups → keep today’s kept-first results (kill report / table path from Phase 65 coexists).

---

### 2. Open group detection

**Server source of truth (per process):** `lastResult.reviewGroups = { distressed: [], notDistressed: [] }` (engine + `lib/bridge-review-groups.js`; client does not invent groups).

**Client pure helpers** (`public/js/bridge-train.js`):

| Helper | Role |
|--------|------|
| `getReviewGroups(data)` | Safe extract; empty arrays if missing |
| `trainDecisionKey(group)` | Prefer `groupId`; fallback `section\|typeKey\|desc` (never type-only) |
| `filterUndecidedTrainGroups(list, decidedKeys)` | Drop groups whose key is in session `Set` |

**Session decided set** (`bridge.js`):

- `trainDecidedKeys` — cards leave the queue after Approve/Deny until re-process or undo
- Cleared on new process batch and on full import reset after save
- Undo deletes key when snapshot restored

**Where open-count is computed today** (inline, no shared `countOpenTrainGroups`):

```javascript
// Pattern repeated in renderResults meta tip, saveCurrentList soft warn,
// commitTrainDecisionLocally remaining status:
filterUndecidedTrainGroups(
  (getReviewGroups(lastResult).distressed || []).concat(
    getReviewGroups(lastResult).notDistressed || []
  )
).length
```

| Call site | Use |
|-----------|-----|
| `renderResults` (admin) | Append ` · N Train group(s) ready` to **results meta only** — does **not** switch mode |
| `saveCurrentList` | Soft confirm if `resultsMode === 'train'` && open > 0 |
| `commitTrainDecisionLocally` | Status: remaining groups after decision |
| `renderTrainGroups` | Filters each section through undecided + search + page (40) |

**Open definition for THTR-01 pivot:** `isBridgeAdmin() && openUndecidedCount(lastResult) > 0` after process / on `renderResults`. Search filter must **not** shrink “open” for theater pivot (search is UX only inside train panel). Use **undecided** count, not raw `reviewGroups` length, so post-decision empty queue can exit theater default behavior on next paint if desired.

**Recommended extract (discretion):** `countOpenTrainGroups(data, decidedKeys)` on `BridgeTrain` for one source of truth + unit test — pure, no DOM.

---

### 3. Live kept-count on decision (mostly shipped)

**Optimistic path (must preserve — no API rewrite):**

1. `onTrainDecision` → `commitTrainDecisionLocally` (sync)
2. `applyTrainDecisionLocally(action, section, group)` moves rows by `rowIds`:
   - Deny distressed → demote tag `Standard`, rows → `notDistressedRows`, `stats.kept--`
   - Deny not_distressed → promote `Strong Distressed Signal`, rows → `rows`, `stats.kept++`
   - Approve = no list move (confirm AI); still marks decided + trains brain via POST
3. Card exit animation; `trainDecidedKeys.add`
4. `refreshTrainUiAfterDecision()`:
   - `renderKpis(lastResult.stats)` → **“Kept (distress)” tile updates live**
   - If mode train/brain: re-render train groups only (avoids full table rebuild)
5. Status (`#bridge-train-status`, `role="status"`):

```text
Decision saved · {keptNow} kept · {remaining} group(s) left. Save list when ready.
// or when remaining === 0:
Decision saved · {keptNow} kept. Save list below when this city is ready.
```

6. Background: `persistTrainBrainDecision` → `POST /api/bridge/brain/decisions` with `clientApplied: true` (server skips bulk row rewrite when client already applied)

**What THTR-01 still needs for “live kept-count feedback”:**

| Already live | Gap for theater |
|--------------|-----------------|
| KPI kept value | Mission header / theater HUD may want **display-scale kept** next to open-group count — wire from same `stats.kept` / `rows.length` |
| Status line after decision | Elevate status into theater mission strip so operator sees count without hunting peer tabs |
| Light refresh path | Does **not** rewrite `resultsMeta` kept count; full `renderResults` would — acceptable if mission header owns live numbers |

**Do not change:** `DENY_CONFIRM_THRESHOLD = 10`, hotkeys A/Enter/D, undo stack + `POST .../undo`, `clientApplied` contract, rowId resolution via `findTrainGroupById`.

---

### 4. Brain demotion (THTR-02)

**Today:** Equal peer tab `#bridge-mode-brain` → `setResultsMode('brain')` → `#bridge-brain-panel` with:

- Metrics (`#brain-metrics`)
- Active type rules / proposed phrases / active phrases
- Status updates via `POST /api/bridge/brain/rules/:id/status`
- Admin-only load; error copy if non-admin

**Target:** Brain is **rules armory** — secondary access that does not compete with:

1. Scrub win / kill-rate report (Phase 65)
2. Train mission when groups are open

**Preserve:**

- Panel DOM ids (`bridge-brain-panel`, `brain-type-rules`, …) for tests and `loadBrainPanel`
- Server rule APIs unchanged
- Ability for admin to open armory when needed (after theater or with 0 open groups)

**Do not:** Auto-open brain after process; auto-activate phrases; show brain to non-admin.

---

### 5. Non-admin hide (THTR-03 — preserve)

| Layer | Behavior |
|-------|----------|
| HTML default | `#bridge-train-wrap` has `hidden` (fail-closed; tested) |
| `renderResults` admin | `setHidden(trainWrap, false)` + `renderTrainGroups` |
| `renderResults` non-admin | `setHidden(trainWrap, true)`; clear distressed/not containers; clear train status |
| Tab / decision / undo / brain rule clicks | All gate `isBridgeAdmin()` |
| Hotkeys | `resultsMode === 'train' && isBridgeAdmin()` |
| `isBridgeAdmin()` | Prefer `PhugleeSettings.isAdmin()`; else session user **exact** `'admin'` (not `Admin`, not email) — `bridge-train.js` + bridge fallback |
| Server | Brain routes admin-enforced 403 (defense in depth; v1.6) |

**Theater risk:** New mission header / armory control must live **inside** the admin-gated wrap (or be created only when admin + open groups). Never leave train/brain chrome visible when wrap is hidden.

---

### 6. No API rewrite (hard boundary)

| Endpoint | Role | Phase 66 |
|----------|------|----------|
| `POST /api/bridge/process` | Produces rows + `reviewGroups` + stats | **Read only** for theater triggers |
| `POST /api/bridge/brain/decisions` | Persist train decision; `clientApplied` slim path | **No contract change** |
| `POST /api/bridge/brain/undo` | Server undo + client snapshot | Unchanged |
| `GET /api/bridge/brain` | Armory data | Unchanged |
| `POST .../rules/:id/status` | Activate/disable/reject | Unchanged |
| List save/download | Staging | Unchanged (soft train-before-save stays) |

Client may add presentation helpers and default-mode logic only.

---

## Standard Stack

| Layer | Use |
|-------|-----|
| Surface | `public/bridge.html` (`/bridge`) |
| Logic | `public/js/bridge.js` (modes, decisions, renderResults) |
| Pure helpers | `public/js/bridge-train.js` (`BridgeTrain`) |
| Style | `public/css/bridge.css` + tokens / premium atmosphere (peer Collect/Command heat for theater chrome if needed) |
| Auth | Session `admin` via `isBridgeAdmin` / settings-menu |
| Tests | `tests/bridge-train-ux.test.js` (+ optional new theater static tests); `npm test`; `scripts/verify-live.ps1` |
| Style / design bibles | `.planning/v1.4-GRITTY-PREMIUM.md`, `.planning/v2.1-FILTER-SCRUB-THEATER.md` |

**Zero new npm packages.** No React.

---

## Architecture Patterns

### Post-process mode selection (proposed)

```
processUpload success
  → clearTrainDecidedKeys / undo stack (existing)
  → renderResults(data)
       if !isBridgeAdmin → hide train wrap (existing)
       else
         open = countOpenTrainGroups(data)
         if open > 0 → theater: setResultsMode('train') + mission header
         else → kept / kill-report default (existing kept mode)
```

### Theater chrome (conceptual)

```
#bridge-results-panel
  kill-rate / KPIs (Phase 65)
  #bridge-train-wrap (admin only)
    [MISSION HEADER] open groups · live kept   ← NEW presentation
    mode chrome: Train primary | Kept escape | Brain armory demoted  ← THTR-01/02
    #bridge-train-status (live decision feedback — keep/enhance)
    #bridge-train-panel | #bridge-brain-panel | kept table (existing setResultsMode)
  save / attach (stay reachable — existing train mode discretion)
```

### Decision loop (unchanged core)

```
click Approve|Deny | hotkey
  → isBridgeAdmin gate
  → commitTrainDecisionLocally (list + KPIs + status + decidedKeys)
  → persistTrainBrainDecision (POST clientApplied)
  → on failure: undo snapshot + refresh
```

### Kept reachable during theater (discretion options for planner)

| Option | Pros | Cons |
|--------|------|------|
| A. Demoted “Kept list” tab (not equal default) | Minimal HTML churn; tests mostly keep ids | Still slightly tabby |
| B. “View kept table” secondary control under mission | Clear theater hierarchy | New control + a11y |
| C. Full pivot: hide tablist when open > 0; restore tabs when 0 open | Strong THTR-01 | Mode switch logic more branches |

Recommend **A or B** for lowest risk against `bridge-train-ux` tests; avoid removing panel ids.

---

## Don't Hand-Roll

| Need | Use existing |
|------|----------------|
| Admin check | `isBridgeAdmin()` / `BridgeTrain.isBridgeAdmin` |
| Review groups | `getReviewGroups` |
| Undecided filter | `filterUndecidedTrainGroups` + `trainDecidedKeys` |
| Card markup | `renderTrainGroupCard` / button labels |
| List mutation | `applyTrainDecisionLocally` |
| KPI refresh | `renderKpis` |
| Mode show/hide | `setResultsMode` (extend, don’t fork) |
| Brain load | `loadBrainPanel` |
| Soft save warn | `saveCurrentList` open-count block |

---

## Common Pitfalls

1. **Defaulting to kept after process** — current `setResultsMode(resultsMode || 'kept')` is the THTR-01 miss; theater must override when open > 0.
2. **Counting raw reviewGroups** without `filterUndecidedTrainGroups` — re-open theater after all decided, or miss decided-session truth.
3. **Using search-filtered length for pivot** — search is local UX; pivot/mission count = all undecided.
4. **Showing theater chrome outside admin wrap** — THTR-03 / TRAIN-03 regression.
5. **Rewriting decisions POST** for “live count” — counts already client-side; API rewrite is out of scope and high risk.
6. **Breaking stable test ids** (`bridge-mode-*`, `bridge-train-wrap`, section containers) without updating `tests/bridge-train-ux.test.js`.
7. **Hiding Save in train mode** — current code intentionally keeps save/attach; theater still needs stage path (KILL-03 / SHIFT later).
8. **Equal 3-up brain tab remains** — violates THTR-02 and v2.1 DON’T “Peer Train/Kept/Brain tabs when open groups exist”.
9. **Non-admin process with open groups server-side** — groups still in payload but wrap stays hidden; do not surface tip/chrome.
10. **Full `renderResults` on every decision** — already avoided for speed; mission header update should be light like KPIs.

---

## Code Examples (as-built anchors)

### Admin gate + wrap (renderResults)

```javascript
// public/js/bridge.js — renderResults tail
const trainWrap = document.getElementById('bridge-train-wrap');
if (isBridgeAdmin()) {
  setHidden(trainWrap, false);
  renderTrainGroups(getReviewGroups(data), data);
  setResultsMode(resultsMode || 'kept'); // ← THTR-01: pivot when open > 0
} else {
  setHidden(trainWrap, true);
  // clear train containers + status
}
```

### Open-count tip (meta only today)

```javascript
if (isBridgeAdmin()) {
  const openTrain = filterUndecidedTrainGroups(
    (getReviewGroups(data).distressed || []).concat(
      getReviewGroups(data).notDistressed || []
    )
  ).length;
  if (openTrain > 0) {
    trainTip = ` · ${openTrain} Train group(s) ready`;
  }
}
```

### Live kept + remaining on decision

```javascript
// commitTrainDecisionLocally (after apply + refresh)
const remaining = filterUndecidedTrainGroups(/* distressed + not */).length;
const keptNow = (lastResult.rows || []).length;
setTrainStatus(
  remaining === 0
    ? `Decision saved · ${keptNow.toLocaleString()} kept. Save list below when this city is ready.`
    : `Decision saved · ${keptNow.toLocaleString()} kept · ${remaining} group(s) left. Save list when ready.`,
  'success'
);
```

### setResultsMode visibility

```javascript
// train: show train panel; hide table/toolbar/pagination; save stays
// brain: show brain panel; loadBrainPanel()
// kept: show table when rows; hide train+brain panels
```

---

## State of the Art (project-local)

| Capability | Status |
|------------|--------|
| Review groups + stacked cards | ✅ Shipped (v1.6+) |
| Admin-only train wrap | ✅ Shipped TRAIN-03 |
| Equal peer tabs Kept/Train/Brain | ✅ As-built — **THTR target to break** |
| Optimistic decision + KPI kept | ✅ Shipped |
| Status kept + remaining | ✅ Shipped |
| Soft train-before-save | ✅ Phase 56 |
| Train keyboard A/D | ✅ Phase 59 |
| Auto-open Train when open groups | ❌ Gap (EFF research already noted; now THTR-01) |
| Mission header | ❌ Gap |
| Brain as armory (demoted) | ❌ Gap |
| Dedicated open-count helper | ❌ Inline only |

---

## Open Questions (resolved for planner where possible)

| Question | Research answer |
|----------|-----------------|
| Pivot only after process or any renderResults? | **Any admin `renderResults` with open > 0** (covers re-render paths); process is primary entry |
| What if open becomes 0 mid-session? | Stay in train mode until user switches (status already says all reviewed) **or** soft return to kept — discretion; do not force mode thrash mid-click |
| Does Approve need kept-count change? | Approve does not move rows; status still shows current kept + remaining (already correct) |
| Interaction with Phase 65 kill report? | Theater sits **in results** after/alongside report chrome; kill hierarchy remains primary scrub proof; Train elevates when open groups (v2.1 “One fire CTA / Train elevates only when open groups”) |
| Should non-admin meta mention train? | **No** — tip already admin-only |

---

## Validation Architecture

| Check | How |
|-------|-----|
| THTR-01 default mode | Static/source: process/renderResults path sets train when open count > 0 and admin; mission header includes open count |
| THTR-01 live kept | Source still contains status template with `kept` + `remaining`; `renderKpis` on decision path; no decisions API shape change |
| THTR-02 brain secondary | HTML/CSS: brain not equal third peer when theater active; panel still loadable |
| THTR-03 non-admin | Existing `bridge-train-ux` isBridgeAdmin + wrap hidden tests stay green; new chrome not outside wrap |
| Regression | `npm test` (train ux, list factory soft warn, efficiency path admin grep, brain/decision tests) |
| Live | `scripts/verify-live.ps1` after `public/` edits |
| a11y / QA-03 later | Tab roles if tabs remain; mission header not motion-required; `prefers-reduced-motion` if theater animates |

---

## Suggested Plan Decomposition (for planner)

1. **66-01 Open-count helper + theater default mode**  
   Extract `countOpenTrainGroups`; in `renderResults` admin branch, `setResultsMode(open > 0 ? 'train' : 'kept')` (respect explicit mid-session mode if needed); mission header markup with open count.

2. **66-02 Theater chrome + live kept HUD**  
   Mission header styling; ensure decision path updates header kept/open (or rely on status + KPIs with header wired); Kept escape hatch per discretion.

3. **66-03 Demote brain armory + THTR-03 lock**  
   Remove equal peer weight for brain; armory entry; confirm non-admin still never sees train/brain; update `bridge-train-ux` / small theater tests; verify-live.

---

## Sources

| Source | Use |
|--------|-----|
| `.planning/phases/66-superpower-train-theater/66-CONTEXT.md` | Phase boundary + decisions |
| `.planning/REQUIREMENTS.md` | THTR-01–03 |
| `.planning/ROADMAP.md` Phase 66 | Success criteria |
| `.planning/v2.1-FILTER-SCRUB-THEATER.md` | Theater DON’T peer tabs; Train elevates when open groups |
| `.planning/codebase/filter-page-ui-map.md` | Mode tabs map |
| `public/bridge.html` | Tab DOM |
| `public/js/bridge.js` | Modes, renderResults, decisions, KPIs |
| `public/js/bridge-train.js` | Admin, groups, cards |
| `public/css/bridge.css` | Tab / status styles |
| `tests/bridge-train-ux.test.js` | TRAIN-03 + tab contracts |
| `lib/bridge-api.js` / `lib/bridge-brain-decisions.js` | clientApplied contract (do not rewrite) |
| Phase 44 research/verification | Original train UX gates |
| Phase 56 research | Soft train-before-save |
| Phase 59 research | Noted missing auto-open Train |

---

## Metadata

**Phase:** 66-superpower-train-theater  
**Requirements:** THTR-01, THTR-02, THTR-03  
**Depends on:** Phase 65 (results/report shell)  
**Downstream:** Phase 67 multi-city shift (save still primary after train)  
**Out of scope:** Decision/engine API rewrites; non-admin train; ML; phrase auto-activate  

---

*Research complete: 2026-07-10*  
*Ready for planning — presentation pivot only; decision mutation and admin gate already production-grade*
