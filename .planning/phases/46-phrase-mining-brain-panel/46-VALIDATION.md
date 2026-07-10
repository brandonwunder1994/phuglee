---
phase: 46
slug: phrase-mining-brain-panel
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-phrase-miner.test.js tests/bridge-brain-api.test.js` |
| **Full suite command** | `npm test` |
| **Live smoke** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~15–45 seconds full suite + live smoke |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green + `scripts/verify-live.ps1` exit 0
- **Max feedback latency:** 60 seconds (unit); live smoke may add ~10–20s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | PHRASE-01, PHRASE-02 | unit RED | `node --test tests/bridge-phrase-miner.test.js` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | PHRASE-01, PHRASE-02 | unit GREEN + hook | `node --test tests/bridge-phrase-miner.test.js` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 2 | PHRASE-03 | unit/API | `node --test tests/bridge-brain-api.test.js` | ❌ W0 (extend) | ⬜ pending |
| 46-02-02 | 02 | 2 | PHRASE-03 | API + live smoke | `node --test tests/bridge-brain-api.test.js; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` | ⚠️ extend + script ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-phrase-miner.test.js` — PHRASE-01/02: ≥2 threshold, never-active, skip matrix, proposed no-op apply, active apply, escapeRegExp
- [ ] Extend `tests/bridge-brain-api.test.js` — GET `/api/bridge/brain`, POST `/brain/rules/:id/status`, 403/400/404
- [ ] Optional extend apply coverage if miner suite does not already prove proposed vs active
- [ ] Framework install: none — existing `node:test`

*TDD plans create Wave 0 test files in Task 1 (RED) before GREEN implementation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin panel lists + Activate/Reject/Disable UX | PHRASE-03 | DOM interaction | As admin on `/bridge`: open Filter brain, activate a proposed phrase, re-process sample file; non-admin must not see panel entry |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (via TDD RED tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 60s for unit commands
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (plan-check remediation — VALIDATION.md created)
