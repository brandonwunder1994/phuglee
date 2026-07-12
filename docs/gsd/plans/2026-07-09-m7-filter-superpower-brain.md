# M7 — Filter Superpower Brain (milestone init)

> **GSD:** Execute phases **42 → 47** in order. Plans are written; **do not implement until user says execute.**

**Goal:** Admin-only global Filter brain that learns from grouped Approve/Deny and improves every future upload for all customers.

**Architecture:** File-backed global brain applied inside `processUpload`; admin review UI on `/bridge` results; type rules live immediately; phrase rules proposed then activated.

**Tech:** Node.js shell, vanilla HTML/CSS/JS, atomic JSON (same pattern as `bridge-list-store`), existing auth admin session.

---

## Why six phases (not one mega-PR)

| Reason | Detail |
|--------|--------|
| **Learning before chrome** | Brain apply (42) must work headless before UI |
| **Payload before UI** | Groups (43) stabilize API contract for 44–45 |
| **Safe writes** | Decisions (45) after read-path + UI reduces thrash |
| **Depth last** | Phrase mining (46) needs events from 45 |
| **Ship gates** | Can stop after 45 with a working type-level superpower; 46–47 deepen |
| **Rollback** | Each phase is independently testable |

## Phase dependency graph

```text
42 store+apply ──► 43 groups ──► 44 admin UX ──► 45 decisions
                      │                │              │
                      └────────────────┴──────────────► 46 phrase panel
                                                           │
                                              42–46 ──────► 47 harden
```

## File ownership (avoid thrash)

| Phase | Primary files |
|-------|----------------|
| 42 | `lib/bridge-brain-store.js` (new), `lib/bridge-brain-apply.js` (new), `lib/bridge-distress-tagger.js`, `lib/bridge-engine/index.js`, `lib/config.js`, tests |
| 43 | `lib/bridge-review-groups.js` (new), `lib/bridge-engine/index.js`, `lib/bridge-api.js`, tests |
| 44 | `public/bridge.html`, `public/js/bridge.js`, `public/css/bridge*.css` |
| 45 | `lib/bridge-brain-decisions.js` (new), `lib/bridge-api.js`, `public/js/bridge.js`, tests |
| 46 | `lib/bridge-phrase-miner.js` (new), brain panel HTML/JS/CSS, tests |
| 47 | undo/metrics, `docs/bridge/TAGGING-RULES.md`, edge-case tests, verify |

## Global verification (every phase)

```powershell
cd C:\Users\brand\Projects\distress-os
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Manual admin: http://127.0.0.1:3000/bridge — process sample, Train brain
```

## Done when (milestone)

All six phase plans checked complete; M7 status → `complete`; admin can train Filter and next upload proves learning.

## User gate

```text
DO NOT RUN execute-phase until user explicitly says to execute.
Planning complete = docs only.
```
