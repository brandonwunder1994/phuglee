# M1 — Core Bones: Reliability & Classification Foundation

> **Status:** `complete`  
> **Completed:** 2026-06-30
> **Created:** 2026-06-30  
> **Scope:** Functionality, operations, reliability, maintainability, scalability, core user value — **not** visuals or styling.  
> **Project:** `property-distress-analyzer` (~10,400 results, session schema v6)

---

## Goal

Harden the bones of Property Distress Analyzer so classification logic is testable, canonical data survives crashes, saves are honest, tier counts are trustworthy, and learned corrections persist with the session.

---

## Execution order

Items are ranked by impact. Recommended build sequence accounts for dependencies and quick wins:

| Order | ID | Item | Depends on | Plan |
|-------|----|------|------------|------|
| 1 | M1-02 | Atomic Canonical File Writes | — | `.planning/phases/06-atomic-canonical-writes/06-01-PLAN.md` |
| 2 | M1-01 | Tier Logic Test Harness | — | `.planning/phases/07-tier-logic-test-harness/07-01-PLAN.md`, `07-02-PLAN.md` |
| 3 | M1-03 | Unified Persistence + Honest Save Status | M1-02 (recommended) | `.planning/phases/08-unified-persistence-honest-save-status/08-01-PLAN.md`, `08-02-PLAN.md` |
| 4 | M1-04 | Single Source of Truth for Tier Classification | M1-01 | `.planning/phases/09-single-tier-source-of-truth/09-01-PLAN.md`, `09-02-PLAN.md` |
| 5 | M1-05 | Persist Learned Brain in Server Session | M1-03 | `.planning/phases/10-persist-learned-brain-in-session/10-01-PLAN.md`, `10-02-PLAN.md` |

---

## Items

### M1-01 — Tier Logic Test Harness + Extracted Pure Functions

**Status:** `done`
**Priority:** P0 — highest long-term leverage  
**Plan:** `.planning/phases/07-tier-logic-test-harness/07-01-PLAN.md`, `07-02-PLAN.md` (GSD Phase 7)

**Why we need it:** `computeLeadTier`, JSON salvage, incremental merge, and downgrade guards are the core product logic but have zero automated tests. The client tier engine (`public/js/review.js`) is far more sophisticated than the server's score-only `resultLeadTierServer` (`lib/backups.js`).

**What it will fix:** Removes the "change a rule and hope 10,000 leads still classify correctly" workflow. Makes tier rules, backup merge, and Gemini JSON repair testable in isolation.

**Benefits right now:** Safe iteration on classification accuracy and backup behavior. Biggest unlock for velocity on correct distress scoring.

**Key files:**
- `public/js/review.js` — `computeLeadTier`, `reconcileLeadTier`, `resultLeadTier`
- `public/js/scan.js` — tier rules, corrections
- `public/js/app.js` — `parseLooseJson`, salvage/repair
- `lib/backups.js` — merge, promote, downgrade helpers

**Success criteria:**
- [x] Test runner added to `package.json` (e.g. Vitest or Node test runner)
- [x] `computeLeadTier` extracted to shared testable module with ≥20 fixture cases
- [x] `mergeIncrementalIntoSession` / `shouldReplaceSessionResult` covered by tests
- [x] `parseLooseJson` / salvage pipeline covered by tests
- [x] `npm test` passes locally

---

### M1-02 — Atomic Writes for All Canonical Files

**Status:** `done`  
**Priority:** P0 — fastest reliability win  
**Plan:** `.planning/phases/06-atomic-canonical-writes/06-01-PLAN.md` (GSD Phase 6)

**Why we need it:** `distressAnalyzerSession_LATEST.json`, `property_imagery/index.json`, and backup snapshots use direct `fs.writeFileSync()` with no write-to-temp-then-rename. A crash mid-write can corrupt the canonical file every safety layer depends on.

**What it will fix:** Closes the gap between excellent backup tiers (JSONL incremental, milestones, mirror, offsite) and still risking truncated JSON on the final write.

**Benefits right now:** Scan and review sessions survive hard kills without manual recovery from `scan_results/*.jsonl`.

**Key files:**
- `lib/fs-atomic.js` — new shared helper (create)
- `routes/session.js:190` — session LATEST write
- `lib/backups.js:384,423` — backup + promote writes
- `imagery-cache.js:79` — index.json write
- `lib/safety.js` — MIRROR_LATEST write

**Success criteria:**
- [x] Shared `writeFileAtomic(targetPath, content)` helper with temp+rename
- [x] All canonical JSON writes use atomic helper
- [x] Manual kill-test: interrupt mid-save, LATEST still parses or prior file intact
- [x] No behavior change to backup tier logic

---

### M1-03 — Unified Persistence + Honest Save Status

**Status:** `done`  
**Priority:** P1  
**Plan:** `.planning/phases/08-unified-persistence-honest-save-status/08-01-PLAN.md`, `08-02-PLAN.md` (GSD Phase 8)

**Why we need it:** Two independent save mutexes (`persistence.js` and `state.js`) race during scans, heartbeats, and review edits. When the server rejects a downgrade save (HTTP 409), `performLocalPersist` only `console.warn`s and still clears dirty state — UI can show "Saved just now" while server kept older data.

**What it will fix:** Single save orchestration path, one in-flight lock, and visible errors for 409 rejections, network failures, and partial writes.

**Benefits right now:** Users stop losing review corrections due to false "saved" signals. Fewer mysterious data regressions.

**Key files:**
- `public/js/state.js` — `performLocalPersist`, `flushSaveSession`, `pushServerBackup`
- `persistence.js` — `saveInFlight`, `scheduleSave`
- `routes/session.js` — 409 downgrade response
- `public/index.html` — `commandSaveStatus` element

**Success criteria:**
- [x] One save entry point; duplicate mutexes removed or delegated
- [x] HTTP 409 `rejected: true` surfaces as UI error, not "Saved just now"
- [x] `lastSessionSaveError` set correctly on all failure modes
- [x] Scan heartbeat + review save + manual save do not race into conflicting POSTs
- [x] Manual test: trigger downgrade block → UI shows failure state

---

### M1-04 — Single Source of Truth for Tier Classification

**Status:** `done`  
**Priority:** P1  
**Plan:** `.planning/phases/09-single-tier-source-of-truth/09-01-PLAN.md`, `09-02-PLAN.md` (GSD Phase 9)

**Why we need it:** Client classification uses indicators, satellite context, learned rules, and demotion logic. Server summaries use naive score thresholds (`resultLeadTierServer`). Tier counts in `/api/session-summary`, progress tracking, and downgrade guards can disagree with the UI.

**What it will fix:** Drift between dashboard counts, export filters, and per-property tiers.

**Benefits right now:** Filter counts, review queues, and session progress become trustworthy. Classification changes apply consistently everywhere.

**Key files:**
- `lib/backups.js:244-266` — `resultLeadTierServer`, `computeTierCounts`
- `public/js/review.js:220-310` — full tier engine
- `routes/session.js` — session summary endpoint
- Shared module from M1-01 (if extracted)

**Success criteria:**
- [x] Server tier counts use same logic as client (shared module or trust persisted `leadTier`)
- [x] `/api/session-summary` tier counts match UI `getTierCounts()` on same dataset
- [x] Tests from M1-01 cover server+client parity cases
- [x] No regression in downgrade guard behavior

---

### M1-05 — Persist Learned Brain in Server Session Schema

**Status:** `done`  
**Priority:** P2  
**Plan:** GSD Phase 10 (executed 2026-06-30)

**Why we need it:** Correction events, affirmation events, and learned tier rules live only in `localStorage` and are excluded from `buildSessionPayload()` / server backups. Browser reset wipes accumulated training signal.

**What it will fix:** Moves `correctionEvents`, `learnedRules`, and tier/category corrections into session backup schema so they restore with scan results.

**Benefits right now:** Review corrections compound over time. Re-analysis rules survive the same backup/offsite pipeline as property data.

**Key files:**
- `public/js/config.js:403-412` — localStorage keys
- `public/js/imagery.js` — `saveLearnedBrain`, `loadLearnedBrain`
- `public/js/state.js:350-377` — `buildSessionPayload`
- `public/js/scan.js` — `captureCorrectionEvent`, `captureAffirmationEvent`
- Session schema version bump (v5 → v6)

**Success criteria:**
- [x] `buildSessionPayload` includes learned brain fields
- [x] Server session backup persists and restores learned brain
- [x] Schema migration v5→v6 loads brain from localStorage on first open, then server-authoritative
- [x] Clearing browser storage + reload restores brain from server session
- [x] `correctionEvents` cap (200) and `learnedRules` cap (120) preserved

---

## Milestone completion

M1 is **done** when all five items are `done` and:

- [x] `npm test` exists and passes (66 tests, 2026-06-30)
- [x] Canonical writes are atomic
- [x] Save status reflects server reality
- [x] Server and client tier counts agree on a 100-record sample (automated parity tests)
- [x] Learned brain round-trips through server backup

---

## Progress log

| Date | Item | Event |
|------|------|-------|
| 2026-06-30 | M1 | Milestone created from GSD codebase audit |
| 2026-06-30 | M1-02 | Phase 6 plan written (06-01-PLAN.md) |
| 2026-06-30 | M1-02 | Phase 6 executed — atomic writes shipped (a1f2292) |
| 2026-06-30 | M1-01 | Phase 7 planned (07-01, 07-02) |
| 2026-06-30 | M1-01 | Phase 7 executed — test harness shipped |
| 2026-06-30 | M1-03 | Phase 8 executed — unified persistence + honest save status shipped |
| 2026-06-30 | M1-04 | Phase 9 executed — single tier source of truth shipped |
| 2026-06-30 | M1-05 | Phase 10 executed — learned brain persisted in server session (schema v6) |
| 2026-06-30 | M1 | Milestone marked complete |
| 2026-06-30 | — | Post-phase fix: save-fail loop + emergency backup spam (e450356) |

---

## Next step

**M1 closed.** Define M2 (`/gsd:new-milestone`) for the next batch of work — features, UX, classification accuracy, or ops improvements outside core-bones scope.