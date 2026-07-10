---
phase: 60
slug: regression-qa-lock
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for v2.0 milestone regression bar (TEST-01..03).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js` |
| **Wave merge / e2e pack** | `node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js tests/bridge-engine.test.js` |
| **Full suite command** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~6–15s targeted; full suite longer; live ~few seconds |

---

## Sampling Rate

- **After every task commit:** Quick bar — independence + gold (+ engine if titles/e2e touched)
- **After every plan wave:** `npm test`
- **Before `/gsd:verify-work`:** Full suite green + `scripts/verify-live.ps1` exit 0
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 60-01-* | 01 | 1 | TEST-01 | static/unit/e2e | `node --test tests/bridge-independence.test.js` (+ IND-04 engine or independence) | ✅ | ⬜ pending |
| 60-01-* | 01 | 1 | TEST-02 | e2e process | `node --test tests/bridge-accuracy-gold.test.js` | ✅ | ⬜ pending |
| 60-01-* | 01 | 1 | TEST-03 (partial) | docs map | `docs/bridge/TEST-PLAN.md` v2.0 bar section | ⚠️ gap | ⬜ pending |
| 60-02-* | 02 | 2 | TEST-01..03 | suite + live | `npm test` + `scripts\verify-live.ps1` | ✅ | ⬜ pending |
| 60-02-* | 02 | 2 | TEST-03 | processUpload e2e | engine COL/GATE/water + gold water patterns | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Phase Requirements → Test Map

| Req ID | Behavior | Automated Command | File Exists |
|--------|----------|-------------------|-------------|
| TEST-01 | No Analyze push on Filter write paths | independence IND-01/02/03 | ✅ |
| TEST-01 | `already_imported` hard-drop off by default | engine IND-04 (optional independence dual) | ✅ |
| TEST-02 | Gold ACC fixtures in CI | `tests/bridge-accuracy-gold.test.js` via `npm test` | ✅ |
| TEST-03 | processUpload Type/format/water e2e | engine COL/GATE/water + gold water | ✅ |
| TEST-03 | Live health + homepage | `scripts/verify-live.ps1` | ✅ script |

---

## Wave 0 Requirements

- [ ] Optional: `TEST-01 (v2.0)` titled markers / IND-04 packaging in independence suite (planner Option A)
- [ ] Recommended: `docs/bridge/TEST-PLAN.md` permanent v2.0 bar section (TEST-01/02/03 → files)
- [ ] Framework install: **none**
- [ ] Missing product e2e for Type/format/water: **None** — already covered
- [ ] Missing gold / independence suites: **None** — already in `npm test`

*If packaging is docs-only: Wave 0 code gaps = none — execute packaging + suite/live immediately.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator multi-city day-2 feel after v2.0 | (optional UX) | Not TEST-01..03 | Optional: process known format → save → download — not required for phase gate |

*Primary bar is fully automated. Optional human smoke only for confidence, not gate.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify (suite + live for ship plan)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers packaging gaps only (no missing product e2e)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s targeted
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending planner → execute
