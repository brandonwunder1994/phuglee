# Phase 63: Idle Proof & Process Climax - Research

**Researched:** 2026-07-10  
**Domain:** Filter `/bridge` — live idle proof from lists API + upload-step Process fire climax (response date demoted, still required)  
**Confidence:** HIGH (lists store/API + client enablement gates + upload markup verified in tree)

## Summary

Phase 63 is **surface proof + hierarchy only**. No new lists endpoint, no process engine change, no live feed (64), no kill-rate report (65).

**IDLE-01** is mostly a **client presentation gap**. `GET /api/bridge/lists` already returns full list summaries on page load (`loadSavedLists` at init). `renderSavedLists()` already derives **list count** and **total `recordCount`** for the Saved lists total strip — but those numbers live only in the bottom lists panel after fold, not as **desk-rest idle proof**. The static 3-up proof rail (phase 61 target) is decorative and has **no live metrics**.

**IDLE-02** is an **upload-panel hierarchy gap**. Current step order is: format badges → **full response-date fieldset (peer form block)** → dropzone → Process. Process enablement is already files-first; date is a **click-time hard gate** (and attach-time server requirement), not a process multipart field. Restructure must demote date to **tight meta** without removing `#bridge-response-date`, `getResponseAtValue()`, or the process/attach gates.

**Primary recommendation:** Reuse `savedLists` from existing `loadSavedLists()` for a live idle strip (lists staged · total records · last save); recompose `#bridge-upload-panel` so dropzone + `#bridge-process` dominate and response date is a compact required meta chip/row. **Zero new npm packages. Zero lists API schema change.**

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Idle proof (IDLE-01)**
- Show live metrics from existing list/API data: lists staged, total records ready, last save (at minimum)
- Not fake decorative numbers

**Process climax (IDLE-02)**
- Dropzone is the stage; Process is the fire CTA
- Response date remains required for KPIs but visually demoted to tight meta chip/row

### Claude's Discretion

- Metric placement (desk header strip vs scrap)
- Exact metric set if lists API offers more fields

### Deferred Ideas (OUT OF SCOPE)

- Live activity feed during process (Phase 64)
- Kill-rate scrub report (Phase 65)
- Multi-city shift sticky queue / inventory HUD elevation (Phase 67) — idle strip may preview counts but must not own shift UX
- City-scoped dossier metrics (Phase 62) — global idle vs per-city dossier must not double-build conflicting systems
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **IDLE-01** | At idle (before process), operator sees **live proof metrics** from existing list/API data (e.g. lists staged, total records ready, last save) — not only post-process KPIs | `GET /api/bridge/lists` → `{ ok, lists[] }` with `toSummary` fields; client already loads into `savedLists` and sums `recordCount`; surface same data at desk rest |
| **IDLE-02** | Upload step makes **Process** the visual climax (dropzone stage + one fire CTA); response date is tight meta, not a peer form block | `#bridge-upload-panel` reorder/CSS; keep `#bridge-response-date` + `getResponseAtValue()` + process/attach gates; do not send date to process multipart (not required by process API) |
</phase_requirements>

---

## Gap Analysis (current tree vs IDLE-01..02)

| Req | Backend / data | UI today | Gap for Phase 63 |
|-----|----------------|----------|------------------|
| **IDLE-01** | ✅ Lists API + store complete | Metrics only in Saved lists table/total strip; decorative proof rail has no live numbers; post-process KPIs only after scrub | **Primary:** idle HUD/strip fed by `savedLists` (refresh on load + after save/delete/clear/download status change) |
| **IDLE-02** | ✅ Date gate client-side; attach server-side | Date is full fieldset **above** dropzone; Process is correct primary button but not “desk climax” | **Primary:** demote date to meta chip/row; elevate dropzone + Process; preserve required behavior |

**Also green already (do not re-implement):**
- Multi-list CRUD / download / clear under `FILTER_LISTS_ROOT` (v2.0 / Phase 56)
- Process enablement when files selected (`syncFileUi`)
- Dirty-guard before process clobbers unsaved kept rows
- Analyze independence (no auto-push)
- Stable DOM id `#bridge-process` (design bible D5)

---

## Exact lists API response fields (idle metrics source)

### Endpoint

| Method | Path | Handler | Client |
|--------|------|---------|--------|
| `GET` | `/api/bridge/lists` | `handleListIndex` → `listSummaries(scopeFromReq(req))` | `loadSavedLists()` → `savedLists = data.lists` |

**Index response shape** (`lib/bridge-api.js` + `lib/bridge-list-store.js`):

```json
{
  "ok": true,
  "lists": [ /* Summary[] */ ]
}
```

### `toSummary(meta)` — exact fields per list

Source: `lib/bridge-list-store.js` `toSummary`:

| Field | Type / notes | Idle metric use |
|-------|--------------|-----------------|
| `id` | string | row identity; not a headline metric |
| `name` | string | optional “latest list” label |
| `createdAt` | ISO string | **last save** (index sorted newest-first by `createdAt`) |
| `updatedAt` | ISO string | rename/status updates; secondary to `createdAt` for “last save” |
| `status` | `'ready'` \| `'downloaded'` | optional ready-vs-downloaded split |
| `cityId` | string | city filter (Phase 62 dossier; optional idle city chips) |
| `city` | string | display / city filter |
| `state` | string | display |
| `uploadType` | `code_violation` \| `water_shut_off` \| `''` | optional type heat (CV vs WS counts) |
| `sourceFile` | string | not needed for idle strip |
| `recordCount` | number | **total records ready** = Σ `recordCount` |
| `downloadedAt` | ISO \| `null` | optional “last download” — **not** required by CONTEXT minimum |

**Not returned on index** (single-list `GET /api/bridge/lists/:id` only): `stats`, `processingMeta`, full `rows` (when `includeRows`). Idle metrics must not require row payloads.

### Derived metrics (client, already partially computed)

From `renderSavedLists()` (`public/js/bridge.js`):

| Metric (CONTEXT minimum) | Derivation | Existing UI home |
|--------------------------|------------|------------------|
| **Lists staged** | `savedLists.length` | `#bridge-lists-total` text (“across N lists”) |
| **Total records ready** | `sum(Number(row.recordCount) \|\| 0)` | `#bridge-lists-total` (“Total: M records…”) |
| **Last save** | `savedLists[0].createdAt` after sort (API already newest-first) **or** `max(createdAt)` | only per-row “Uploaded” column via `formatListWhen(list.createdAt)` — **no desk-level last-save chip** |

**Empty inventory:** `lists: []` → show honest zeros / “No lists staged yet” — still live, not fake.

### Optional extra metrics (Claude’s discretion — API already has fields)

| Extra | How | Caution |
|-------|-----|---------|
| Ready count | `lists.filter(s => s.status !== 'downloaded').length` | Don’t invent a third status |
| Downloaded count | `status === 'downloaded'` | Secondary |
| Type heat | count by `uploadType` | Avoid equal 3-up icon tiles (DESK-02) |
| Distinct cities staged | unique `cityId` or `city+state` | Overlaps Phase 67 shift language — keep light |
| Latest list name/city | `lists[0].name` / city | Useful scrap detail, not required |

**Do not invent:** fake “kill rate,” fake “open train debt,” or process-duration at idle without a real source. Admin open-train debt only exists **after** process (`lastResult.reviewGroups`) — out of idle scope unless a future brain API is added (not in phase).

### Refresh hooks (when metrics must update)

| Event | Already calls `loadSavedLists`? |
|-------|----------------------------------|
| Page init | ✅ `loadSavedLists().catch(...)` at boot |
| Save list | ✅ after POST |
| Rename / delete one | ✅ |
| Clear all | ✅ |
| Download one / download-all | ✅ (status → downloaded; `downloadedAt` set server-side) |
| Process upload success | ❌ does **not** change lists (no auto-save) — idle strip unchanged until Save |
| City change / type change | N/A for global inventory |

**Implementation note:** Extract a pure `computeIdleProof(lists)` (or reuse reduce already in `renderSavedLists`) and call a `renderIdleProof()` from `renderSavedLists` so one load path updates both lists panel and idle strip — avoid dual fetches.

---

## Process enablement conditions (exact)

### Button enable/disable (`syncFileUi` / `clearFileUi`)

| Condition | `#bridge-process` |
|-----------|-------------------|
| `selectedFiles.length === 0` | `disabled = true`, label `"Process upload"` |
| `selectedFiles.length === 1` | `disabled = false`, label `"Process upload"` |
| `selectedFiles.length > 1` | `disabled = false`, label ``Process ${count} files`` |
| During process / confirm rounds | disabled while in flight; re-enabled via `syncFileUi` after cancel/error |

**Not checked for enable:** city selected, upload type selected, response date filled. Those fail at **click** with focus + error.

### Runtime gates inside `processUpload()` (order)

1. `processUploadInFlight` → error “already running”
2. `selectedCity` → error; pipeline → location; focus city
3. `selectedUploadType` → error; pipeline → type
4. `selectedFiles.length` → error; pipeline → upload
5. **`getResponseAtValue()` non-empty** → error “Enter the date the city sent this list…”; `focusResponseDateTime()`
6. Dirty-guard: if `lastResult.rows.length > 0`, confirm discard of unsaved kept/Train work
7. POST `/api/bridge/process` via `buildProcessFormData(resumeOpts)`

### `getResponseAtValue()` contract

```text
#bridge-response-date value must match /^\d{4}-\d{2}-\d{2}$/
→ local Date(`${date}T12:00:00`) → toISOString()
empty / invalid → ''
```

Same noon-local rule as `lib/bridge-export.js` `parseResponseReceivedAt` for date-only strings.

### What process multipart actually sends

`buildProcessFormData` appends **only**:

- `cityId`
- `uploadType`
- `file` (1..5)
- optional type-column resume: `confirmedTypeHeader`, `formatFingerprint`, `confirmedFormats`

**Does not append `responseAt` / `responseReceivedAt`.**  
So “required for KPIs” means:

| Path | Date role |
|------|-----------|
| Process click | **Product/UX hard gate** in client (keeps operator habit + blocks process without date for later attach KPIs) |
| Attach dataset | **Server required** — `responseReceivedAt` via `parseResponseReceivedAt`; missing → 400 / client “Response received date is required” |
| Save list | Not used |
| Process API engine | Not used |

**Implication for IDLE-02:** demoting the date control is pure UI hierarchy; **must keep** `#bridge-response-date`, `required` (or equivalent aria), `getResponseAtValue()`, process gate, attach gate. Do not “fix” requiredness by removing the gate.

### Stable IDs / hooks to preserve (D5)

| ID | Role |
|----|------|
| `#bridge-upload-panel` | Step 3 panel |
| `#bridge-response-date` | Date input |
| `#bridge-response-datetime` | Fieldset wrapper (may restyle) |
| `#bridge-response-hint` | Hint text (can shorten) |
| `#bridge-dropzone` / `#bridge-file-input` / `#bridge-browse` | File stage |
| `#bridge-process` | Fire CTA |
| `#bridge-clear-file` | Secondary clear |
| `#bridge-lists-total` / lists table | Existing inventory (keep working) |

---

## Upload climax restructure (without breaking date requirement)

### Current markup order (`public/bridge.html` `#bridge-upload-panel`)

1. H2 “Upload city response file(s)” + lead  
2. Format badges (`.xlsx .csv …`)  
3. **`.bridge-response-row`** — full fieldset legend “When did the city send this list?” + date input + long hint (**peer form block**)  
4. **`.bridge-dropzone`** — stage  
5. **`.bridge-actions--upload`** — Process (primary) + Clear files (ghost)

CSS: date row has full margin (`bridge-response-row` margin-bottom 1.25rem); dropzone already has gradient frame; Process uses dual `bridge-btn-primary` + `phuglee-btn-primary`.

### Target hierarchy (CONTEXT + design bible)

| Rank | Element | Treatment |
|------|---------|-----------|
| 1 | Dropzone | Stage — largest surface, heat/focus |
| 2 | Process | One fire CTA — ops label OK (“Process upload” / “Process N files”); ≥44px touch |
| 3 | Clear files | Ghost secondary |
| 4 | Response date | **Tight meta chip/row** — still required, still `#bridge-response-date` |
| 5 | Format badges / short hint | Tertiary chrome |

### Safe restructure patterns (pick one in plan; all preserve gate)

**A. Meta chip above dropzone (recommended default)**  
Compact single row: `Received` + date input + optional short “Forge KPI” title — no full legend essay. Dropzone + Process dominate below.

**B. Meta chip under dropzone, above Process**  
Date sits as “last check before fire” without competing as a form section. Risk: slightly further from top; still valid if Process remains largest CTA.

**C. Inline meta beside Process actions**  
Date + Process on one actions row on wide desktop; stack on mobile. Highest climax density; need care for 44px targets and focus order.

**Must not:**

- Remove process-time date validation  
- Hide the date with `display:none` while still “required” (operators must see and fill it)  
- Replace date with a silent default (would poison Form Forge turnaround KPIs on attach)  
- Recreate equal multi-metric feature cards inside the upload panel  
- Break `aria-describedby` / label association for the date input  

**Copy demotion:** legend can shrink to “Received” / “Response date”; long hint can become `title` tooltip or one-line muted meta. Keep meaning: date feeds Form Forge turnaround KPIs.

**Button system:** prefer unified `phuglee-btn` vocabulary (DESK-06 / phase 61); Process remains the sole fire CTA on this step.

### Relationship to process loading (phase 64 boundary)

Phase 63 stops at **idle + upload climax**. During process, existing `#bridge-loading-panel` rotating copy remains; **do not** build live address feed here (64).

---

## As-built inventory (verified 2026-07-10)

### Data / API

| Piece | Location | Status for 63 |
|-------|----------|---------------|
| List summaries | `lib/bridge-list-store.js` `toSummary` / `listSummaries` | ✅ complete — consume only |
| GET lists | `lib/bridge-api.js` `handleListIndex` | ✅ `{ ok, lists }` |
| Client load/render | `public/js/bridge.js` `loadSavedLists` / `renderSavedLists` | ✅ totals exist; need idle surface |
| Process gate + date | `processUpload` + `getResponseAtValue` | ✅ keep |
| Attach date | `attachDataset` + `parseResponseReceivedAt` | ✅ keep |
| Process FormData | `buildProcessFormData` | ✅ no date field — leave as-is |

### UI surfaces

| Surface | Today | Phase 63 role |
|---------|-------|---------------|
| Decorative proof rail | Static 3 equal columns (phase 61 removes/replaces) | Do **not** reintroduce equal 3-up; idle proof is **live**, not icon-step theater |
| Saved lists total | Live totals bottom of page | Source of truth pattern; optional keep + promote summary upward |
| Upload panel | Date peer block → dropzone → Process | Hierarchy fix (IDLE-02) |
| Post-process KPI grid | Only after process | Out of scope (65 elevates results) |
| City dossier | Phase 62 | City-scoped; idle is **global inventory** at desk rest |

### Command mission language (copy/pattern peer)

Command (`public/command.html` + `command-center.js`):

- Coverage: **`{n} cities · {m} states live`** from live DOM counts  
- Status rows: label + metric + optional detail — **not** equal marketing feature cards  
- Mission kicker + one fire CTA  

Filter idle should steal **proof-num + unit** voice, e.g.:

```text
3 lists staged · 12,480 records ready · Last save Jul 10, 2:14 PM
```

Empty:

```text
0 lists staged · Ready when you scrub the first city
```

---

## Standard Stack

### Core

| Library / module | Location | Purpose | Why standard |
|------------------|----------|---------|--------------|
| Vanilla HTML/CSS/JS | `public/bridge.*` | Idle strip + upload climax | Design bible D3; no React |
| `GET /api/bridge/lists` | `bridge-api` + `bridge-list-store` | Live inventory | Already fetched |
| `public/js/bridge.js` | client | `savedLists`, process gates, date helpers | Primary touch |
| `public/css/bridge.css` | page CSS | Strip + demoted date + Process hierarchy | Light CSS only |
| Phuglee tokens / `phuglee-btn` | shared | Fire CTA vocabulary | Match Collect/Command |
| `node --test` | tests | Static/regression locks if needed | Project standard |
| `scripts/verify-live.ps1` | scripts | After any `public/` edit | AGENTS.md |

### Supporting peers (visual language only)

| Peer | Steal |
|------|--------|
| Command status / proof nums | Live metric strip language |
| Collect desk asymmetry | Placement of proof scrap vs primary work (phase 61 shell) |
| Territory HUD | Display-scale counts (don’t over-scale on Filter) |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Client-derived idle metrics from lists index | New `/api/bridge/idle-stats` aggregate | Unnecessary — index already has all fields; extra endpoint = scope creep |
| Fake animated counters | Live zeros when empty | Violates proof-first / CONTEXT “not fake” |
| Disable Process until date filled | Current click-time gate only | Optional UX polish; either OK if date still required before process runs |
| Default today’s date silently | Explicit operator entry | Breaks honest KPI “when city sent this” |
| Idle metrics only in lists panel | Promote to desk rest | Fails IDLE-01 “at idle before process” |

**Installation:** none.

```bash
# verification spirit
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## Architecture Patterns

### Recommended touch set

```
public/
├── bridge.html          # MODIFY — upload panel order; optional idle proof mount nodes
├── js/bridge.js         # MODIFY — renderIdleProof from savedLists; keep date/process gates
└── css/bridge.css       # MODIFY — idle strip + demoted response meta + Process climax

lib/
├── bridge-list-store.js # READ-ONLY for 63
└── bridge-api.js        # READ-ONLY for 63

tests/                   # optional static string/DOM contract tests; no engine rewrite
```

### Pattern 1: Single source of truth for idle proof

```
loadSavedLists()
  → savedLists = data.lists
  → renderSavedLists()      // table + #bridge-lists-total
  → renderIdleProof()       // NEW: desk strip/scrap from same array
```

Derived:

```javascript
function computeIdleProof(lists) {
  const rows = Array.isArray(lists) ? lists : [];
  const listCount = rows.length;
  const recordTotal = rows.reduce((s, r) => s + (Number(r.recordCount) || 0), 0);
  const lastSaveAt = rows[0]?.createdAt || null; // API sorts createdAt desc
  // optional: readyCount, downloadedCount, byType...
  return { listCount, recordTotal, lastSaveAt };
}
```

### Pattern 2: Idle placement (discretion)

| Option | Pros | Cons |
|--------|------|------|
| **Desk header strip** (under hero / beside pipeline) | Visible at rest before any step; matches Command coverage row | Must survive phase 61 layout; avoid re-creating 3 equal cards |
| **Supporting scrap** (asymmetric desk scrap from 61) | Natural scrap content; doesn’t crowd upload | Hidden if operator never looks at scrap |
| **Hybrid** | Compact strip always + scrap detail | More CSS surface |

**Recommendation:** Prefer a **compact live strip always visible at desk rest** (not equal 3-up cards): one row of proof numbers. If phase 61 provides a scrap, scrap can host expanded inventory language later (67).

### Pattern 3: Upload climax DOM (preserve date)

Logical structure target:

```html
<section id="bridge-upload-panel">
  <!-- title + short lead -->
  <!-- format badges (tertiary) -->
  <!-- DROPZONE stage (dominant) -->
  <!-- RESPONSE META chip/row: label + #bridge-response-date + short hint -->
  <!-- actions: #bridge-process fire + #bridge-clear-file -->
</section>
```

Keep validation functions untouched unless wiring focus after demotion.

### Pattern 4: Phase boundary hygiene

| Phase | Owns |
|-------|------|
| 61 | Desk shell, kill decorative rail, atmosphere, Anton H1 |
| 62 | **City-scoped** dossier (lists for selected city, history, outcomes scrap) |
| **63** | **Global** idle proof + upload Process climax |
| 64 | Live feed **during** process |
| 65 | Post-process kill-rate report |
| 67 | Shift queue / staging inventory elevation |

**Avoid double-counting UX:** 63 global “lists staged / records / last save”; 62 filters same `savedLists` by `cityId` for dossier. Share helpers if both exist; don’t build two stores.

### Anti-patterns

- Rebuilding decorative equal 3-up “proof” with icons and static step titles  
- Fake numbers or marketing placeholders when API empty  
- Removing date requirement or auto-filling without operator intent  
- Sending response date into process multipart “for completeness” without product need (attach already owns KPI date)  
- Live scrub feed / kill-rate hierarchy in this phase  
- Wiping `filter-lists` in tests against real roots  
- New framework / component library  

---

## Don't Hand-Roll

| Problem | Don’t build | Use instead |
|---------|-------------|-------------|
| Inventory aggregate API | New endpoint | `GET /api/bridge/lists` + client reduce |
| Last-save clock | Server “now” heartbeat | `lists[0].createdAt` / `formatListWhen` |
| Process enable state machine lib | XState etc. | Existing `syncFileUi` + `processUpload` gates |
| Date picker component pack | flatpickr / React date | Native `input type="date"` (already) |
| Idle polling SSE | websockets | Load on init + existing mutation paths; optional focus refresh later |

**Key insight:** Lists data and process gates are done. Phase 63 is **where the truth is shown** (idle) and **what dominates the upload beat** (Process), not new persistence.

---

## Common Pitfalls

### Pitfall 1: Idle strip re-fetches or drifts from Saved lists

**What goes wrong:** Strip shows stale counts after save/delete.  
**Why:** Separate fetch or render path.  
**How to avoid:** Always update idle proof from `renderSavedLists` / shared `savedLists`.

### Pitfall 2: Equal 3 metric cards = M5 anti-pattern redux

**What goes wrong:** “Lists / Records / Last save” as three equal icon tiles.  
**Why:** Same sin as retired proof rail.  
**How to avoid:** One proof **row/strip** or Command-style status metrics — hierarchy, not feature grid.

### Pitfall 3: Demoting date until operators miss it

**What goes wrong:** Process errors “enter the date” repeatedly; frustration.  
**Why:** Meta too hidden / contrast too low.  
**How to avoid:** Tight but visible; keep focus-on-error; don’t `visibility:hidden`.

### Pitfall 4: Confusing last save with last process

**What goes wrong:** Label “last scrub” when data is **last list save**.  
**Why:** Process doesn’t write lists.  
**How to avoid:** Copy = “Last save” / “Last staged” — not “last process” unless wired to a real process log (none on index).

### Pitfall 5: City dossier vs global idle collision

**What goes wrong:** Two competing headers with similar numbers.  
**Why:** 62 city filter vs 63 global.  
**How to avoid:** Global strip = all staged inventory; dossier = selected city only; shared `computeIdleProof(lists, { cityId })` optional.

### Pitfall 6: Breaking attach KPIs

**What goes wrong:** Date cleared on process success or omitted from attach.  
**Why:** Aggressive panel reset / DOM rewrite.  
**How to avoid:** Keep `clearResponseDateTime` only where product already clears (downstream reset / post-save); attach still reads `getResponseAtValue()`.

### Pitfall 7: Scope creep into 64/65

**What goes wrong:** Building address feed or RAW→KILLED→KEPT in “climax” work.  
**Why:** Theater excitement.  
**How to avoid:** Success criteria only IDLE-01/02; loading panel stays as-is until 64.

---

## Code references (anchors)

| Topic | Path |
|-------|------|
| Summary fields | `lib/bridge-list-store.js` — `toSummary` |
| Index sort | `listSummaries` — `createdAt` desc |
| GET handler | `lib/bridge-api.js` — `handleListIndex` |
| Client load + totals | `public/js/bridge.js` — `loadSavedLists`, `renderSavedLists` |
| Process enable | `syncFileUi`, `clearFileUi` |
| Process gates + date | `processUpload`, `getResponseAtValue` |
| FormData (no date) | `buildProcessFormData` |
| Attach date | `attachDataset` → `responseReceivedAt` |
| Upload markup | `public/bridge.html` — `#bridge-upload-panel` |
| Dropzone / date CSS | `public/css/bridge.css` — `.bridge-dropzone*`, `.bridge-response-*` |
| UI map recs 3 & 7 | `.planning/codebase/filter-page-ui-map.md` §8 items 3, 6 |
| Requirements | `.planning/REQUIREMENTS.md` — IDLE-01, IDLE-02 |
| Roadmap success | `.planning/ROADMAP.md` — Phase 63 |
| Design bible | `.planning/v2.1-FILTER-SCRUB-THEATER.md` — proof-first, one fire CTA |

---

## Validation spirit (for later plan / execute)

Observable when 63 is done:

1. With zero lists: idle proof shows live empty (0 lists / 0 records / no last save) — not decorative step titles.  
2. After saving a list and reloading `/bridge`: idle proof matches lists API (count, Σ records, latest `createdAt`).  
3. Upload step: dropzone + Process read as climax; response date is compact meta, still required before process succeeds.  
4. Attach still accepts date when provided; process dirty-guard and multi-file labels still work.  
5. `npm test` green; `scripts/verify-live.ps1` exit 0 after `public/` edits.  
6. No live feed / kill-report chrome introduced early.

---

## Open questions (non-blocking for plan)

1. **Placement:** desk header strip vs scrap (CONTEXT discretion) — recommend compact always-on strip.  
2. **Optional metrics:** ready vs downloaded split / type heat — only if strip stays non-grid.  
3. **Process button disable until date filled** — optional UX; current click-time gate is sufficient if meta remains visible.  
4. **Idle refresh on tab focus** — nice-to-have if multi-tab operators share a user scope; not required for IDLE-01.

---

*Phase: 63-idle-proof-process-climax*  
*Research only — no implementation in this artifact.*
