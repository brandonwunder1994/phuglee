---
phase: 59
slug: efficiency-operator-path
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 59 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Quick run** | `node --test tests/bridge-efficiency-path.test.js tests/bridge-accuracy-gold.test.js tests/bridge-independence.test.js` |
| **Full suite** | `npm test` |
| **Live gate** | `scripts/verify-live.ps1` if `public/` touched |

## Sampling Rate

- Per task: efficiency + independence + gold patterns
- Per wave: `npm test`
- Max latency: ~90s

## Per-Task Map

| Plan | Wave | Req | Automated | Status |
|------|------|-----|-----------|--------|
| 59-01 | 1 | EFF-01, EFF-02 | efficiency path static + GATE auto_reuse | ⬜ |
| 59-02 | 2 | EFF-01 | bridge.js polish (reuse chip, download after save) | ⬜ |
| 59-03 | 3 | EFF-02 | gold + independence + suite + live | ⬜ |

## Wave 0

- [ ] `tests/bridge-efficiency-path.test.js` — day-2 path locks (auto_reuse, download-all, no push, gold keep-green)
- [ ] Optional keyboard Train contracts if shipped

## Sign-Off

- [ ] All tasks automated
- [ ] No accuracy/independence regression

**Approval:** pending
