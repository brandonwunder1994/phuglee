---
phase: 51
slug: col-scoring-map-wire
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node --test` |
| **Config file** | none — `package.json` script `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-type-column-score.test.js tests/bridge-category-promote.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/bridge-type-column-score.test.js tests/bridge-category-promote.test.js`
- **After every plan wave:** Run `npm test` (Plan 03 final gate mandatory)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-------------------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | COL-01/02/04 | unit (RED) | `node --test tests/bridge-type-column-score.test.js` | ❌ W0 | ⬜ pending |
| 51-01-02 | 01 | 1 | COL-01/02/04 | integration (RED) | `node --test tests/bridge-engine.test.js` | ❌ W0 | ⬜ pending |
| 51-02-01 | 02 | 2 | COL-01/02/04 | unit (GREEN) | `node --test tests/bridge-type-column-score.test.js` | ❌ W0 | ⬜ pending |
| 51-02-02 | 02 | 2 | COL-03 safe | unit | `node --test tests/bridge-type-column-score.test.js tests/bridge-category-promote.test.js` | partial | ⬜ pending |
| 51-03-01 | 03 | 3 | COL-01–04 | integration | `node --test tests/bridge-engine.test.js tests/bridge-type-column-score.test.js tests/bridge-category-promote.test.js` | ❌ W0 | ⬜ pending |
| 51-03-02 | 03 | 3 | COL-01–04 | full suite | `npm test` | ✅ runner | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-type-column-score.test.js` — COL-01/02/04 pure trap matrix (Plan 01)
- [ ] Engine wire tests in `tests/bridge-engine.test.js` — process `columnMap` + row Type on trap fixtures (Plan 01)
- [ ] Framework install: none — already `node --test`

*Existing infrastructure covers runner; new fixtures required for COL traps.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | All phase behaviors have automated verification | — |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 01 creates both test files)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — execute to close Wave 0 checkboxes
