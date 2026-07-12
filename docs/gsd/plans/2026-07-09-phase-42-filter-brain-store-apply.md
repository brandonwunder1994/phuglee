# Phase 42 — Filter Brain Store + Runtime Apply

> **GSD:** `/gsd:execute-phase 42`  
> **Milestone:** [M7 Filter Superpower Brain](../milestones/M7-filter-superpower-brain.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`

**Goal:** Persist a global Filter brain and **apply active type/phrase rules on every process** so future uploads can learn (rules may be empty until later phases write them).

**Architecture:** New store module (atomic JSON) + pure apply function integrated into tagging pipeline after base `tagRow`, before distress filter. Water shut-off skips type suppress/promote.

**Tech stack:** Node `fs` atomic write, existing tagger, engine processUpload.

---

## Quality bar

| Pass | Fail |
|------|------|
| Missing brain file = empty brain, process still works | Process throws if file missing |
| Active `suppress_type` forces non-distress for matching type | Suppress ignored |
| Active `promote_type` forces strong distress for matching type | Promote ignored |
| Active phrase rules match search text | Phrase never consulted |
| Water shut-off not type-suppressed | Water rows dropped by brain |
| Unit tests green | Only manual proof |

---

## Files

| Action | Path |
|--------|------|
| Create | `lib/bridge-brain-store.js` |
| Create | `lib/bridge-brain-apply.js` |
| Create | `tests/bridge-brain-store.test.js` |
| Create | `tests/bridge-brain-apply.test.js` |
| Modify | `lib/config.js` — `BRIDGE_BRAIN_PATH` / root |
| Modify | `lib/bridge-distress-tagger.js` — export helpers if needed; optional `tagRowWithBrain` |
| Modify | `lib/bridge-engine/index.js` or `normalizer.js` — call apply after tag |
| Modify | `lib/bridge-engine/index.js` — pass `brainMeta` into response |

---

## Interfaces

### `bridge-brain-store.js`

```js
/** @returns {string} absolute path to global-brain.json */
function brainPath()

/** @returns {BrainDocument} versioned empty or loaded */
function loadBrain()

/** @param {BrainDocument} brain — atomic write */
function saveBrain(brain)

/** @returns {BrainDocument} empty structure version 1 */
function emptyBrain()

function violationTypeKey(label)
```

### `bridge-brain-apply.js`

```js
/**
 * @param {object} row - normalized row with violationIssueType, distressedSignalTag, matchedIndicators
 * @param {BrainDocument} brain
 * @param {{ uploadType: string }} opts
 * @returns {{ row: object, appliedRuleIds: string[] }}
 */
function applyBrainToRow(row, brain, opts)

/**
 * @param {object[]} rows
 * @param {BrainDocument} brain
 * @param {{ uploadType: string }} opts
 * @returns {{ rows: object[], appliedRuleIds: string[] }}
 */
function applyBrainToRows(rows, brain, opts)
```

**Apply order per row (code_violation):**

1. Normalize type key from `row.violationIssueType`
2. If active `promote_type` for key → set `STRONG_DISTRESSED_TAG`, note `brainApplied: [...]`
3. Else if base tag already set from tagger — keep
4. Active `promote_phrase` matching `buildSearchText(row)` → strong tag
5. Active `suppress_phrase` matching → force default standard tag, clear matchedIndicators or annotate
6. Active `suppress_type` for key → force standard (wins last for safety)

Water: skip steps 2 and 6 (type rules); phrases optional no-op in v1.

---

## Tasks

### Task 1: Config + empty store

- [ ] Add to `config.js`:

```js
BRIDGE_BRAIN_ROOT: process.env.BRIDGE_BRAIN_ROOT
  ? path.resolve(process.env.BRIDGE_BRAIN_ROOT)
  : (process.env.PDA_DATA_ROOT
    ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-brain')
    : path.join(ROOT, 'data', 'bridge-brain')),
// path.join(BRIDGE_BRAIN_ROOT, 'global-brain.json')
```

- [ ] Implement `emptyBrain`, `loadBrain`, `saveBrain` (atomic tmp+rename like list-store)
- [ ] Test: load missing → empty; save round-trip

### Task 2: Apply pure functions

- [ ] Implement `violationTypeKey`, `applyBrainToRow`, `applyBrainToRows`
- [ ] Test suppress_type: row with type "High Grass" + suppress → not strong
- [ ] Test promote_type: standard row + promote → strong
- [ ] Test suppress wins over promote on same key
- [ ] Test water_shut_off ignores type suppress

### Task 3: Wire processUpload

- [ ] After rows tagged/normalized and before or after `filterDistressOnly`:
  - `const brain = loadBrain()`
  - `applyBrainToRows(rows, brain, { uploadType })`
- [ ] Prefer apply **before** `filterDistressOnly` so promote can keep FN types
- [ ] Attach `processingMeta.brainVersion` and unique `appliedRuleIds`
- [ ] Test via engine unit test with temp brain file (env override path)

### Task 4: Verify + commit

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js
npm test
powershell -File scripts\verify-live.ps1
```

- [ ] Commit: `feat(filter): phase 42 global brain store and runtime apply`

---

## Out of scope this phase

UI, decisions API, grouping, phrase mining UI, writing rules from admin (seed only via tests/file)
