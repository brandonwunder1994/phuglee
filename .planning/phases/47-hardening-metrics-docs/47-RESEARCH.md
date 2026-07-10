# Phase 47: Hardening + metrics + docs - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Bridge brain production hardening (undo, caps, version conflicts, metrics, docs, QA)  
**Confidence:** HIGH

## Summary

Phase 47 closes M7 by making the Filter Superpower Brain **reversible, bounded, observable, and documented**. Admin undo is a **split responsibility**: client `trainUndoStack` restores list/review UI snapshots; server `POST /api/bridge/brain/undo` reverts the brain rule(s) created by the last training event. Brain persistence enforces **caps** on events/rules and **optimistic concurrency** via `brain.version` (stale writes → **409**). Admin metrics expose decision and rule counts. `docs/bridge/TAGGING-RULES.md` gains a section describing **base regex + brain layers**. Phase gate is full `npm test` + `scripts/verify-live.ps1`.

This phase depends on 42–46 (store/apply, review groups, train UX, decisions, phrase panel). It must not introduce Analyzer brain coupling or new npm dependencies.

**Primary recommendation:** Implement caps + version RMW in `bridge-brain-store.js`; undo in `bridge-brain-decisions.js` + API; metrics GET; client undo stack + train search/pagination polish; update TAGGING-RULES; harden with `tests/bridge-brain-hardening.test.js` and full QA matrix.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Client trainUndoStack for list restore; server undo reverts rule from last event
- Caps on events/rules; brain.version RMW
- Document brain layers in docs/bridge/TAGGING-RULES.md

### Claude's Discretion
- Exact cap numbers (design defaults: events 2000, typeRules 500, phraseRules 500) unless already set in phase 42 store
- trainUndoStack depth (recommend 10)
- Train group page size (plan suggests 40) and confirm-dialog threshold (plan suggests count ≥ 10)
- Whether metrics are embedded in GET brain vs dedicated GET metrics (design has both; implement dedicated + panel display)
- Edge-case UX copy for 409 conflicts

### Deferred Ideas (OUT OF SCOPE)
- Server-side authenticated sessions (replace spoofable X-Phuglee-User) — future
- Per-city brain scopes
- ML fine-tuning pipeline
- Non-admin read-only brain metrics dashboard
- Full multi-level undo beyond last event best-effort
- Horizontal multi-instance brain locking beyond file version field
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HARD-01 | Admin can undo the last training decision (list snapshot client-side + rule revert server-side) | `trainUndoStack` push before decision; `POST /api/bridge/brain/undo` disables/reverts `resultingRuleIds` from last event; client pop restores rows/groups |
| HARD-02 | Brain file enforces caps on events and rules; version conflicts return 409 | `capArray` on save; increment `version` on write; compare client `brainVersion` → 409 `VERSION_CONFLICT` |
| HARD-03 | Admin can view brain metrics (decision counts, active/proposed rule counts) | `GET /api/bridge/brain/metrics` (+ panel display); recompute on save |
| HARD-04 | Tagging documentation describes base regex + brain layers; npm test and verify-live pass | Update `docs/bridge/TAGGING-RULES.md`; phase gate commands green |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| `lib/bridge-brain-store.js` | phase 42 (modify) | Caps, version RMW, metrics recompute | Single persistence choke point |
| `lib/bridge-brain-decisions.js` | phase 45 (modify) | Undo last event / rule revert | Decision write path already owns events |
| `lib/bridge-api.js` | existing (modify) | `/brain/undo`, `/brain/metrics`, 409 mapping | Existing bridge router |
| `public/js/bridge.js` | existing (modify) | `trainUndoStack`, undo button, search/pagination | Train UX surface |
| `docs/bridge/TAGGING-RULES.md` | existing (modify) | Document brain layers | HARD-04 |
| `node:test` + `node:assert/strict` | built-in | Hardening suite | Project standard |
| Analyzer `learned-brain.js` | pattern only | `capArray` / slice(-cap) pattern | Do not share store |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/config.js` `BRIDGE_BRAIN_ROOT` | Temp root in tests | Mirror list-store isolation |
| `scripts/verify-live.ps1` | Live health + homepage 200 | HARD-04 / AGENTS.md |
| `docs/bridge/TEST-PLAN.md` | Map new cases if bridge coverage table maintained | After adding tests |
| `docs/gsd/milestones/M7-filter-superpower-brain.md` | Mark implemented only after user accepts | Close prep, not auto |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-only undo | Server restores row arrays | Server may not have last process rows (stateless decisions); CONTEXT locks client list undo |
| Server-only undo of list | Persist processToken drafts | Out of scope; larger store |
| Unlimited event log | Caps (slice last N) | Unbounded disk/memory |
| File locks / flock | version + 409 | Enough for single-host admin; multi-writer rare |
| Prometheus/metrics SaaS | Simple JSON counts | Overkill for local/operator product |

**Installation:** none — no new npm packages.

```bash
npm test
node --test tests/bridge-brain-hardening.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-brain-store.js        # MODIFY — CAPS, saveBrain version++, enforce caps, recomputeMetrics
├── bridge-brain-decisions.js    # MODIFY — undoLastDecision(brain), accept brainVersion
├── bridge-api.js                # MODIFY — POST undo, GET metrics, map 409
public/js/
└── bridge.js                    # MODIFY — trainUndoStack, undo UI, group search/pagination
docs/bridge/
└── TAGGING-RULES.md             # MODIFY — brain layers section
tests/
└── bridge-brain-hardening.test.js  # CREATE
```

### Pattern 1: Caps (copy Analyzer pattern, Filter constants)

**What:** On every save, truncate arrays to max length (keep newest).  
**When to use:** All brain writes (decisions, rule status, undo).

```js
// Source: modules/property-analyzer/lib/learned-brain.js (pattern only)
// Design spec §4.1 caps
const BRAIN_CAPS = Object.freeze({
  events: 2000,
  typeRules: 500,
  phraseRules: 500
});

function capArray(value, cap) {
  if (!Array.isArray(value)) return [];
  return value.slice(-cap);
}

function enforceBrainCaps(brain) {
  brain.events = capArray(brain.events, BRAIN_CAPS.events);
  brain.typeRules = capArray(brain.typeRules, BRAIN_CAPS.typeRules);
  brain.phraseRules = capArray(brain.phraseRules, BRAIN_CAPS.phraseRules);
  return brain;
}
```

**Note:** Prefer keeping **active** type/phrase rules when trimming if possible; if simple slice, document that oldest disabled/rejected drop first by sorting status priority before slice (discretion — simple slice is acceptable if tests document behavior).

### Pattern 2: Version RMW → 409

**What:** Document `version` integer increments on each successful save; writers may send `brainVersion`.  
**When to use:** decisions, rule status, undo.

```js
// Source: design spec §8 concurrent admin edits
function saveBrain(brain, { expectedVersion } = {}) {
  const current = loadBrain();
  if (expectedVersion != null && current.version !== expectedVersion) {
    const err = new Error('Brain version conflict');
    err.code = 'VERSION_CONFLICT';
    err.statusCode = 409;
    throw err;
  }
  const next = enforceBrainCaps({
    ...brain,
    version: (current.version || 0) + 1,
    updatedAt: new Date().toISOString(),
    metrics: recomputeMetrics(brain)
  });
  writeJsonAtomic(brainPath(), next);
  return next;
}
```

API mapping:

```http
POST /api/bridge/brain/decisions
Body: { …, "brainVersion": 12 }
→ 409 { "code": "VERSION_CONFLICT", "currentVersion": 13 }
```

Client: on 409, refetch brain + show “Brain was updated elsewhere — refresh train state.”

### Pattern 3: Split undo (HARD-01 locked)

```text
Before decision:
  trainUndoStack.push(snapshot(lastResult))  // rows, notDistressedRows, reviewGroups, KPIs
  depth max 10

Admin clicks Undo:
  1. POST /api/bridge/brain/undo  { brainVersion? }
     → server: find last undoable event for admin
     → disable/revert rules in resultingRuleIds if still matching
     → append event action: "undo"
     → save with caps/version
  2. Client: pop trainUndoStack → restore lastResult → re-render
```

```js
// Server sketch
function undoLastDecision(brain, { by }) {
  const last = [...(brain.events || [])].reverse().find((e) =>
    e.by === by && e.action !== 'undo' && !e.undone
  );
  if (!last) {
    const err = new Error('Nothing to undo');
    err.code = 'NOTHING_TO_UNDO';
    err.statusCode = 400;
    throw err;
  }
  for (const id of last.resultingRuleIds || []) {
    const rule = findRule(brain, id);
    if (!rule) continue;
    // Best-effort: disable if still active and created by this event
    if (rule.status === 'active') rule.status = 'disabled';
  }
  last.undone = true;
  brain.events.push({
    id: newEventId(),
    at: new Date().toISOString(),
    by,
    action: 'undo',
    resultingRuleIds: last.resultingRuleIds || [],
    undoneEventId: last.id
  });
  return brain;
}
```

**Document clearly:** Server does **not** re-insert deleted rows into the client list. Without client stack, list side cannot restore.

### Pattern 4: Metrics (HARD-03)

```js
// Source: design §4.1 + phase-47 plan
function recomputeMetrics(brain) {
  const typeRules = brain.typeRules || [];
  const phraseRules = brain.phraseRules || [];
  const events = brain.events || [];
  return {
    totalDecisions: events.filter((e) =>
      ['approve_group', 'deny_group', 'approve_row', 'deny_row'].includes(e.action)
    ).length,
    typeRulesActive: typeRules.filter((r) => r.status === 'active').length,
    phraseRulesActive: phraseRules.filter((r) => r.status === 'active').length,
    phraseRulesProposed: phraseRules.filter((r) => r.status === 'proposed').length,
    suppressCount: typeRules.filter((r) => r.status === 'active' && r.kind === 'suppress_type').length
      + phraseRules.filter((r) => r.status === 'active' && r.kind === 'suppress_phrase').length,
    promoteCount: typeRules.filter((r) => r.status === 'active' && r.kind === 'promote_type').length
      + phraseRules.filter((r) => r.status === 'active' && r.kind === 'promote_phrase').length
  };
}
```

```http
GET /api/bridge/brain/metrics
Headers: x-phuglee-user: admin
→ 200 { totalDecisions, typeRulesActive, phraseRulesActive, phraseRulesProposed, suppressCount, promoteCount }
```

Admin-only. Display on brain panel (phase 46 shell).

### Pattern 5: Train UX polish (phase 47 plan Task 4)

| Feature | Recommendation |
|---------|----------------|
| Group search | Filter by violation type label / key client-side |
| Pagination | Page size 40, sort count desc (design §8 huge discarded) |
| Confirm Deny | Dialog when `count >= 10` |
| Empty/loading/error | Complete states on train + brain panel |
| Undo control | Adjacent to train toolbar; disabled if stack empty |

### Pattern 6: TAGGING-RULES brain layers (HARD-04)

Append to `docs/bridge/TAGGING-RULES.md` (existing base regex content stays authoritative for INDICATOR_CATEGORIES):

```markdown
## Filter Superpower Brain (global, admin-trained)

Runtime order for **code_violation** uploads:

1. Base regex indicators (this document — `INDICATOR_CATEGORIES`)
2. Active **promote type** rules (normalized Violation/Issue Type)
3. Active **phrase** rules (literal patterns on search text)
4. Active **suppress type** rules (final veto on type key)
5. Keep filter splits Strong Distressed vs reviewable not-distressed

**Water shut-off:** exempt from type suppress (always high-value pass-through). Phrase rules N/A in v1.

**Training:** Admin-only on `/bridge` → Train brain. Type rules go live immediately; phrase rules are proposed then activated in Filter brain panel. Non-admins only receive improved automatic tagging.

**Persistence:** Global durable brain JSON (volume-safe path); not the Property Analyzer vision learned-brain.
```

### Pattern 7: Full QA matrix (must automate what is automatable)

| Scenario | Expected | Test type |
|----------|----------|-----------|
| Admin deny weeds type | Removed now; next process no keep | integration |
| Admin approve FN type | Promoted now; next process keeps | integration |
| Non-admin decision | 403 ADMIN_REQUIRED | API |
| Activate phrase | Next process matches | integration |
| Undo | Rule disabled + client list restored | unit + client logic |
| Caps | events length ≤ max after flood | unit |
| Stale version | 409 | unit |
| Metrics accuracy | counts match fixtures | unit |
| Huge FN list | Cap / truncated flag (phase 43) | regression |
| Water never type-suppressed | regression | unit/engine |
| Save list after denials | Export without denied rows | integration/UI contract |
| `npm test` | exit 0 | gate |
| verify-live | health + homepage 200 | gate |

### Anti-Patterns to Avoid

- **Server claims to restore list without client stack:** Lies; CONTEXT forbids.  
- **Undo that deletes audit history:** Prefer mark `undone` + append undo event.  
- **Unbounded events:** Disk growth; slow loadBrain.  
- **Silent version overwrite:** Lost admin training under multi-tab.  
- **Metrics hardcoded zeros:** HARD-03 fail.  
- **Docs only base regex:** HARD-04 fail.  
- **Ending without verify-live after public edits:** Violates AGENTS.md.  
- **Importing Analyzer learned-brain store:** Domain contamination.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Array capping | Ad-hoc splice per call site | Shared `capArray` + `BRAIN_CAPS` in store | Analyzer pattern; one choke point |
| Atomic durable write | Custom fsync protocols | Existing tmp+rename from list-store / brain store | Proven on Windows |
| Distributed lock service | Redis/etcd | version + 409 | Single Node + volume |
| Full process session server | processToken cache | Client snapshot stack | Stateless decisions already |
| Metrics DB | Time-series store | Recomputed JSON fields | Small global brain |
| New test framework | Jest/Vitest | `node:test` | Project TESTING.md |

**Key insight:** Hardening is mostly **discipline at the store boundary** (caps, version, metrics recompute) plus an honest **split undo**. Do not invent a second brain architecture.

## Common Pitfalls

### Pitfall 1: Undo only on client
**What goes wrong:** List returns but suppress/promote still live globally.  
**Why it happens:** Forgot server rule revert.  
**How to avoid:** Always pair stack pop with POST undo; test rule status after undo.  
**Warning signs:** Re-process still applies undone type rule.

### Pitfall 2: Undo only on server
**What goes wrong:** Brain fixed but UI kept list still missing promoted/denied rows.  
**Why it happens:** No `trainUndoStack`.  
**How to avoid:** Push snapshot before every successful decision.  
**Warning signs:** Undo button only changes metrics, not table.

### Pitfall 3: Caps drop active rules first
**What goes wrong:** Live suppress disappears when rule list full of junk disabled rules.  
**Why it happens:** Naive `slice(-500)` on append order mixing disabled.  
**How to avoid:** Prefer cap events aggressively; for rules, prune `rejected`/`disabled` oldest first.  
**Warning signs:** Production brain hits 500 and active count falls.

### Pitfall 4: Version not checked on all writers
**What goes wrong:** Status activate races with decision overwrite.  
**Why it happens:** Only decisions send brainVersion.  
**How to avoid:** All mutating brain endpoints accept/check version.  
**Warning signs:** Flaky multi-tab admin tests.

### Pitfall 5: 409 without client recovery
**What goes wrong:** Admin stuck after conflict.  
**Why it happens:** Error toast only.  
**How to avoid:** Refetch brain + disable stale actions until refresh.  
**Warning signs:** Repeated 409 loops.

### Pitfall 6: Water regression
**What goes wrong:** HARD matrix fails BRAIN-03.  
**Why it happens:** Undo/disable path corrupts apply order or seeds bad suppress on water.  
**How to avoid:** Keep engine water tests green; never type-suppress water.  
**Warning signs:** Water fixture kept count drops.

### Pitfall 7: Docs drift
**What goes wrong:** HARD-04 fails review.  
**Why it happens:** Code ships, TAGGING-RULES untouched.  
**How to avoid:** Explicit docs task in plan; checklist item.  
**Warning signs:** Doc still says only regex keep/discard.

### Pitfall 8: Claiming live without verify-live
**What goes wrong:** AGENTS.md violation; dead server after edits.  
**Why it happens:** Unit tests pass, server not checked.  
**How to avoid:** Phase gate includes `scripts/verify-live.ps1`; restart via `scripts/restart.ps1` if needed (never blocking `node server.js` in agent shell).  
**Warning signs:** Health check not run in same turn as public/ edits.

### Pitfall 9: Double-undo / empty stack
**What goes wrong:** 500 errors or corrupted events.  
**Why it happens:** No NOTHING_TO_UNDO handling.  
**How to avoid:** 400 when no undoable event; client disables button when stack empty.  
**Warning signs:** Spam undo creates many undo events without rule changes.

## Code Examples

### Client trainUndoStack

```js
// public/js/bridge.js — sketch
const trainUndoStack = [];
const UNDO_LIMIT = 10;

function snapshotTrainState() {
  return {
    rows: structuredClone(lastResult.rows),
    notDistressedRows: structuredClone(lastResult.notDistressedRows),
    reviewGroups: structuredClone(lastResult.reviewGroups),
    stats: { ...lastResult.stats }
  };
}

async function onTrainDecision(payload) {
  trainUndoStack.push(snapshotTrainState());
  if (trainUndoStack.length > UNDO_LIMIT) trainUndoStack.shift();
  const res = await fetch('/api/bridge/brain/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...phugleeSessionHeaders() },
    body: JSON.stringify({ ...payload, brainVersion: lastBrainVersion })
  });
  if (res.status === 409) {
    trainUndoStack.pop(); // decision did not apply
    // refetch brain, toast conflict
    return;
  }
  // apply response rows/groups; update lastBrainVersion
}

async function onTrainUndo() {
  if (!trainUndoStack.length) return;
  const res = await fetch('/api/bridge/brain/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...phugleeSessionHeaders() },
    body: JSON.stringify({ brainVersion: lastBrainVersion })
  });
  if (!res.ok) return; // toast
  const snap = trainUndoStack.pop();
  lastResult = { ...lastResult, ...snap };
  renderResults();
  refreshBrainPanel();
}
```

### writeJsonAtomic (reuse)

```js
// Source: lib/bridge-list-store.js
function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}
```

### Cap + version unit test sketch

```js
test('saveBrain caps events and bumps version', () => {
  const brain = emptyBrain();
  brain.version = 1;
  brain.events = Array.from({ length: 2500 }, (_, i) => ({ id: 'ev_' + i, action: 'deny_group' }));
  const saved = saveBrain(brain, { expectedVersion: 1 });
  assert.equal(saved.events.length, 2000);
  assert.equal(saved.version, 2);
});

test('stale expectedVersion returns conflict', () => {
  saveBrain(emptyBrain()); // version 1→2 or 0→1
  assert.throws(
    () => saveBrain(emptyBrain(), { expectedVersion: 0 }),
    (err) => err.code === 'VERSION_CONFLICT'
  );
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Unbounded audit logs | Capped events (2000) | M7 phase 47 | Bounded volume file |
| Last-writer-wins silent | version + 409 | M7 phase 47 | Safer multi-tab admin |
| Irreversible training | Split undo | M7 phase 47 | Recover from mis-clicks |
| Regex-only docs | Base + brain layers | M7 phase 47 | Operators understand HITL |

**Deprecated/outdated:**
- Treating Filter tagging as “edit INDICATOR_CATEGORIES and redeploy” as the only recovery path
- Assuming client UI hide = security (still need 403 matrix complete in this phase)

## Open Questions

1. **Can undo re-enable a rule that was disabled by a later conflicting decision?**  
   - What we know: Best-effort disable of `resultingRuleIds` from last event.  
   - What's unclear: Complex multi-rule interactions.  
   - Recommendation: Only last event; mark undone; do not deep-reconstruct history.

2. **Should metrics include hitCount rates from process?**  
   - What we know: HARD-03 lists decision + rule counts.  
   - What's unclear: Runtime hit counters.  
   - Recommendation: Counts only in v1; hitCount increments optional if phase 42 already tracks.

3. **FN payload cap location**  
   - What we know: Design wants cap on huge discarded/FN sets.  
   - What's unclear: Whether phase 43 already shipped cap.  
   - Recommendation: If missing, add `notDistressedRowsTruncated` flag here as polish; do not re-architect process.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `npm test` → `node --test tests/**/*.test.js` |
| Quick run command | `node --test tests/bridge-brain-hardening.test.js` |
| Full suite command | `npm test` |
| Live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARD-01 | Server undo disables rules from last event | unit | `node --test tests/bridge-brain-hardening.test.js` | ❌ Wave 0 |
| HARD-01 | NOTHING_TO_UNDO when empty | unit | same | ❌ Wave 0 |
| HARD-01 | Client stack restores list (logic unit or documented manual) | unit/manual | pure function test of stack push/pop if extracted; else manual QA matrix | ❌ Wave 0 |
| HARD-02 | Events/rules capped on save | unit | same | ❌ Wave 0 |
| HARD-02 | Stale brainVersion → 409 VERSION_CONFLICT | unit/API | same + brain-api tests | ❌ Wave 0 |
| HARD-03 | Metrics match fixture rule/event counts | unit | same | ❌ Wave 0 |
| HARD-03 | Non-admin metrics → 403 | API | `node --test tests/bridge-brain-api.test.js` | ❌ Wave 0 |
| HARD-04 | TAGGING-RULES contains brain layer section | static | assert file content in test or checklist | ❌ Wave 0 |
| HARD-04 | npm test green | suite | `npm test` | ✅ infra exists |
| HARD-04 | verify-live green | smoke | `scripts/verify-live.ps1` | ✅ script exists |
| Regression | Water never type-suppressed | unit/engine | existing tagger/engine tests | ✅ (must stay green) |
| Regression | Non-admin decision 403 | API | brain-api tests from 45 | extend |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-brain-hardening.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + `scripts/verify-live.ps1` both exit 0 before `/gsd:verify-work` / milestone close

### Wave 0 Gaps

- [ ] `tests/bridge-brain-hardening.test.js` — caps, version 409, undo, metrics
- [ ] Extend API tests for `/brain/undo` and `/brain/metrics`
- [ ] Optional static test: `docs/bridge/TAGGING-RULES.md` includes “Superpower Brain” / layer headings
- [ ] Ensure temp `BRIDGE_BRAIN_ROOT` isolation in before/after (TESTING.md pattern)
- [ ] Framework install: none

*(If phase 42–46 tests already exist at execute time, extend rather than duplicate.)*

## Sources

### Primary (HIGH confidence)

- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — caps, version 409, undo API, metrics, apply order
- `.planning/REQUIREMENTS.md` — HARD-01–04
- `.planning/ROADMAP.md` — Phase 47 success criteria
- `.planning/phases/47-hardening-metrics-docs/47-CONTEXT.md` — locked split undo / caps / docs
- `.planning/codebase/TESTING.md` — node:test, isolation, verify-live
- `.planning/codebase/CONCERNS.md` — concurrency, admin spoof, brain single-writer scaling
- `docs/bridge/TAGGING-RULES.md` — current base-only docs (must extend)
- `AGENTS.md` — verify-live mandatory after site-affecting work
- `modules/property-analyzer/lib/learned-brain.js` — capArray pattern only
- `lib/bridge-list-store.js` — writeJsonAtomic
- Phase 42 RESEARCH — store/apply foundations

### Secondary (MEDIUM confidence)

- `docs/gsd/plans/2026-07-09-phase-47-filter-brain-hardening.md` — task list, QA matrix (reference)
- `docs/gsd/plans/2026-07-09-m7-audit-filter-brain.md` — residual risks (over-suppress, ReDoS)

### Tertiary (LOW confidence)

- Optimal rule-pruning policy when over cap — not locked; recommend prune disabled/rejected first

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — filesystem brain + existing test runner; no new deps
- Architecture: HIGH — CONTEXT + design lock split undo, caps, version
- Pitfalls: HIGH — concerns + audit call out concurrency, water, admin gate, docs drift

**Research date:** 2026-07-09  
**Valid until:** 2026-08-08 (30 days; stable domain)

## RESEARCH COMPLETE
