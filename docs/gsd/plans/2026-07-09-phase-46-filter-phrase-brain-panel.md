# Phase 46 — Phrase Mining + Admin Brain Panel

> **GSD:** `/gsd:execute-phase 46`  
> **Milestone:** [M7 Filter Superpower Brain](../milestones/M7-filter-superpower-brain.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
> **Depends on:** Phase 45

**Goal:** Deep learning layer — mine phrases from one-by-one (and multi-description) decisions into **proposed** rules; admin **brain panel** to activate/reject; only **active** phrase rules affect future process (via phase 42 apply).

**Architecture:** `bridge-phrase-miner.js` runs after each decision; panel reads `GET /api/bridge/brain`; status updates via `POST .../rules/:id/status`.

---

## Quality bar

| Pass | Fail |
|------|------|
| Proposed phrase rules never change tagging until active | Auto-live on mine |
| ≥2 same-direction evidence → one proposed rule | Spam one-offs as live |
| Admin activate → next process uses phrase | Activate no-op |
| Admin reject → status rejected, not applied | Still matches |
| Panel lists type rules + phrase rules | Hidden only in JSON file |
| Literals escaped (no ReDoS from raw user text) | Untrusted regex live |

---

## Files

| Action | Path |
|--------|------|
| Create | `lib/bridge-phrase-miner.js` |
| Create | `tests/bridge-phrase-miner.test.js` |
| Modify | `lib/bridge-brain-decisions.js` — call miner after event |
| Modify | `lib/bridge-api.js` — GET brain, POST rule status |
| Modify | `public/bridge.html` — brain panel drawer/section |
| Modify | `public/js/bridge.js` — load/render panel |
| Modify | CSS for panel |

---

## Interfaces

```js
/**
 * @param {object} event - training event with descriptions, action, section
 * @param {BrainDocument} brain
 * @returns {BrainDocument} maybe with new proposed phraseRules
 */
function minePhrasesFromEvent(event, brain)

function extractCandidates(text) // tokens/phrases length>=4
```

**Mining rules:**

- Use descriptionNotes + violationIssueType from event samples
- Direction: promote if (not_distressed+approve) or (distressed+approve with weak signals); suppress if distressed+deny
- Count evidence in events; if candidate has ≥2 promote evidence and no suppress conflict → proposed promote_phrase
- Status always `proposed` on create
- Deduplicate identical pattern+kind

**Activate path:**

```js
POST /api/bridge/brain/rules/:id/status
{ "status": "active" | "rejected" | "disabled" }
```

Phase 42 `applyBrainToRow` already applies `status === 'active'` phrase rules — verify wiring.

---

## Brain panel UX (admin)

- Entry: button “Filter brain” on results/train toolbar
- Sections:
  1. **Active type rules** (suppress/promote) + disable
  2. **Proposed phrase rules** + Approve / Reject
  3. **Active phrase rules** + Disable
  4. Counts from metrics
- Empty states for new installs

---

## Tasks

### Task 1: Miner + tests

- [ ] extractCandidates
- [ ] two deny events with “parking on lawn” → proposed suppress
- [ ] single event → no proposal
- [ ] never status active from miner

### Task 2: Hook decisions + API

- [ ] After applyDecision save, run miner
- [ ] GET /api/bridge/brain admin-only
- [ ] POST rule status admin-only

### Task 3: Panel UI

- [ ] Render lists; actions call API; refresh
- [ ] After activate, optional note “Applies on next file process”

### Task 4: Integration test

- [ ] propose → activate → applyBrainToRow text matches → strong or suppressed as expected
- [ ] Commit: `feat(filter): phase 46 phrase mining and brain panel`

### Task 5: Verify

```powershell
npm test
powershell -File scripts\verify-live.ps1
```

---

## Out of scope

Full undo stack (47), public metrics dashboard for non-admin
