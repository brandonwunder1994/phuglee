# Phase 62: City Dossier - Research

**Researched:** 2026-07-10  
**Domain:** Filter `/bridge` city-select → ops case-file dossier + demote no-list outcomes to secondary scrap/drawer  
**Confidence:** HIGH

## Summary

Phase 62 turns city selection from a **void dual-select + 5-radio outcome wall** into an **ops dossier** (prior attaches, last scrub, lists staged for that city, relevant status), while demoting the “city replied, no usable list” path to a **secondary scrap/drawer**. Happy path stays: **pick city → (type) → drop file**.

All dossier inputs already exist client-side or behind existing Bridge APIs:

| Dossier facet | Source today | Loaded when? |
|---------------|--------------|--------------|
| Prior attaches | `GET /api/bridge/history/:cityId` → `history[]` (Form Forge `bridge_datasets`) | **Only** when “Attachment history” dialog opens (`loadHistory`) |
| Last scrub signals | Same history entry fields (`kept_count`, `attached_at`, `upload_type_label`, optional `stats`) | Same lazy path |
| Lists staged for city | `GET /api/bridge/lists` → filter `list.cityId === selectedCity.id` | **Page load** (`loadSavedLists` → `savedLists`) |
| Relevant status | List `status` (`ready` / `downloaded`); post-outcome local status; attach sets Forge `response_status: yes` | Lists in memory; **no GET** for last no-list outcome |
| No-list outcomes | `POST /api/bridge/city-outcome` (write-only from Bridge) | N/A — save path only |

**Primary recommendation:** Compose a **client-side dossier** on `onCityChange` by (1) filtering in-memory `savedLists` by `cityId`, (2) eagerly fetching history for that city (reuse `loadHistory` / `renderHistory` patterns, surface last attach as “last scrub”), and (3) relocating `#bridge-city-outcome` + save wiring into a collapsed scrap/drawer without changing the POST payload or `CITY_OUTCOME_*` validation. **No new backend routes required** for CITY-01/02.

Depends on Phase 61 desk shell (asymmetric work surface + scrap). Does **not** implement idle global metrics (63) or multi-city shift queue (67).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dossier
- On city select: show case-file panel with prior attaches, last scrub signals, lists staged for that city, relevant status
- Data from existing APIs where possible (`/api/bridge/history/:cityId`, `/api/bridge/lists`, city outcome)

#### Exception path
- Five city-reply outcomes move to secondary scrap/drawer — not primary 5-radio wall on happy path
- Happy path remains: pick city → (type) → drop file

### Claude's Discretion
- Dossier layout (inline panel vs side scrap)
- Empty dossier copy when no history

### Deferred Ideas (OUT OF SCOPE)
- Multi-city shift sticky queue (67)
- Global idle KPIs not city-scoped (63)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CITY-01 | Selecting a city opens a **city dossier** (ops case file): prior attaches / last scrub / lists staged for that city / relevant status — not a void dual-select only | Compose from history API + in-memory lists filtered by `cityId`; show on `onCityChange` when `selectedCity` set |
| CITY-02 | “City replied, no usable list” outcomes live as a **secondary scrap / drawer** on the dossier — not a 5-radio wall competing with step-1 happy path | Relocate `#bridge-city-outcome` radiogroup + notes + request type + Save into collapsed scrap/drawer; preserve `saveCityOutcome` POST contract |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| `public/bridge.html` | existing | City step markup: selects, history button, outcome wall, history dialog | Primary DOM surface for CITY-01/02 |
| `public/js/bridge.js` | existing (~3k lines) | `onCityChange`, `loadHistory`, `renderHistory`, `saveCityOutcome`, `loadSavedLists` | All data + event wiring already here |
| `public/css/bridge.css` | existing | `.bridge-city-outcome`, history dialog, list table styles | Extend for dossier + demoted scrap |
| `lib/bridge-api.js` | existing | `handleHistory`, `handleCityOutcome`, lists handlers | **Reuse as-is** — no engine rewrite |
| `lib/bridge-list-store.js` | existing | List summary shape (`cityId`, `recordCount`, `status`, …) | Client filters lists by `cityId` |
| Form Forge (proxy) | via `fetchForgeJson` / `postForgeJson` | City profiles + `bridge_datasets` + tracker response log | History + outcome persistence |

### Supporting

| Module / Pattern | Purpose | When to Use |
|------------------|---------|-------------|
| Collect desk scrap | `public/collect.html` `.collect-desk-tracker` — “Already waiting? Track Requests” secondary path | Visual demotion pattern for CITY-02 |
| Home territory dossier | `public/index.html` `.home-territory-dossier` | **Visual language only** (chrome stamp, case-file feel) — not data model |
| `phuglee-btn` vocabulary | DESK-06 (phase 61) | Prefer over dual `bridge-btn` on outcome save when restyling |
| `fetchJson` in `bridge.js` | Session headers + error codes | All dossier fetches |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-compose dossier from history + lists | New `GET /api/bridge/dossier/:cityId` | Extra backend + Forge coupling; CONTEXT says use existing APIs; **reject for v2.1** |
| Keep outcome wall visible but restyle smaller | True scrap/drawer | CITY-02 requires secondary path not competing with happy path |
| Drop history modal entirely | Inline-only history | Modal can remain “full history” detail; dossier can show summary + last scrub; keep `#bridge-history-dialog` IDs |
| Read last tracker outcome from Forge city detail | Surface fields already returned by history’s Forge fetch | Bridge currently **maps only** `bridge_datasets` → `history`; no GET for no-list outcomes. Optional later; not required for CITY-01 if lists + attaches cover “status” |

**Installation:** none — UI-only phase; no new npm packages.

```bash
# verify
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

## Architecture Patterns

### Recommended Project Structure

```
public/
├── bridge.html                 # MODIFY — dossier shell; demote outcome into scrap/drawer
├── css/bridge.css              # MODIFY — dossier + scrap/drawer styles
└── js/bridge.js                # MODIFY — onCityChange loads dossier; filter lists; preserve outcome save

lib/
├── bridge-api.js               # REUSE — history, lists, city-outcome (no new routes preferred)
└── bridge-list-store.js        # REUSE — summary fields for city-scoped filter

tests/
└── (optional) bridge-api-handlers already cover history + lists;
    city-outcome has handler code but **no dedicated test** today — soft gap
```

### Pattern 1: Existing city-select lifecycle (do not break)

**What:** `onCityChange` in `bridge.js`:

1. `resetDownstream('city')` — clears type/upload/results
2. Sets `selectedCity` from `cities` array
3. Shows `#bridge-type-panel`, `#bridge-city-actions`, **`#bridge-city-outcome`**
4. `resetCityOutcomeUi()` — clears radios/notes
5. Advances pipeline to `type`

**Phase 62 insert:** After `selectedCity` is set, **build/show dossier** and **fetch history** (async, non-blocking for type panel). Keep type panel reveal for happy path.

### Pattern 2: History API (prior attaches / last scrub)

**Route:** `GET /api/bridge/history/:cityId`  
**Handler:** `handleHistory` in `lib/bridge-api.js`  
**Upstream:** `GET /api/portal/city/:cityId` → `data.bridge_datasets`

**Response shape (documented + code):**

```js
{
  cityId: 'arizona-marana',
  city: '...',       // from Forge when present
  state: '...',
  history: [
    {
      id: '20260706-143022-arizona-marana',
      upload_type: 'code_violation',
      upload_type_label: 'Code Violation',
      original_filename: 'violations-march.xlsx',
      response_received_at: '…',
      attached_at: '…',
      kept_count: 142,
      discarded_count: 8,          // often present on Forge version
      deduplicated_count: 3,
      already_imported_count: 12,
      csv_download_url: '/forge/api/file/...',
      xlsx_download_url: '/forge/api/file/...',
      stats: { kept, discarded, … } // optional on version
    }
  ]
}
```

**Client today:**

- `loadHistory(cityId)` → `renderHistory(data.history || [])` into `#bridge-history-list`
- Empty copy: “No datasets attached yet for this city.”
- Item line: `{type label} · {filename}` + `{kept} kept · received … · attached …` + CSV/XLSX links
- Also re-called after successful **attach**

**Last scrub derivation (client):**

```js
// Prefer newest by attached_at (ISO strings sort lexicographically when full ISO)
const last = [...history].sort((a, b) =>
  String(b.attached_at || '').localeCompare(String(a.attached_at || ''))
)[0] || null;
// Surface: upload_type_label, kept_count, attached_at / response_received_at, original_filename
```

**404:** Unknown city → `{ error, code: 'CITY_NOT_FOUND' }` — dossier should show soft empty/error, not break type step.

### Pattern 3: Lists API (lists staged for city)

**Route:** `GET /api/bridge/lists` (user-scoped)  
**Summary fields** (`toSummary` in `lib/bridge-list-store.js`):

```js
{
  id, name, createdAt, updatedAt,
  status: 'ready' | 'downloaded',
  cityId, city, state,
  uploadType, sourceFile,
  recordCount, downloadedAt
}
```

**Client:**

- `savedLists` filled at page load and after save/rename/delete/download-all/clear
- `renderSavedLists()` is **global** inventory table (phase 67 restyles as shift inventory)
- Phase 62: **filter only** for dossier chips/rows:

```js
function listsForCity(cityId) {
  const id = String(cityId || '');
  return (savedLists || []).filter((l) => String(l.cityId || '') === id);
}
```

**Pitfall:** Older/malformed lists with empty `cityId` will not match — treat as not city-scoped (honest empty for that city).

### Pattern 4: City outcome API (must not break)

**Route:** `POST /api/bridge/city-outcome` only (**no GET**)  
**Handler:** `handleCityOutcome`  
**Upstream:** `POST /api/portal/city/:cityId/response`

**Allowed `response_status`:**

| Value | UI label (current) |
|-------|--------------------|
| `needs_clarification` | Needs clarification |
| `no` | No records of this kind |
| `other_source` | Contact another source |
| `they_charge` | They charge for the list |
| `approved_bad_data` | Replied — info invalid to use |

**Allowed `request_type`:** `code_violation` | `water_shutoff`  
⚠️ **Not** the same string as process `uploadType` (`water_shut_off`). Outcome select already uses `water_shutoff`.

**Body (client `saveCityOutcome`):**

```js
{
  cityId: selectedCity.id,
  response_status: responseStatus,
  request_type: requestType,  // from #bridge-outcome-type
  notes,
  response_raw: notes
}
```

**Server rules:**

- Missing `cityId` → 400 `MISSING_CITY`
- Bad status → 400 `INVALID_STATUS`
- Bad request type → 400 `INVALID_REQUEST_TYPE`
- `other_source` requires notes or response_raw → 400 `MISSING_NOTES`
- Client also requires notes for `other_source` before POST; notes optional for `approved_bad_data` UI

**Success response:** `{ ok, event, city, response_status, request_type }`  
**Does not wipe Filter lists** (comment + product rule).

**DOM contract to preserve (IDs / names):**

| ID / name | Role |
|-----------|------|
| `#bridge-city-outcome` | Panel container (may move under drawer) |
| `input[name="bridge-city-outcome"]` | Five radios — values must stay exact |
| `#bridge-other-source-wrap` / `#bridge-other-source-notes` | Notes for other_source / bad data |
| `#bridge-outcome-type` | request_type select |
| `#bridge-outcome-save` | Save to City Tracker |
| `#bridge-outcome-status` | Inline success/error |
| `saveCityOutcome`, `syncCityOutcomeUi`, `resetCityOutcomeUi` | Logic must keep working |

### Pattern 5: Dossier data shape (recommended client model)

Discretionary field names; compose purely on the client:

```js
/**
 * @typedef {Object} CityDossierModel
 * @property {{ id: string, city: string, state: string }} city
 * @property {Object[]} attaches        // history[] as returned
 * @property {Object|null} lastScrub    // newest attach or null
 * @property {Object[]} stagedLists     // lists filtered by cityId
 * @property {{ ready: number, downloaded: number, recordCount: number }} listStatus
 * @property {'loading'|'ready'|'empty'|'error'} historyState
 * @property {string} [historyError]
 */
function buildDossierModel(selectedCity, history, lists) {
  const attaches = Array.isArray(history) ? history : [];
  const lastScrub = attaches.length
    ? [...attaches].sort((a, b) =>
        String(b.attached_at || '').localeCompare(String(a.attached_at || ''))
      )[0]
    : null;
  const stagedLists = (lists || []).filter(
    (l) => String(l.cityId || '') === String(selectedCity.id)
  );
  const listStatus = {
    ready: stagedLists.filter((l) => (l.status || 'ready') === 'ready').length,
    downloaded: stagedLists.filter((l) => l.status === 'downloaded').length,
    recordCount: stagedLists.reduce((n, l) => n + (Number(l.recordCount) || 0), 0)
  };
  return { city: selectedCity, attaches, lastScrub, stagedLists, listStatus };
}
```

**CITY-01 surface checklist:**

| Facet | Display suggestion |
|-------|--------------------|
| Prior attaches | Count + short list (or “N attached”) + link/button to full history dialog |
| Last scrub | Type · kept count · attached date · filename |
| Lists staged | Count + total records + ready/downloaded chips; name samples optional |
| Relevant status | “Ready to download” / “Downloaded” mix; empty = “No staged lists for this city” |
| Empty | Discretionary ops copy when no history **and** no lists |

### Pattern 6: Demote outcome radiogroup (CITY-02)

**Current problem** (`filter-page-ui-map.md`): 5-radio wall shares step 1 with happy path; cognitive load for “I have a file” operators.

**Collect analog:** secondary scrap “Already waiting? Track Requests” — not peer primary CTA.

**Recommended UX:**

1. Happy path after city: **dossier summary + type step** (already revealed).
2. Exception entry: collapsed control e.g. “City replied — no usable list” / “Log tracker outcome” on scrap side or under dossier.
3. Expand → same five radios + notes + request type + Save (existing IDs).
4. Default state on city select: **drawer closed**, radios cleared (`resetCityOutcomeUi` already).

**Do not:**

- Remove any of the five statuses (City Tracker contract)
- Change POST path or field names
- Make outcome save a required step before type/upload
- Auto-submit outcomes

### Pattern 7: Layout discretion (inline vs side scrap)

| Option | Fit | Notes |
|--------|-----|-------|
| **Inline panel** under selects | Simpler; works with current single-column wizard | Good if phase 61 still stacking |
| **Side scrap** on desk | Matches DESK-01 asymmetric shell | Prefer if 61 shipped dominant surface + scrap rail |
| Hybrid | Dossier summary inline; outcome drawer in scrap | Strong hierarchy; slightly more CSS |

Territory `.home-territory-dossier` is **chrome inspiration only** (stamp, case-file frame) — do not import home map JS.

### Anti-Patterns to Avoid

- **New Forge/Bridge write APIs** for dossier read — compose from history + lists.
- **Blocking type panel** on slow history fetch — show type immediately; dossier sections may “Loading…”.
- **Filtering lists by city name only** — use `cityId` as primary key.
- **Renaming outcome radio values** — breaks Forge tracker statuses.
- **Using `water_shut_off` in outcome request_type** — server accepts `water_shutoff` only.
- **Wiping lists on outcome save** — forbidden product rule; API does not delete lists.
- **Implementing phase 63 idle global KPIs or 67 shift queue** in this phase.
- **Breaking attach → loadHistory** refresh path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Attach history | New store of attaches | `GET /api/bridge/history/:cityId` | Already Forge-backed + tested |
| Staged lists per city | New endpoint | Filter `savedLists` by `cityId` | Lists already loaded |
| Last scrub stats | Re-process or invent | Latest history entry fields | Truth from attach versions |
| Tracker no-list write | Second save path | Existing `saveCityOutcome` + POST | Stable City Tracker proxy |
| Case-file chrome | Copy territory map JS | CSS/HTML visual cues only | Different data domain |
| Outcome demotion pattern | Novel UX theory | Collect tracker scrap | Product already demotes secondary paths |

**Key insight:** Phase 62 is **presentation + composition**, not new persistence. The failure mode is breaking the outcome POST or making the exception path still feel primary.

## Common Pitfalls

### Pitfall 1: Breaking city-outcome save (highest risk)
**What goes wrong:** Tracker outcomes stop saving; operators lose no-list path.  
**Why it happens:** Renamed inputs, moved nodes without rebinding, wrong `request_type`, or broken `selectedCity` guard.  
**How to avoid:** Keep radio `name`/`value`, `#bridge-outcome-save` click → `saveCityOutcome`, body fields identical; smoke-test all five statuses + `other_source` notes required.  
**Warning signs:** Button stays disabled; 400 `INVALID_STATUS` / `MISSING_NOTES`; silent catch.

### Pitfall 2: History only in modal (dossier empty forever)
**What goes wrong:** CITY-01 shows void because history still lazy-loads only on dialog open.  
**Why it happens:** Dossier UI added without calling `loadHistory` (or shared fetch) on city select.  
**How to avoid:** On `onCityChange` with valid city, fetch history for dossier; dialog can share same data/cache.  
**Warning signs:** Modal has data after click but dossier always “No history”.

### Pitfall 3: Race on rapid city changes
**What goes wrong:** Slow history for city A paints into city B’s dossier.  
**Why it happens:** Unsequenced async `loadHistory` without cityId guard.  
**How to avoid:** Capture `const cityId = selectedCity.id` at start; ignore response if `selectedCity?.id !== cityId`.  
**Warning signs:** Flickering wrong city names in dossier.

### Pitfall 4: Confusing lists inventory with attaches
**What goes wrong:** Dossier mixes “staged for download” with “attached to Forge profile”.  
**Why it happens:** Both are “files for city” in operator language.  
**How to avoid:** Separate sections: **Staged lists** (Filter store) vs **Attached versions** (history).  
**Warning signs:** Operators think Save list auto-attaches (it does not).

### Pitfall 5: Empty `cityId` on some lists
**What goes wrong:** City has staged lists but dossier says zero.  
**Why it happens:** Save without `cityId` or legacy data.  
**How to avoid:** Filter by `cityId`; optional weak fallback match on `city`+`state` only if product accepts — prefer strict `cityId` and honest empty.  
**Warning signs:** Global lists table shows city name but dossier filter empty.

### Pitfall 6: Outcome wall still primary after “demote”
**What goes wrong:** CITY-02 fails review — 5 radios still dominate step 1.  
**Why it happens:** CSS only shrinks cards; still always expanded.  
**How to avoid:** Default collapsed drawer; expanded only on explicit open; happy path visual weight on dossier + type.  
**Warning signs:** First paint after city select still shows full radiogroup without click.

### Pitfall 7: Dual button system / DESK-06 drift
**What goes wrong:** Outcome save remains `bridge-btn` while desk uses `phuglee-btn`.  
**Why it happens:** Phase 61 may unify buttons; phase 62 reintroduces dual system.  
**How to avoid:** Align with phase 61 button vocabulary when touching outcome chrome.  
**Warning signs:** Gold gradient primary next to glass secondary mixed systems.

### Pitfall 8: Hiding type panel while building dossier
**What goes wrong:** Happy path blocked until history returns.  
**Why it happens:** Awaiting history inside `onCityChange` before `setHidden(typePanel, false)`.  
**How to avoid:** Keep current order: show type + start history fetch async.  
**Warning signs:** Lag between city select and type cards.

### Pitfall 9: Post-save reset forgets new dossier nodes
**What goes wrong:** After Save list, dossier shell stays visible with stale city.  
**Why it happens:** `resetImportAreaAfterSave` clears city select and hides outcome/actions but not new dossier container.  
**How to avoid:** Hide/clear dossier in same reset paths as `cityOutcomePanel` / `cityActions` (`resetDownstream('state')`, clear city, post-save).  
**Warning signs:** Ghost dossier after full reset.

### Pitfall 10: Scope creep into 63/67
**What goes wrong:** Global idle metrics or multi-city queue built early.  
**Why it happens:** Dossier “status” language overlaps idle KPIs / shift inventory.  
**How to avoid:** City-scoped only; global lists table remains page-level until 67.  
**Warning signs:** Phase plan rewrites `#bridge-lists-panel` as shift queue.

## Code Examples

Verified patterns from this repo:

### History fetch + render (existing)

```js
// public/js/bridge.js — loadHistory / renderHistory
async function loadHistory(cityId) {
  if (!cityId || !historyList) return;
  historyList.innerHTML = '<p class="bridge-history-empty">Loading history…</p>';
  try {
    const data = await fetchJson(`/api/bridge/history/${encodeURIComponent(cityId)}`);
    renderHistory(data.history || []);
  } catch (err) {
    historyList.innerHTML = `<p class="bridge-history-empty">${esc(err.message || 'Could not load history')}</p>`;
  }
}
```

### City outcome save (existing — preserve)

```js
// public/js/bridge.js — saveCityOutcome body
await fetchJson('/api/bridge/city-outcome', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cityId: selectedCity.id,
    response_status: responseStatus,
    request_type: requestType, // code_violation | water_shutoff
    notes,
    response_raw: notes
  })
});
```

### Server allowed statuses (existing)

```js
// lib/bridge-api.js
const CITY_OUTCOME_STATUSES = new Set([
  'needs_clarification',
  'no',
  'other_source',
  'they_charge',
  'approved_bad_data'
]);
const CITY_OUTCOME_REQUEST_TYPES = new Set(['code_violation', 'water_shutoff']);
```

### City change hook (extend, don’t replace)

```js
// public/js/bridge.js — onCityChange (sketch)
function onCityChange() {
  resetDownstream('city');
  // ... resolve selectedCity ...
  setHidden(typePanel, false);
  setHidden(cityActions, false);
  // CITY-02: do not force full outcome wall open — scrap/drawer closed
  setHidden(cityOutcomePanel, /* drawer open? */ true); // or keep panel but collapsed
  resetCityOutcomeUi();
  renderCityDossier(selectedCity); // CITY-01: lists from savedLists immediately
  loadCityDossierHistory(selectedCity.id); // async history / last scrub
  setPipelineStep('type');
}
```

### List summary filter

```js
// lib/bridge-list-store.js — toSummary fields available on each list
// id, name, createdAt, status, cityId, city, state, uploadType, recordCount, downloadedAt
const staged = savedLists.filter((l) => String(l.cityId) === String(selectedCity.id));
```

## Exact Files to Create / Modify

| Action | Path | Why |
|--------|------|-----|
| **Modify** | `public/bridge.html` | Dossier shell under city step; wrap outcome wall in scrap/drawer markup |
| **Modify** | `public/js/bridge.js` | Dossier compose on city select; history eager load; drawer open/close; preserve outcome save |
| **Modify** | `public/css/bridge.css` | Dossier case-file styles; collapsed scrap; hierarchy vs type panel |
| **Reuse only** | `lib/bridge-api.js` | history / lists / city-outcome handlers |
| **Reuse only** | `lib/bridge-list-store.js` | List summary shape |
| **Do not modify** | `lib/bridge-engine/*` | Engine out of scope |
| **Do not create** | New `/api/bridge/dossier` | Prefer client composition |
| **Optional** | Tests for city-outcome POST | Soft gap — no dedicated test file today |
| **Optional** | Keep `#bridge-history-dialog` | Full attach history detail |

## State of the Art

| Old Approach | Current Approach (pre-62) | Phase 62 target |
|--------------|---------------------------|-----------------|
| Dual select only | Dual select + **always-on 5-radio wall** + history modal button | Dual select + **dossier** + history detail + **collapsed** exception scrap |
| History on demand | Modal-only `loadHistory` | Dossier summary + optional modal deep-dive |
| Lists global only | Bottom inventory table | Same table + **city-filtered** dossier section |
| No-list path peer | Radios compete with type step | Secondary drawer; happy path type → file |

**Deprecated for this phase:**

- Treating city step as “form fields only” without case-file proof  
- Equal visual weight for no-list outcomes vs file scrub path  

## Open Questions

1. **Should history modal stay?**
   - What we know: Modal + `loadHistory` + dialog IDs exist; attach refreshes list.
   - Recommendation: Keep modal for full history / downloads; dossier shows summary + last scrub. “Attachment history” button can remain or become “Full history”.

2. **Is last no-list tracker status required on dossier?**
   - What we know: Bridge has POST only; Forge city detail may have request/response fields not mapped by `handleHistory`.
   - Recommendation: CITY-01 can ship without last outcome read; show local success after save. Optional follow-up: map Forge status if already in portal city payload (verify before inventing API).

3. **Inline vs side scrap for dossier + outcomes?**
   - Locked as Claude’s discretion.
   - Recommendation: Follow phase 61 shell — if scrap rail exists, put demoted outcomes there and dossier on work surface; else inline dossier + `<details>`/drawer under selects.

4. **Empty copy tone?**
   - Discretionary.
   - Recommendation: Ops voice e.g. “No attaches yet for this city. Drop a file or log a tracker reply.” Avoid long teaching essay (DESK-04).

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Full suite | `npm test` |
| Live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| UI route | `http://127.0.0.1:3000/bridge` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CITY-01 | History API returns cityId + history with download URLs | API | `node --test tests/bridge-api-handlers.test.js` (history cases) | ✅ |
| CITY-01 | Lists summaries include `cityId` / `recordCount` / `status` | API | lists CRUD in `bridge-api-handlers.test.js` | ✅ |
| CITY-01 | Client dossier filters lists by cityId + shows last history | Manual / DOM | Visual on `/bridge` after city select | ❌ automated UI |
| CITY-02 | Outcome POST still accepts five statuses + notes rules | API (gap) | Prefer add handler tests if touching server; client preserve payload | ⚠️ handler exists, **no test** |
| CITY-02 | Radiogroup not primary wall on happy path | Manual | `/bridge` city select → type visible; outcomes collapsed | ❌ |
| Regression | Independence / accuracy / brain locks | Suite | `npm test` | ✅ |
| Regression | Live health | Script | `scripts/verify-live.ps1` | ✅ |

### Sampling Rate

- **Per task:** smoke `/bridge` city select dossier + one outcome save if outcome UI moved  
- **Per wave:** `npm test`  
- **Phase gate:** Suite green + verify-live exit 0 + both success criteria observable  

### Wave 0 Gaps

- [ ] Optional: `POST /api/bridge/city-outcome` handler unit tests (statuses, notes, water_shutoff) — protect Pitfall 1  
- [ ] No browser e2e for dossier — rely on manual criteria in ROADMAP  
- [ ] No new deps  

## Sources

### Primary (HIGH confidence)

- `public/bridge.html` — city step L96–171; history dialog L400–411  
- `public/js/bridge.js` — city select, outcome save (~1513–1618), lists (~1782+), history (~2206–2251), init `loadSavedLists`  
- `lib/bridge-api.js` — `handleHistory`, `handleCityOutcome`, `CITY_OUTCOME_*`, lists routes  
- `lib/bridge-list-store.js` — `toSummary` shape  
- `docs/bridge/API.md` — history + lists + process/attach contracts  
- `docs/bridge/DATA-STANDARDS.md` — `bridge_datasets` version schema  
- `tests/bridge-api-handlers.test.js` — history GET + lists CRUD  
- `.planning/phases/62-city-dossier/62-CONTEXT.md` — locked decisions  
- `.planning/REQUIREMENTS.md` — CITY-01, CITY-02  
- `.planning/ROADMAP.md` — phase 62 success criteria  
- `.planning/codebase/filter-page-ui-map.md` — city step inventory + rec 6/SS4  
- `public/collect.html` — secondary tracker scrap demotion pattern  
- `public/index.html` — `.home-territory-dossier` visual language only  

### Secondary (MEDIUM confidence)

- `.planning/v2.1-FILTER-SCRUB-THEATER.md` — order D2, peer steal list  
- Form Forge portal city payload beyond `bridge_datasets` (not fully mapped in Bridge history handler)

### Tertiary (LOW confidence)

- Whether Forge city detail already exposes last `response_status` without new routes — verify only if planner wants live tracker status chip  

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — pure existing Bridge UI + APIs; zero new deps  
- Architecture: **HIGH** — handlers, client functions, and HTML nodes found and read  
- Pitfalls: **HIGH** — outcome save contract + lazy history + list cityId filter are concrete code risks  

**Research date:** 2026-07-10  
**Valid until:** 2026-08-10 (re-check if phase 61 renames city-step DOM IDs or history/outcome APIs change)

---

## RESEARCH COMPLETE

**Phase:** 62 - city-dossier  
**Confidence:** HIGH

### Key Findings
- Dossier is **client-composed**: history API for attaches/last scrub; in-memory `/api/bridge/lists` filtered by `cityId` for staged lists/status — **no new API required**.
- History is currently **modal-lazy**; CITY-01 needs eager (or shared) fetch on city select without blocking type panel.
- City outcome is **POST-only** with five fixed statuses and `request_type` `code_violation` | `water_shutoff`; demote UI only — **do not break save payload**.
- CITY-02 = Collect-style secondary scrap/drawer; default collapsed so happy path is pick city → type → file.
- Highest risks: outcome save regression, async city race, conflating staged lists vs Forge attaches, post-save reset omitting new dossier nodes.

### File Created
`.planning/phases/62-city-dossier/62-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All routes/modules located in repo |
| Architecture | HIGH | Client lifecycle + API contracts verified in source |
| Pitfalls | HIGH | Concrete breakages identified from live code paths |

### Open Questions
- Keep history modal vs summary-only (recommend keep modal).
- Last no-list tracker status without GET (optional; not blocking).
- Inline vs side scrap layout (follow phase 61 shell).

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
