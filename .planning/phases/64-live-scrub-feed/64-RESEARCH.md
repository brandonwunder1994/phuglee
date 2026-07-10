# Phase 64: Live Scrub Feed - Research

**Researched:** 2026-07-10  
**Domain:** Filter `/bridge` process-theater UI — client-staged scrub activity feed from process response (FEED-01–02)  
**Confidence:** HIGH (process payload, loading panel, and D4 locks verified in code; Analyze feed is reference-only)

## Summary

Phase 64 turns the Filter process beat from a **passive bar + rotating slogans** into a **live scrub activity feed** that shows addresses/types with kept / no-distress / discarded / already-in-Analyze language. The design bible and phase context **lock D4**: prefer a **client-staged feed built from the process response rows/meta**, not SSE. That matches the as-built architecture — `/api/bridge/process` is a single multipart POST that returns one JSON payload when `processUploadBatch` finishes; there is no streaming path in `lib/bridge-api.js` or `lib/bridge-engine`.

Today (`public/js/bridge.js`): `processUpload()` hides results, shows `#bridge-loading-panel`, rotates `LOADING_STEPS` every 900ms, awaits `fetchJson('/api/bridge/process')`, then `renderResults(data)`. The response already carries everything needed for truthful feed rows: `rows` (kept), `notDistressedRows` (FN / no-distress), `discarded` (thin reason + `rawPreview`), and `stats` (counts + `discardReasons`). **Do not invent unlabeled fake addresses.** Cap large lists (sample + “+N more”). Reduced-motion users get a static summary / crossfade — motion is never required for comprehension.

**Primary recommendation:** Implement a pure client helper that maps process response → feed events, mount a feed list inside/near `#bridge-loading-panel`, and **play a short staged reveal after the HTTP response arrives (still inside the process UI beat)** before handing off to `renderResults`. During the HTTP wait, keep phase slogans only (no fake addresses). **No SSE. No engine keep/kill rewrite. No kill-rate report chrome (Phase 65).**

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Feed data
- Prefer client-staged from process response rows/meta (D4)
- Status language: kept / no-distress / discarded / already-in-Analyze as applicable
- Never invent fake addresses as unlabeled “proof”

#### Motion
- FEED-02: prefers-reduced-motion → static summary / crossfade; motion not required for comprehension

### Claude's Discretion
- Whether feed animates before HTTP returns (optimistic phases) vs only post-response staged play
- Row sampling vs full list for large files (cap with “+N more” OK)

### Deferred Ideas (OUT OF SCOPE)
- SSE streaming
- kill-rate report chrome (65)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FEED-01** | While process runs, operator sees a **live scrub activity feed** (addresses and/or types with kept / no-distress / discarded / already-in-Analyze status language) — not only rotating copy + passive bar | Extend `#bridge-loading-panel` process beat: after `/api/bridge/process` returns, stage feed rows from `rows` / `notDistressedRows` / `discarded` + `stats` before `renderResults`. Optional phase slogans only during HTTP wait (no fake addresses). |
| **FEED-02** | Feed respects `prefers-reduced-motion` (static summary / crossfade allowed; no mandatory motion for comprehension) | Mirror `phuglee-motion.js` / Analyze `live-scan-feed.js`: `matchMedia('(prefers-reduced-motion: reduce)')` → paint summary counts + sample rows at once (or single crossfade); skip staggered intervals / auto-scroll. |
</phase_requirements>

---

## Gap Analysis (current tree vs FEED-01–02)

| Gap | Evidence today | Phase 64 target |
|-----|----------------|-----------------|
| Loading is slogans only | `LOADING_STEPS` + `startLoadingAnimation` (~900ms interval); bar via `phuglee-loading-state` | Feed list of real outcomes (post-response staged) |
| No address-level theater | Loading panel is copy + bar only (`bridge.html` L228–233) | Rows: address/type + status language |
| Truth risk | N/A (no feed yet) | Only real `streetAddress` / `rawPreview` / types from response; never unlabeled fakes |
| Large-file DOM risk | Process can return thousands of kept + up to 5000 FN rows (`MAX_FN_REVIEW_ROWS`) | Cap displayed feed rows; “+N more” from `stats` |
| Reduced-motion | Global a11y kills some CSS animations; loading interval still runs | Explicit feed path: static summary when `prefers-reduced-motion: reduce` |
| SSE temptation | Deferred in REQUIREMENTS + CONTEXT | **Do not implement** — not justified (below) |

---

## Process response fields usable for feed rows

### Success payload (`processUpload` / `processUploadBatch` → `sendJson(res, 200, payload)`)

Verified shape from `lib/bridge-engine/index.js` return + `lib/bridge-api.js` `handleProcess` (payload passed through unchanged):

| Field | Type | Feed use |
|-------|------|----------|
| `rows` | `KeptRow[]` | **kept** events — primary “alive” proof |
| `notDistressedRows` | `Row[]` (capped at `MAX_FN_REVIEW_ROWS` = 5000) | **no-distress** events |
| `discarded` | `{ reason, rawPreview, duplicateOf? }[]` | **discarded** / **already-in-Analyze** events |
| `stats.kept` | number | Cap remainder + summary header |
| `stats.noDistress` | number | Summary / “+N more” for FN bucket |
| `stats.discarded` | number | Total killed (includes no-distress in aggregate) |
| `stats.alreadyImported` | number | already-in-Analyze summary (may be 0 when IND-04 default-off) |
| `stats.deduplicated` | number | Optional discard flavor |
| `stats.discardReasons` | `{ [reasonLabel]: count }` | Reason breakdown for labels / sampling weights |
| `stats.totalParsed` | number | Optional “RAW” context for theater (full kill report is Phase 65) |
| `brainMeta.notDistressedTotal` / `notDistressedReturned` / `notDistressedTruncated` | numbers / bool | Honesty when FN list is truncated server-side |
| `processingMeta.durationMs` | number | Optional “scrubbed in Xs” chip; not required for feed rows |
| `processingMeta.parser` / `typeResolution` | meta | Optional phase flavor only — not address proof |
| `city`, `uploadType`, `sourceFile` / `sourceFiles` | meta | Feed header context |
| `reviewGroups` | train stacks | **Out of scope for feed** (Train theater = Phase 66) |

### Kept / FN row fields (full rows)

Useful display fields (already used by results table / export):

| Field | Feed display |
|-------|--------------|
| `streetAddress` | Primary line (required for address proof) |
| `violationIssueType` | Secondary / type chip |
| `distressedSignalTag` | Optional kept accent (kept only) |
| `confidenceLevel` | Optional; not required for FEED-01 |
| `city` / `state` / `zip` | Usually omit (city already selected) |

### Thin discard items (`discarded[]`)

Built by engine mappers (`mapDedupDiscards`, `mapImportDiscards`, normalizer discards):

| Field | Notes |
|-------|-------|
| `reason` | Human label from `DISCARD_REASONS` (or equivalent string) |
| `rawPreview` | Address or short preview — **use as address line when present** |
| `duplicateOf` | Present for near-dupes only |

### `DISCARD_REASONS` → feed status language

From `lib/bridge-intake-schema.js`:

| Reason key / label | Feed status |
|--------------------|-------------|
| `already_imported` / “Already imported in Analyze” | **already-in-Analyze** |
| `no_distress_signal` / “No distressed signal…” | **no-distress** (if ever present on thin discards; full FN rows usually live in `notDistressedRows` instead) |
| `duplicate` / “Near-duplicate within upload” | **discarded** (dup) |
| `no_address`, `blank_row`, `non_property`, `parse_error` | **discarded** |
| Any other reason string | **discarded** (generic) |

**Important composition note (HIGH confidence):**  
For successful code-violation process, **false-negative / generic rows are full rows in `notDistressedRows`**, not thin `discarded` entries. Non-review discards (bad address, blank, non-property, dupes, optional already-imported when hard-drop on) live in `discarded`. Feed builders must sample **both** arrays or operators will never see “no-distress” language on typical scrubs.

### Error / empty paths

| Code | Payload | Feed behavior |
|------|---------|---------------|
| `NO_USABLE_ROWS` (422) | `discarded[]`, `stats` | Optional: stage kill-only feed then error — or skip feed and keep error path. Prefer **short static discard summary** if cheap; do not invent kept rows. |
| `TYPE_COLUMN_CONFIRM_REQUIRED` (409) | confirm dialogs | **Hide feed / stop loading** (already stops spinner before modal). No staged play mid-confirm. |
| Network / parse failures | error wrap | No feed from fake data |

### Client consumption today

`renderResults(data)` already reads:

- `data.stats` → KPIs  
- `data.rows` → table  
- `data.processingMeta` → meta line  
- `getReviewGroups(data)` → Train  

Feed should run **after success payload is in hand**, **before or as a brief lead-in to** `renderResults(data)`, then yield so Phase 65 can restyle results without fighting a permanent loading overlay.

---

## Recommended architecture (D4 client-staged)

### Pattern: post-response staged play (recommended)

```text
Process click
  → show #bridge-loading-panel
  → phase slogans only while HTTP in flight (existing LOADING_STEPS OK)
  → await /api/bridge/process
  → buildFeedEvents(data)   // pure helper, unit-testable
  → playFeed(events)        // staged intervals OR instant if reduced-motion
  → renderResults(data)     // existing path
  → hide loading panel
```

**Why this and not true mid-pipeline streaming**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. Post-response staged play** | Truthful; zero server work; fits D4; unit-testable helper | Feed starts after wait (short files may feel brief) | **Recommend** |
| **B. Optimistic phases during HTTP only** | Something moves during wait | Cannot show real addresses without lying | Use **only as wait chrome**, not as proof |
| **C. Optimistic fake addresses during HTTP** | “Busy” theater | Violates CONTEXT + design bible proof-first | **Forbidden** unless labeled decorative (still discouraged) |
| **D. SSE / chunked process events** | Real mid-pipeline addresses | Requires engine rewrite, multi-phase HTTP, abort, new contracts; deferred in REQUIREMENTS | **Out of scope** |

### Discretion recommendation

| Decision | Recommendation | Rationale |
|----------|-----------------|-----------|
| Animate before HTTP returns? | **Phase slogans only** (keep/evolve `LOADING_STEPS`). No address rows until response. | Truth > theater; avoids unlabeled fakes |
| After response, stage play? | **Yes** — 1.2–2.5s staged reveal (capped), then results | Delivers FEED-01 “live feed” feel without SSE |
| Sampling vs full list | **Stratified sample + cap** | Avoid multi-thousand DOM nodes; `stats` already holds totals |
| Cap size | **24–40 visible rows** (default **32**), mirror Analyze `MAX_FEED = 50` upper bound | Enough theater; snappy on large files |
| “+N more” | Always when `stats` bucket total > sampled count | Honest remainder |

### Stratified sampling algorithm (prescriptive)

Pure function `buildScrubFeedEvents(data, opts)`:

1. Collect pools:
   - kept: `data.rows` → status `kept`, label from `streetAddress` + optional `violationIssueType`
   - noDistress: `data.notDistressedRows` → status `no-distress`
   - alreadyIn: `data.discarded` where reason matches already-imported → status `already-in-Analyze`, label `rawPreview`
   - discarded: remaining `discarded` → status `discarded`, label `rawPreview` or reason fallback
2. Target mix (adjust if a pool is empty): e.g. ~40% kept / ~30% no-distress / ~20% discarded / ~10% already-in-Analyze of the **cap**, not of full file.
3. Interleave buckets (round-robin) so the feed feels like a scrub, not “all kept then all kills.”
4. Attach `remainderByStatus` from `stats` (not pool length alone — FN may be truncated; alreadyImported may exceed discarded list if filter mode differs).
5. Return `{ events, summary }` where `summary` powers reduced-motion and header line.

**Never** synthesize street strings. If a discard has empty `rawPreview`, show reason-only line (still real) or skip that event.

### Status copy (ops voice)

| Status key | Operator language (examples) |
|------------|------------------------------|
| `kept` | Kept · distress |
| `no-distress` | No distress · dropped |
| `discarded` | Discarded · {short reason} |
| `already-in-Analyze` | Already in Analyze |

Avoid green SaaS “success” chrome; use ember/gold heat for kept hierarchy (desk language from design bible). Full RAW → KILLED → KEPT display-scale hierarchy is **Phase 65**, not this phase.

### DOM / CSS placement

| Piece | Location | Notes |
|-------|----------|-------|
| Mount | Inside `#bridge-loading-panel` | Already `aria-live="polite"` `aria-busy="true"` |
| List | New `#bridge-scrub-feed` (`ul`/`ol`) | Stable id for tests |
| Summary | `#bridge-scrub-feed-summary` | Counts line; primary for reduced-motion |
| Keep bar + phase copy | Existing `phuglee-loading-bar` / `#bridge-loading-copy` | Phase copy during HTTP; can freeze or become “Scrubbing results…” during staged play |
| Styles | `public/css/bridge.css` | Feed rows, status chips, reduced-motion rules — page-local, no new framework |
| IDs preserved | `bridge-process`, loading panel id | D5 / tests |

Do **not** invent a second loading surface outside the process beat. Do **not** ship kill-rate report layout in results (65).

### Reduced-motion approach (FEED-02)

Reuse project patterns:

- JS: `window.matchMedia('(prefers-reduced-motion: reduce)').matches` (`phuglee-motion.js`, Analyze `live-scan-feed.js`)
- CSS: `@media (prefers-reduced-motion: reduce)` disable row slide/fade intervals

**When reduced motion is on:**

1. Skip staggered `setInterval` / per-row delays.
2. Paint `summary` (e.g. `Kept 42 · No distress 180 · Discarded 12 · Already in Analyze 3`) immediately.
3. Optionally paint up to **N sample rows** all at once (static list) — not required if summary alone is clear.
4. Proceed to `renderResults` with no artificial multi-second delay (0–300ms crossfade max).

**When motion is allowed:**

1. Append events one-by-one (or small batches) every ~40–80ms until cap or pool exhausted.
2. Optional subtle enter transition; auto-scroll feed to newest if list is tall (Analyze sets `scrollTop = 0` on newest-first — pick one direction and stick to it).
3. Hard timeout (e.g. max 2.5s play) so large samples never stall the operator path.

### Cap for large lists

| Constant | Suggested value | Purpose |
|----------|-----------------|---------|
| `SCRUB_FEED_CAP` | 32 (range 24–40) | Max DOM rows during theater |
| `SCRUB_FEED_PLAY_MS` | 2000 (max 2500) | Wall-clock cap for staged play |
| `SCRUB_FEED_TICK_MS` | 50–80 | Interval between row reveals |
| Remainder copy | `+{n} more {status}` | From stats − shown |

Server already truncates FN review rows at 5000; client must still cap feed independently. **Do not** render full `rows` + `notDistressedRows` into the feed.

### No SSE (justification)

| Claim | Evidence |
|-------|----------|
| Process is one-shot | `handleProcess` → `processUploadBatch` → single `sendJson(200, payload)` |
| No stream hooks | No `text/event-stream` / EventSource usage in bridge API |
| Deferred product intent | REQUIREMENTS Future: “Server-streamed process events (SSE) if client-side staged feed is insufficient” |
| Cost of SSE | Engine would need incremental callbacks mid-parse/tag/dedupe; abort semantics; multi-file batch events; client reconnect — violates D1 surface-only milestone |
| Sufficiency | For typical city exports, duration is already measured in `durationMs` and returned with full row sets — staged play after response is enough theater for FEED-01 |

**Only revisit SSE later** if operators with multi-minute OCR/PDF batches report the wait feels empty *and* post-response theater is not enough — still out of this phase.

---

## Standard Stack

### Core

| Library / Surface | Version / Location | Purpose | Why Standard |
|-------------------|--------------------|---------|--------------|
| Vanilla `public/js/bridge.js` | as-built | Process UI, loading, results | D3 stack; all Filter interaction lives here |
| `public/css/bridge.css` | as-built | Feed chrome | Page-local design system |
| `public/bridge.html` | as-built | Loading panel mount | Stable process beat |
| `lib/bridge-engine` process response | as-built | Truth source for events | D1: no engine rewrite |
| `matchMedia('(prefers-reduced-motion: reduce)')` | platform | FEED-02 gate | Site pattern |
| `node:test` | project | Pure helper + static DOM contracts | Existing CI (`npm test`) |

### Supporting (reference only — do not couple)

| Module | Use |
|--------|-----|
| Analyze `modules/property-analyzer/public/js/live-scan-feed.js` | Cap + reduced-motion list pattern (`MAX_FEED = 50`) — **concept only**, different app |
| `public/js/phuglee-motion.js` | Reduced-motion helper pattern |
| Home `home-filter-tally*` | Marketing raw→kept vocabulary (optional tone, not DOM reuse) |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Client-staged post-response | SSE mid-pipeline | Deferred; unjustified for v2.1 surface milestone |
| Client-staged post-response | Fake addresses during wait | Forbidden by proof-first / CONTEXT |
| In-page feed helper in `bridge.js` | New npm animation lib | Violates zero-framework / D3 |
| Feed in results panel | Loading-panel beat | Blurs Phase 64 vs 65; FEED is “while process runs” |

**Installation:** none — no new packages.

---

## Architecture Patterns

### Recommended project structure (delta only)

```
public/
  bridge.html          # feed list + summary nodes inside loading panel
  css/bridge.css       # .bridge-scrub-feed* styles + reduced-motion
  js/bridge.js         # play orchestration in processUpload success path
  js/bridge-scrub-feed.js   # OPTIONAL pure helper (preferred if >~80 LOC)
tests/
  bridge-scrub-feed.test.js # buildScrubFeedEvents / cap / status mapping
```

Prefer a **pure helper module** (or IIFE-exported functions) so event building is unit-tested without DOM. Keep play/timer logic thin in `bridge.js`.

### Pattern 1: Build events from response (pure)

```javascript
// Conceptual — planner implements against real field names above
function buildScrubFeedEvents(data, { cap = 32 } = {}) {
  const stats = data.stats || {};
  const kept = (data.rows || []).map((r) => ({
    status: 'kept',
    address: String(r.streetAddress || '').trim(),
    type: String(r.violationIssueType || '').trim()
  })).filter((e) => e.address);

  const noDistress = (data.notDistressedRows || []).map((r) => ({
    status: 'no-distress',
    address: String(r.streetAddress || '').trim(),
    type: String(r.violationIssueType || '').trim()
  })).filter((e) => e.address);

  const discardedEvents = [];
  for (const d of data.discarded || []) {
    const reason = String(d.reason || '');
    const isImported = /already imported/i.test(reason) || reason === 'already_imported';
    discardedEvents.push({
      status: isImported ? 'already-in-Analyze' : 'discarded',
      address: String(d.rawPreview || '').trim(),
      type: reason
    });
  }

  // stratified sample + interleave → events (≤ cap)
  // summary from stats.kept / noDistress / discarded / alreadyImported
  return { events, summary, remainderByStatus };
}
```

### Pattern 2: Play then hand off

```javascript
// Inside processUpload success path (before renderResults)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const built = buildScrubFeedEvents(data, { cap: 32 });
await playScrubFeed(built, { reducedMotion: reduced, maxMs: reduced ? 0 : 2000 });
renderResults(data);
```

Clear any feed timer in `finally` with `stopLoadingAnimation` so confirm/cancel/error paths never leave intervals running.

### Anti-patterns

- **Fake address ticker during HTTP** — violates proof-first; fails CONTEXT.
- **Rendering full `rows` into feed** — multi-thousand DOM; freezes low-end laptops.
- **SSE “just in case”** — out of scope; expands engine surface.
- **Kill-rate RAW→KEPT mission panel in this phase** — Phase 65 owns results chrome.
- **Blocking `renderResults` for long staged plays** — hard-cap play duration.
- **Green SaaS flash rows** — brand heat (ember/gold) for kept; stone for kills.
- **Breaking `bridge-process` / loading panel contracts** — D5 DOM hooks.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Mid-pipeline truth | Custom SSE server + client EventSource | Client-staged from existing JSON | Payload already complete |
| Status taxonomy | New kill ontology | Map to kept / no-distress / discarded / already-in-Analyze + existing `DISCARD_REASONS` labels | FEED-01 language already specified |
| Motion preference | Ad-hoc “disable animations” flag only in CSS | `matchMedia('(prefers-reduced-motion: reduce)')` + static summary | Site-wide pattern; FEED-02 |
| Address shortening | Novel fuzzy truncation | Simple trim / existing short-label helpers if needed | Keep feed dumb |
| Large list UX | Virtualized grid library | Cap + “+N more” | Cap is enough for theater |

**Key insight:** The scrub theater problem is a **presentation** problem. The engine already finished the work when the response arrives — the feed is a **truthful replay**, not a second pipeline.

---

## Common Pitfalls

### Pitfall 1: Treating `discarded` as the only kill source
**What goes wrong:** Feed shows kept + random discards but almost never “no-distress.”  
**Why:** FN rows live in `notDistressedRows`.  
**How to avoid:** Always sample both pools.  
**Warning signs:** `stats.noDistress > 0` but zero no-distress feed lines.

### Pitfall 2: Inventing rows to fill dead air during HTTP
**What goes wrong:** Operators (and QA) treat decorative streets as proof.  
**How to avoid:** Phase slogans only until `data` exists; label any decorative chrome as non-proof if ever added (prefer none).

### Pitfall 3: Unbounded staged play on huge files
**What goes wrong:** 5000-row sample * 60ms = minutes stuck on loader.  
**How to avoid:** Cap events **and** wall-clock `maxMs`.

### Pitfall 4: Leaving loading panel / timers after type-confirm modal
**What goes wrong:** Spinner or feed interval continues under dialog (already a concern for confirm path).  
**How to avoid:** Stop feed + loading in the same places `stopLoadingAnimation` runs today (confirm, error, finally).

### Pitfall 5: Overlapping Phase 65 kill-rate report
**What goes wrong:** Results panel gets dual “theater” systems; planner thrash.  
**How to avoid:** Phase 64 owns **loading-beat feed only**; results KPI/report redesign is 65.

### Pitfall 6: IND-04 already-imported display
**What goes wrong:** Feed implies hard-drop of Analyze addresses when default-off keeps them.  
**How to avoid:** Only emit already-in-Analyze events when `stats.alreadyImported > 0` or discarded reasons actually include already-imported (same honesty as `renderKpis` omitting zero card).

### Pitfall 7: XSS via address/type injection
**What goes wrong:** Raw HTML in feed from municipal free text.  
**How to avoid:** Reuse `esc()` already in `bridge.js` for all feed text.

---

## Code Examples

### Existing loading beat (anchor)

```4:12:public/js/bridge.js
  const LOADING_STEPS = [
    'Detecting format…',
    'Parsing records…',
    'Normalizing addresses…',
    'Tagging distressed signals…',
    'Deduplicating upload…',
    'Cross-checking Analyze…',
    'Building filtered list…'
  ];
```

```1631:1643:public/js/bridge.js
  function startLoadingAnimation() {
    let index = 0;
    loadingCopy.textContent = LOADING_STEPS[0];
    loadingTimer = window.setInterval(() => {
      index = (index + 1) % LOADING_STEPS.length;
      loadingCopy.textContent = LOADING_STEPS[index];
    }, 900);
  }

  function stopLoadingAnimation() {
    if (loadingTimer) window.clearInterval(loadingTimer);
    loadingTimer = null;
  }
```

Success handoff today (insert staged feed **before** `renderResults`):

```2923:2925:public/js/bridge.js
      showError('');
      renderResults(data);
      updateTrainUndoButton();
```

### Analyze feed cap + reduced-motion (reference only)

```7:33:modules/property-analyzer/public/js/live-scan-feed.js
    const MAX_FEED = 50;
    const feedItems = [];
    // ...
      while (feedItems.length > MAX_FEED) feedItems.pop();
```

```50:63:modules/property-analyzer/public/js/live-scan-feed.js
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      liveScanFeed.innerHTML = feedItems.map((item) => {
        // ...
        return `<li class="live-scan-item is-${...}${reducedMotion ? ' no-motion' : ''}">
```

### Engine discard / FN split (truth source)

- Thin discards: normalizer + dedupe + import filter → `discarded`
- No-distress full rows: `filterDistressOnly` removed → `notDistressedRows` (capped 5000)
- Stats: `stats.noDistress`, `stats.alreadyImported`, `stats.discardReasons`

---

## State of the Art (this product)

| Old approach (Filter today) | Phase 64 approach | When | Impact |
|-----------------------------|-------------------|------|--------|
| Rotating slogans + bar | Real address/type feed from process JSON | v2.1 Phase 64 | Proof-first scrub theater |
| KPIs only after results show | Brief staged kill/keep feed in process beat | same | Climax of process path (depends on Phase 63 desk) |
| Deferred SSE for “live” | Client-staged replay | Locked D4 | No engine/stream complexity |

**Deprecated for this phase:** server-streamed process events; kill-rate report layout; Train pivot UI.

---

## Open Questions

1. **Exact play duration vs operator impatience**
   - What we know: short files return quickly; long OCR can take seconds–tens of seconds.
   - What's unclear: preferred staged-play length without feeling fake delay after response.
   - Recommendation: default **≤2s** staged play when motion allowed; **0s** when reduced-motion; hard cap **2.5s**.

2. **NO_USABLE_ROWS feed**
   - What we know: 422 returns `discarded` + `stats`.
   - What's unclear: whether to theater empty kept scrubs.
   - Recommendation: optional **static** discard summary only; do not animate empty success.

3. **Helper file vs inline `bridge.js`**
   - What we know: `bridge.js` is already large (~3k lines).
   - Recommendation: extract pure `buildScrubFeedEvents` (+ maybe `formatScrubFeedSummary`) to `public/js/bridge-scrub-feed.js` if >~80 LOC; keep timers in `bridge.js`.

4. **Phase 63 dependency**
   - Feed mounts on process climax beat. If Phase 63 not executed yet, still implement against current loading panel — 63 only repositions climax chrome.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include automated map.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-scrub-feed.test.js` (Wave 0) |
| Full suite command | `npm test` |
| Live gate | `scripts/verify-live.ps1` (after any `public/` edit) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FEED-01 | `buildScrubFeedEvents` maps kept / no-distress / discarded / already-in-Analyze from fixture-like payload | unit | `node --test tests/bridge-scrub-feed.test.js` | ❌ Wave 0 |
| FEED-01 | Cap ≤ N; remainder reported when stats > sample | unit | same | ❌ Wave 0 |
| FEED-01 | No synthetic addresses when pools empty | unit | same | ❌ Wave 0 |
| FEED-01 | Loading panel contains feed mount id(s) in `bridge.html` | static | `node --test` assertion on HTML string or small DOM contract test | ❌ Wave 0 |
| FEED-02 | Reduced-motion path returns summary-first / zero staged delay config | unit | same helper test with `reducedMotion: true` options object | ❌ Wave 0 |
| FEED-02 | CSS includes `@media (prefers-reduced-motion: reduce)` rules for feed animation classes | static | grep/assert in test or brand-audit style check | ❌ optional |
| Regression | Independence / gold / engine processUpload still green | suite | `npm test` | ✅ existing |
| Live | health + home 200 | smoke | `scripts/verify-live.ps1` | ✅ existing |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-scrub-feed.test.js` (+ any static HTML test)
- **Per wave merge:** focused bridge tests + new feed tests
- **Phase gate:** `npm test` green + `scripts/verify-live.ps1` exit 0

### Wave 0 Gaps

- [ ] `tests/bridge-scrub-feed.test.js` — pure event builder: status mapping, cap, remainder, no fakes, already-imported honesty
- [ ] Optional: `tests/bridge-scrub-feed-dom.test.js` or extend list-factory/static test to assert `#bridge-scrub-feed` exists in `public/bridge.html`
- [ ] No new framework install required

**Manual-only (document in plan, not blocking automation):** visual check of staged play at 390/1440; OS reduced-motion on; one real process on a multi-row fixture file.

---

## Sources

### Primary (HIGH confidence)

- `.planning/phases/64-live-scrub-feed/64-CONTEXT.md` — locked D4, FEED motion, discretion, deferred SSE/kill-report
- `.planning/v2.1-FILTER-SCRUB-THEATER.md` — D4 feed data, theater-with-truth, stack locks
- `.planning/REQUIREMENTS.md` — FEED-01, FEED-02; Future SSE deferral
- `.planning/ROADMAP.md` — Phase 64 success criteria; depends on 63; 65 owns kill report
- `.planning/codebase/filter-page-ui-map.md` — loading panel inventory; process path
- `public/js/bridge.js` — `LOADING_STEPS`, `processUpload`, `renderResults`, KPI honesty for alreadyImported
- `public/bridge.html` — `#bridge-loading-panel` aria-live mount
- `lib/bridge-engine/index.js` — process return shape, FN vs discarded split, stats
- `lib/bridge-intake-schema.js` — `DISCARD_REASONS`, `emptyProcessingStats`
- `lib/bridge-api.js` — process payload passthrough; NO_USABLE_ROWS details
- `lib/bridge-review-groups.js` — `MAX_FN_REVIEW_ROWS = 5000`
- `modules/property-analyzer/public/js/live-scan-feed.js` — reference cap + reduced-motion list (concept only)
- `public/js/phuglee-motion.js` / `public/css/phuglee-a11y.css` — reduced-motion conventions
- `.planning/config.json` — `nyquist_validation: true`

### Secondary (MEDIUM confidence)

- Home filter tally CSS (`public/css/home-ui-preview.css`) — marketing raw→kept vocabulary for tone only
- Typical process durations via `processingMeta.durationMs` surface (EFF polish) — exact operator SLA not measured this research pass

### Tertiary (LOW confidence)

- Ideal staged-play duration preference (1.2 vs 2.5s) — product feel; plan should pick a default and hard-cap

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Vanilla bridge surface locked by design bible; no new libs needed |
| Architecture | HIGH | Response fields verified in engine + API; D4 forbids SSE path |
| Process field map | HIGH | Read from `index.js` return + schema + client `renderResults` |
| Reduced-motion | HIGH | Existing site + Analyze patterns; FEED-02 explicit |
| Cap constants | MEDIUM | 32 recommended by analogy to Analyze 50; planner may tune 24–40 |
| Play timing | MEDIUM | UX preference; hard-cap mitigates risk |
| Pitfalls | HIGH | FN/`discarded` split and IND-04 zero card verified in code |

**Research date:** 2026-07-10  
**Valid until:** ~30 days (stable Filter process contract; re-check if process payload shape changes)

---

## RESEARCH COMPLETE

**Phase:** 64 - Live Scrub Feed  
**Confidence:** HIGH

### Key Findings

1. **D4 client-staged feed is the only in-scope architecture** — process is one-shot JSON; SSE deferred and unjustified.
2. **Feed truth sources:** `rows` (kept), `notDistressedRows` (no-distress), `discarded` + `stats` (discarded / already-in-Analyze) — must sample FN rows or “no-distress” never appears.
3. **Recommend post-response staged play** (≤2–2.5s, cap ~32 rows, “+N more”); during HTTP wait use phase slogans only — **no fake addresses**.
4. **FEED-02:** `prefers-reduced-motion` → static summary (optional static samples); skip stagger.
5. **No Phase 65 kill-rate chrome; no engine rewrite; Wave 0 unit tests for pure event builder.**

### File Created

`C:\Users\brand\Projects\distress-os\.planning\phases\64-live-scrub-feed\64-RESEARCH.md`

### Ready for Planning

Research complete. Planner can create PLAN.md tasks from this document.
