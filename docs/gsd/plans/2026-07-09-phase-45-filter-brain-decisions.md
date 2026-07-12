# Phase 45 — Decision Write Path + Type Rules + List Mutation

> **GSD:** `/gsd:execute-phase 45`  
> **Milestone:** [M7 Filter Superpower Brain](../milestones/M7-filter-superpower-brain.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
> **Depends on:** Phases 42–44

**Goal:** Admin Approve/Deny **persists** training, **mutates the current kept list**, and **updates type rules** so the **next upload** is automatically better for everyone.

**Architecture:** Decision service loads brain → validates admin → mutates rules/events → returns updated `rows` / groups for client; client replaces `lastResult` and re-renders.

---

## Quality bar

| Pass | Fail |
|------|------|
| Non-admin POST → 403 `ADMIN_REQUIRED` | Open write |
| Deny distressed group → those rowIds gone from `rows` | Rows still kept |
| Approve not_distressed → rows appear in `rows` with strong tag | Stay excluded |
| Deny distressed → active `suppress_type` for type key | No rule written |
| Approve not_distressed → active `promote_type` | No rule written |
| Next `processUpload` with same type respects rule | Brain not applied (42 regression) |
| Audit event appended | Silent mutation |
| Client train card marks resolved; KPIs update | Stale UI |

---

## Files

| Action | Path |
|--------|------|
| Create | `lib/bridge-brain-decisions.js` |
| Create | `tests/bridge-brain-decisions.test.js` |
| Create | `tests/bridge-brain-api.test.js` (or extend bridge-api tests) |
| Modify | `lib/bridge-api.js` — routes + admin helper |
| Modify | `lib/bridge-brain-store.js` — upsert type rule helpers |
| Modify | `public/js/bridge.js` — POST decisions, apply response |

---

## Interfaces

```js
function requireAdmin(req) // throws or returns username; uses readPhugleeUser

/**
 * @param {object} input
 * @param {object} ctx - { brain, currentRows, notDistressedRows }
 * @returns {{ brain, rows, notDistressedRows, reviewGroups, event }}
 */
function applyDecision(input, ctx)
```

### Decision semantics (implement exactly)

```text
section=distressed, action=deny:
  - Remove rowIds from rows
  - Upsert typeRule suppress_type active for violationTypeKey
  - Event deny_group

section=distressed, action=approve:
  - Leave rows
  - Event approve_group (affirmation; do not delete suppress if any — optional: remove suppress for this type if existed)
  - If approving, disable any active suppress_type for that key (admin says type is good)

section=not_distressed, action=approve:
  - Move rowIds from notDistressedRows → rows
  - Set distressedSignalTag = STRONG_DISTRESSED_TAG on moved rows
  - Upsert promote_type active
  - Disable conflicting suppress_type for same key
  - Event approve_group

section=not_distressed, action=deny:
  - Leave out of rows
  - Event deny_group (correct exclusion)
  - Do NOT create suppress for unrelated good types
```

### API

```http
POST /api/bridge/brain/decisions
Headers: x-phuglee-user: admin
Body: {
  action, section, groupId, rowIds, violationTypeKey, violationTypeLabel,
  city, sourceFile, uploadType,
  rows,              // client sends current working sets OR server session
  notDistressedRows
}
→ 200 { ok, rows, notDistressedRows, reviewGroups, event, brainSummary }
```

**Session strategy (locked for v1):** Stateless decision: client sends current `rows` + `notDistressedRows` arrays (may be large). Cap body size; if too large, return 413. Alternative later: processToken server cache — out of scope unless needed.

---

## Tasks

### Task 1: Decision pure logic + tests

- [ ] All four action/section combos
- [ ] Admin-only gate unit on helper
- [ ] Type rule upsert idempotent (second deny same type updates timestamp, no duplicate actives)

### Task 2: API route

- [ ] Wire in `bridge-api.js` router
- [ ] 403 non-admin
- [ ] 400 missing fields
- [ ] saveBrain after decision

### Task 3: Client wire

- [ ] Approve/Deny fetch with session headers (same as other phuglee API calls)
- [ ] On success: `lastResult.rows = data.rows` etc.; re-render table + train groups + KPIs
- [ ] Optimistic disable buttons during request
- [ ] Error toast

### Task 4: End-to-end learning proof test

- [ ] Seed process-like rows → deny type “Fence Permit” if ever kept → save brain → applyBrain on new row same type → not strong
- [ ] Commit: `feat(filter): phase 45 brain decisions and live type rules`

### Task 5: Verify

```powershell
npm test
powershell -File scripts\verify-live.ps1
# Manual: admin deny stacked type → refresh process similar type → should drop
```

---

## Out of scope

Phrase mining (46), undo UI (47)
