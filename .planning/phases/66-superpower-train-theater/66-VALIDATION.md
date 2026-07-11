---
phase: 66
slug: superpower-train-theater
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 66 — Validation Strategy

> Per-phase validation for Superpower Train Theater (THTR-01–03). Presentation pivot only — decision APIs and admin gate as-built.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` + `node:assert/strict` |
| **Config** | `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run** | `node --test tests/bridge-train-theater.test.js tests/bridge-train-ux.test.js` |
| **Wave merge** | `node --test tests/bridge-train-theater.test.js tests/bridge-train-ux.test.js tests/bridge-efficiency-path.test.js tests/bridge-list-factory-ux.test.js tests/bridge-independence.test.js` |
| **Full suite** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (required after any `public/` edit) |
| **Estimated runtime** | ~30–90s targeted; full suite longer |

---

## Sampling Rate

- **After every task:** quick run (theater + train-ux)
- **After every plan wave:** wave merge command
- **Phase gate (66-03):** `npm test` + `verify-live.ps1` exit 0
- **Max feedback latency:** ~90s targeted

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 66-01-T1 | 01 | 1 | THTR-01 | static unit | `node --test tests/bridge-train-theater.test.js` | ❌ Wave 0 | ⬜ |
| 66-01-T2 | 01 | 1 | THTR-01 | static + pure helper | theater + train-ux | ❌→✅ | ⬜ |
| 66-01-T3 | 01 | 1 | THTR-01 | regression | theater + train-ux | ⚠️ | ⬜ |
| 66-02-T1 | 02 | 2 | THTR-01 | static decision path | theater | ✅ after 01 | ⬜ |
| 66-02-T2 | 02 | 2 | THTR-01 | CSS + chrome | theater + train-ux | ✅ | ⬜ |
| 66-03-T1 | 03 | 3 | THTR-02, THTR-03 | static armory + admin | theater + train-ux | ✅ | ⬜ |
| 66-03-T2 | 03 | 3 | THTR-01–03 | suite + live | `npm test` + verify-live | ✅ | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-train-theater.test.js` created (66-01 Task 1)
  - THTR-01: `countOpenTrainGroups` pure unit + export
  - THTR-01: `forceTrainTheater` / process→train pivot static
  - THTR-01: `#bridge-train-mission` + open-count ids
  - THTR-01: live `updateTrainMissionHeader` on decision path (greens with 66-02)
  - THTR-02: `Rules armory` demotion (greens with 66-03)
  - THTR-03: wrap `hidden`; mission inside wrap; non-admin hide path
- [ ] Existing `tests/bridge-train-ux.test.js` stays green (migrate labels if Train/Brain copy changes)
- [ ] No new packages; no watch-mode flags

---

## Requirement → Proof

| ID | Observable truth | Automated proof |
|----|------------------|-----------------|
| **THTR-01** | Admin + open groups after process → Train theater; mission open count; live kept on decision | theater tests: pivot flag + mission ids + decision `updateTrainMissionHeader` + status `Decision saved · .* kept` |
| **THTR-02** | Brain secondary armory | HTML `Rules armory` + CSS demotion; `loadBrainPanel` still present; not equal peer `Filter brain` tab |
| **THTR-03** | Non-admin never sees train/brain | wrap default `hidden`; renderResults non-admin `setHidden(true)`; isBridgeAdmin units; mission inside wrap |

---

## Hard Boundaries (fail phase if violated)

| Boundary | Check |
|----------|--------|
| No decision API rewrite | No contract change on `POST /api/bridge/brain/decisions` / `clientApplied` |
| No processUpload keep/kill rewrite | Engine untouched for theater |
| No data wipe | Never delete `data/filter-lists/` or `data/bridge-brain/` |
| Stable ids | `bridge-train-wrap`, `bridge-mode-kept`, `bridge-mode-train`, `bridge-mode-brain`, `bridge-train-panel`, `bridge-brain-panel` remain unless tests migrate with them |
| Vanilla stack | No React / new npm deps |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Process as admin with mixed types → lands in Train cards | THTR-01 | Needs real process + session | Log in as `admin`; process code-violations fixture; confirm mission open count & train panel visible by default |
| Approve/Deny updates mission kept + KPI | THTR-01 | Browser mutation | Decide one group; watch mission kept + KPI tile + status line |
| Rules armory opens brain panel | THTR-02 | Browser click | Click Rules armory; type/phrase rules load |
| Non-admin process never shows train wrap | THTR-03 | Second session | Log in as non-admin; process; no train/brain/mission chrome |
| Reduced motion | QA-03 later | OS setting | Optional: enable prefers-reduced-motion; theater still comprehensible without motion |

---

## Design / a11y notes

- Tab roles retained if tablist remains (QA-03 / Phase 68 formal)
- Mission header not motion-required
- Primary decision CTAs remain existing Approve/Deny (≥44px expected from prior train shell)
- Save list stays reachable in train mode (KILL-03 / factory path)

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity OK (task → wave → phase)
- [ ] Wave 0 theater file covers THTR-01–03 contracts
- [ ] No watch-mode flags
- [ ] Feedback latency &lt; 90s targeted
- [ ] `nyquist_compliant: true` after plans align
- [ ] `npm test` green at 66-03
- [ ] `verify-live.ps1` exit 0 after public/ work

**Approval:** pending planner → execute
---

*Phase: 66-superpower-train-theater*  
*Validation written: 2026-07-10*
