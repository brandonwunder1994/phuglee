---
phase: 45
slug: decisions-type-rules
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-brain-decisions.test.js tests/bridge-brain-api.test.js` |
| **Full suite command** | `npm test` |
| **Live smoke** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~10–40 seconds quick; ~30–90s full suite + live |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command
- **After every plan wave:** Quick run (decisions + API tests); wave 3 also `verify-live.ps1`
- **Before `/gsd:verify-work`:** Full suite green + `scripts\verify-live.ps1` exit 0
- **Max feedback latency:** 60 seconds for unit/API; live smoke under 30s when server up

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | DEC-01–05 | unit RED | `node --test tests/bridge-brain-decisions.test.js` | ❌ W0 | ⬜ pending |
| 45-01-02 | 01 | 1 | DEC-01–05 | unit GREEN | `node --test tests/bridge-brain-decisions.test.js` | ❌ W0 | ⬜ pending |
| 45-02-01 | 02 | 2 | DEC-06 (+ wire 01–05) | API RED | `node --test tests/bridge-brain-api.test.js` | ❌ W0 | ⬜ pending |
| 45-02-02 | 02 | 2 | DEC-06 (+ wire 01–05) | API GREEN | `node --test tests/bridge-brain-api.test.js tests/bridge-brain-decisions.test.js` | ❌ W0 | ⬜ pending |
| 45-03-01 | 03 | 3 | DEC-01–06 client | regression | `node --test tests/bridge-brain-decisions.test.js tests/bridge-brain-api.test.js` | ✅ after 01–02 | ⬜ pending |
| 45-03-02 | 03 | 3 | Live + public/ | smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → Test Map

| Req ID | Behavior | Automated Command | Covered By |
|--------|----------|-------------------|------------|
| DEC-01 | Deny distressed removes rowIds from kept | `node --test tests/bridge-brain-decisions.test.js` | 45-01 |
| DEC-02 | Approve not_distressed promotes + STRONG tag | same | 45-01 |
| DEC-03 | Deny distressed → active suppress_type | same | 45-01 |
| DEC-04 | Approve not_distressed → active promote_type | same | 45-01 |
| DEC-05 | Audit event on every path (incl. affirmations) | same | 45-01 |
| DEC-06 | Non-admin POST → 403 ADMIN_REQUIRED | `node --test tests/bridge-brain-api.test.js` | 45-02 |
| Learning | suppress write → applyBrain demotes strong | decisions suite | 45-01 |
| Client | Train POST + lastResult re-render | API suite green + verify-live; grep acceptance | 45-03 |

---

## Wave 0 Requirements

- [ ] `tests/bridge-brain-decisions.test.js` — DEC-01–05 matrix + affirmations + learning proof (created in plan 01 Task 1 RED)
- [ ] `tests/bridge-brain-api.test.js` — DEC-06 403 + admin happy path + 400/413 (created in plan 02 Task 1 RED)
- [ ] Depends: phase 42 store/apply + phase 43 groups modules must exist before GREEN
- [ ] Framework install: none — `node:test` already project standard

*TDD plans create Wave 0 test files as Task 1 (RED) before implementation (GREEN). No separate Wave 0 plan file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin Train click updates kept table + KPIs in browser | DEC-01/02 UI | No Playwright E2E for train cards | Log in as admin; process sample CV; Approve/Deny a group; confirm table + train cards refresh |
| Next process respects new type rules | DEC-03/04 learning | Cross-session / re-upload | After deny suppress, re-process same city file; type should not stay strong |
| Non-admin cannot train via UI | DEC-06 UX | Client hide is phase 44 | Session as non-admin: train chrome hidden; curl without admin still 403 |

*Core matrix, persist, and 403 are automated; browser train loop is manual QA.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — commands point at real test paths created in RED tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 60s for unit/API
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (plan-check remediation — VALIDATION.md created)
