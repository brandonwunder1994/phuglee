# Phase 67: Multi-City Shift & Staging - Research

**Researched:** 2026-07-10  
**Domain:** Filter multi-city shift desk — sticky session queue, staging inventory HUD, brand-heat post-save  
**Confidence:** HIGH (save/reset/flash/lists inventory verified in `bridge.js` / `bridge.css` / list store / static tests); MEDIUM only on exact queue chrome placement (CONTEXT leaves left-rail vs top strip to discretion)

## Summary

Phase 67 turns the already-shipped **multi-list factory** into an **ops shift desk**: operators batch many cities in one sitting, always see what is staged, and after each Save land back on a one-click next-city posture — without inventing a second list backend or wiping the store.

**What already ships (do not rebuild):**

1. **Durable multi-city staging** — `lib/bridge-list-store.js` + `GET/POST/PATCH/DELETE /api/bridge/lists`, download one/all, `ready`/`downloaded` status, user scope under `FILTER_LISTS_ROOT`.
2. **Post-save full working-set reset** — `resetImportAreaAfterSave` clears city/type/files/results/Train, **keeps state + city option lists loaded**, focuses city select, scrolls to Saved lists.
3. **Post-save flash + optional CSV** — `#bridge-lists-flash` teaching copy + `#bridge-flash-download-csv` / `data-action="flash-download"` (EFF-02: never auto-download).
4. **Lists table + total strip** — type chips (⚠️/💧), rename, records, Ready/Downloaded, city, CSV/XLSX/Delete, Download all, Clear all.

**What is not done (Phase 67 focus):**

| Gap | Evidence |
|-----|----------|
| No **sticky shift queue** chrome (session-visible staged cities / order-of-work) | Only the full Saved lists table below the fold; no “this shift” strip/rail |
| Inventory reads as **spreadsheet**, not war-room HUD | UI map rec 10; flat total line; no count tiles / type heat summary over table |
| Success flash is **green SaaS**, not brand heat | `.bridge-lists-flash` uses `rgba(120,180,140,…)` + `#9fd4a8` |
| “Next city one-click without re-teaching” is **partial** | State preserved + city focus yes; still full wizard reset feel, scroll-to-lists interrupt, proof-rail/long teaching stack re-visible (desk slim is Phase 61; shift UX is 67) |
| Downloaded status chip also green | `.bridge-list-status--downloaded` same green island family |

**Primary recommendation:** **Client-only shift layer on top of existing lists API.** Derive durable inventory from `savedLists` (already loaded on page + after every save). Optionally overlay a **session-only** ordered queue (in-memory and/or `sessionStorage`) of `{listId, city, state, uploadType, recordCount, savedAt}` pushed on each successful save — **no new backend routes, no schema change.** Elevate lists panel into a **staging inventory HUD** (counts + type heat + ready/download language) **above** the existing table, keep all row actions. Restyle flash (and status “ready for enrich” language) to **ember/gold** heat; preserve Download this list (CSV) path and no-auto-download locks.

---

<user_constraints>
## User Constraints (from CONTEXT.md / product locks)

### Locked Decisions

- **SHIFT-01:** Multi-city shift: sticky queue/inventory of staged cities/lists; after save, next city is one-click without re-teaching chrome / full wizard restart feel
- **SHIFT-02:** Saved lists read as **staging inventory** (counts, type heat, ready/download language) while preserving rename / download / delete / download-all APIs
- **SHIFT-03:** Post-save success uses **brand heat** (ember/gold), not green SaaS flash; optional “Download this list” path remains
- **Preserve list APIs** — do not wipe data; rename/download/delete/download-all stay working
- **No new framework** — vanilla `public/` stack (v2.1 D3)
- **AGENTS.md:** never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores
- **Independence:** no Filter → Analyze auto-push; no auto-save every process; no auto-delete after download
- **Depends on Phase 66** (roadmap): post-process/train path stable; Save still primary
- **Zero new npm packages**

### Claude's Discretion (from CONTEXT)

- Queue placement: **left rail vs top strip**
- Session-only queue vs **derived purely from lists API**

### Deferred (OUT OF SCOPE)

- Multi-operator collaboration
- Auto-delete after download
- Server-streamed process events (SSE) — Phase 64 deferred path
- New list store / multi-tenant shift server
- Engine keep/kill rewrite
- Analyze scan page changes

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SHIFT-01** | Multi-city shift: sticky queue/inventory; after save, next city one-click without re-teaching / full wizard restart feel | As-built: `resetImportAreaAfterSave` clears working set, keeps state+city options, focuses city. Gaps: no sticky shift chrome; scroll-to-lists + green flash dominate; no session queue of cities just staged. Session-side queue + keep next-city focus + stop feeling like day-1 onboarding. |
| **SHIFT-02** | Saved lists = staging inventory (counts, type heat, ready/download language); preserve list actions/APIs | As-built: table + type badges + Ready/Downloaded + `#bridge-lists-total`. Gaps: no HUD over table; copy still “Saved lists” spreadsheet voice; type heat only per-row. Elevate presentation only — no API rewrite. |
| **SHIFT-03** | Post-save success brand heat (ember/gold), not green SaaS; optional Download this list remains | As-built: `#bridge-lists-flash` + flash CSV button + 10s hide; EFF/LIST tests lock strings + no auto-download. Gaps: green CSS palette. Restyle to heat; keep CTA + click-only download. |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### Post-save reset behavior (`resetImportAreaAfterSave`)

**Location:** `public/js/bridge.js` ~1792–1923  
**Called from:** `saveCurrentList` after successful `POST /api/bridge/lists` and `await loadSavedLists()` (~1967–1968)

| Step | Behavior | SHIFT relevance |
|------|----------|-----------------|
| Clear working set | `lastResult = null`, `selectedCity = null`, `selectedUploadType = ''`, `selectedFiles = []` | Prevents city B inheriting city A’s rows (LIST-01 lock — **keep**) |
| Clear Train session | undo stack, decided keys, train search/page, brainVersion, resultsMode → `kept` | Correct isolation between cities |
| Clear chrome | type radios, files, response datetime, city outcome UI; hide type/upload/results/save/attach/train | Full reset feel — intentional, but reads as “wizard restart” |
| **Keep state options** | Comment: “Clear city pick; keep state + city dropdown options so next TX city is one click” — only `citySelect.value = ''` | **Already one-click next city within same state** if operator stays on state |
| Pipeline | `setPipelineStep('location')` | Back to step 1 orthography |
| Focus | `citySelect?.focus()` | Next action = pick city |
| Scroll | `listsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })` | Pulls eyes to lists; can fight “stay on desk for next city” |
| Flash | Build/show `#bridge-lists-flash` 10s | Teaching + optional CSV |

**Locked by tests (do not regress):**

- `tests/bridge-list-factory-ux.test.js` — full reset asserts (`selectedCity = null`, empty upload type, `lastResult = null`, clear response datetime, train clear, `setPipelineStep('location')`, flash teaches “pick the next city”, **no** `downloadSavedList(` inside reset body).
- `tests/bridge-efficiency-path.test.js` — flash download affordance present; **no auto-download** in `resetImportAreaAfterSave`.

**Implication for SHIFT-01:** Do **not** keep prior city selected or leave `lastResult` mounted. The win is **chrome + inventory continuity**, not reusing the previous process payload. “Without re-teaching chrome” means: slim veteran desk (Phase 61), sticky inventory always visible, session queue of work done, stay in shift posture — **not** skip city clear.

```
POST-SAVE FLOW (as-built):
  Save list → POST /api/bridge/lists
    → loadSavedLists() / renderSavedLists()
    → resetImportAreaAfterSave(name, id)
         → wipe working set + hide results
         → flash on lists panel + optional Download this list
         → scroll to lists
         → focus city select (state still selected if was)

OPERATOR NEXT CLICK (same state):
  City dropdown only (type → date → files → process)

GAP vs SHIFT-01 ideal:
  • No persistent “shift strip” of cities already staged this sitting
  • Scroll-to-lists + 10s flash can feel like leaving the desk
  • Teaching copy still day-1 essay length on page (partially Phase 61)
```

### Flash green location (SHIFT-03 target)

| Piece | Location | Notes |
|-------|----------|--------|
| DOM mount | JS-created `#bridge-lists-flash` inside `#bridge-lists-panel` | After `.bridge-panel-lead` if present, else `prepend` |
| Class | `.bridge-lists-flash` | `role="status"` |
| Text | `.bridge-lists-flash-text` | “Saved “{name}”. Filter reset — pick the next city…” |
| CTA | `#bridge-flash-download-csv` / `data-action="flash-download"` | Only if `savedListId`; click → `downloadSavedList` |
| Hide | 10s timeout `flash.hidden = true` | Clear-all reuses flash with 5s message |
| Styles | `public/css/bridge.css` ~1285–1316 | **Green SaaS island** |

```css
/* CURRENT — anti-pattern for brand heat */
.bridge-lists-flash {
  background: rgba(120, 180, 140, 0.12);
  border: 1px solid rgba(120, 180, 140, 0.28);
  color: #9fd4a8;
}
.bridge-flash-download {
  color: #c8e8cf;
  border: 1px solid rgba(120, 180, 140, 0.42);
}
```

**Brand heat targets (tokens already live):**

| Token | Value / alias | Use |
|-------|---------------|-----|
| `--phuglee-gold` / `--heat-core` | `#eeb746` | Highlight / heat core |
| `--phuglee-orange` / `--ember` | `#e58435` | Primary heat / success ember |
| `--phuglee-terracotta` | `#ac6b32` | Secondary depth |
| v2.1 DO | Ember/gold heat for success | Explicit: no green SaaS flashes |

**Also green (discretionary fix with SHIFT-03):**

- `.bridge-list-status--downloaded` → `rgba(120, 180, 140, …)` / `#9fd4a8` — same SaaS green island on inventory rows. Prefer heat-muted “Downloaded” or cream/stone status with gold Ready heat so inventory does not reintroduce green.

### Lists API & summary shape (inventory source of truth)

**Store:** `lib/bridge-list-store.js`  
**Summaries:** `toSummary(meta)` → client `savedLists[]`

| Field | Type | HUD use |
|-------|------|---------|
| `id` | string | Flash download, row actions, session queue key |
| `name` | string | Display / rename |
| `createdAt` / `updatedAt` | ISO | Last save / sort |
| `status` | `ready` \| `downloaded` | Ready/download language |
| `cityId`, `city`, `state` | string | City queue chips |
| `uploadType` | string | Type heat (CV vs water) |
| `sourceFile` | string | Optional meta |
| `recordCount` | number | Counts |
| `downloadedAt` | ISO \| null | Downloaded proof |

**Client already aggregates:**

```javascript
// renderSavedLists — total strip
Total: {N} records across {M} lists
```

**Derived metrics available with zero API change:**

| Metric | Derivation |
|--------|------------|
| Lists staged | `savedLists.length` |
| Records staged | sum `recordCount` |
| Ready vs downloaded counts | filter by `status` |
| Ready records / Downloaded records | sum by status |
| Type heat (CV vs water counts / records) | `listUploadTypeBadge` / `uploadType` grouping |
| Cities touched | unique `cityId` or `city+state` |
| Last save | max `createdAt` / first row if index is newest-first |

Store `index.unshift` on save → newest first in API list — good for “just staged” highlight.

**APIs that must keep working (SHIFT-02):**

| Method | Path | UI binding |
|--------|------|------------|
| GET | `/api/bridge/lists` | `loadSavedLists` |
| POST | `/api/bridge/lists` | `saveCurrentList` |
| PATCH | `/api/bridge/lists/:id` | rename |
| DELETE | `/api/bridge/lists/:id` | per-row delete |
| DELETE | `/api/bridge/lists` | clear all |
| GET | `.../download?format=` | per-list CSV/XLSX |
| GET | `.../download-all?format=` | toolbar Download all |

### Inventory HUD over table (as-built vs target)

**As-built panel** (`public/bridge.html` `#bridge-lists-panel`):

1. Header: “Saved lists” + master staging lead + toolbar (Download all CSV/XLSX, Clear all)
2. Empty dashed teaching box **or**
3. Table: Type · List name · Uploaded · Records · Status · City · Actions
4. `#bridge-lists-total` muted strip under table

**Type heat already partial:** row chips `.bridge-list-type--violation` (ember-tinted) vs `--water` (blue). No panel-level heat summary.

**UI map diagnosis (rec 10 + density):** “Spreadsheet-like… admin tool, not war-room inventory.”

**Target pattern (peer language, don’t invent):** Territory/Command HUD — display-scale counts, heat ramp gold→ember, status chips; Collect scrap proof. Inventory should read **counts first, table second**.

Recommended HUD composition (research, not plan):

```
┌─ Staging inventory ─────────────────────────────────────┐
│  [12 lists]  [4,280 records]  [9 Ready]  [3 Downloaded] │
│  Type heat:  ⚠️ 8 CV · 💧 4 Water   ·  Cities: 11        │
│  (optional session): Irving · Midlothian · … just staged │
├─ table (unchanged columns + actions) ───────────────────┤
│  …                                                      │
└─ Total strip (can merge into HUD or stay as a11y live) ─┘
```

### Sticky queue session-side (no new backend)

CONTEXT discretion: *session-only queue vs derived purely from lists API*. Both are valid **without new server**.

#### Option A — Derive purely from lists API (simplest)

- Sticky inventory **is** `savedLists` already in memory.
- HUD chips + optional city rollup from unique cities in summaries.
- “Queue” order = API order (newest first) or sort by `createdAt`.
- Survives refresh within durable store; survives process restart (LIST-02).
- **No** “only this browser tab’s shift” distinction — shows all staged lists for user (may include yesterday’s).

**When enough:** Operators treat Saved lists as the shift backlog; multi-day accumulate is a feature (LIST-02).

#### Option B — Session-only ordered shift queue (recommended hybrid)

On each successful save in `saveCurrentList` (after `data.list` returns):

```javascript
// Conceptual — no server
shiftQueue.unshift({
  listId: savedId,
  name: savedName,
  city: data.list?.city || lastResult?.city?.city,
  state: data.list?.state || …,
  uploadType: …,
  recordCount: …,
  savedAt: Date.now()
});
// optional: sessionStorage.setItem('bridge_shift_queue', JSON.stringify(shiftQueue))
```

| Property | Behavior |
|----------|----------|
| Source of truth for **files** | Still lists API / disk |
| Queue | Client memory; optional `sessionStorage` for tab refresh mid-shift |
| Clear | Tab close (memory) or session end; **never** clear server lists |
| Sticky chrome | Top strip or left rail of chips: city · type · records · Ready |
| After save | Push chip + update HUD from `loadSavedLists` |
| Conflict with LIST-02 | None — queue is a view overlay; delete list should drop chip if id matches |

**Why hybrid wins SHIFT-01:** Durable HUD answers “what is staged for enrich”; session queue answers “what I did **this sitting**” without multi-operator server (deferred).

#### Option C — Rejected for this phase

| Approach | Why not |
|----------|---------|
| New `/api/bridge/shift` store | Overkill; deferred multi-operator; AGENTS data surface growth |
| Keep `lastResult` after save | Breaks LIST full-reset lock; city inheritance bugs |
| Auto-select next city from a planned itinerary | No itinerary product; no API |
| localStorage permanent queue | Stale vs durable lists; confusing with multi-device |

### “One-click next city without re-teaching”

| Already true | Still friction |
|--------------|----------------|
| Same-state city pick is one select | Must re-pick type every city (product — type can differ) |
| States not reloaded on save | Response date cleared (correct for KPIs) |
| City select focused | Scroll to lists pulls away from city control |
| Flash teaches next city | Flash green + long teaching reads day-1 |
| Pipeline back to location | Full proof-rail + long hero essay still on page (Phase 61 DESK) |

**Phase 67-owned levers (within SHIFT):**

1. Sticky inventory / queue always visible so operator never “loses” staged work mentally.
2. Soft post-save posture: keep focus on city (or desk), optional gentler scroll (flash near desk or dual announce).
3. Copy: short shift voice (“Staged. Next city.”) not full factory essay on every save.
4. Do **not** re-show type/upload panels until city chosen (already true).

**Owned by earlier phases (do not re-scope 67 into 61):** asymmetric desk, kill proof rail, slim teaching chrome, hero length — Phase 61 DESK. City dossier history (Phase 62) can later feed “already staged for this city” on select; SHIFT can surface count-by-city from lists today without dossier.

---

## Standard Stack

### Core (touch surface)

| Module / file | Role | Phase 67 action |
|---------------|------|-----------------|
| `public/js/bridge.js` | save, reset, flash, `renderSavedLists`, `loadSavedLists` | **Primary** — session queue, HUD render, flash copy; keep reset contracts |
| `public/css/bridge.css` | flash green, list type/status, table | **Primary** — heat flash; HUD layout; status heat |
| `public/bridge.html` | `#bridge-lists-panel` structure | **Light** — HUD mount points / heading voice (“Staging inventory”) |
| `lib/bridge-list-store.js` | multi-list CRUD | **KEEP** — no schema/API rewrite |
| `lib/bridge-api.js` | lists routes | **KEEP** |
| `tokens.css` | ember/gold/success tokens | **Read** — use heat, avoid inventing greens |

### Supporting tests (extend, don’t gut)

| Test file | Locks |
|-----------|--------|
| `tests/bridge-list-factory-ux.test.js` | reset fullness, flash teaching, LIST CTAs |
| `tests/bridge-efficiency-path.test.js` | flash download present; no auto-download; IND bans |
| `tests/bridge-list-store.test.js` | store CRUD |
| `tests/bridge-api-handlers.test.js` | HTTP lists contract |
| `tests/bridge-independence.test.js` | save only under filter-lists |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Client session queue + lists-derived HUD | New shift API | Server complexity; deferred multi-op |
| Ember/gold restyle of existing flash | New toast system / library | Extra deps; flash node already exists |
| HUD over table | Replace table with cards only | Loses dense rename/download actions; worse multi-list ops |
| Soft partial reset (keep city) | Full reset (current) | City inheritance bugs; breaks LIST tests |
| Green success (status-up token) | Brand heat | Explicit v2.1 DON’T |

**Installation:** none.

```bash
npm test
# after public/ edits:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1
```

---

## Architecture Patterns

### Pattern 1: Inventory = lists API; Queue = session overlay

**What:** Durable truth from `savedLists`; optional `shiftQueue` for this sitting.  
**When:** Every multi-city day.  
**Do not:** Persist queue by wiping or rewriting list store index.

### Pattern 2: Reset hygiene stays; shift chrome softens restart feel

**What:** Keep `resetImportAreaAfterSave` isolation. Add queue push + HUD refresh + heat flash **after** reset (or inside, after clear).  
**When:** Every successful save.  
**Do not:** Auto-download; keep prior `lastResult`; skip city clear.

### Pattern 3: HUD over table, not instead of table

**What:** Summary strip/chips above `#bridge-lists-table`; row actions unchanged.  
**When:** `renderSavedLists` whenever lists non-empty (and empty state still teaches once).  
**Do not:** Break `data-action` download/rename/delete wiring or download-all toolbar IDs used by tests/handlers.

### Pattern 4: Brand-heat success flash

**What:** Same DOM contract (`#bridge-lists-flash`, flash download button); CSS + short copy only.  
**When:** Save success + clear-all message reuse.  
**Do not:** Drop EFF-01 “Download this list” string/affordance without updating efficiency tests.

### Recommended touch structure

```
public/
├── bridge.html          # lists panel heading + HUD mount (optional empty slot)
├── css/bridge.css       # heat flash; inventory HUD; status chips
└── js/bridge.js         # shiftQueue optional; renderInventoryHud; flash copy/scroll/focus polish

lib/
├── bridge-list-store.js # KEEP
└── bridge-api.js        # KEEP

tests/
├── bridge-list-factory-ux.test.js     # KEEP reset locks; optional SHIFT strings
├── bridge-efficiency-path.test.js     # KEEP flash download + no auto-dl
└── bridge-shift-staging.test.js       # NEW optional — HUD/flash heat/static markers
```

---

## Don't Hand-Roll

| Problem | Don't hand-roll | Use instead |
|---------|-----------------|-------------|
| Multi-list persistence | New JSON files / second store | `bridge-list-store` + existing lists API |
| Post-save CSV path | Auto-download or new export endpoint | Existing flash → `downloadSavedList` |
| Type classification for HUD | New taxonomy service | Existing `listUploadTypeBadge` / `uploadType` |
| Session auth on list fetch | Custom cookies | Existing `bridgeHeaders` / Phuglee session |
| Success color system | Hard-coded random greens/blues | `--phuglee-gold` / `--phuglee-orange` / cream |
| Counts | Fake decorative numbers | Live sums from `savedLists` only |

---

## Common Pitfalls

### Pitfall 1: Weakening full reset “for speed”

**What goes wrong:** Next city’s process inherits prior rows or Train decisions.  
**Signals:** Soft-keep `lastResult` or `selectedCity` after save.  
**Prevention:** Keep LIST-01/LIST factory reset asserts green; only change chrome around reset.

### Pitfall 2: Queue that deletes server lists

**What goes wrong:** “Clear shift” wipes durable staging.  
**Signals:** Shift clear calling `DELETE /api/bridge/lists`.  
**Prevention:** Session queue clear ≠ Clear all lists; Clear all stays explicit confirm.

### Pitfall 3: Green flash swap without keeping Download CTA

**What goes wrong:** EFF-01 regression; operators re-hunt CSV in table.  
**Signals:** Flash text-only; no `flash-download`.  
**Prevention:** Keep button + click handler; only restyle/copy.

### Pitfall 4: HUD that breaks row actions

**What goes wrong:** Event delegation on `#bridge-lists-panel` misses rename/download.  
**Signals:** Rebuilt table without `data-action` / `data-list-id`.  
**Prevention:** Extend `renderSavedLists`; don’t replace action model.

### Pitfall 5: Treating Phase 61 desk rewrite as Phase 67

**What goes wrong:** Scope explosion into proof rail / hero / asymmetric desk.  
**Signals:** Plans editing proof rail 3-up as SHIFT work.  
**Prevention:** SHIFT owns lists inventory + post-save shift posture; DESK owns foundation.

### Pitfall 6: New backend for “sticky”

**What goes wrong:** Unnecessary API surface; deploy/volume complexity.  
**Signals:** New routes under `/api/bridge/shift`.  
**Prevention:** sessionStorage/memory + lists GET is enough for SHIFT-01.

### Pitfall 7: Scroll fight after save

**What goes wrong:** Focus city then smooth-scroll to lists — next city feels like two tasks.  
**Signals:** Operators say they “have to find the city select again.”  
**Prevention:** Discretion: flash inline near desk **or** inventory sticky in viewport **or** shorter scroll; still announce save via `role="status"`.

---

## Code Examples (as-built anchors)

### Save → load → reset

```1792:1923:public/js/bridge.js
  /**
   * After Save list: full fresh-filter reset so the next city cannot inherit
   * the previous session's city, type, file, response time, results, or Train state.
   * Saved lists + optional flash download stay; never auto-downloads.
   */
  function resetImportAreaAfterSave(savedLabel, savedListId) {
    // ... clears working set, keeps state options, builds #bridge-lists-flash,
    // optional Download this list (CSV), 10s hide, scrollIntoView lists, focus city
  }
```

### Lists total + type badge (HUD seeds)

```1708:1779:public/js/bridge.js
  function listUploadTypeBadge(uploadType) { /* violation vs water */ }
  function renderSavedLists() {
    // table rows + listsTotalEl: "Total: N records across M lists"
  }
```

### Summary contract

```103:117:lib/bridge-list-store.js
function toSummary(meta) {
  return {
    id, name, createdAt, updatedAt, status,
    cityId, city, state, uploadType, sourceFile,
    recordCount, downloadedAt
  };
}
```

---

## State of the Art / Peer patterns (in-repo)

| Peer | Steal for SHIFT | Don’t steal |
|------|-----------------|-------------|
| Territory / coverage dock | Display-scale counts, heat chips, compact dock language | Full map embed (out of scope) |
| Command mission status | Live counts, ops status chips | Health-only semantics |
| Collect desk scrap | Secondary inventory scrap alongside primary work | Tracker product coupling |
| Phase 56 list factory | Save → download teaching, no Analyze push | Spreadsheet-only presentation |
| Phase 59 EFF flash download | One-click CSV after save | Green palette |

v2.1 design bible DO: “Ember/gold heat for success”; DON’T: “Green SaaS success flashes.”

---

## Validation Architecture

### Testable behaviors

| Behavior | How to lock |
|----------|-------------|
| Full reset still clears city/type/results/train | Existing LIST factory static slice tests |
| No auto-download on save | Existing EFF-02 function body scan |
| Flash download affordance remains | Existing EFF-01 `Download this list` + flash-download markers |
| Flash uses heat not green (CSS) | Static assert: `.bridge-lists-flash` rules lack green rgb islands **or** include gold/orange tokens |
| Inventory HUD shows counts from lists | Static markers for HUD ids/classes + optional string “Ready” / “Staged” |
| Rename/download/delete/download-all still wired | Existing factory + API tests; smoke IDs |
| No wipe of list store | Independence + AGENTS; no new delete-on-save |

### Runtime verify

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Manual multi-city smoke: State TX → City A → process → save → confirm flash heat + inventory counts up → City B one select → process → save → two lists in HUD; download/rename/delete still work.

---

## Open Questions (for planner / implementer — not blockers)

1. **Queue chrome placement:** top strip under pipeline vs left rail on asymmetric desk (desk shape may land in Phase 61 first — plan SHIFT flexible to either mount).
2. **Session queue default:** pure lists-derived HUD only vs hybrid session chips — research recommends **hybrid if cheap**, pure lists if time-boxed.
3. **Scroll after save:** keep scroll-to-lists (proves inventory) vs keep desk-focused with live HUD always in view once desk layout ships.
4. **Downloaded chip color:** restyle with SHIFT-03 green purge vs leave until inventory pass — recommend **purge green islands** on lists surface together.
5. **Empty state personality:** Phase 61/empty duck may own peak empty; SHIFT only needs inventory empty copy not to fight shift voice.

---

## Sources

### Primary (verified in tree)

- `.planning/phases/67-multi-city-shift-staging/67-CONTEXT.md`
- `.planning/REQUIREMENTS.md` — SHIFT-01–03
- `.planning/ROADMAP.md` — Phase 67 success criteria
- `.planning/v2.1-FILTER-SCRUB-THEATER.md` — heat success DO/DON’T
- `.planning/codebase/filter-page-ui-map.md` — flash green gap, inventory rec 10–11, post-save friction
- `public/js/bridge.js` — `saveCurrentList`, `resetImportAreaAfterSave`, `renderSavedLists`, flash download handler
- `public/css/bridge.css` — `.bridge-lists-flash`, type/status chips, totals
- `public/bridge.html` — `#bridge-lists-panel`
- `lib/bridge-list-store.js` — `toSummary`, statuses, download-all
- `tests/bridge-list-factory-ux.test.js`, `tests/bridge-efficiency-path.test.js`
- `public/css/tokens.css` — ember/gold tokens
- Prior phase research: `56-RESEARCH.md` (list factory), `59-RESEARCH.md` (post-save download)

### Confidence by topic

| Topic | Confidence | Notes |
|-------|------------|-------|
| Post-save reset behavior | HIGH | Code + static tests |
| Flash location + green styles | HIGH | DOM + CSS lines verified |
| Session queue without backend | HIGH | Feasible; placement discretionary |
| Inventory HUD over table | HIGH | Data fields exist; pure presentation |
| Exact strip vs rail layout | MEDIUM | Depends on Phase 61 desk geometry |
| Multi-day vs session-only queue default | MEDIUM | Product taste; hybrid recommended |

---

## RESEARCH COMPLETE

Phase 67 is a **surface + session UX** phase on a finished list factory: keep list store/APIs and full post-save isolation; add sticky inventory/queue chrome from client-side lists (+ optional session overlay); restyle success to ember/gold; leave Download this list click-only. No new backend, no data wipes, no Analyze re-coupling.

---
*Phase: 67-multi-city-shift-staging*  
*Research only — no PLAN.md / no code changes in this step*
