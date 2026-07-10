# Filter Superpower Brain — Design Spec

**Date:** 2026-07-09  
**Status:** Approved for planning (execute only when user says)  
**Surface:** Filter / Data Bridge (`/bridge`) — `public/bridge.html`, `public/js/bridge.js`, `lib/bridge-*`  
**Milestone:** M7 — Filter Superpower Brain (v1.6)  
**GSD phases:** 42 → 47  

---

## 1. Feature summary

Build a **global, admin-only human feedback loop** on the Filter results page so every Approve / Deny:

1. **Fixes the current batch** (deny removes from kept; approve on non-distressed promotes into kept).
2. **Trains a durable shared brain** so the **next upload** (and every customer’s Filter run) tags distress better.

This is a **human-in-the-loop hybrid**, not black-box ML: type suppress/promote + phrase-mined rules that only go live after admin approval. Readable, undoable, auditable — a sellable “superpower brain.”

### Who it’s for

| Role | Capability |
|------|------------|
| **Admin** (`username === admin`) | Review groups, Approve/Deny, manage proposed phrase rules, undo/disable rules, view metrics |
| **All other users** | Get improved automatic filtering from the shared brain; **no** training UI |

### Success

Admin grades “High Grass and Weeds × 20” once → that type is suppressed or affirmed globally → next city’s file already respects the lesson without re-reviewing the same type.

---

## 2. Locked product decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Surface | **Filter / Bridge only** (not Analyze vision review) |
| D2 | Current-list effect | **Deny → remove** from kept; **Approve** on non-distressed → **promote** into kept |
| D3 | Brain scope | **Global** (all customers share one brain) |
| D4 | Who trains | **Admin only** |
| D5 | Grouping | **City Violation/Issue Type** label (normalized); unique leftovers one-by-one |
| D6 | Learning model | **HITL hybrid:** type rules + phrase mining → proposed rules → admin approve into live brain |
| D7 | Future uploads | Brain **must** change tagging on every subsequent `processUpload` |
| D8 | Stack | Existing Node shell + vanilla HTML/CSS/JS + file-backed atomic JSON (same pattern as filter lists) |

---

## 3. Architecture

```text
┌─────────────────── Upload (any user) ───────────────────┐
│  parse → normalize → dedupe → import-filter             │
│       → tagRow (base regex)                             │
│       → applyBridgeBrain(live rules)   ◄── GLOBAL BRAIN │
│       → distress filter (kept + reviewable not-kept)    │
│       → response: rows, notDistressedRows, reviewGroups │
└─────────────────────────────────────────────────────────┘

┌─────────────────── Admin review UI ─────────────────────┐
│  Section A: Marked distressed (groups)                  │
│  Section B: Not marked distressed (groups)              │
│  ✓ Approve  /  ✗ Deny   (+ one-by-one free-text)        │
│  Shows: type, count, matchedIndicators, descriptions    │
└───────────────┬─────────────────────────────────────────┘
                │ POST /api/bridge/brain/decisions
                ▼
┌─────────────────── Brain write path ────────────────────┐
│  1. Mutate current result (remove / promote rows)       │
│  2. Append training event (audit log)                   │
│  3. Type rule: suppress | promote (live immediately)    │
│  4. Phrase miner → proposedRules (pending admin OK)     │
│  5. Atomic write global brain JSON                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────── Admin brain panel ───────────────────┐
│  Live type rules · Proposed phrase rules · Metrics      │
│  Approve / reject / disable / undo                      │
└─────────────────────────────────────────────────────────┘
```

### Runtime tag order (code violations)

1. Build search text (existing `buildSearchText`).
2. If **promote type** matches normalized `violationIssueType` → force strong distress tag (+ reason `brain:promote-type`).
3. Else run base `INDICATOR_CATEGORIES` regex match.
4. Apply **approved phrase rules** (promote or suppress by pattern).
5. If **suppress type** matches → force standard / not distress (+ reason `brain:suppress-type`).
6. `filterDistressOnly` (or equivalent) splits kept vs not-distressed **reviewable** rows.
7. Water shut-off: **skip brain type suppress** (always high-value); optional phrase rules N/A.

---

## 4. Data model

### 4.1 Global brain file

Path (prefer volume-safe like filter lists):

```text
$FILTER_LISTS_ROOT/../bridge-brain/global-brain.json
# or config.BRIDGE_BRAIN_PATH
# fallback: data/bridge-brain/global-brain.json
```

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "typeRules": [
    {
      "id": "tr_…",
      "kind": "suppress_type" | "promote_type",
      "violationTypeKey": "high grass and weeds",
      "violationTypeLabel": "High Grass and Weeds",
      "status": "active" | "disabled",
      "source": "admin_review",
      "createdAt": "ISO",
      "createdBy": "admin",
      "sampleCity": "Cheyenne",
      "sampleState": "WY",
      "hitCount": 0
    }
  ],
  "phraseRules": [
    {
      "id": "pr_…",
      "kind": "promote_phrase" | "suppress_phrase",
      "pattern": "string or /regex/i source",
      "patternType": "literal" | "regex",
      "status": "proposed" | "active" | "rejected" | "disabled",
      "evidenceEventIds": ["ev_…"],
      "createdAt": "ISO",
      "reviewedAt": null,
      "reviewedBy": null
    }
  ],
  "events": [
    {
      "id": "ev_…",
      "at": "ISO",
      "by": "admin",
      "action": "approve_group" | "deny_group" | "approve_row" | "deny_row" | "approve_phrase_rule" | "reject_phrase_rule" | "disable_rule" | "undo",
      "section": "distressed" | "not_distressed",
      "violationTypeKey": "…",
      "violationTypeLabel": "…",
      "rowCount": 20,
      "sampleAddresses": ["…"],
      "matchedIndicators": ["…"],
      "descriptionSamples": ["…"],
      "city": {},
      "sourceFile": "…",
      "resultingRuleIds": ["tr_…"],
      "batchId": "…"
    }
  ],
  "metrics": {
    "totalDecisions": 0,
    "typeRulesActive": 0,
    "phraseRulesActive": 0,
    "phraseRulesProposed": 0
  }
}
```

**Caps:** events last 2000; typeRules 500 active+disabled; phraseRules 500. Atomic write (tmp + rename) like `bridge-list-store`.

### 4.2 Normalization key

```js
function violationTypeKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
// empty → key "__unknown__" ; one-by-one may use description hash when type empty
```

### 4.3 Process response additions

```js
{
  // existing
  rows: KeptRow[],           // after brain + distress filter
  discarded: DiscardSummary[], // non-reviewable discards (bad address, dedupe, already imported)

  // NEW
  notDistressedRows: Row[],  // full rows that failed distress (reviewable FN pool)
  reviewGroups: {
    distressed: ReviewGroup[],
    notDistressed: ReviewGroup[]
  },
  brainMeta: {
    appliedTypeRuleIds: string[],
    appliedPhraseRuleIds: string[],
    version: number
  }
}

ReviewGroup = {
  groupId: string,              // hash of section + typeKey [+ descriptionKey if singleton]
  section: 'distressed' | 'not_distressed',
  violationTypeLabel: string,
  violationTypeKey: string,
  count: number,
  rowIds: string[],             // stable ids assigned at process time
  sampleAddresses: string[],    // up to 5
  matchedIndicators: string[],  // union
  descriptionSamples: string[], // up to 5 distinct
  confidenceLevels: string[],
  isSingleton: boolean          // true → one-by-one UI treatment
}
```

Every row gets `rowId` at process time (`crypto.randomBytes` or hash of address+type+index).

### 4.4 Decision request

```js
POST /api/bridge/brain/decisions
{
  "action": "approve" | "deny",
  "section": "distressed" | "not_distressed",
  "groupId": "…",
  "rowIds": ["…"],           // all rows in group (server re-validates)
  "processToken": "…",       // optional: server-side draft id if we persist batch
  "city": { "id", "city", "state" },
  "sourceFile": "…",
  "uploadType": "code_violation"
}
```

**Semantics:**

| Section | Action | Current list | Brain |
|---------|--------|--------------|-------|
| distressed | approve | Keep rows; mark reviewed | Affirmation event; optional reinforce promote if was brain-promoted |
| distressed | deny | **Remove** rows from `rows` | **suppress_type** for group type key |
| not_distressed | approve | **Promote** rows into `rows` (strong tag) | **promote_type** for group type key |
| not_distressed | deny | Leave out of kept | Affirmation “correctly excluded”; no suppress of healthy types unless type was falsely promoted |

Singleton free-text denials/approvals also feed **phrase miner**.

---

## 5. Admin gate

- Client: show training UI only if session username is `admin` (existing `PhugleeSession` / auth).
- Server: **all** brain write endpoints require `x-phuglee-user: admin` (or sanitized equal). Non-admin → **403** `{ code: 'ADMIN_REQUIRED' }`.
- Read endpoints for active rule **application** happen inside process (no special auth); listing brain rules for UI is admin-only.
- When `AUTH_DISABLED` in local dev: still require header for writes, or allow env `BRIDGE_BRAIN_OPEN=1` for tests only — default **strict**.

---

## 6. UX (Filter results)

### Non-admin

Existing results table + save/export. Brain applied silently. Optional subtle meta: “Filter brain vN applied” (no controls).

### Admin

After process, results panel gains:

1. **Mode tabs:** `Kept list` | `Train brain`  
2. **Train brain** has two sections:
   - **Marked distressed** — groups with count badge, matched signal chips, description samples, address samples, ✓ / ✗  
   - **Not marked distressed** — same layout (false-negative catch)  
3. Expand group → sample rows table  
4. After decision: group collapses to “Approved/Denied”, list KPIs update  
5. **Filter brain** drawer/panel: active type rules, proposed phrase rules (approve/reject), undo last decision, metrics  

Match existing bridge design system (cards, tags, toolbar) — no new visual language.

**Keyboard:** optional later (not blocking v1).

---

## 7. Phrase mining (depth layer)

After singleton or multi-description decisions:

1. Collect description + issue type text from decided rows.
2. Extract candidate tokens/phrases (length ≥ 4, not stopwords, not pure numbers).
3. If same candidate appears ≥ 2 times in same direction (promote vs suppress) → create `phraseRules` entry `status: proposed`.
4. Admin must set `active` before it affects `applyBridgeBrain`.
5. Never auto-activate phrase rules.

---

## 8. Edge cases

| Case | Behavior |
|------|----------|
| Empty violation type | Group key `__unknown__`; prefer description exact-match sub-groups; often singleton |
| Water shut-off | No type suppress; training UI can hide or show read-only |
| Huge discarded set | Paginate groups (50), sort by count desc, search by type |
| Conflicting rules | suppress type wins over promote type on same key (safe default); log warning |
| Re-process same file | Brain already applied; admin re-review optional |
| Save list after denials | Save **current** `rows` only (post-mutation) |
| Concurrent admin edits | Atomic RMW with version field; 409 on stale version |
| Missing brain file | Treat as empty brain; create on first write |
| Regex ReDoS | Phrase rules: escape literals; reject user regex over length/complexity |

---

## 9. API surface

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/bridge/process` | user | Extended response (existing + new fields) |
| GET | `/api/bridge/brain` | admin | Full brain summary for panel |
| POST | `/api/bridge/brain/decisions` | admin | Approve/deny group |
| POST | `/api/bridge/brain/rules/:id/status` | admin | active/disabled/rejected |
| POST | `/api/bridge/brain/undo` | admin | Undo last event (best-effort reverse) |
| GET | `/api/bridge/brain/metrics` | admin | Counts / rates |

---

## 10. Testing strategy

- Unit: normalize key, apply type/phrase rules, group builder, decision mutator, phrase miner, admin gate  
- Integration: process with seeded brain → kept/not kept change  
- API: non-admin 403 on decisions  
- UI smoke: admin sees Train brain; non-admin does not  
- Regression: existing bridge tests + `npm test` + `scripts/verify-live.ps1`

---

## 11. Out of scope (this milestone)

- Analyze vision AI review changes  
- Per-user or per-city brains  
- Automatic ML model training / fine-tunes  
- Non-admin training  
- Changing Collect or Command flows  

---

## 12. Phase map (GSD)

| Phase | Name | Ships |
|-------|------|-------|
| 42 | Brain store + runtime apply | Empty-safe brain file; process applies suppress/promote/phrase active rules |
| 43 | Reviewable FN rows + grouping | `notDistressedRows`, `reviewGroups`, `rowId` |
| 44 | Admin review UX | Two sections, group ✓/✗, signals + descriptions |
| 45 | Decision write path | Remove/promote + type rules + audit events |
| 46 | Phrase mining + brain panel | Proposed rules + admin activate/reject |
| 47 | Hardening + metrics + docs | Undo, caps, metrics, TAGGING-RULES, production QA |

**Execute order:** 42 → 43 → 44 → 45 → 46 → 47 only.
