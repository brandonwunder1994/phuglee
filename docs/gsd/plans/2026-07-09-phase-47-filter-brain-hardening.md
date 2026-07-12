# Phase 47 — Hardening, Metrics, Docs, Production QA

> **GSD:** `/gsd:execute-phase 47`  
> **Milestone:** [M7 Filter Superpower Brain](../milestones/M7-filter-superpower-brain.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
> **Depends on:** Phases 42–46

**Goal:** Production-ready superpower brain — undo, caps, metrics, docs, edge cases, full verification so M7 can close.

---

## Quality bar

| Pass | Fail |
|------|------|
| Undo last decision best-effort reverses list+rule when safe | Undo always no-op |
| Events capped; brain file stays bounded | Unbounded growth |
| Metrics endpoint accurate | Hardcoded zeros |
| TAGGING-RULES.md documents brain layers | Docs stale |
| Water shut-off never type-suppressed (regression) | Broken |
| FN cap + group pagination UX | 50k group freeze |
| `npm test` + verify-live exit 0 | Red |
| Non-admin 403 matrix complete | Hole |

---

## Files

| Action | Path |
|--------|------|
| Modify | `lib/bridge-brain-store.js` — caps, version RMW |
| Modify | `lib/bridge-brain-decisions.js` — undo |
| Modify | `lib/bridge-api.js` — undo + metrics routes |
| Modify | `public/js/bridge.js` — undo button, pagination search on train groups |
| Modify | `docs/bridge/TAGGING-RULES.md` |
| Modify | `docs/gsd/milestones/M7-filter-superpower-brain.md` — status when done |
| Create | `tests/bridge-brain-hardening.test.js` |

---

## Tasks

### Task 1: Caps + version

- [ ] Enforce event/type/phrase caps on save
- [ ] `brain.version` increment; decision body may send `brainVersion`; mismatch → 409

### Task 2: Undo

```js
POST /api/bridge/brain/undo
// reverses last event by admin if resultingRuleIds still match current rule state
```

- [ ] Best-effort: re-disable rule created by last event; does not re-insert deleted rows into client without client resend — document: undo rule side fully; list side requires client to keep undo stack of lastResult snapshots (client-side stack of last 10 results preferred for list undo)

**Locked approach:**

1. Client keeps `trainUndoStack` of `{ rows, notDistressedRows, reviewGroups }` before each decision  
2. Server undo reverts **brain rule** from last event  
3. Client pop stack for list UI  

### Task 3: Metrics

```js
GET /api/bridge/brain/metrics
→ { totalDecisions, typeRulesActive, phraseRulesActive, phraseRulesProposed, suppressCount, promoteCount }
```

- [ ] Panel displays metrics

### Task 4: UX polish

- [ ] Train group search filter
- [ ] Paginate groups (page size 40)
- [ ] Confirm dialog on Deny for count ≥ 10
- [ ] Loading/error empty states complete

### Task 5: Docs

Update `docs/bridge/TAGGING-RULES.md` with:

```markdown
## Filter Superpower Brain (global, admin-trained)

1. Base regex indicators (this doc)
2. Active promote type rules
3. Active phrase rules
4. Active suppress type rules (final veto)
5. Water shut-off exempt from type suppress

Admin trains via /bridge → Train brain. Non-admins only receive improved tagging.
```

### Task 6: Full QA matrix

| Scenario | Expected |
|----------|----------|
| Admin deny weeds type | Removed now; next file no weeds keep |
| Admin approve FN type | Promoted now; next file keeps type |
| Non-admin decision | 403 |
| Activate phrase | Next process matches |
| Undo | Rule disabled + list restored client |
| Huge FN list | Cap + truncated flag |
| Save list after denials | Export without denied rows |
| AUTH paths | Headers present from bridge fetch helper |

### Task 7: Verify + close prep

```powershell
cd C:\Users\brand\Projects\distress-os
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

- [ ] Commit: `feat(filter): phase 47 brain hardening metrics and docs`
- [ ] Update M7 milestone status to `implemented` only after user accepts  
- [ ] Ready for `/gsd:complete-milestone` / `/gsd:audit-milestone` post-ship

---

## Milestone exit

When 47 green, run post-implementation audit against BRAIN-01–16 matrix in `2026-07-09-m7-audit-filter-brain.md` and mark coverage **done**.
