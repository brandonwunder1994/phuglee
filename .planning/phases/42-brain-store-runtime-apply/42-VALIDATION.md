---
phase: 42
slug: brain-store-runtime-apply
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-brain-store.test.js tests/bridge-brain-apply.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15–40 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run quick run command for touched test files
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + `scripts/verify-live.ps1`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | BRAIN-01 | unit RED | `node --test tests/bridge-brain-store.test.js` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 1 | BRAIN-01 | unit GREEN | `node --test tests/bridge-brain-store.test.js` | ❌ W0 | ⬜ pending |
| 42-02-01 | 02 | 2 | BRAIN-02,03 | unit RED | `node --test tests/bridge-brain-apply.test.js` | ❌ W0 | ⬜ pending |
| 42-02-02 | 02 | 2 | BRAIN-02,03 | unit GREEN | `node --test tests/bridge-brain-apply.test.js` | ❌ W0 | ⬜ pending |
| 42-02-03 | 02 | 2 | BRAIN-02,03 | integration | `node --test tests/bridge-engine.test.js` | ⚠️ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-brain-store.test.js` — stubs/tests for BRAIN-01
- [ ] `tests/bridge-brain-apply.test.js` — stubs/tests for BRAIN-02/03
- [ ] Engine integration cases in `tests/bridge-engine.test.js` — suppress, promote, **water + seeded suppress**

*Existing infrastructure: node:test already used across `tests/`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live process with real UI still works after wire | BRAIN-02 | Full upload UX | After phase: `verify-live.ps1`; process sample file on /bridge |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (plan-check remediation)
