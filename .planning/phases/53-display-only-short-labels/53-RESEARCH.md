# Phase 53: Display-Only Short Labels - Research

**Researched:** 2026-07-10  
**Domain:** Filter / Data Bridge — Train group display labels (display-only shortener)  
**Confidence:** HIGH

## Summary

Phase 53 makes Train / review group **titles scannable** when `violationTypeLabel` (or empty-type description fallback) is a long ordinance wall of text, without touching anything used for distress tagging, export, brain keys, group stacking, or decision payloads. v1.7 already cleans timestamps into group labels via `stripIncidentalTimestamps` and keys groups with `stableTypeKey` / `stableDescriptionKey`. Today Train cards print the **full** `group.violationTypeLabel` as the title (`public/js/bridge-train.js`), and description samples alone are clipped at 160 chars. Long type walls remain unreadable at a glance.

The locked product contract is **display-only**: a parallel `shortLabel` field (or client-only derive from full label) — **never** replace `row.violationIssueType`, `group.violationTypeLabel`, group keys, export columns, or brain `violationTypeKey` / `violationTypeLabel` on rules. Decision POST already sends full metadata from the group object in the happy path (`submitTrainDecision` body uses `group.violationTypeLabel` + `group.violationTypeKey`). The **real LBL-03 trap** is the fallback `resolveTrainGroupFromCard` in `bridge.js`, which scrapes `.bridge-train-group-title` DOM text when `groupId` lookup fails — after short titles ship, that scrape would poison type rules with truncated labels.

**Primary recommendation:** Add pure `lib/bridge-short-label.js` (zero packages); attach `shortLabel` on groups in `buildReviewGroups`; Train title renders `shortLabel || violationTypeLabel` with full text in `title`/tooltip; **hard-kill DOM title scrape** so decisions always use group metadata (or fail closed).

---

## User Constraints

### Locked Decisions (from phase brief / PROJECT.md / REQUIREMENTS)

- **Display-only short labels** — never replace stored type for distress / export / brain
- **Deterministic heuristic preferred** — no LLM paraphrase for v1.8
- **Group keys stay on full/stable type text** (v1.7) — short label never becomes the group key
- **Decision POST must use full labels from group metadata**, not DOM scrape of short titles
- **Zero new npm packages preferred**
- **Do NOT re-do Type column scoring or confirm gate** (Phases 51/52 shipped)
- **AGENTS.md:** never wipe filter lists / brain / Form Forge / Analyzer user data — code + tests + static assets only

### Claude's Discretion (plan may choose within bounds)

- Exact max length constant in 48–64 range (recommend **56** as middle default; fixture-lock outcomes)
- Whether short label is **server-attached** on group DTO (`g.shortLabel`) vs **client-only** derive in `renderTrainGroupCard` (recommend **server attach** so all clients/API consumers see the same field; pure helper still shared for unit tests)
- Break-priority order among em-dash / first clause / hard max (recommend: em-dash → clause separators → word-boundary max → hard slice)
- Whether confirm dialogs / status toasts show short or full (recommend **short in toast/confirm chrome**, full always in decision body)
- Ellipsis character (`…` vs `...`) — prefer single unicode `…` matching existing `truncateTrainSample`

### Deferred Ideas (OUT OF SCOPE)

- ML / embeddings / LLM paraphrase of Type (REQUIREMENTS Future)
- Short labels as group keys or stored `violationIssueType` mutation
- Type column scoring / format memory / confirm gate rework (51/52)
- Full processUpload e2e lock suite (Phase 54 TEST-03 — phase 53 still needs unit + UI contracts)
- Train CSS redesign
- Multi-column Type blend

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LBL-01 | Train / review group titles use display-only short label when type/description is a long wall of text (first clause / before em-dash / max ~48–64; timestamps already cleaned where applicable) | Pure `shortLabelForDisplay(text)`; wire into group DTO + `renderTrainGroupCard` title |
| LBL-02 | Full raw type/description remains on row for distress, export, brain keys, decisions — short label never replaces stored `violationIssueType` or becomes group key | Parallel field only; keys stay `stableTypeKey` / `stableDescriptionKey`; export via `toExportRow` untouched |
| LBL-03 | Decision POST / undo paths use full type labels from group metadata, not scraped truncated DOM titles | `submitTrainDecision` already posts full group fields; **remove/neutralize** DOM scrape fallback in `resolveTrainGroupFromCard` |

---

## Standard Stack

### Core

| Library / module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js | 20+ | Runtime | Existing shell |
| Pure CommonJS | — | `lib/bridge-short-label.js` | Matches v1.7 `bridge-stable-text.js` / v1.8 scorer pattern |
| `lib/bridge-stable-text.js` | existing | `stripIncidentalTimestamps` for optional re-clean | Groups already strip for labels; helper may re-call for safety |
| `lib/bridge-review-groups.js` | existing | Attach `shortLabel` next to full `violationTypeLabel` | Single authoritative group builder (process + decisions rebuild) |
| `public/js/bridge-train.js` | existing | Card title prefers `shortLabel` | Pure render; unit-tested via `vm` |
| `public/js/bridge.js` | existing | Decision body + **DOM scrape fix** | LBL-03 wire |
| `node --test` | built-in | Unit + source contracts | Existing suite (`npm test`) |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/bridge-brain-decisions.js` | Rebuilds groups after decide via `buildReviewGroups` | No decision-mutator change if shortLabel is set inside `buildReviewGroups` |
| `lib/bridge-export.js` / `toExportRow` | Export `Violation/Issue Type` from **rows** | Regression: assert export still full type |
| `lib/bridge-engine/index.js` | Calls `buildReviewGroups` on process | No engine logic change beyond groups already used |
| `tests/bridge-train-ux.test.js` | Card HTML contracts | Extend for short title + full tooltip |
| `tests/bridge-review-groups.test.js` | Group shape + keys | Extend for shortLabel + key stability |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server `g.shortLabel` | Client-only truncate in render | Client-only is fewer files but API/train status paths diverge; server field is single source of truth |
| Parallel field | Mutate `violationTypeLabel` in place | **Forbidden** — brain/export poison (Pitfall 4) |
| Pure max-slice | LLM / sentence embeddings | Non-deterministic, out of scope |
| New npm truncate lib | Hand-rolled 30-line pure function | Zero deps locked; domain separators (em-dash) matter more than generic truncate |

**Installation:**

```bash
# No new packages
npm test
```

---

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-short-label.js      # NEW pure: shortLabelForDisplay(text, opts?) → string
├── bridge-stable-text.js      # UNCHANGED (reuse strip if needed)
├── bridge-review-groups.js    # MODIFY: set g.shortLabel from full violationTypeLabel
└── bridge-brain-decisions.js  # UNCHANGED (rebuilds groups → inherits shortLabel)
public/js/
├── bridge-train.js            # MODIFY: title = shortLabel || violationTypeLabel; title attr = full
└── bridge.js                  # MODIFY: LBL-03 kill DOM scrape; keep decision body on group.*
tests/
├── bridge-short-label.test.js     # NEW pure heuristic matrix (LBL-01)
├── bridge-review-groups.test.js   # ADD shortLabel + key/export-safety contracts (LBL-02)
└── bridge-train-ux.test.js        # ADD title/tooltip + source contract no DOM scrape (LBL-01/03)
```

### Pattern 1: Parallel display field on review groups (required)

**What:** After choosing full `violationTypeLabel` (existing cleaned type or description fallback), set:

```javascript
// Source: codebase pattern + .planning/research/ARCHITECTURE.md Pattern 4
const fullLabel = g.violationTypeLabel; // already set by existing _labelSet logic
g.shortLabel = shortLabelForDisplay(fullLabel);
// groupId / violationTypeKey / descriptionKey UNCHANGED — still from stable* helpers on raw row text
```

**When to use:** Inside `buildReviewGroups` once per group when label is first set (or always recompute from final public label before strip of private fields).

**Why here:** `applyDecision` returns `buildReviewGroups(...)` again — decisions path automatically gets `shortLabel` without a second wire.

### Pattern 2: Deterministic short-label heuristic (LBL-01)

**What:** Pure function, no I/O. Recommended algorithm (planner should fixture-lock):

1. Coerce to string; optional `stripIncidentalTimestamps` + collapse whitespace (groups usually already cleaned).
2. If length ≤ `maxLen` (default **56** in 48–64 band) → return as-is (no ellipsis).
3. Prefer cut **before first em/en dash or spaced hyphen clause**:
   - `—` (U+2014), `–` (U+2013), or ` - ` / ` – ` / ` — ` as separators
   - If left part length ≥ ~12 and ≤ maxLen → use left part (no ellipsis if natural break)
4. Else prefer first clause before `. ` `;` `|` when left part is meaningful (≥ ~12 chars).
5. Else hard max at word boundary ≤ maxLen, append `…`.
6. Never return empty if input non-empty; never invent category text.

**When to use:** Only for display titles — not for keys.

**Example:**

```javascript
// lib/bridge-short-label.js — recommended shape (implement + lock in tests)
const { stripIncidentalTimestamps } = require('./bridge-stable-text');

const DEFAULT_MAX = 56; // within REQUIREMENTS ~48–64

function shortLabelForDisplay(text, { maxLen = DEFAULT_MAX } = {}) {
  let s = stripIncidentalTimestamps(String(text || ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;

  // Prefer break before em/en dash or " - " style separators
  const dashSplit = s.split(/\s*[—–]\s*|\s+-\s+/);
  if (dashSplit[0] && dashSplit[0].length >= 12 && dashSplit[0].length <= maxLen) {
    return dashSplit[0].trim();
  }

  // First clause
  const clause = s.match(/^(.{12,}?)[.|;]\s/);
  if (clause && clause[1].length <= maxLen) return clause[1].trim();

  // Word-boundary hard max
  let cut = s.slice(0, maxLen - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp >= 12) cut = cut.slice(0, sp);
  return cut.trimEnd() + '…';
}

module.exports = { shortLabelForDisplay, DEFAULT_MAX };
```

### Pattern 3: Train render prefers short; a11y keeps full

**What:**

```javascript
// public/js/bridge-train.js
var fullLabel = group.violationTypeLabel || 'Unknown type';
var label = group.shortLabel || fullLabel;
// title text uses label (short)
// element title="/tooltip" and optionally aria-label use fullLabel for hover/screen readers
```

**When to use:** `renderTrainGroupCard` primary path + `bridge.js` fallback renderer (keep in sync).

### Pattern 4: Decision payload from group metadata only (LBL-03)

**What:** Happy path already correct:

```javascript
// public/js/bridge.js submitTrainDecision — KEEP
violationTypeKey: group.violationTypeKey || '',
violationTypeLabel: group.violationTypeLabel || '',  // FULL — never shortLabel
```

**Must fix** fallback:

```javascript
// public/js/bridge.js resolveTrainGroupFromCard — CURRENT PITFALL (~line 900–904)
return {
  groupId,
  section,
  violationTypeLabel: card.querySelector('.bridge-train-group-title')?.childNodes?.[0]?.textContent?.trim() || 'group'
};
```

**Do this instead:**
- Prefer lookup by `groupId` in `lastResult.reviewGroups` (already done).
- If not found: return `null` (caller already handles “Could not resolve this group”) — **do not invent** label from DOM.
- Optional: stash `data-full-label` on card only as non-authoritative debug — still prefer group object.

Undo path: server undo reverts rules; client restores **snapshot** of lists/reviewGroups (full labels preserved in snapshot). No DOM scrape on undo — already safe. Status toasts may show short for UX.

### Anti-Patterns to Avoid

- **Mutate `violationTypeLabel` for display:** brain/export poison — use parallel field
- **Group by short label:** two long types sharing a 40-char prefix collapse into one group
- **POST `shortLabel` as `violationTypeLabel`:** durable type rules never rematch next upload
- **Client truncate only + leave DOM scrape:** LBL-01 “works” while LBL-03 fails silently
- **Re-implement scorer / confirm gate:** out of scope
- **Write shortLabel onto rows or export columns:** breaks `Violation/Issue Type` fidelity

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timestamp cleanup | New date regex soup in short-label | `stripIncidentalTimestamps` from `bridge-stable-text.js` | Already battle-tested for GROUP-01–04 |
| Group stacking | Short-label-aware keys | Existing `stableTypeKey` / `stableDescriptionKey` | Prefix collisions |
| Export formatting | Custom export map for short | Existing `toExportRow` / `rowsToCsv` | Rows never carry shortLabel |
| Decision mutation | New decision DTO schema | Keep `violationTypeLabel` full; only UI title changes | Brain rules keyed on full |
| Truncate library | npm string libs | 30-line pure helper | Zero packages; domain separators |

**Key insight:** This phase is a **presentation seam**, not a data pipeline change. The failure mode is accidental dual-use of one field — not algorithmic complexity.

---

## Common Pitfalls

### Pitfall 1: Short labels replace stored type (brain/export poison)

**What goes wrong:** Train looks clean; export shows “High Grass and We…”; type rules store truncated keys that never match next upload.  
**Why it happens:** Title = single field dual-use; mutate group/row in place for UI.  
**How to avoid:** Parallel `shortLabel`; assert `violationTypeLabel` and `row.violationIssueType` unchanged in tests; export still full.  
**Warning signs:** Type rules list fills with ellipsis endings; Analyzer import types truncated.

### Pitfall 2: Short label becomes group key

**What goes wrong:** Two distinct long ordinances sharing first 48 chars merge into one Train group.  
**Why it happens:** Temptation to “normalize” keys with the same helper.  
**How to avoid:** Keys remain `stableTypeKey(raw type)` / `stableDescriptionKey(raw desc)` only; fixture with shared-prefix long types → 2 groups.  
**Warning signs:** Group counts collapse after phase ships.

### Pitfall 3: Decision DOM scrape of truncated title (LBL-03)

**What goes wrong:** When `groupId` lookup fails (stale card, race, missing id), POST uses scraped short title → poison rule label.  
**Why it happens:** Existing fallback in `resolveTrainGroupFromCard` (verified in `public/js/bridge.js`).  
**How to avoid:** Remove scrape; return null / force re-process message; source-contract test that bridge.js does **not** read `.bridge-train-group-title` for `violationTypeLabel`.  
**Warning signs:** Decision events / typeRules with `…` suffixes.

### Pitfall 4: Status/confirm UX vs payload confusion

**What goes wrong:** Deny confirm dialog uses short label (OK) but body accidentally switches to short too.  
**Why it happens:** One `label` variable reused for both UI and POST.  
**How to avoid:** Explicit `displayLabel` vs `fullLabel` locals; POST only `fullLabel` / `group.violationTypeLabel`.  
**Warning signs:** Network payload `violationTypeLabel` ends with `…`.

### Pitfall 5: Sort / search regressions

**What goes wrong:** Train sort/filter uses short label inconsistently → order flickers or search misses full text.  
**Why it happens:** `bridge.js` filter/sort currently lowercases `violationTypeLabel` (full).  
**How to avoid:** Keep sort/search on **full** `violationTypeLabel` (and optionally also match short); do not sort by short alone.  
**Warning signs:** Search for words only in the truncated tail fails (acceptable if documented) or full-word search fails (bug).

### Pitfall 6: Bridge-train vs bridge.js fallback drift

**What goes wrong:** Primary render uses shortLabel; fallback in `bridge.js` still shows full walls if `bridge-train.js` fails to load.  
**Why it happens:** Dual render implementations.  
**How to avoid:** Update both; train-ux tests load `bridge-train.js` primarily.  
**Warning signs:** Only one code path shows short titles.

---

## Code Examples

### Current group label assignment (full only)

```45:109:lib/bridge-review-groups.js
function buildReviewGroups(rows, section) {
  // ...
    // Label: prefer cleaned type, else cleaned description, else raw fallback, else '(no type)'
    if (!g._labelSet) {
      const typeLabelClean = stripIncidentalTimestamps(typeLabelRaw)
        .replace(/\s+/g, ' ')
        .trim();
      // ...
      if (typeLabelClean) {
        g.violationTypeLabel = typeLabelClean;
        g._labelSet = true;
      } else if (descLabelClean) {
        g.violationTypeLabel = descLabelClean;
        // ...
```

**Wire point:** immediately after `g.violationTypeLabel` is finalized (or when building `publicGroup`), set `g.shortLabel = shortLabelForDisplay(g.violationTypeLabel)`.

### Current Train title (full only)

```71:113:public/js/bridge-train.js
  function renderTrainGroupCard(group) {
    group = group || {};
    var label = group.violationTypeLabel || 'Unknown type';
    // ...
          '<div class="bridge-train-group-title">' +
            esc(label) +
```

### Decision happy path (already full — keep)

```716:731:public/js/bridge.js
    const body = {
      action,
      section: resolvedSection,
      groupId: group.groupId || '',
      rowIds: group.rowIds,
      violationTypeKey: group.violationTypeKey || '',
      violationTypeLabel: group.violationTypeLabel || '',
      // ...
    };
```

### Decision fallback (must change)

```892:905:public/js/bridge.js
  function resolveTrainGroupFromCard(card) {
    // ...
    const found = list.find((g) => String(g.groupId) === String(groupId));
    if (found) return found;
    return {
      groupId,
      section,
      violationTypeLabel: card.querySelector('.bridge-train-group-title')?.childNodes?.[0]?.textContent?.trim() || 'group'
    };
  }
```

### Export stays on rows (no group shortLabel)

```253:261:lib/bridge-intake-schema.js
function toExportRow(row) {
  const out = {};
  for (const key of COLUMN_KEYS) {
    out[NORMALIZED_COLUMNS[key].exportLabel] =
      key === 'matchedIndicators'
        ? formatMatchedIndicatorsForExport(row[key])
        : (row[key] ?? '');
  }
  return out;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full wall of text as Train title | Display-only short title + full metadata | Phase 53 (this) | Scannable Train; matching unchanged |
| Description samples only truncated (160) | Type/description **titles** also shortened | Phase 53 | Titles match sample discipline |
| Group keys on raw/timestamp-stripped full text | Unchanged | v1.7 Phase 49 | Do not regress |
| Type column force + confirm | Unchanged | v1.8 Phases 51–52 | Correct full type text on groups before short labels |

**Deprecated/outdated:**
- Using card DOM text as authoritative type label for decisions (must die with short titles)
- Mutating stored type for UI convenience (explicit anti-feature in REQUIREMENTS Out of Scope)

---

## Open Questions

1. **Exact default maxLen (48 vs 56 vs 64)?**  
   - What we know: REQUIREMENTS says ~48–64; research STACK says 40–60.  
   - What's unclear: product taste on real city ordinances.  
   - Recommendation: default **56**; export constant `DEFAULT_MAX`; tests assert bounds not a single magic pixel width.

2. **Should shortLabel omit ellipsis when natural dash-break fits?**  
   - Recommendation: **yes** — “High Grass and Weeds” from `High Grass and Weeds — Sec. 12-34 ...` is better without `…`.

3. **Tooltip / expand UX?**  
   - What we know: success criteria say titles short; full remains on row/group.  
   - Recommendation: `title="{fullLabel}"` on the title div is enough for v1.8; no new expand modal (out of chrome redesign scope).

4. **Does Phase 54 TEST-03 own processUpload e2e for labels?**  
   - Yes per roadmap. Phase 53 still needs pure + group + train-ux + source contracts so 54 is integration-only.

---

## Validation Architecture

> Nyquist enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node --test` |
| Config file | none — `package.json` script `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-short-label.test.js tests/bridge-review-groups.test.js tests/bridge-train-ux.test.js` |
| Full suite command | `npm test` |
| Live gate | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (after any `public/` edit) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LBL-01 | Long type → short display ≤ maxLen; dash/clause break preferred; short unchanged when already short | unit | `node --test tests/bridge-short-label.test.js` | ❌ Wave 0 |
| LBL-01 | Group DTO includes `shortLabel`; Train card HTML shows short not full wall | unit | `node --test tests/bridge-review-groups.test.js tests/bridge-train-ux.test.js` | ⚠️ partial — extend existing |
| LBL-02 | Full `violationTypeLabel` preserved; group keys identical for shared-prefix long types (2 groups); row `violationIssueType` untouched by short helper | unit | `node --test tests/bridge-review-groups.test.js tests/bridge-short-label.test.js` | ⚠️ partial — add cases |
| LBL-02 | Export path still uses full type from rows (no shortLabel on export row) | unit / smoke | `node --test tests/bridge-export.test.js` (add assert if missing) | ⚠️ optional small add |
| LBL-03 | `submitTrainDecision` body fields from group metadata (source contract); **no** `.bridge-train-group-title` scrape for `violationTypeLabel` | unit / source | `node --test tests/bridge-train-ux.test.js` | ❌ Wave 0 case |
| LBL-03 | Missing groupId → null / error path, not DOM-invented label | unit / source | same | ❌ Wave 0 |
| META | Existing GROUP/COL/GATE suites stay green | regression | `npm test` | ✅ |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-short-label.test.js tests/bridge-review-groups.test.js tests/bridge-train-ux.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + `scripts/verify-live.ps1` after UI wire (before `/gsd:verify-work`)

### Wave 0 Gaps

- [ ] `tests/bridge-short-label.test.js` — pure matrix: short passthrough; em-dash cut; first clause; hard max + ellipsis; empty; timestamps already stripped; maxLen option
- [ ] Extend `tests/bridge-review-groups.test.js` — `shortLabel` present; full label longer when wall-of-text; two long types same prefix → still 2 groups / distinct keys; no `_` private fields
- [ ] Extend `tests/bridge-train-ux.test.js` — render prefers `shortLabel`; full available via `title=` or data attr; source contract: bridge.js must not assign `violationTypeLabel` from `.bridge-train-group-title`
- [ ] Optional: one export assert long `violationIssueType` survives `toExportRow` / `rowsToCsv` unchanged
- [ ] Framework install: none — `node --test` already used

---

## Sources

### Primary (HIGH confidence)

- Local codebase: `lib/bridge-review-groups.js`, `lib/bridge-stable-text.js`, `lib/bridge-brain-decisions.js`, `lib/bridge-export.js`, `lib/bridge-intake-schema.js` (`toExportRow`)
- Local UI: `public/js/bridge-train.js` (title = full label today), `public/js/bridge.js` (`submitTrainDecision`, `resolveTrainGroupFromCard` DOM scrape)
- Local tests: `tests/bridge-review-groups.test.js`, `tests/bridge-train-ux.test.js`, `tests/bridge-export.test.js`
- `.planning/REQUIREMENTS.md` — LBL-01..03, TEST-03
- `.planning/research/ARCHITECTURE.md` — Pattern 4 Display-only short labels
- `.planning/research/PITFALLS.md` — Pitfall 4 short labels replace stored type; DOM scrape gotcha
- `.planning/research/STACK.md` — display short-label stack (zero deps)
- `.planning/research/SUMMARY.md` — Phase 53 deliverables
- Phase 52 verification — process/groups path stable; no short labels yet

### Secondary (MEDIUM confidence)

- Heuristic maxLen midpoint (56) and break-priority order — product-tunable; not in shipped code yet
- Tooltip-only full text vs future expand UI — inferred from “no Train CSS redesign” out of scope

### Tertiary (LOW confidence)

- None blocking planning — LLM paraphrase explicitly deferred

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero new deps; pure helper + existing group/UI seams verified in code
- Architecture: **HIGH** — parallel field + Train title + decision metadata path verified; DOM scrape pitfall line-located
- Pitfalls: **HIGH** — documented in v1.8 research and confirmed against current `bridge.js` fallback
- Exact maxLen / dash regex: **MEDIUM** — lock with Wave 0 fixtures

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (stable domain; re-check only if Train decision payload shape changes)

---

## RESEARCH COMPLETE

**Phase:** 53 - Display-Only Short Labels  
**Confidence:** HIGH

### Key Findings

1. **Ship pure `lib/bridge-short-label.js` + `shortLabel` on groups** — never mutate `violationTypeLabel` / `violationIssueType` / group keys.
2. **Train titles** in `bridge-train.js` (and bridge.js fallback) prefer `shortLabel`; full label stays on group for decisions, tooltips, sort/search.
3. **LBL-03 critical fix:** remove DOM scrape of `.bridge-train-group-title` in `resolveTrainGroupFromCard` — happy-path POST already uses full group metadata.
4. **Heuristic:** deterministic first-clause / em-dash / max ~56 chars; reuse `stripIncidentalTimestamps`; no LLM; zero npm packages.
5. **Do not touch** scorer, format store, confirm gate, brain mutator logic, or export row mapping beyond regression asserts.

### File Created

`.planning/phases/53-display-only-short-labels/53-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Existing pure-module pattern; no new deps |
| Architecture | HIGH | Seams verified in review-groups + Train + decisions |
| Pitfalls | HIGH | DOM scrape + dual-use field confirmed in code |

### Open Questions

- Default maxLen within 48–64 (recommend 56)
- Natural dash-break without ellipsis (recommend yes)
- Tooltip-only full text sufficient for v1.8 (recommend yes)

### Ready for Planning

Research complete. Planner can now create PLAN.md files (recommended: Wave 0 RED tests → pure short-label → groups wire → Train UI + DOM scrape kill → suite/verify-live).
