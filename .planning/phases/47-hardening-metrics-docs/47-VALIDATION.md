---
phase: 47
slug: hardening-metrics-docs
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-brain-hardening.test.js tests/bridge-brain-api.test.js` |
| **Full suite command** | `npm test` |
| **Live smoke** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~20–60 seconds full suite + live smoke |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work` / milestone close:** `npm test` + `scripts/verify-live.ps1` both exit 0
- **Max feedback latency:** 60 seconds (unit); full suite + live may approach 60–90s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | HARD-01, HARD-02, HARD-03 | unit + API | `node --test tests/bridge-brain-hardening.test.js tests/bridge-brain-api.test.js` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | HARD-01, HARD-03 | live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` | ✅ script | ⬜ pending |
| 47-01-03 | 01 | 1 | HARD-04 | suite + live + docs | `npm test; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` | ✅ infra | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-brain-hardening.test.js` — caps (events 2000, rules 500), version 409, undoLastDecision, recomputeMetrics; optional static assert on TAGGING-RULES
- [ ] Extend `tests/bridge-brain-api.test.js` — POST `/brain/undo`, GET `/brain/metrics`, 403/409
- [ ] Temp `BRIDGE_BRAIN_ROOT` isolation (TESTING.md pattern)
- [ ] Framework install: none

*Task 1 creates hardening tests (TDD RED→GREEN) before API/store implementation completes.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Client trainUndoStack restores list after Undo | HARD-01 | UI state restore | Admin train: approve/deny group → Undo restores prior rows/groups; server rule disabled |
| Train search + pagination polish | HARD-01 polish | UX | Search filter groups; page size 40; Deny confirm when count ≥ 10 |
| Metrics strip visible in brain panel | HARD-03 | UI | Admin Filter brain shows totalDecisions + active/proposed counts |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: 3 tasks all have `<automated>` (3/3)
- [x] Wave 0 covers hardening + API gaps
- [x] No watch-mode flags
- [x] Unit feedback latency < 60s; phase gate uses full suite intentionally
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (plan-check remediation — VALIDATION.md created)
