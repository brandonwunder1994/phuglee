# Phase 65: Kill-Rate Scrub Report - Research

**Researched:** 2026-07-10  
**Domain:** Filter post-process results — cinematic kill-rate scrub report (RAW → KILLED → KEPT), proof chips from existing process meta, Save/Stage CTA hierarchy  
**Confidence:** HIGH (stats/meta/CTA fully verified in `bridge.js` / `bridge.html` / engine; peer HUD patterns verified in home/command CSS; no engine rewrite required)

## Summary

Phase 65 is **surface theater on data the engine already returns**. After `/api/bridge/process` succeeds, `renderResults` paints a **single meta sentence** + an **equal auto-fit KPI tile grid** (`renderKpis`) where only “Kept (distress)” is accented. Kill reasons, duration, format reuse, and discard story already exist on `data.stats` / `data.processingMeta` but read as admin footnotes — not a mission readout.

The product gap is hierarchy and proof, not computation:

| Need | Already true | Missing on surface |
|------|--------------|--------------------|
| RAW count | `stats.totalParsed` | Not shown as display-scale hero |
| KILLED total + reasons | `stats.discarded`, `noDistress`, `deduplicated`, `alreadyImported`, `discardReasons` | Flat peer KPI cards; “other” is a remainder math |
| KEPT | `stats.kept` + `rows[]` | Accent tile only; no dossier samples |
| Process proof | `durationMs`, `typeResolution` (auto_reuse), parser, discard story in stub | Buried in `#bridge-results-meta` string + optional `#bridge-stub-note` |
| Primary CTA | `#bridge-save-list` primary; `#bridge-export-csv` = Preview CSV | Layout still leads with KPI grid → table → save; Stage language optional |

**Primary recommendation:** Reforge the results head (`#bridge-results-meta` + `#bridge-kpi-grid` + `#bridge-stub-note`) into a **kill-rate scrub report**: display-scale **RAW → KILLED → KEPT** (Territory/Command HUD language), kill-reason breakdown from `discardReasons` (+ counters), proof chips from `processingMeta`, optional 3–5 sample kept dossiers from `rows`. Keep `#bridge-save-list` primary and Preview CSV secondary. **Zero engine / keep-kill rewrite. Zero new npm packages.** Stable IDs for Save / Preview / train wrap preserved for LIST/EFF/TRAIN tests.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Report hierarchy
- Display-scale **RAW → KILLED → KEPT** (not equal KPI tile grid as primary)
- Kill-reason breakdown from existing process stats
- Meta (duration, format reuse, discard story) as **proof chips/HUD**

#### CTA
- Primary: **Save list / Stage**
- Secondary: **Preview CSV**
- **No Analyze push**

#### Phase boundary
- After process, results open as kill-rate scrub report
- Analyze boundary preserved
- Train theater pivot is **phase 66** (do not implement Train climax here; leave hooks intact)

### Claude's Discretion
- Optional 3–5 sample kept address dossiers visual treatment
- How existing KPI grid is **replaced vs demoted**

### Deferred (OUT OF SCOPE)
- Train theater (66)
- Shift inventory (67)
- Live scrub feed (64) — feed ends when results open; report is the climax readout
- Rewrite `processUpload` keep/kill engine (REQUIREMENTS Out of Scope)
- Auto-push Filter → Analyze
- New framework / shared design-system extraction beyond page-local CSS
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **KILL-01** | After process, results open with a **kill-rate scrub report**: display-scale RAW → KILLED → KEPT hierarchy, kill-reason breakdown, optional sample kept dossiers — not only equal KPI tiles | As-built: equal `bridge-kpi-grid` + `renderKpis`. Data ready: `totalParsed` / kill counters / `discardReasons` / `rows`. **Action:** replace or demote equal grid; build hierarchy + reasons; optional dossier strip. |
| **KILL-02** | Process meta already computed (duration, format reuse, discard story) surfaces as **proof chips/HUD**, not a single buried meta sentence | As-built: one concatenated `#bridge-results-meta` string + prose stub note. Meta fields already on `processingMeta` + stats. **Action:** chip/HUD strip; keep independence wording. |
| **KILL-03** | Primary post-scrub CTA remains **Save list / Stage** (Analyze boundary preserved); Preview CSV stays secondary | As-built LIST-01: `#bridge-save-list` primary, Preview CSV label locked by tests. **Action:** visual elevation of Save/Stage in report flow; no Analyze CTA; do not rebrand Preview to Export CSV. |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### Results panel structure (`public/bridge.html` L235–358)

| Order today | Node | Role |
|-------------|------|------|
| 1 | H2 “Results & save” + step badge 4 | Wizard step chrome |
| 2 | `#bridge-results-meta` | Single prose meta line |
| 3 | `#bridge-kpi-grid` | Equal auto-fit KPI cards |
| 4 | `#bridge-stub-note` | Discard / review / independence prose (often hidden) |
| 5 | `#bridge-train-wrap` | Admin mode tabs (Kept / Train / Brain) — **phase 66** |
| 6 | `#bridge-results-toolbar` | Filters + **Preview CSV** (`#bridge-export-csv`) |
| 7 | Table + pagination | Kept rows |
| 8 | `#bridge-workflow-strip` | Process → (Train) → Save → Download → enrich → manual Analyze |
| 9 | `#bridge-save-panel` / `#bridge-save-list` | **Primary** durable save |
| 10 | `#bridge-attach-panel` | Optional Form Forge attach (not Analyze) |

### `renderKpis` — current equal grid (`public/js/bridge.js` ~1645–1663)

```text
Cards (left→right, auto-fit minmax 120px):
  1. Kept (distress)          ← accent only
  2. No distress signal
  3. Discarded (other)        ← discarded − noDistress (clamped ≥0)
  4. Already in Analyze       ← only if alreadyImported > 0 (IND-04)
  5. Needs review             ← kept attribute, not a kill
  6. Deduped
```

CSS (`bridge.css` ~677–716): `repeat(auto-fit, minmax(120px, 1fr))` — **equal peer tiles**. Accent is a quiet border/orange value, not display-scale hierarchy. This is the same family of “equal mini-cards” called out in filter-page-ui-map §8 rec 8 / SS3.

### `renderResults` meta sentence (~2254–2295)

Concatenates into **one** `#bridge-results-meta` text node:

| Fragment | Source |
|----------|--------|
| `N record(s) kept from {file(s)}` | `rows.length`, `sourceFile` / `fileCount` |
| upload type · city, state | `uploadType`, `data.city` |
| parser | `processingMeta.parser` |
| Analyze index count | `processingMeta.importIndexCount` (if > 0) |
| Format reused · Type: {header} | `processingMeta.typeResolution.source === 'auto_reuse'` |
| duration `X.Xs` | `processingMeta.durationMs` |
| admin train tip | open Train group count (admin only) |

**KILL-02 gap:** all of the above is buried prose. Phase 59 already intended reuse + duration visibility; they still live inside that string.

### Stub / discard story (`#bridge-stub-note` ~2313–2331)

Prose for: total discarded, no-distress count, alreadyImported, needsReview, and clean-path “Save the list below — nothing was sent to Analyze.” Hidden when all zero. This **is** the discard story — but it competes with KPI cards and does not read as HUD chips.

---

## Stats → RAW / KILLED / KEPT mapping

### Canonical stats object (`emptyProcessingStats` in `lib/bridge-intake-schema.js`)

| Field | Type | Meaning |
|-------|------|---------|
| `totalParsed` | number | Rows the pipeline counted as input (RAW) |
| `kept` | number | Distress-kept rows returned in `rows` (KEPT) |
| `discarded` | number | Rows in discard path (includes no-distress when tallied into discarded set) |
| `noDistress` | number | Generic / not-distressed kills |
| `deduplicated` | number | Near-dupes removed |
| `alreadyImported` | number | Analyze-index hits; hard-drop **opt-in only** (IND-04 default-off → usually 0) |
| `needsReview` | number | Kept rows flagged low-confidence extraction |
| `lowConfidence` | number | Kept confidence=low (UI falls back for needs review) |
| `discardReasons` | `{ [reason]: count }` | Breakdown keys (engine + human labels) |
| `tagBreakdown` | object | Kept tag histogram (secondary; not kill hierarchy) |
| `confidenceBreakdown` | high/medium/low | Kept confidence (secondary) |

### Display math (client-only; no engine change)

```text
RAW     = Number(stats.totalParsed) || (kept + killedEstimate)
KEPT    = Number(stats.kept) || (rows || []).length
KILLED  = max(0, RAW - KEPT)
        // Prefer RAW − KEPT for single display number so hierarchy always sums.
        // Fallback if totalParsed missing: discarded + deduplicated + alreadyImported
        // (dedupe / already_imported may sit outside discarded.length depending on path)
```

**Invariant for UI copy:** `RAW ≈ KEPT + KILLED`. Prefer `totalParsed` as RAW when present (engine always sets it via `buildStats`). After Train mutates `lastResult.rows` / `stats.kept`, **recompute display KEPT from live `stats.kept`** (already updated on decisions ~359–428); RAW/KILLED can stay process-time or re-derive if stats still hold original totals — do **not** invent new server fields.

### Kill-reason breakdown (from existing data)

**Preferred source:** `stats.discardReasons` entries with count > 0, sorted by count desc.

Canonical reason strings (`DISCARD_REASONS` in `bridge-intake-schema.js`):

| Key / label shown in stats | Operator-facing chip label (suggested) | Bucket |
|----------------------------|----------------------------------------|--------|
| `No usable street address` | No address | Kill |
| `Blank or empty row` | Blank row | Kill |
| `Clearly non-property record` | Non-property | Kill |
| `Near-duplicate within upload` | Deduped | Kill |
| `Already imported in Analyze` | Already in Analyze | Kill (only if > 0) |
| `No distressed signal (generic code violation)` / `no_distress_signal` | No distress signal | Kill |
| `Could not parse row` | Parse error | Kill |

**Also surface as reasons when counters > 0 and not already in map:**

| Counter | Label |
|---------|-------|
| `stats.noDistress` | No distress signal (alias for `no_distress_signal`) |
| `stats.deduplicated` | Deduped |
| `stats.alreadyImported` | Already in Analyze |

**Not kills (secondary chips only):**

| Field | Label | Placement |
|-------|-------|-----------|
| `needsReview` / `lowConfidence` | Needs review | Proof / quality chip under KEPT |
| Open Train groups (admin) | N Train groups ready | Admin chip; theater is phase 66 |

### Current KPI card → hierarchy remap

| Today’s KPI card | Maps to | New treatment |
|------------------|---------|---------------|
| — (missing) | **RAW** | Display-scale number (largest or first in flow) |
| Discarded (other) + No distress + Deduped + Already in Analyze | **KILLED** total | Single display-scale KILLED + reason breakdown list/bars |
| Kept (distress) | **KEPT** | Display-scale survivor; ember/gold heat (brand, not SaaS green) |
| Needs review | Quality under KEPT | Small chip, not peer of RAW/KILLED/KEPT |

### Home marketing vocabulary alignment

Home Filter scene uses `.home-filter-tally-raw` / `.home-filter-tally-kept` + kill/keep lists (`home-ui-preview.css`). Product `/bridge` should speak the same **raw → kept** dialect at **ops display scale** (Territory HUD: `.home-territory-hud-stat strong` clamp ~1.25–1.65rem Anton/display), not marketing mono micro-type. Avoid home’s green “kept success” island if it fights gritty heat — prefer cream/gold kept + ember kill accents per v2.1 DO list.

---

## Proof chips from `processingMeta`

### Fields already returned (`lib/bridge-engine/index.js` ~505–538)

| Meta field | When useful | Chip copy (examples) |
|------------|-------------|----------------------|
| `durationMs` | Always if finite ≥ 0 | `1.4s scrub` / `Scrubbed in 1.4s` |
| `typeResolution.source === 'auto_reuse'` | Day-2 known format | `Format reused` (+ header if present) |
| `typeResolution.header` | When set | `Type: {header}` or “No type column” |
| `typeResolution.formatMatched` | true on reuse | Optional confirm of match |
| `parser` | Always | `xlsx` / `csv` / `pdf` / `stub` |
| `parseMode` / `sheetName` / `delimiter` | Sparse | Secondary detail, not first-class chips |
| `importIndexCount` | > 0 | `N in Analyze index` (cross-check proof, not a push) |
| `brainVersion` / `brainAppliedRuleIds` | Admin / debug | Optional slim “Brain vN · M rules” — keep out of non-admin clutter |
| `pageCount` / `ocrConfidence` | OCR paths | Optional when present |

### Discard story chips (from stats, not only stub prose)

| Source | Chip |
|--------|------|
| `stats.discarded` | `N discarded` |
| Top 1–3 `discardReasons` | e.g. `42 no distress` |
| Clean path | `0 discards` or omit + independence line |
| Independence | Short fixed: “Nothing sent to Analyze” (preserve LIST-03 / IND language) |

### Implementation shape (recommended)

1. **Mission readout row:** RAW · KILLED · KEPT (display-scale, left-aligned, not equal marketing 3-up feature cards — hierarchy by size/weight/color, not three identical tiles).
2. **Kill reasons strip:** horizontal or stacked reason chips with counts (real data only).
3. **Proof chip row:** duration · format reuse · parser · (optional) Analyze index · needs-review · independence.
4. Demote or remove prose-only meta sentence; if city/file context still needed, one short ops line under the HUD: `{city} · {type} · {file}`.

**Reuse `#bridge-results-meta` and/or `#bridge-kpi-grid`:** either reforge in place (keep IDs for fewer HTML churn) or add a `#bridge-kill-report` wrapper and leave old IDs as hosts. Prefer **reforge content of existing hosts** so callers of `renderKpis` / `renderResults` stay simple. `renderKpis` is also called after Train decisions (~445–446) — new renderer must tolerate live `stats.kept` updates.

---

## CTA hierarchy (KILL-03)

### Locked operator path (post-process)

| Priority | Control | ID | Status today | Phase 65 target |
|----------|---------|-----|--------------|-----------------|
| **1 Primary** | Save list | `#bridge-save-list` | Primary orange CTA in save panel | Stay primary; may add **Stage** voice (“Stage list” / “Save & stage”) without breaking test match `/Save list/` or keep label “Save list” and use Stage in surrounding copy |
| **2 Secondary** | Preview CSV | `#bridge-export-csv` | Ghost in toolbar; client blob of filtered rows | Stay secondary; keep label **Preview CSV** (LIST-01 / EFF tests) |
| **3 After save** | Download (lists panel) | per-list / download-all | Phase 67 inventory polish | Out of scope except don’t break |
| Side | Attach versioned dataset | `#bridge-attach` | Optional Forge | Keep demoted |
| Forbidden | Send to Analyze / auto-push | — | Absent (Phase 55) | Must remain absent |

### Layout hierarchy problem

Today visual order is: **meta → KPIs → (admin tabs) → toolbar/Preview → table → workflow strip → Save**. Save is primary by button class but **late in scroll**. Phase 65 should make the kill report land first, then surface **Save/Stage adjacent to the report win** (above or sticky near report), with Preview remaining in toolbar or as ghost near table — not competing with Save weight.

### Test contracts to preserve

| Test | Assertion |
|------|-----------|
| `tests/bridge-list-factory-ux.test.js` | `id="bridge-save-list"`, label **Save list**, `id="bridge-export-csv"`, label **Preview CSV**, workflow strip language |
| `tests/bridge-efficiency-path.test.js` | Save list primary CTA carry-forward; auto_reuse surfaced in results path |
| Independence suites | No Analyze push strings/modules |

---

## How to replace the equal KPI grid

### Problem

`.bridge-kpi-grid { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }` + 5–6 peer cards is the **post-process** instance of M5/v2.1 equal-feature-grid anti-pattern. Accent on Kept is insufficient hierarchy for SS3 “cinematic kill-rate.”

### Options (discretion)

| Option | Description | Recommend? |
|--------|-------------|------------|
| **A. Replace (preferred)** | `#bridge-kpi-grid` becomes kill-rate HUD root: three hierarchical counts + reason children; drop equal card template | **Yes** — clearest KILL-01 |
| **B. Demote** | Keep grid for secondary stats only; insert new display-scale report above | Acceptable if Train/table callers expect grid chrome |
| **C. Dual** | Show hierarchy + old grid | **No** — doubles chrome; fights slim teaching |

### Recommended visual structure (vanilla, page-local CSS)

```text
#bridge-results-panel
  [optional slim step header]
  .bridge-kill-report (or repurposed #bridge-kpi-grid)
    .bridge-kill-flow
      RAW (display-scale, stone/cream)
      →
      KILLED (display-scale, heat/ember)
      →
      KEPT (display-scale, gold/orange accent — survivor)
    .bridge-kill-reasons   ← chips from discardReasons
    .bridge-proof-chips    ← duration, format reuse, parser, independence…
    .bridge-kept-samples   ← optional 3–5 dossiers (discretion)
  #bridge-results-meta     ← short city/file context OR emptied if chips own proof
  #bridge-stub-note        ← hide when chips cover discard story; keep for stub:true edge
  … train wrap (66) …
  toolbar (Preview secondary) + table
  workflow strip
  save panel (primary) + attach
```

### Hierarchy rules (avoid new equal 3-up)

- RAW / KILLED / KEPT must **not** be three identical cards with the same type ramp.
- Use **asymmetric scale** (e.g. KEPT largest or KILLED emphasized mid-flow), heat color on kill, gold on kept, quieter stone on raw — Territory HUD pattern, not proof-rail clone.
- Kill-reason chips are **breakdown**, not a second equal KPI row of the same visual weight as the three heroes.
- Zero-kept / stub / NO_USABLE_ROWS paths: still show RAW → KILLED → KEPT=0 with reasons (error path already builds breakdown for NO_USABLE_ROWS ~1233–1251).

### Optional sample kept dossiers (discretion)

| Field from `rows[i]` | Dossier line |
|----------------------|--------------|
| `streetAddress` | Title |
| `violationIssueType` | Subtitle / issue |
| `distressedSignalTag` | Tag chip (existing `bridge-tag--*`) |
| `confidenceLevel` / `needsReview` | Optional meta |

Take first 3–5 of `rows` (or prefer Strong tag first if cheap). Purely presentational; table remains source of truth. Skip when `rows.length === 0`.

### CSS / atmosphere notes

- Extend `bridge.css`; do not pull React.
- Prefer display font (`--font-display` / Anton stack already on KPI values) at **clamp** sizes larger than current `1.45rem` for the three heroes.
- Respect `prefers-reduced-motion` if any reveal/count-up is added (QA-03 family; feed motion is 64 — report can be static).
- Do not introduce green SaaS success for KEPT if avoidable (v2.1 DON’T / SHIFT heat direction).

---

## Peer patterns to copy (don’t invent)

| Peer | Steal for Phase 65 |
|------|--------------------|
| Territory HUD (`.home-territory-hud-stat`) | Display-scale number + uppercase micro label |
| Command status stack | Mission readout, not form wizard footer |
| Home filter tally | RAW → KEPT vocabulary + kill reason language |
| Collect desk | Ops voice; one fire CTA dominance |
| Existing `bridge-tag` | Kept sample dossiers |

---

## Code touch map (expected implement surface)

| File | Likely changes |
|------|----------------|
| `public/js/bridge.js` | Rewrite `renderKpis` and/or split `renderKillReport(stats, data)`; slim `renderResults` meta string into chips; optional sample dossier HTML; ensure Train-driven re-render still updates KEPT |
| `public/css/bridge.css` | Kill-flow HUD, reason chips, proof chips; retire equal-card-as-primary styles |
| `public/bridge.html` | Minimal: optional wrapper markup / Stage copy near save; keep stable IDs |
| Engine / API | **None** unless a bug shows `totalParsed` missing (unlikely) |
| Tests | Prefer static HTML/JS contract tests for hierarchy labels + Save/Preview IDs; no gold accuracy rewrite |

**Stable IDs / hooks to keep:**  
`bridge-results-panel`, `bridge-results-meta`, `bridge-kpi-grid` (host OK), `bridge-stub-note`, `bridge-save-list`, `bridge-list-name`, `bridge-export-csv`, `bridge-train-wrap`, `bridge-workflow-strip`, process/table IDs used by phases 64/66.

---

## Gap analysis vs KILL-01–03

| Req | Exists today | Gap | Phase 65 action |
|-----|--------------|-----|-----------------|
| KILL-01 hierarchy | Quiet accent on Kept tile | No RAW; equal grid; no cinematic flow | Display-scale RAW→KILLED→KEPT |
| KILL-01 reasons | Partial (2 kill cards + stub prose) | Not a sorted multi-reason breakdown UI | Render `discardReasons` + counters |
| KILL-01 samples | Full table only | No dossier strip | Optional 3–5 cards from `rows` |
| KILL-02 duration | In meta string | Not a chip | Proof chip |
| KILL-02 format reuse | In meta string if auto_reuse | Not a chip | Proof chip (EFF carry-forward) |
| KILL-02 discard story | Stub note prose | Buried / often hidden | Reason + discard chips |
| KILL-03 Save primary | Button primary class | Below fold after table | Elevate near report; keep label/tests |
| KILL-03 Preview secondary | Ghost + Preview label | OK | Keep secondary |
| KILL-03 Analyze boundary | Workflow strip + save lead | Must survive copy reflow | Preserve “nothing sent to Analyze” |

---

## Risks & pitfalls

1. **Equal 3-up relapse** — Three same-weight RAW/KILLED/KEPT cards recreate DESK-02/M5 anti-pattern. Hierarchy must be scale/color/flow, not another feature rail.
2. **IND-04** — Do not show “Already in Analyze” kill drama when count is 0 (current `renderKpis` already omits zero).
3. **Train live mutation** — After Approve/Deny, `stats.kept` and rows change; kill report KEPT must refresh (`renderKpis` already re-called).
4. **Double counting** — Prefer RAW−KEPT for KILLED total; reason chips from `discardReasons` may not sum exactly to KILLED if counters overlap — label as breakdown, not requiring exact partition if engine leaves residual.
5. **Stub / zero-kept** — Still show report; save panel stays hidden when no rows (`setHidden(savePanel, !showTable)`).
6. **Phase 66 boundary** — Do not pivot admin to Train theater here; only leave open-group count as optional proof chip if already computed.
7. **Test label locks** — “Save list”, “Preview CSV”, save button id — do not rename casually.
8. **No engine rewrite** — All numbers come from existing process payload.

---

## Validation approach (for planner / later QA)

| Gate | How |
|------|-----|
| Visual | Process a real list → report shows RAW > KILLED > KEPT hierarchy at a glance |
| Reasons | Multi-reason file shows >1 kill-reason chip with counts |
| Chips | auto_reuse city shows Format reused; duration chip present |
| CTA | Save list remains primary control; Preview CSV secondary; no Analyze push |
| Regression | `npm test` (LIST/EFF/IND/ACC green); `scripts/verify-live.ps1` after public edits |
| Motion | If count-up added, `prefers-reduced-motion` static values |
| Mobile | 390px: no horizontal overflow; CTAs ≥ 44px |

---

## Open questions (resolve in plan, not blockers)

1. **Stage vs Save list label** — CONTEXT says “Save list / Stage”; tests lock “Save list”. Prefer **keep button “Save list”** + Stage language in report/save panel lead.
2. **Count-up animation** — Optional theater; static HUD is enough for KILL-01 if reduced-motion cost is high.
3. **Sample dossiers** — Ship if cheap (3 cards); cut first if schedule tight — not required for KILL-01 core wording (“optional”).
4. **Host element** — Reforge `#bridge-kpi-grid` vs new `#bridge-kill-report` (recommend reforge + class rename in CSS).

---

## Sources

### Internal (primary)
- `.planning/phases/65-kill-rate-scrub-report/65-CONTEXT.md`
- `.planning/REQUIREMENTS.md` — KILL-01–03
- `.planning/v2.1-FILTER-SCRUB-THEATER.md`
- `.planning/codebase/filter-page-ui-map.md` — results surface, rec 8, SS3
- `.planning/ROADMAP.md` — Phase 65 success criteria
- `public/js/bridge.js` — `renderKpis`, `renderResults`, export/save handlers
- `public/bridge.html` — results panel markup
- `public/css/bridge.css` — `.bridge-kpi*`
- `lib/bridge-intake-schema.js` — `emptyProcessingStats`, `DISCARD_REASONS`
- `lib/bridge-engine/index.js` — `buildStats`, `processingMeta`, discard tallies
- `public/css/home-ui-preview.css` — filter tally vocabulary
- `public/css/home.css` — territory HUD display-scale
- `tests/bridge-list-factory-ux.test.js`, `tests/bridge-efficiency-path.test.js` — CTA locks

### External
- None required — pure in-repo UI theater on existing API.

---

## RESEARCH COMPLETE

**Phase:** 65-kill-rate-scrub-report  
**Confidence:** HIGH  
**Primary path:** Client-only reforge of post-process results head into RAW→KILLED→KEPT kill-rate report + proof chips; Save/Stage primary; Preview secondary; no engine rewrite.  
**Ready for:** plan-phase / `65-PLAN` breakdown  
