---
phase: 58
slug: learning-loop-strength
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 58 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Quick run** | `node --test tests/bridge-learning-metrics.test.js tests/bridge-brain-api.test.js tests/bridge-accuracy-gold.test.js` |
| **Full suite** | `npm test` |
| **Live gate** | `scripts/verify-live.ps1` if `public/` touched |

## Sampling Rate

- Per task: learning-metrics + related brain tests
- Per wave: focused pattern + gold
- Phase gate: `npm test` + verify-live after UI
- Max latency: ~90s focused / full suite as needed

## Per-Task Map

| Plan | Wave | Req | Automated | Status |
|------|------|-----|-----------|--------|
| 58-01 | 1 | LRN-01, LRN-02 | `node --test tests/bridge-learning-metrics.test.js` | ⬜ |
| 58-02 | 2 | LRN-01 | `node --test --test-name-pattern="LRN-01\|HARD:.*metrics" tests/bridge-brain-api.test.js` | ⬜ |
| 58-03 | 3 | LRN-01, LRN-02, LRN-03 | LRN pattern tests + gold + `npm test` + verify-live | ⬜ |

## Wave 0 (in-plan TDD)

- [ ] `tests/bridge-learning-metrics.test.js` RED then GREEN with pure helpers
- [ ] `lib/bridge-learning-metrics.js` — trend, gold P/R, apply coverage, pairedOk
- [ ] Extend GET brain metrics payload with `learning` nest
- [ ] Admin UI chips + last-process coverage

## Manual-Only

Optional: admin opens Filter brain panel and sees decision trend + gold health chips.

## Sign-Off

- [ ] Automated verify on all tasks
- [x] `nyquist_compliant: true` — every task has `<automated>` verify
- [x] Plans map LRN-01, LRN-02, LRN-03

**Approval:** plans ready for `/gsd:execute-phase 58`
