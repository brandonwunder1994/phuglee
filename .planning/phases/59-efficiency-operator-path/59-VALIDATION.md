---
phase: 59
slug: efficiency-operator-path
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 59 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Quick run** | `node --test tests/bridge-efficiency-path.test.js tests/bridge-list-factory-ux.test.js` |
| **Wave merge** | `node --test tests/bridge-efficiency-path.test.js tests/bridge-engine.test.js tests/bridge-accuracy-gold.test.js tests/bridge-independence.test.js tests/bridge-list-factory-ux.test.js tests/bridge-train-ux.test.js` |
| **Full suite** | `npm test` |
| **Live gate** | `scripts/verify-live.ps1` if `public/` touched |

## Sampling Rate

- Per task: efficiency-path (+ touched suite)
- Per wave: wave merge command above
- Phase gate: `npm test` + verify-live
- Max latency: ~90s targeted / full suite longer

## Per-Task Map

| Plan | Wave | Req | Automated | Status |
|------|------|-----|-----------|--------|
| 59-01 | 1 | EFF-01, EFF-02 | `node --test tests/bridge-efficiency-path.test.js` (as-built green; polish RED) | ⬜ |
| 59-02 | 2 | EFF-01 | efficiency-path + list-factory-ux green after reuse chip + post-save download | ⬜ |
| 59-03 | 3 | EFF-01, EFF-02 | train keyboard + gold + independence + GATE + `npm test` + verify-live | ⬜ |

## Wave 0

- [ ] `tests/bridge-efficiency-path.test.js` — day-2 path locks (auto_reuse, download-all, Format reused RED, Download this list RED)
- [ ] EFF-02 anti-patterns GREEN (no push, no auto-save, GATE-02, Train chrome, gold file present)
- [ ] Optional keyboard contracts when 59-03 ships

## Sign-Off

- [ ] All tasks automated
- [ ] No accuracy/independence regression
- [ ] verify-live green after public/ edits

**Approval:** pending planner → execute
