# Phase 45: Decisions + type rules + list mutation - Research

**Researched:** 2026-07-09  
**Domain:** Admin brain decision write path — list mutation + live type rules + audit + 403 gate  
**Confidence:** HIGH

## Summary

Phase 45 is the **write half** of the Filter superpower brain: admin Approve/Deny on Train-brain groups must (1) mutate the **current process result lists** (kept vs not-distressed), (2) upsert **active global type rules** so the next `processUpload` learns for all users, (3) append an **audit event**, and (4) reject non-admin writers with **403 `ADMIN_REQUIRED`**. Phases 42–44 supply the store/apply layer, review payload/groups/rowIds, and admin UI chrome; this phase wires persistence + semantics.

The stack is already decided by the product and prior research: Node filesystem brain (`lib/bridge-brain-store.js` from 42), pure decision mutator (`lib/bridge-brain-decisions.js` — create), routes in `lib/bridge-api.js`, client POST from `public/js/bridge.js` using `X-Phuglee-User` headers. Session strategy for v1 is **stateless**: client sends current `rows` + `notDistressedRows` with the decision body; server mutates those arrays and returns the new working sets (no server-side processToken cache).

**Primary recommendation:** Implement pure `applyDecision` + `requireAdmin` + `POST /api/bridge/brain/decisions` that upserts type rules via brain-store, returns mutated lists + event + brainSummary; client replaces `lastResult` and re-renders. No phrase mining, undo, or metrics panel in this phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

| Section | Action | List | Brain |
|---------|--------|------|-------|
| distressed | deny | remove from kept | suppress_type active |
| distressed | approve | keep | affirmation; clear suppress for type if present |
| not_distressed | approve | promote to kept strong | promote_type active |
| not_distressed | deny | stay out | affirmation only |

- Stateless: client may send current rows arrays; or document size limits
- Server requireAdmin via x-phuglee-user === admin

### Claude's Discretion

*(CONTEXT.md does not list a separate “Claude's Discretion” section. Treat as discretion:)*

- Exact request/response field names within design-spec envelope
- Body size limit value for 413
- Whether `requireAdmin` lives in `bridge-api.js` vs `bridge-brain-decisions.js` (prefer API helper + pure decision module without HTTP)
- Whether to rebuild `reviewGroups` server-side on every decision (recommended: yes, reuse phase-43 `buildReviewGroups`)
- Event id format (`ev_…`) and type rule id format (`tr_…`)

### Deferred Ideas (OUT OF SCOPE)

- Phrase mining / proposed phrase rules — Phase 46
- Brain panel activate/reject/disable UI — Phase 46
- Undo last decision — Phase 47
- Caps enforcement + version 409 concurrency — Phase 47 (document `version` bump OK; full 409 optional if cheap)
- Server-side processToken / draft cache alternative to client row arrays
- Analyzer learned-brain / shared store
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEC-01 | Admin Deny on distressed removes those rows from the current kept list | `applyDecision`: section=`distressed`, action=`deny` → filter `rowIds` out of `rows` |
| DEC-02 | Admin Approve on not-distressed promotes those rows into the current kept list as distressed | Move matching `rowIds` from `notDistressedRows` → `rows`; set `distressedSignalTag = STRONG_DISTRESSED_TAG` |
| DEC-03 | Deny on distressed writes an active global `suppress_type` rule for that violation type | Upsert `typeRules` entry `kind: suppress_type`, `status: active`; `saveBrain` |
| DEC-04 | Approve on not-distressed writes an active global `promote_type` rule for that violation type | Upsert `promote_type` active; disable conflicting `suppress_type` for same key |
| DEC-05 | Every decision appends an audit event (who, when, type, counts, samples) | Append to `brain.events` with by/at/action/section/type/counts/samples; return `event` in response |
| DEC-06 | Non-admin brain write APIs return 403 `ADMIN_REQUIRED` | `requireAdmin(req)` using `readPhugleeUser(req) === 'admin'`; else 403 JSON |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| Node `fs` + brain store | `lib/bridge-brain-store.js` (phase 42) | load/save global brain, `violationTypeKey` | Already durable + atomic |
| `lib/bridge-brain-decisions.js` | **create** | Pure `applyDecision` + type-rule upsert helpers | Unit-testable without HTTP |
| `lib/bridge-api.js` | existing | `POST /api/bridge/brain/decisions` + `requireAdmin` | All bridge HTTP routes live here |
| `lib/phuglee-user.js` | existing | `readPhugleeUser` → sanitized lowercase username | Header identity already used by lists |
| `lib/bridge-distress-tagger.js` | existing | `STRONG_DISTRESSED_TAG` | Promote must match keep filter |
| `lib/bridge-review-groups.js` (or engine helper from 43) | phase 43 | Rebuild `reviewGroups` after mutation | Keep UI groups consistent |
| `public/js/bridge.js` | existing | Client POST + replace `lastResult` | Train UI from phase 44 |
| `public/js/phuglee-session-headers.js` | existing | `X-Phuglee-User` / `X-Phuglee-Plan` | Same as list CRUD |
| `node:test` + `node:assert/strict` | built-in | Unit + API handler tests | Project standard |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `crypto.randomBytes` / short id | `ev_…` / `tr_…` ids | Event + rule creation |
| `lib/config.js` `BRIDGE_BRAIN_ROOT` | Temp dir override in tests | Isolation like list-store tests |
| Design-spec event schema §4.1 | Audit field names | DEC-05 shape |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stateless client row arrays | Server processToken cache | Deferred; avoids server memory; payload can be large → enforce body cap |
| Decision logic inside `bridge-api.js` only | Monolith handler | Harder to unit test four-way matrix; pure module is standard for tagger/apply |
| Analyzer `learned-brain.js` patterns for storage | Reuse file | **Forbidden** — different domain; only copy caps/audit *ideas* later in 47 |
| Persist mutation via `saveList` | Always write list store | Current list is **in-session process result**; save remains explicit user action |

**Installation:** none — no new npm packages.

```bash
npm test
node --test tests/bridge-brain-decisions.test.js tests/bridge-brain-api.test.js
```

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-brain-store.js          # from 42 — loadBrain, saveBrain, violationTypeKey, emptyBrain
├── bridge-brain-apply.js          # from 42 — runtime apply (consumer of rules written here)
├── bridge-brain-decisions.js      # CREATE — applyDecision, upsertTypeRule, buildEvent
├── bridge-review-groups.js        # from 43 — buildReviewGroups (rebuild after mutate)
├── bridge-api.js                  # MODIFY — requireAdmin + POST /brain/decisions
├── phuglee-user.js                # REUSE readPhugleeUser
└── bridge-distress-tagger.js      # REUSE STRONG_DISTRESSED_TAG

public/js/
├── bridge.js                      # MODIFY — POST decision, apply response to lastResult
└── phuglee-session-headers.js     # REUSE bridgeHeaders path

tests/
├── bridge-brain-decisions.test.js # CREATE — 4 action/section combos + rule upsert
└── bridge-brain-api.test.js       # CREATE — 403, 400, happy path admin
```

### Pattern 1: Decision matrix (locked — implement exactly)

```text
section=distressed, action=deny:     # DEC-01 + DEC-03
  - Remove rowIds from rows
  - Upsert typeRule suppress_type active for violationTypeKey
  - Disable any active promote_type for same key (suppress wins next process)
  - Event action: deny_group

section=distressed, action=approve:  # affirmation + clear suppress
  - Leave rows in kept
  - Disable any active suppress_type for that key (admin affirms type is good)
  - Do NOT create promote_type merely from affirmation (optional later)
  - Event action: approve_group

section=not_distressed, action=approve:  # DEC-02 + DEC-04
  - Move rowIds from notDistressedRows → rows
  - Set distressedSignalTag = STRONG_DISTRESSED_TAG on moved rows
  - Upsert promote_type active
  - Disable conflicting suppress_type for same key
  - Event action: approve_group

section=not_distressed, action=deny:  # affirmation only
  - Leave out of rows (no list change)
  - Event action: deny_group
  - Do NOT write suppress_type (type was correctly excluded; suppressing would train wrong signal)
```

### Pattern 2: Stateless decision request

**What:** Client owns working sets; server is pure transform + brain write.  
**When to use:** All v1 decision POSTs (CONTEXT locked).  
**Body (design §4.4 + plan extension):**

```js
// POST /api/bridge/brain/decisions
// Headers: X-Phuglee-User: admin  (Content-Type: application/json)
{
  action: 'approve' | 'deny',
  section: 'distressed' | 'not_distressed',
  groupId: string,
  rowIds: string[],
  violationTypeKey: string,      // server re-derives from label if missing
  violationTypeLabel: string,
  city: { id, city, state },
  sourceFile: string,
  uploadType: 'code_violation',  // water training optional no-op / reject
  rows: Row[],                   // current kept
  notDistressedRows: Row[],      // current FN pool
  matchedIndicators: string[],   // optional samples for event
  descriptionSamples: string[],
  sampleAddresses: string[]
}
```

**Response:**

```js
{
  ok: true,
  rows: Row[],
  notDistressedRows: Row[],
  reviewGroups: { distressed: [], notDistressed: [] },
  event: { id, at, by, action, section, ... },
  brainSummary: {
    version: number,
    typeRulesActive: number,
    totalDecisions: number
  },
  statsPatch: {  // optional but useful for KPIs
    kept: number,
    notDistressed: number
  }
}
```

### Pattern 3: requireAdmin (DEC-06)

```js
// Source: design §5 + lib/phuglee-user.js (sanitize → lowercase)
const { readPhugleeUser } = require('./phuglee-user');
const ADMIN_USERNAME = 'admin'; // same as user-session ADMIN_USERNAME

function requireAdmin(req) {
  const username = readPhugleeUser(req);
  if (username !== ADMIN_USERNAME) {
    const err = new Error('Admin required');
    err.code = 'ADMIN_REQUIRED';
    err.statusCode = 403;
    throw err;
  }
  return username;
}
```

**Notes:**
- `sanitizePhugleeUsername` lowercases and strips non `[a-z0-9_-]`, so `Admin` → `admin`.
- Spoofable header is known (CONCERNS.md); short-term gate matches design; real sessions deferred.
- Default **strict** even when `AUTH_DISABLED` — do not auto-open brain writes unless tests set header.
- Client already gates UI with `PhugleeSettings.isAdmin()` / session === `admin` (phase 44); server must still enforce.

### Pattern 4: Type rule upsert (idempotent)

```js
// Source: design §4.1 typeRules shape
function upsertTypeRule(brain, { kind, violationTypeKey, violationTypeLabel, by, city }) {
  const key = violationTypeKey || violationTypeKeyFromLabel(violationTypeLabel);
  // Prefer single active rule per (kind, key); disable opposite kind for same key when needed
  let existing = brain.typeRules.find(
    (r) => r.kind === kind && r.violationTypeKey === key && r.status === 'active'
  );
  if (existing) {
    existing.updatedAt = new Date().toISOString();
    existing.hitCount = (existing.hitCount || 0) + 1;
    return existing;
  }
  const rule = {
    id: `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind, // 'suppress_type' | 'promote_type'
    violationTypeKey: key,
    violationTypeLabel: violationTypeLabel || key,
    status: 'active',
    source: 'admin_review',
    createdAt: new Date().toISOString(),
    createdBy: by,
    sampleCity: city?.city || '',
    sampleState: city?.state || '',
    hitCount: 1
  };
  brain.typeRules.push(rule);
  return rule;
}

function disableTypeRules(brain, { kind, violationTypeKey }) {
  for (const r of brain.typeRules) {
    if (r.kind === kind && r.violationTypeKey === violationTypeKey && r.status === 'active') {
      r.status = 'disabled';
      r.disabledAt = new Date().toISOString();
    }
  }
}
```

### Pattern 5: List mutation by rowId

```js
function removeByRowIds(rows, rowIds) {
  const set = new Set(rowIds || []);
  return (rows || []).filter((r) => !set.has(r.rowId));
}

function promoteByRowIds(rows, notDistressedRows, rowIds, strongTag) {
  const set = new Set(rowIds || []);
  const moved = [];
  const remainingFn = [];
  for (const r of notDistressedRows || []) {
    if (set.has(r.rowId)) {
      moved.push({
        ...r,
        distressedSignalTag: strongTag,
        confidenceLevel: r.confidenceLevel || 'high',
        brainDecision: 'promoted'
      });
    } else {
      remainingFn.push(r);
    }
  }
  return {
    rows: [...(rows || []), ...moved],
    notDistressedRows: remainingFn,
    movedCount: moved.length
  };
}
```

### Pattern 6: Audit event (DEC-05)

```js
// Source: design §4.1 events[]
function buildDecisionEvent({ by, action, section, input, resultingRuleIds, rowCount }) {
  return {
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    by,
    action, // approve_group | deny_group
    section, // distressed | not_distressed
    violationTypeKey: input.violationTypeKey,
    violationTypeLabel: input.violationTypeLabel,
    rowCount,
    sampleAddresses: (input.sampleAddresses || []).slice(0, 5),
    matchedIndicators: input.matchedIndicators || [],
    descriptionSamples: (input.descriptionSamples || []).slice(0, 5),
    city: input.city || {},
    sourceFile: input.sourceFile || '',
    resultingRuleIds: resultingRuleIds || [],
    groupId: input.groupId || '',
    batchId: input.batchId || null
  };
}
```

After append: bump `brain.metrics.totalDecisions`, recompute `typeRulesActive`, set `brain.updatedAt`, optionally `brain.version += 1` (forward-compat for phase 47).

### Pattern 7: API handler skeleton

```js
// lib/bridge-api.js — add route before 404
// POST /api/bridge/brain/decisions
async function handleBrainDecision(req, res) {
  let username;
  try {
    username = requireAdmin(req);
  } catch (err) {
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message, code: 'ADMIN_REQUIRED' });
      return;
    }
    throw err;
  }

  const buffer = await readBody(req);
  // Body size cap (discretion): e.g. 15_000_000 bytes
  if (buffer.length > MAX_BRAIN_DECISION_BYTES) {
    sendJson(res, 413, { error: 'Decision payload too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  // validate action/section/rowIds
  const brain = loadBrain();
  const result = applyDecision(body, {
    brain,
    currentRows: body.rows,
    notDistressedRows: body.notDistressedRows,
    by: username
  });
  saveBrain(result.brain);
  sendJson(res, 200, {
    ok: true,
    rows: result.rows,
    notDistressedRows: result.notDistressedRows,
    reviewGroups: result.reviewGroups,
    event: result.event,
    brainSummary: result.brainSummary
  });
}
```

Router: `pathname === '/api/bridge/brain/decisions' && req.method === 'POST'`.

### Pattern 8: Client wire (phase 44 UI → live)

```js
// public/js/bridge.js — on Approve/Deny click
async function submitTrainDecision({ action, section, group }) {
  if (!lastResult) return;
  const data = await fetchJson('/api/bridge/brain/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      section,
      groupId: group.groupId,
      rowIds: group.rowIds,
      violationTypeKey: group.violationTypeKey,
      violationTypeLabel: group.violationTypeLabel,
      city: lastResult.city,
      sourceFile: lastResult.sourceFile,
      uploadType: lastResult.uploadType,
      rows: lastResult.rows,
      notDistressedRows: lastResult.notDistressedRows || [],
      matchedIndicators: group.matchedIndicators,
      descriptionSamples: group.descriptionSamples,
      sampleAddresses: group.sampleAddresses
    })
  });
  lastResult.rows = data.rows;
  lastResult.notDistressedRows = data.notDistressedRows;
  lastResult.reviewGroups = data.reviewGroups;
  if (lastResult.stats) {
    lastResult.stats.kept = data.rows.length;
    // optional notDistressed count field if present
  }
  renderResults(lastResult); // table + train sections + KPIs
}
```

Use existing `bridgeHeaders` / `fetchJson` so `X-Phuglee-User` is attached. Handle `ADMIN_REQUIRED` toast for non-admin edge cases.

### Anti-Patterns to Avoid

- **UI-only mutation without brain write:** Breaks DEC-03/04 and “next process learns.”
- **Brain write without list mutation:** Breaks DEC-01/02 current-batch fix.
- **Creating suppress_type on not_distressed deny:** Trains wrong lesson; affirmation only.
- **Importing Analyzer learned-brain:** Product forbidden.
- **Skipping requireAdmin:** CONCERNS + DEC-06; client hide is not auth.
- **Throwing on missing brain:** `loadBrain` empty-fallback then first `saveBrain` creates file.
- **Duplicate active suppress+promote for same key without disable:** Runtime suppress wins (42), but keep brain clean by disabling opposite on write.
- **Mutating saved list store implicitly:** Save remains user action on current `rows`.
- **Phrase mining in this phase:** Phase 46 only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin identity parse | Custom header regex | `readPhugleeUser` | Sanitization + case fold already tested |
| Strong tag string | Magic `"Strong Distressed Signal"` | `STRONG_DISTRESSED_TAG` | Must match `filterDistressOnly` |
| Type key normalize | Ad-hoc toLowerCase | `violationTypeKey` from store (42) | Apply and decisions must share key |
| Atomic brain write | Direct writeFile | `saveBrain` / list-store atomic pattern | Partial write risk |
| Group rebuild | New grouping algorithm | Phase 43 `buildReviewGroups` | Single source of truth |
| Auth sessions | JWT now | Header `admin` gate | Deferred multi-tenant auth |
| ProcessToken server cache | Redis/session map | Client row arrays + body cap | CONTEXT locked stateless |

**Key insight:** Phase 45 is a thin **decision orchestrator** — pure mutate + store write + admin gate. Complexity of mining, undo, and caps belongs later; get the four-way matrix and 403 right first.

## Common Pitfalls

### Pitfall 1: Client mutates UI but server never saves brain
**What goes wrong:** Current list looks fixed; next city re-uploads same FP/FN.  
**Why it happens:** Phase 44 stub buttons without POST.  
**How to avoid:** Task order: pure decision tests → API → client; E2E learning proof test (deny → applyBrain → not strong).  
**Warning signs:** `global-brain.json` unchanged after admin click.

### Pitfall 2: Promote without STRONG tag
**What goes wrong:** Rows move into `rows` array but later re-filter / export semantics inconsistent; if client re-applies filter they drop.  
**Why it happens:** Copy row without setting `distressedSignalTag`.  
**How to avoid:** Always set `STRONG_DISTRESSED_TAG` on promote.  
**Warning signs:** Promoted rows missing strong tag in unit tests.

### Pitfall 3: Suppress on not_distressed deny
**What goes wrong:** Healthy “fence permit” type gets suppress when admin was only affirming exclusion — or worse, unrelated types poisoned.  
**Why it happens:** Symmetric “deny always writes suppress” shortcut.  
**How to avoid:** Locked matrix: only distressed+deny writes suppress_type.  
**Warning signs:** typeRules grow on FN-deny tests.

### Pitfall 4: Non-admin 403 missing
**What goes wrong:** Any client can train global brain via curl.  
**Why it happens:** Only client `isAdmin()` hide.  
**How to avoid:** DEC-06 first-class test: `x-phuglee-user: bob` → 403 `ADMIN_REQUIRED`.  
**Warning signs:** Open POST succeeds in API tests without admin header.

### Pitfall 5: Huge JSON body OOM
**What goes wrong:** Stateless design sends full city kept+FN arrays; multi-MB bodies.  
**Why it happens:** No body size check on `readBody`.  
**How to avoid:** Cap (recommend 10–15MB) → 413 `PAYLOAD_TOO_LARGE`; document limit.  
**Warning signs:** Heap spikes on train of large process results.

### Pitfall 6: rowId mismatch
**What goes wrong:** Deny removes 0 rows because client sent group keys but rows lack `rowId` (phase 43 incomplete).  
**Why it happens:** Phase dependency order violated.  
**How to avoid:** Phase 45 depends on 43 rowIds; validate at least one match or return 400 `ROW_IDS_NOT_FOUND` if none of rowIds present in the relevant section.  
**Warning signs:** Decision 200 but list length unchanged.

### Pitfall 7: Water shut-off type rules
**What goes wrong:** Admin accidentally suppress_type on water-ish labels; process already skips water type suppress (42) but brain pollutes.  
**Why it happens:** No uploadType check on write.  
**How to avoid:** If `uploadType === 'water_shut_off'`, reject decision write with 400 `WATER_TRAINING_UNSUPPORTED` or no-op rules + list-only (prefer 400 for clarity).  
**Warning signs:** typeRules for water delinquency labels.

### Pitfall 8: Forgetting stats/KPI update on client
**What goes wrong:** Table updates but “kept” KPI stale.  
**Why it happens:** Only re-render table not stats bar.  
**How to avoid:** After success, set `lastResult.stats.kept` from `rows.length` and re-render results chrome.  
**Warning signs:** Manual QA “count badge wrong after deny.”

### Pitfall 9: Treating historical docs/gsd plans as authority
**What goes wrong:** Planner executes superseded task lists blindly.  
**Why it happens:** `docs/gsd/plans/2026-07-09-phase-45-*.md` still useful as sketch.  
**How to avoid:** Reference only; authoritative CONTEXT + this RESEARCH + future PLAN under `.planning/phases/45-*`.

## Code Examples

### applyDecision core (sketch)

```js
// lib/bridge-brain-decisions.js
// Source: design §4.4 + CONTEXT decision table + historical phase-45 plan
const { STRONG_DISTRESSED_TAG } = require('./bridge-distress-tagger');
const { violationTypeKey } = require('./bridge-brain-store');
// buildReviewGroups from phase 43 module

function applyDecision(input, ctx) {
  const { brain, by } = ctx;
  let rows = Array.isArray(ctx.currentRows) ? ctx.currentRows.slice() : [];
  let notDistressedRows = Array.isArray(ctx.notDistressedRows)
    ? ctx.notDistressedRows.slice()
    : [];
  const action = input.action;
  const section = input.section;
  const typeKey = input.violationTypeKey || violationTypeKey(input.violationTypeLabel);
  const resultingRuleIds = [];
  let rowCount = (input.rowIds || []).length;

  if (section === 'distressed' && action === 'deny') {
    rows = removeByRowIds(rows, input.rowIds);
    const rule = upsertTypeRule(brain, {
      kind: 'suppress_type',
      violationTypeKey: typeKey,
      violationTypeLabel: input.violationTypeLabel,
      by,
      city: input.city
    });
    disableTypeRules(brain, { kind: 'promote_type', violationTypeKey: typeKey });
    resultingRuleIds.push(rule.id);
  } else if (section === 'distressed' && action === 'approve') {
    disableTypeRules(brain, { kind: 'suppress_type', violationTypeKey: typeKey });
  } else if (section === 'not_distressed' && action === 'approve') {
    const promoted = promoteByRowIds(rows, notDistressedRows, input.rowIds, STRONG_DISTRESSED_TAG);
    rows = promoted.rows;
    notDistressedRows = promoted.notDistressedRows;
    rowCount = promoted.movedCount;
    const rule = upsertTypeRule(brain, {
      kind: 'promote_type',
      violationTypeKey: typeKey,
      violationTypeLabel: input.violationTypeLabel,
      by,
      city: input.city
    });
    disableTypeRules(brain, { kind: 'suppress_type', violationTypeKey: typeKey });
    resultingRuleIds.push(rule.id);
  } else if (section === 'not_distressed' && action === 'deny') {
    // affirmation only — no type rule
  } else {
    const err = new Error('Invalid action/section');
    err.code = 'INVALID_DECISION';
    throw err;
  }

  const event = buildDecisionEvent({
    by,
    action: action === 'approve' ? 'approve_group' : 'deny_group',
    section,
    input: { ...input, violationTypeKey: typeKey },
    resultingRuleIds,
    rowCount
  });
  brain.events = brain.events || [];
  brain.events.push(event);
  brain.updatedAt = event.at;
  brain.version = (brain.version || 1) + 1;
  brain.metrics = brain.metrics || {};
  brain.metrics.totalDecisions = (brain.metrics.totalDecisions || 0) + 1;
  brain.metrics.typeRulesActive = brain.typeRules.filter((r) => r.status === 'active').length;

  const reviewGroups = {
    distressed: buildReviewGroups(rows, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };

  return {
    brain,
    rows,
    notDistressedRows,
    reviewGroups,
    event,
    brainSummary: {
      version: brain.version,
      typeRulesActive: brain.metrics.typeRulesActive,
      totalDecisions: brain.metrics.totalDecisions
    }
  };
}

module.exports = { applyDecision, upsertTypeRule, requireAdmin: undefined /* keep HTTP-free */ };
```

### Learning proof (integration)

```js
// tests/bridge-brain-decisions.test.js or bridge-brain-api.test.js
// 1) applyDecision deny distressed fence permit → brain has suppress_type
// 2) applyBrainToRows([{ violationIssueType: 'Fence Permit', distressedSignalTag: STRONG... }], brain)
// 3) assert tag is standard / not strong
```

### API test 403

```js
// Mirror tests/bridge-api-handlers.test.js createMockReq/Res + callBridge
const res = await callBridge('POST', '/api/bridge/brain/decisions', {
  headers: {
    'content-type': 'application/json',
    'x-phuglee-user': 'bob'
  },
  body: Buffer.from(JSON.stringify({
    action: 'deny',
    section: 'distressed',
    rowIds: ['r1'],
    rows: [{ rowId: 'r1', violationIssueType: 'Weeds' }],
    notDistressedRows: []
  }))
});
assert.equal(res.status, 403);
assert.equal(res.json.code, 'ADMIN_REQUIRED');
```

## Exact Files to Create / Modify

| Action | Path | Why |
|--------|------|-----|
| **Create** | `lib/bridge-brain-decisions.js` | Pure decision matrix (DEC-01–05) |
| **Create** | `tests/bridge-brain-decisions.test.js` | Four combos + upsert + affirmation |
| **Create** | `tests/bridge-brain-api.test.js` | 403, 400, admin happy path |
| **Modify** | `lib/bridge-api.js` | Route + requireAdmin + body parse/cap |
| **Modify** | `lib/bridge-brain-store.js` | Optional helpers: upsert/disable if cleaner than decisions-only |
| **Modify** | `public/js/bridge.js` | Wire Train buttons to POST; apply response |
| **Depends on (prior phases)** | store/apply (42), groups/rowIds (43), train UI (44) | Do not reimplement |
| **Do not modify** | `modules/property-analyzer/lib/learned-brain.js` | Separate product |
| **Do not create yet** | phrase miner, undo, metrics panel routes | 46–47 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-edit `INDICATOR_CATEGORIES` + redeploy | Admin decision → live type rule | v1.6 phase 45 | Global learning without deploy |
| Client-only list edits | Server-authoritative mutate + brain write | Phase 45 | Audit trail + multi-user benefit |
| No admin API gate on bridge | `requireAdmin` on brain writes | Phase 45 | DEC-06 |

**Deprecated/outdated:**
- `docs/gsd/plans/2026-07-09-phase-45-filter-brain-decisions.md` — **reference only** (SUPERSEDED note); use for file list/semantics sketch, not execution authority.

## Open Questions

1. **Exact body size cap?**
   - What we know: Stateless arrays can be large; CONCERNS flags unbuffered bodies.
   - What's unclear: Product max city size in practice.
   - Recommendation: **15MB** default constant `MAX_BRAIN_DECISION_BYTES`; document; 413 on exceed.

2. **Must server re-validate all rowIds exist?**
   - What we know: Design says “server re-validates.”
   - Recommendation: Remove/promote only matching ids; if **zero** matches for deny-distressed or approve-FN, return **400** `ROW_IDS_NOT_FOUND`; partial match OK (stale UI).

3. **Rebuild groups server-side vs client-side?**
   - Recommendation: **Server rebuild** via phase-43 helper so single source of truth and DEC tests assert groups.

4. **version++ on every decision now?**
   - Phase 47 wants 409 on stale. Recommendation: increment `brain.version` on save now; optional `If-Match` / body `expectedVersion` can wait for 47 unless free.

5. **Affirm distressed approve writes promote_type?**
   - CONTEXT: affirmation + clear suppress only.
   - Recommendation: **Do not** auto-promote on distressed approve (type already kept by base/brain).

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-brain-decisions.test.js tests/bridge-brain-api.test.js` |
| Full suite command | `npm test` |
| Live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DEC-01 | Deny distressed removes rowIds from rows | unit | `node --test tests/bridge-brain-decisions.test.js` | ❌ Wave 0 |
| DEC-02 | Approve not_distressed moves rows to kept with STRONG tag | unit | `node --test tests/bridge-brain-decisions.test.js` | ❌ Wave 0 |
| DEC-03 | Deny distressed upserts active suppress_type | unit | `node --test tests/bridge-brain-decisions.test.js` | ❌ Wave 0 |
| DEC-04 | Approve not_distressed upserts active promote_type; disables suppress | unit | `node --test tests/bridge-brain-decisions.test.js` | ❌ Wave 0 |
| DEC-05 | Event appended with by/at/section/type/counts | unit | `node --test tests/bridge-brain-decisions.test.js` | ❌ Wave 0 |
| DEC-05 | Affirmation paths also append events (no silent) | unit | `node --test tests/bridge-brain-decisions.test.js` | ❌ Wave 0 |
| DEC-06 | Non-admin POST → 403 ADMIN_REQUIRED | API | `node --test tests/bridge-brain-api.test.js` | ❌ Wave 0 |
| DEC-06 | Admin POST → 200 + brain file updated | API | `node --test tests/bridge-brain-api.test.js` | ❌ Wave 0 |
| Learning | After suppress, applyBrain demotes matching type | integration | decisions or apply test | ❌ Wave 0 |
| Regression | Existing bridge suite green | suite | `npm test` | ✅ existing |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-brain-decisions.test.js tests/bridge-brain-api.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green; if `public/` or server routes change, `scripts\verify-live.ps1` must exit 0

### Wave 0 Gaps

- [ ] `tests/bridge-brain-decisions.test.js` — DEC-01–05 pure matrix
- [ ] `tests/bridge-brain-api.test.js` — DEC-06 + HTTP validation
- [ ] Depends: phase 42 store/apply + phase 43 groups modules must exist before integration green
- [ ] Framework install: none — `node:test` already used
- [ ] Optional: temp `BRIDGE_BRAIN_ROOT` in API tests (mirror list-store handler tests)

*(No pre-existing brain decision tests — Wave 0 is the new files above.)*

## Sources

### Primary (HIGH confidence)

- `.planning/phases/45-decisions-type-rules/45-CONTEXT.md` — locked decision matrix + stateless + requireAdmin
- `.planning/REQUIREMENTS.md` — DEC-01–06
- `.planning/ROADMAP.md` — phase 45 success criteria
- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — §4.1–4.4 schema, §5 admin gate, §9 API
- `lib/bridge-api.js` — router + `readBody` + `sendJson` patterns
- `lib/phuglee-user.js` + `modules/property-analyzer/lib/user-session.js` — sanitize + `admin` constant
- `lib/bridge-distress-tagger.js` — `STRONG_DISTRESSED_TAG`, keep semantics
- `public/js/bridge.js` + `public/js/phuglee-session-headers.js` — fetch + headers
- `.planning/phases/42-brain-store-runtime-apply/42-RESEARCH.md` — store/apply contracts decisions write into
- `.planning/codebase/CONCERNS.md` — spoofable admin, missing brain API, test gaps
- `.planning/codebase/TESTING.md` — node:test conventions
- `tests/bridge-api-handlers.test.js` — mock req/res pattern for API tests

### Secondary (MEDIUM confidence)

- `docs/gsd/plans/2026-07-09-phase-45-filter-brain-decisions.md` — historical task sketch (superseded for authority)
- `docs/gsd/milestones/M7-filter-superpower-brain.md` — milestone constraints
- Phase 43/44 CONTEXT — rowIds/groups/UI prerequisites

### Tertiary (LOW confidence)

- Body size 15MB recommendation — operational discretion, not product-specified
- Optional 400 on water training — design emphasizes water never type-suppressed at apply; write-side reject is defensive

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — pure Node + existing bridge modules; zero new deps
- Architecture: **HIGH** — design + CONTEXT matrix + phase-45 plan sketch + live API patterns agree
- Pitfalls: **HIGH** — CONCERNS and product matrix make failure modes explicit

**Research date:** 2026-07-09  
**Valid until:** 2026-08-08 (stable in-repo domain; re-check if phase 42–44 module names diverge from research)

---

## RESEARCH COMPLETE

**Phase:** 45 - decisions-type-rules  
**Confidence:** HIGH

### Key Findings
- Implement locked 4-way matrix in pure `lib/bridge-brain-decisions.js`; only distressed+deny writes `suppress_type`, only not_distressed+approve writes `promote_type` + list promote.
- Stateless POST body carries `rows` + `notDistressedRows`; cap size (≈15MB → 413); return mutated lists + rebuilt groups + event + brainSummary.
- `requireAdmin` via `readPhugleeUser(req) === 'admin'` on all brain writes → 403 `ADMIN_REQUIRED` (DEC-06).
- Client replaces `lastResult` from response using existing `bridgeHeaders`/`fetchJson`; save-list remains separate user action on post-mutation rows.
- Wave 0: `tests/bridge-brain-decisions.test.js` + `tests/bridge-brain-api.test.js`; learning proof ties decision write → applyBrain.

### File Created
`.planning/phases/45-decisions-type-rules/45-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Existing Node/bridge patterns; no external libs |
| Architecture | HIGH | CONTEXT + design + API code aligned |
| Pitfalls | HIGH | Auth spoof, body size, matrix asymmetry documented |

### Open Questions
- Exact payload byte cap; zero-match rowId policy (recommend 400); version++ now vs phase 47 only.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
