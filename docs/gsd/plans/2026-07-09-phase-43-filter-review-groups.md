# Phase 43 — Reviewable Not-Distressed Rows + Grouping

> **GSD:** `/gsd:execute-phase 43`  
> **Milestone:** [M7 Filter Superpower Brain](../milestones/M7-filter-superpower-brain.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
> **Depends on:** Phase 42

**Goal:** Process responses include full **not-distressed** rows (false-negative pool) plus **review groups** stacked by city Violation type, with signals and description samples ready for admin UI.

**Architecture:** Split distress filter into kept + full FN rows; assign stable `rowId`; pure `buildReviewGroups(rows, section)`.

---

## Quality bar

| Pass | Fail |
|------|------|
| `notDistressedRows` has full fields (address, type, description, tag, matchedIndicators) | Only rawPreview discards |
| Groups stack identical type keys with correct `count` | One group per row always |
| Union of `matchedIndicators` on distressed groups | Signals missing |
| `descriptionSamples` up to 5 distinct | Empty always |
| Non-distress discards (dedupe, no address) stay in `discarded` only | Pollute FN review pool |
| Cap: if FN > 5000, truncate with `brainMeta.notDistressedTruncated` | OOM / multi-MB response silent |

---

## Files

| Action | Path |
|--------|------|
| Create | `lib/bridge-review-groups.js` |
| Create | `tests/bridge-review-groups.test.js` |
| Modify | `lib/bridge-distress-tagger.js` — `filterDistressOnly` return full removed rows (already has `row`) |
| Modify | `lib/bridge-engine/index.js` — build FN list + groups + rowIds |
| Modify | `lib/bridge-api.js` — ensure JSON payload includes new fields |
| Modify | `tests/bridge-engine.test.js` or process tests |

---

## Interfaces

```js
// bridge-review-groups.js
function assignRowIds(rows) // mutates or maps with rowId
function buildReviewGroups(rows, section /* 'distressed' | 'not_distressed' */)
// returns ReviewGroup[] sorted by count desc, then label asc

function groupIdFor(section, violationTypeKey, descriptionKeyOptional)
```

**Grouping rules:**

- Primary key: `violationTypeKey(violationIssueType)`
- Empty type → `__unknown__`
- Within `__unknown__` or when admin later needs one-by-one: if group count would mix wildly different descriptions, optional sub-split by exact `descriptionNotes` trim when type is empty **only** (phase 43: for empty type, group by exact description string)
- For non-empty type: **one group per type key** even if descriptions differ (product D5)
- `isSingleton: count === 1`

**rowId:** `r_${index}_${hash8(streetAddress|type|violationDate)}` stable within a process response.

---

## Tasks

### Task 1: Group builder tests first

- [ ] 20 rows same type → 1 group count 20
- [ ] 2 types → 2 groups
- [ ] Empty type different descriptions → separate groups
- [ ] matchedIndicators union
- [ ] descriptionSamples unique max 5

### Task 2: Engine integration

- [ ] After brain apply + distress split:
  - `kept` → `rows`
  - strong-fail code violations → `notDistressedRows` (full row objects)
  - map distress discards that are only `no_distress_signal` into FN rows; keep other discard reasons in `discarded`
- [ ] `assignRowIds` on both arrays
- [ ] `reviewGroups.distressed = buildReviewGroups(rows, 'distressed')`
- [ ] `reviewGroups.notDistressed = buildReviewGroups(notDistressedRows, 'not_distressed')`
- [ ] Cap `notDistressedRows` at 5000 (document constant `MAX_FN_REVIEW_ROWS`)

### Task 3: API contract smoke

- [ ] Process fixture CSV with weeds + fence permit → assert both sections non-empty when applicable
- [ ] Commit: `feat(filter): phase 43 review groups and not-distressed rows`

### Task 4: Verify

```powershell
node --test tests/bridge-review-groups.test.js
npm test
powershell -File scripts\verify-live.ps1
```

---

## Out of scope

Admin UI, decision writes (return data only)
