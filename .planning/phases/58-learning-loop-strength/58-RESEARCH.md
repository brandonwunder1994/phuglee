# Phase 58: Learning Loop Strength - Research

**Researched:** 2026-07-10  
**Domain:** Filter Superpower Brain — paired learning metrics, rule apply coverage, HITL type/phrase gates  
**Confidence:** HIGH (as-built brain/API/UI/gold verified in `lib/` + `tests/`); MEDIUM on exact gold P/R formula packaging for live admin UI vs CI-only

## Summary

Phase 58 makes the learning loop **measurable and honest**. After Phase 57 froze keep/kill structure with gold fixtures, this phase proves the brain is getting smarter **for the right reason**: fewer necessary Approve/Deny actions on comparable work **and** gold-set precision/recall not degrading — with **real rule apply coverage** on process (`processingMeta.brainAppliedRuleIds`), not gamed by hiding Train groups, auto-activating phrases, or silent-dropping inventory.

The stack already has the raw materials: global HITL brain (`bridge-brain-store` / `apply` / `decisions` / `phrase-miner`), admin-only `GET /api/bridge/brain` + `GET /api/bridge/brain/metrics`, Filter brain panel counters, process-time `brainAppliedRuleIds`, and Phase 57 gold suite (`tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/`). What is **missing** is a **paired learning health surface** (decision volume trend + gold P/R), **apply-coverage as a first-class success signal**, and **regression locks** that prevent gaming. Type suppress/promote already apply live on process; phrases already mine as `proposed` only — Phase 58 must **preserve and test-lock** that split (LRN-03), not invent unsupervised ML.

**Primary recommendation:** Add pure `lib/bridge-learning-metrics.js` (zero npm packages). Extend `GET /api/bridge/brain/metrics` (and brain panel) with a `learning` object: decision-volume trend from `brain.events`, gold precision/recall scorer over Phase 57 fixtures (server-readable from repo or cached last run), and apply-coverage derived from process `brainAppliedRuleIds` / optional rolling process snapshots. Lock LRN-02 with anti-gaming tests; lock LRN-03 with phrase proposed-only + type-live process e2e. Do **not** auto-activate phrases, hide groups, or silent-drop to “win” metrics.

---

<user_constraints>
## User Constraints (from REQUIREMENTS / ROADMAP / research — no 58-CONTEXT.md)

**No `58-CONTEXT.md`** — discuss-phase was not run. Constraints below are locked by REQUIREMENTS.md, ROADMAP.md, STATE.md, v2.0 research SUMMARY, and the orchestrator brief.

### Locked Decisions

- **LRN-01:** Admin can see paired learning metrics: Approve/Deny (or decisions-per-comparable-process) trend **and** gold-set precision/recall not degrading
- **LRN-02:** Metrics cannot be satisfied by hiding Train groups, auto-activating phrases, or silent-dropping rows — learning success requires **real rule apply coverage**
- **LRN-03:** Type suppress/promote still apply on process from admin decisions; phrases remain proposed-only until admin activate (**no unsupervised live ML**)
- **Depends on Phase 57:** Gold fixtures + ACC locks are the P/R half of the pair — do not weaken gold asserts to force green metrics
- **Zero new npm packages** — pure CommonJS + `node --test` (v2.0 research SUMMARY / STACK)
- **Optional pure module allowed:** `lib/bridge-learning-metrics.js` (STACK.md) — create it; do not invent a metrics service / Prometheus
- **AGENTS.md:** never wipe `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores as part of coding/restarts
- **Carry-forward product locks (still binding):**
  - Phrases proposed-only until admin Activate (D6/D7 HITL hybrid)
  - Type rules live on Deny/promote paths from Train
  - Water shut-off never type-suppressed; no water training
  - No multi-column Type blend; no silent drop for “no Type”
  - No Analyze push re-coupling
  - Full time-series learning dashboard is **future** (REQUIREMENTS Future) — Phase 58 is milestone-minimum paired bar, not charts product
- **Phase 58 scope:** Learning metrics + apply coverage + HITL gate locks — not day-2 efficiency polish (59), not full milestone QA pack (60), not Analyze re-coupling

### Claude's Discretion

- Exact shape of `learning` object on metrics API (recommend nested under `learning` preserving flat legacy counters for back-compat)
- Whether decision volume uses **time buckets from `events.at`** vs **decisions-per-comparable-process** harness on gold (recommend **both**: UI trend from events; automated LRN-01/02 proof via comparable-process on gold)
- Whether gold P/R is computed **on-demand in admin metrics** (fixtures in repo) vs **test-only + cached snapshot** written into `brain.metrics.goldLastRun` (recommend pure scorer always; admin GET may include gold when fixtures path exists; CI always asserts)
- Whether process apply hits persist as capped `process_apply` events / rule `applyHitCount` (recommend lightweight: record last N process apply summaries into brain **or** derive live apply coverage from client `lastResult.processingMeta` + server test harness — prefer server-visible coverage without dirtying every process with full brain RMW if avoidable)
- UI density: compact metric chips vs small “Learning health” section under existing brain metrics strip
- Whether to touch `docs/bridge/API.md` / `TEST-PLAN.md` with LRN map (recommended light)

### Deferred Ideas (OUT OF SCOPE)

- Richer time-series learning dashboard / per-type effectiveness charts (Future Requirements)
- Phrase mining quality pass beyond proposed-only gate
- Phase 59 efficiency (format reuse polish, bulk download path shortening)
- Phase 60 full regression packaging (will re-assert LRN locks)
- Auto-activate phrases / unsupervised ML
- Per-user or per-city brains
- Multi-column Type blend, silent-drop inventory
- Load-saved-list-back-into-Train
- Server-side multi-tenant sessions
- Shared store with Analyzer learned-brain
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **LRN-01** | Admin can see paired learning metrics: Approve/Deny (or decisions-per-comparable-process) trend **and** gold-set precision/recall not degrading | Pure `bridge-learning-metrics.js`: `computeDecisionTrend(events)` + `scoreGoldKeepKill(...)` over Phase 57 gold fixtures; extend `GET /api/bridge/brain/metrics` + Filter brain panel to render both halves; tests lock P/R ≥ baseline and trend object present |
| **LRN-02** | Metrics cannot be won by hiding Train groups, auto-activating phrases, or silent-dropping rows — success requires real rule apply coverage | Apply-coverage scorer on `processingMeta.brainAppliedRuleIds`; anti-gaming tests (proposed phrases do not apply; no group-hide “win”; gold P/R fails if silent-drop reasons appear); success composite requires `rulesAppliedCount > 0` when active matching rules exist |
| **LRN-03** | Type suppress/promote still apply on process from admin decisions; phrases remain proposed-only until admin activate | Keep existing `applyDecision` type upserts + `minePhrasesFromEvent` proposed-only + `applyBrainToRows` active-only filter; regression e2e: active type fires on process; proposed phrase does not; admin activate then fires |
</phase_requirements>

---

## As-Built Inventory (verified 2026-07-10)

### Brain metrics today

| Surface | What exists | Gap for LRN |
|---------|-------------|-------------|
| `emptyMetrics()` / `recomputeMetrics()` | `totalDecisions`, `typeRulesActive`, `phraseRulesActive`, `phraseRulesProposed`, `suppressCount`, `promoteCount` | No trend, no gold P/R, no apply coverage |
| `GET /api/bridge/brain` | Admin; full rules + recompute metrics + last 20 events | No `learning` object |
| `GET /api/bridge/brain/metrics` | Admin; raw `recomputeMetrics(brain)` only | Same gap; **extend here** (back-compat flat fields) |
| Brain panel UI (`#brain-metrics`) | Chips: version, decisions, type active, proposed, phrase active, suppress, promote | No paired health, no P/R, no coverage |
| `brain.events` | Decision audit with `at`, `action` (`approve_group` / `deny_group` / `undo` / phrase audits), `resultingRuleIds`, `sourceFile`, `batchId` | Enough for **decision volume trend** via time buckets; no process apply log yet |
| Type rule `hitCount` | Bumps on **re-decision** upsert only | Does **not** count process-time apply hits |

### Process apply path (coverage raw material)

```
processUpload
  → loadBrain()                          // read-only today
  → applyBrainToRows(...)                // active rules only
  → filterDistressOnly
  → processingMeta.brainAppliedRuleIds   // unique rule ids that fired
  → per-row brainAppliedRuleIds
```

| Fact | Implication |
|------|-------------|
| Apply is **read-only** on brain file (no `saveBrain` after process) | Coverage is **ephemeral on response** unless Phase 58 persists snapshots or client shows last process meta |
| Water early-return → empty `brainAppliedRuleIds` | Expected; do not score water as “zero coverage failure” |
| Proposed phrases filtered out in apply | LRN-03 already correct in code |
| Gold water test already asserts hostile type rules **not** in `brainAppliedRuleIds` | Preserve |

### Decision → rule → apply (LRN-03 as-built)

| Action | Type rule | Phrase |
|--------|-----------|--------|
| distressed + Deny | `suppress_type` **active** immediately | Miner may propose `suppress_phrase` |
| not_distressed + Deny | `promote_type` **active** immediately | Miner may propose `promote_phrase` |
| Approve (either section) | Affirmation / disable opposite type rule | No mining on approve |
| Phrase activate | N/A | Admin POST `rules/:id/status` → `active` only then applies |
| Miner | Never sets `status: 'active'` | Locked by PHRASE-01 tests |

### Phase 57 gold harness (P/R half)

| Asset | Role |
|-------|------|
| `tests/fixtures/bridge/gold/*.csv|txt` | Synthetic keep / deny / type-trap / no-type / water |
| `tests/bridge-accuracy-gold.test.js` | 8 ACC contracts; keep Strong vs FN deny; no silent-drop |
| Expectations (implicit) | Keep addresses `*Gold Keep*`; deny `*Gold Deny*`; water keep despite suppress |

**Gap:** No named precision/recall numbers, no shared scorer module, no “baseline vs trained brain” comparable-process metric.

### Independence / accuracy locks to preserve

- No Analyze push; `already_imported` default-off (Phase 55)
- Gold ACC-01/02/03 stay green (Phase 57)
- Water never type-suppressed
- Do not invent hard-drop reasons to inflate precision

---

## Standard Stack

### Core

| Library / module | Version / location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node.js 20+ CommonJS | runtime | Filter shell | Existing; no TS/build |
| `lib/bridge-brain-store.js` | existing | Caps, version RMW, `recomputeMetrics`, events | Source of decision volume counters |
| `lib/bridge-brain-apply.js` | existing | Active type/phrase apply + `brainAppliedRuleIds` | Apply coverage truth |
| `lib/bridge-brain-decisions.js` | existing | Approve/Deny → type live + phrase mine proposed | LRN-03 type path |
| `lib/bridge-phrase-miner.js` | existing | Proposed-only mining | LRN-03 phrase gate |
| `lib/bridge-api.js` | existing | `handleBrainGet` / `handleBrainMetrics` / decisions / rule status | Extend metrics response |
| `lib/bridge-engine` `processUpload` | existing | Emits `processingMeta.brainAppliedRuleIds` | Coverage e2e |
| **`lib/bridge-learning-metrics.js`** | **NEW pure** | Trend + gold P/R + apply coverage + paired health | STACK optional module — Phase 58 creates it |
| `node:test` + `node:assert/strict` | Node built-in | LRN locks | `npm test` |
| Vanilla `public/js/bridge.js` + `bridge.html` | existing | Admin brain panel | Surface paired metrics |

### Supporting

| Module / file | Purpose | When to use |
|---------------|---------|-------------|
| `tests/fixtures/bridge/gold/` | Gold keep/kill shapes | P/R scorer inputs |
| `tests/bridge-accuracy-gold.test.js` | ACC locks | Keep green; optionally import shared scorer |
| `tests/bridge-brain-api.test.js` | Metrics/admin API | Extend for `learning` payload |
| `tests/bridge-brain-apply.test.js` / phrase miner tests | Active vs proposed apply | LRN-03 keep-green |
| Temp `BRIDGE_BRAIN_ROOT` | Isolation | Always in learning e2e |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Pure `bridge-learning-metrics.js` | Cram formulas into `bridge-brain-store.recomputeMetrics` | Store stays persistence; learning formulas are pure reduce — **prefer separate module** |
| Persist process_apply events on every process | Client-only lastResult coverage | Server metrics incomplete without some process sample; **prefer optional capped process snapshots or last-N apply log** if admin GET must show coverage without a fresh process |
| On-demand gold process in every metrics GET | CI-only P/R | Admin must “view” P/R (LRN-01); fixtures are tiny — **on-demand or cached last-run is OK**; never block process path on gold |
| Prometheus / external TSDB | File-backed brain.events | Single-tenant; overkill |
| Auto-activate phrases to boost coverage | Admin Activate only | Violates LRN-02/03 and product locks |
| Hide Train groups / shrink FN caps to cut decisions | Real rules fire | Games LRN-01; forbidden by LRN-02 |
| Embeddings / unsupervised ML | HITL type + proposed phrases | Out of stack |

**Installation:** none.

```bash
# focused learning / brain / gold
node --test tests/bridge-learning-metrics.test.js
node --test tests/bridge-brain-api.test.js
node --test tests/bridge-accuracy-gold.test.js
node --test --test-name-pattern="LRN-|HARD|PHRASE|brainApplied|proposed" tests/bridge-brain-apply.test.js tests/bridge-phrase-miner.test.js tests/bridge-engine.test.js

# full + live (after public/ edits)
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## Architecture Patterns

### Recommended project structure

```
lib/
├── bridge-learning-metrics.js     # NEW — pure: trend, gold P/R, apply coverage, buildLearningHealth
├── bridge-brain-store.js          # MODIFY lightly — optional metrics fields / process log cap; keep recomputeMetrics legacy
├── bridge-api.js                  # MODIFY — handleBrainMetrics (+ optionally handleBrainGet) attach learning
├── bridge-brain-apply.js          # READ — active-only; brainAppliedRuleIds (do not auto-activate)
├── bridge-brain-decisions.js      # READ — type live; phrase mine proposed
├── bridge-phrase-miner.js         # READ — never status active
└── bridge-engine/index.js         # OPTIONAL — record process_apply snapshot / applyHitCounts (only if coverage must persist)

public/
├── js/bridge.js                   # MODIFY — renderLearningHealth in renderBrainPanel
└── bridge.html                    # OPTIONAL — learning health container under #brain-metrics

tests/
├── bridge-learning-metrics.test.js    # NEW — pure unit + gold P/R + anti-game
├── bridge-brain-api.test.js           # EXTEND — GET /metrics includes learning; admin-only
├── bridge-accuracy-gold.test.js       # KEEP green; optional shared scorer import
└── fixtures/bridge/gold/              # READ — P/R expectations

docs/bridge/
├── API.md / TEST-PLAN.md              # OPTIONAL LRN surface docs
```

### Pattern 1: Paired success bar (never single-metric)

**What:** Learning health is a **composite** of (A) decision volume trend **and** (B) gold precision/recall, with (C) apply coverage as a **gate** that A cannot claim alone.  
**When:** Any LRN-01 UI or API claim.  
**Why:** Pitfall 6 — fewer clicks ≠ better accuracy.

```javascript
// Source: recommended lib/bridge-learning-metrics.js
// buildLearningHealth({ events, goldScore, applyCoverage }) →
// {
//   decisionTrend: { recent, previous, direction: 'down'|'up'|'flat', buckets },
//   gold: { precision, recall, baseline, degraded: boolean },
//   applyCoverage: { appliedRuleIds, rulesAppliedCount, rowHitRate, sufficient: boolean },
//   pairedOk: boolean  // !gold.degraded && applyCoverage.sufficient when rules expected
// }
```

### Pattern 2: Gold keep/kill precision-recall scorer

**What:** Treat processUpload kept Strong vs FN pool as a binary classifier against gold address expectations.  
**When:** LRN-01 automated half + optional admin gold include.

| Symbol | Definition (code_violation gold) |
|--------|-----------------------------------|
| **TP** | Expected keep address is Strong in `result.rows` |
| **FP** | Expected deny (junk) address is Strong in `result.rows` |
| **FN** | Expected keep address not Strong kept (missing or only FN) |
| **TN** | Expected deny in FN / not Strong kept |
| **Precision** | `TP / (TP + FP)` (1 if TP+FP=0) |
| **Recall** | `TP / (TP + FN)` (1 if TP+FN=0) |

**Baseline:** Empty brain (or Phase 57 green baseline) on same fixtures. **Degraded:** `precision < baseline - ε` OR `recall < baseline - ε` (recommend ε = 0 absolute for small synthetic set, or 0.0 until fixtures grow).

**Not counted as FP/FN wins:** thin discards (`no_address`, `non_property`, …) — inventory must stay reviewable (ACC-02). If banned silent-drop reasons appear, **fail** learning health regardless of P/R.

### Pattern 3: Decision volume trend from events

**What:** Bucket `brain.events` where `action ∈ {approve_group, deny_group}` (exclude `undo`, phrase admin audits) by time window (e.g. last 7d vs previous 7d) **or** last N vs previous N decisions.  
**When:** Admin metrics UI always.  
**Comparable-process alternative (tests):** Same gold file twice — empty brain vs brain with active suppress/promote matching gold types — measure residual Train group count / decisions needed; with rules, residual should not increase and apply coverage should be non-zero.

```javascript
// Decision actions already defined in bridge-brain-store DECISION_ACTIONS
// totalDecisions = events.filter(e => DECISION_ACTIONS.has(e.action)).length
// Trend: do not treat totalDecisions alone as success — only direction + pair with gold
```

### Pattern 4: Apply coverage from process meta

**What:** Success requires evidence that **active rules fire** on matching rows.  
**Signals (prefer in order):**

1. `processingMeta.brainAppliedRuleIds.length > 0` when active type rules match fixture types  
2. Per-row `brainAppliedRuleIds` hit rate among rows whose type key matches an active rule  
3. Optional: capped `process_apply` events `{ action: 'process_apply', at, appliedRuleIds, kept, sourceFile }` for server-side trend without client process  

**Anti-pattern:** Counting “groups not shown” or UI pagination as coverage.

### Pattern 5: Extend metrics API without breaking flat counters

**What:** `GET /api/bridge/brain/metrics` continues returning flat `recomputeMetrics` fields; **add** nested `learning` (or sibling fields with clear names).  
**When:** LRN-01 admin view.  
**Auth:** Keep `requireAdmin` (existing HARD tests).

### Pattern 6: HITL gates unchanged (LRN-03)

**What:** Type rules `status: 'active'` apply on process; phrase rules only when admin-activated; miner never activates.  
**When:** Every PR in this phase.  
**Tests already exist** (PHRASE-01/03, apply proposed no-op) — re-assert under LRN- titles if helpful; do not weaken.

### Anti-Patterns to Avoid

- **Single-metric dashboard:** Decision ↓ alone celebrates fatigue/gaming  
- **Auto-activate phrases “to show learning”:** Instant LRN-02/03 fail  
- **Silent-drop to raise precision:** ACC-02 + LRN-02 fail  
- **Hide / collapse Train groups as “learning”:** Forbidden  
- **Process path always `saveBrain`:** Version thrash + 409 storms; if persisting apply hits, use careful merge or separate capped log  
- **Gold P/R on water as type-suppress success:** Water must ignore type rules  
- **New npm charting libs:** Milestone-minimum chips/text; future dashboard later  
- **Wipe brain volume to reset metrics in tests against live data:** Always temp `BRIDGE_BRAIN_ROOT`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Learning formulas | Ad-hoc math in `bridge.js` only | `lib/bridge-learning-metrics.js` pure + tests | Server + UI + CI must share truth |
| Time-series DB | Prometheus / Influx | `brain.events` reduce + optional process_apply cap | Single-tenant; events already capped 2000 |
| ML classifier for “smarter brain” | Embeddings / auto-ML | HITL type + proposed phrases | Controllability + undo |
| Precision via drop | New discard reasons | Gold FN pool + suppress rules | Silent-drop is product failure |
| Coverage via UI hide | Collapse Train | `brainAppliedRuleIds` | LRN-02 |
| Custom chart framework | Chart.js etc. | Metric chips + short text trend | Zero deps; future dashboard deferred |
| Phrase live without admin | Miner → active | Existing status machine + Activate button | PHRASE locks |

**Key insight:** The learning bar is an **instrumentation + honesty** phase on a shipped HITL loop — not a new intelligence subsystem. Prefer pure reduce + gold scorer + UI chips over any new service.

---

## Common Pitfalls

### Pitfall 1: Learning metric gamed (Pitfall 6 from v2.0 research)

**What goes wrong:** Decision count falls while junk still ships; external enrich wastes money.  
**Why:** Easy to measure clicks; hard to measure quality.  
**How to avoid:** Paired metrics + apply coverage gate + anti-gaming tests.  
**Warning signs:** `suppressCount >> promoteCount` by orders of magnitude; same type re-Denied weekly (key mismatch); metrics green while gold red.

### Pitfall 2: Gold P/R without shared scorer

**What goes wrong:** UI invents numbers; CI asserts different definition.  
**How to avoid:** One pure `scoreGoldKeepKill` used by tests and API.  
**Warning signs:** Duplicated address lists in UI vs test.

### Pitfall 3: Coverage invisible on server

**What goes wrong:** Admin opens brain panel without processing a file → “0 apply” forever; metrics look dead.  
**How to avoid:** Show last process coverage from client `lastResult.processingMeta` **and/or** last-N process_apply snapshots; label empty state “Process a city file to measure apply coverage.”  
**Warning signs:** Learning health always “insufficient” on fresh panel open.

### Pitfall 4: Process-time brain write storms

**What goes wrong:** Every process bumps version → Train 409s mid-session.  
**How to avoid:** Prefer not to `saveBrain` on process; if apply hits must persist, use separate append-only log or careful non-versioned side file — **discretion: default no process RMW**.  
**Warning signs:** Operators report constant VERSION_CONFLICT after multi-file day.

### Pitfall 5: Auto-activate phrases to pass coverage tests

**What goes wrong:** Global false suppress/promote; undoes HITL product.  
**How to avoid:** LRN-03 tests; miner status assertions; coverage tests use **type** rules for auto-live path.  
**Warning signs:** `phraseRulesActive` jumps without admin status POSTs in audit.

### Pitfall 6: Weakening gold to “not degrade”

**What goes wrong:** Lower ACC bar so P/R stays flat after bad brain change.  
**How to avoid:** Gold suite remains independent gate; learning tests **import** gold fixtures, never loosen ACC asserts.  
**Warning signs:** Diffs that delete expected keep addresses from fixtures.

### Pitfall 7: Counting undo / phrase audits as decisions

**What goes wrong:** Trend noise.  
**How to avoid:** Reuse `DECISION_ACTIONS` (`approve_group`, `deny_group`, and row variants if present) — exclude `undo`, `approve_phrase_rule`, etc.

### Pitfall 8: Agents.md data wipe

**What goes wrong:** “Reset brain for clean metrics” deletes operator learning.  
**How to avoid:** Temp roots in tests only; never delete `data/bridge-brain/` in implementation.

---

## Code Examples

Verified patterns from live codebase:

### Existing metrics recompute (extend, don't replace)

```javascript
// Source: lib/bridge-brain-store.js — recomputeMetrics
function recomputeMetrics(brain) {
  const typeRules = Array.isArray(brain && brain.typeRules) ? brain.typeRules : [];
  const phraseRules = Array.isArray(brain && brain.phraseRules) ? brain.phraseRules : [];
  const events = Array.isArray(brain && brain.events) ? brain.events : [];
  const isActive = (r) => r && r.status === 'active';
  const isProposed = (r) => r && r.status === 'proposed';
  return {
    totalDecisions: events.filter((e) => e && DECISION_ACTIONS.has(e.action)).length,
    typeRulesActive: typeRules.filter(isActive).length,
    phraseRulesActive: phraseRules.filter(isActive).length,
    phraseRulesProposed: phraseRules.filter(isProposed).length,
    suppressCount:
      typeRules.filter((r) => isActive(r) && r.kind === 'suppress_type').length +
      phraseRules.filter((r) => isActive(r) && r.kind === 'suppress_phrase').length,
    promoteCount:
      typeRules.filter((r) => isActive(r) && r.kind === 'promote_type').length +
      phraseRules.filter((r) => isActive(r) && r.kind === 'promote_phrase').length
  };
}
```

### Process already emits apply coverage ids

```javascript
// Source: lib/bridge-engine/index.js — processUpload return
processingMeta: {
  // ...
  brainVersion: brain.version ?? 1,
  brainAppliedRuleIds: brainApplied.appliedRuleIds || [],
  durationMs: Date.now() - started
}
```

### Apply active-only (LRN-03)

```javascript
// Source: lib/bridge-brain-apply.js
const activeTypes = typeRules.filter((r) => r && r.status === 'active');
const activePhrases = phraseRules.filter((r) => r && r.status === 'active');
// proposed phrases never enter activePhrases → no effect
```

### Phrase miner never activates

```javascript
// Source: lib/bridge-phrase-miner.js
// Never upgrade status from miner
existing.status = 'proposed';
// new rules: status: 'proposed'
```

### Recommended gold P/R scorer sketch

```javascript
// Source: recommended lib/bridge-learning-metrics.js
function isStrong(row) {
  const t = String(row && row.distressedSignalTag || '');
  return t === 'Strong Distressed Signal' || t.includes('Strong Distressed');
}

function scoreGoldKeepKill(result, { keepFrags, denyFrags }) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const frag of keepFrags) {
    const kept = (result.rows || []).find((r) => String(r.streetAddress || '').includes(frag));
    if (kept && isStrong(kept)) tp += 1;
    else fn += 1;
  }
  for (const frag of denyFrags) {
    const kept = (result.rows || []).find((r) => String(r.streetAddress || '').includes(frag));
    if (kept && isStrong(kept)) fp += 1;
    else tn += 1;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, tn, precision, recall };
}
```

### Recommended metrics API shape

```javascript
// GET /api/bridge/brain/metrics 200 (admin)
{
  // legacy flat (recomputeMetrics)
  "totalDecisions": 120,
  "typeRulesActive": 8,
  "phraseRulesActive": 2,
  "phraseRulesProposed": 5,
  "suppressCount": 6,
  "promoteCount": 4,
  // NEW
  "learning": {
    "decisionTrend": {
      "recentCount": 12,
      "previousCount": 28,
      "direction": "down",
      "window": "last_7d_vs_prior_7d"
    },
    "gold": {
      "precision": 1,
      "recall": 1,
      "baselinePrecision": 1,
      "baselineRecall": 1,
      "degraded": false,
      "source": "fixtures/bridge/gold"
    },
    "applyCoverage": {
      "sufficient": true,
      "rulesAppliedCount": 2,
      "note": "from last process snapshot or live processMeta"
    },
    "pairedOk": true
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `totalDecisions` chip | Paired trend + gold P/R + coverage | Phase 58 (this) | Honest learning bar |
| Accuracy by feel | Gold fixtures ACC-01/02/03 | Phase 57 | P/R baseline exists |
| Type rules live / phrases proposed | Same HITL hybrid | v1.6 D6–D8 | Do not regress in 58 |
| Apply ids on process only | Same + metrics consume them | v1.6 process + Phase 58 surface | Coverage becomes KPI |
| Full learning dashboard | Deferred | Future reqs | Keep 58 minimal |

**Deprecated/outdated:**

- Celebrating decision count alone as “brain smarter”  
- Auto-ML live rules without admin gate  
- Using silent-drop as precision strategy  

---

## Open Questions

1. **Should admin metrics GET run gold processUpload on every request?**  
   - What we know: Fixtures are tiny (~5 files); processUpload is the real classifier under test.  
   - What's unclear: Latency tolerance on Railway admin click.  
   - Recommendation: Pure scorer always; **cache** `goldLastRun` on brain or in-memory with TTL (e.g. 5–15 min) **or** compute only when `?includeGold=1`; CI always computes fresh. Discretion OK.

2. **How to persist apply coverage without process RMW?**  
   - What we know: `brainAppliedRuleIds` already on process response; client has `lastResult`.  
   - What's unclear: Whether brain panel alone (no recent process) must show historical coverage.  
   - Recommendation: UI shows last process meta when available; server learning object may mark coverage `unknown` until snapshot exists; tests prove coverage via processUpload e2e. Optional capped process_apply events if product insists on server history.

3. **Trend window formula (7d vs last-N events)?**  
   - What we know: Events have ISO `at`; caps at 2000.  
   - Recommendation: **last N vs previous N** (N=25) as primary (works with sparse usage) + optional 7d buckets when enough dated events. Document in metrics response `window` field.

4. **Comparable-process definition for automated LRN-01**  
   - Recommendation: Test harness — gold deny file with active `suppress_type` for a junk type that would otherwise be Strong (if any) OR keep file with promote; assert `brainAppliedRuleIds` includes rule id and gold P/R not degraded vs baseline. Residual Train groups need not go to zero.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-learning-metrics.test.js tests/bridge-brain-api.test.js` |
| Full suite command | `npm test` |
| Live gate (UI) | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LRN-01 | Decision trend object computed from events | unit | `node --test --test-name-pattern="LRN-01" tests/bridge-learning-metrics.test.js` | ❌ Wave 0 |
| LRN-01 | Gold P/R scorer on keep+deny fixtures; not degraded vs baseline | unit/e2e | `node --test --test-name-pattern="LRN-01|gold" tests/bridge-learning-metrics.test.js` | ❌ Wave 0 |
| LRN-01 | Admin GET `/api/bridge/brain/metrics` includes paired `learning` | integration | `node --test --test-name-pattern="LRN-01|metrics" tests/bridge-brain-api.test.js` | ❌ extend existing |
| LRN-01 | Brain panel renders trend + gold + coverage (or static markers) | smoke/DOM or string contract | `node --test --test-name-pattern="LRN-01|learning" tests/bridge-train-ux.test.js` (or new) | ❌ Wave 0 / light |
| LRN-02 | Apply coverage requires `brainAppliedRuleIds` when active type matches | e2e | `node --test --test-name-pattern="LRN-02|coverage" tests/bridge-learning-metrics.test.js tests/bridge-engine.test.js` | ❌ Wave 0 |
| LRN-02 | Proposed phrase does not count as coverage / does not apply | unit | existing phrase apply tests + LRN-02 title | ✅ partial |
| LRN-02 | Silent-drop reasons fail learning health | unit | gold banned reasons + learning scorer | ❌ Wave 0 |
| LRN-02 | Hiding groups is not a metric input (no API field for “hidden groups”) | contract | assert learning object has no `groupsHidden` win path; coverage from apply ids only | ❌ Wave 0 |
| LRN-03 | Active suppress/promote type applies on processUpload | e2e | existing engine BRAIN + LRN-03 pattern | ✅ partial |
| LRN-03 | Mined phrases stay proposed; activate then apply | unit/api | phrase miner + PHRASE-03 API | ✅ |
| ACC keep-green | Gold suite still 8/8 | e2e | `node --test tests/bridge-accuracy-gold.test.js` | ✅ |
| Admin gate | Non-admin metrics 403 | integration | existing HARD metrics test | ✅ |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-learning-metrics.test.js tests/bridge-brain-api.test.js`  
- **Per wave merge:** above + `node --test tests/bridge-accuracy-gold.test.js` + phrase/apply patterns  
- **Phase gate:** `npm test` green; if `public/` touched → `scripts\verify-live.ps1` green before claim live  

### Wave 0 Gaps

- [ ] `tests/bridge-learning-metrics.test.js` — pure trend / gold P/R / apply coverage / pairedOk / anti-game (LRN-01, LRN-02)
- [ ] `lib/bridge-learning-metrics.js` — implementation target for Wave 0 RED tests
- [ ] Extend `tests/bridge-brain-api.test.js` — admin metrics `learning` payload; non-admin still 403
- [ ] Optional UI contract test for learning chips in brain panel
- [ ] Framework install: none

*(Existing infrastructure covers LRN-03 largely; Wave 0 adds LRN-01/02 measurement surface.)*

### Suggested plan waves (for planner)

| Wave | Focus | Reqs |
|------|-------|------|
| 0 | RED tests: learning-metrics pure + metrics API learning shape + anti-game | LRN-01, LRN-02 |
| 1 | Implement `bridge-learning-metrics.js` + wire `handleBrainMetrics` / optional GET brain | LRN-01 |
| 2 | Brain panel UI paired chips + last-process apply coverage; verify-live | LRN-01, LRN-02 |
| 3 | LRN-03 regression titles + gold keep-green + full `npm test` + docs light | LRN-03 + gate |

---

## Sources

### Primary (HIGH confidence)

- `lib/bridge-brain-store.js` — metrics, caps, DECISION_ACTIONS, recomputeMetrics  
- `lib/bridge-brain-apply.js` — active-only apply, brainAppliedRuleIds  
- `lib/bridge-brain-decisions.js` — type live, phrase mine proposed  
- `lib/bridge-phrase-miner.js` — never status active  
- `lib/bridge-api.js` — handleBrainGet / handleBrainMetrics / decisions / rule status  
- `lib/bridge-engine/index.js` — processUpload processingMeta.brainAppliedRuleIds  
- `public/js/bridge.js` — renderBrainPanel metrics chips  
- `public/bridge.html` — `#brain-metrics` / Filter brain panel  
- `tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/` — Phase 57 gold  
- `tests/bridge-brain-api.test.js` — HARD metrics admin/403  
- `.planning/REQUIREMENTS.md` — LRN-01/02/03  
- `.planning/ROADMAP.md` — Phase 58 success criteria  
- `.planning/research/SUMMARY.md`, `STACK.md`, `FEATURES.md`, `PITFALLS.md` — learning bar + Pitfall 6  
- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — HITL D6–D8, proposed-only phrases  

### Secondary (MEDIUM confidence)

- Exact admin UX density (chips vs section) — product polish within discretion  
- Whether process_apply persistence is required for LRN-01 “admin can view” vs client lastResult — both satisfy if documented  

### Tertiary (LOW confidence)

- Optimal trend window (7d vs last-N) under real operator cadence — pick last-N default; revisit Phase 59/60 if sparse  

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Brain/API/gold/process meta verified in repo; zero-dep pattern proven |
| Architecture | HIGH | Clear pure-module + metrics extend + UI chips; process RMW optional |
| Pitfalls | HIGH | Pitfall 6 documented; gaming vectors map 1:1 to LRN-02 |
| Gold P/R packaging for live UI | MEDIUM | Fixtures exist; on-demand vs cache is discretion |
| Process apply persistence | MEDIUM | Ephemeral meta enough for tests; server history optional |

**Research date:** 2026-07-10  
**Valid until:** ~2026-08-10 (stable domain; re-check if brain event schema changes)
