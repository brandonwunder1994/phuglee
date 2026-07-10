---
phase: 58
slug: learning-loop-strength
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 58 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Quick run** | `node --test tests/bridge-learning-metrics.test.js tests/bridge-accuracy-gold.test.js` |
| **Full suite** | `npm test` |
| **Live gate** | `scripts/verify-live.ps1` if `public/` touched |

## Sampling Rate

- Per task: learning-metrics + related brain tests
- Per wave: `npm test`
- Max latency: ~90s

## Per-Task Map

| Plan | Wave | Req | Automated | Status |
|------|------|-----|-----------|--------|
| 58-01 | 1 | LRN-01, LRN-02 | `bridge-learning-metrics.test.js` | ⬜ |
| 58-02 | 2 | LRN-01 | API/brain metrics + optional gold P/R | ⬜ |
| 58-03 | 3 | LRN-02, LRN-03 | anti-game + phrase proposed-only + gold + suite | ⬜ |

## Wave 0

- [ ] `lib/bridge-learning-metrics.js` pure helpers
- [ ] `tests/bridge-learning-metrics.test.js`
- [ ] Extend GET brain metrics payload with `learning` nest
- [ ] Admin UI chips (if UI plan)

## Manual-Only

Optional: admin opens Filter brain panel and sees decision trend + gold health chips.

## Sign-Off

- [ ] Automated verify on all tasks
- [ ] `nyquist_compliant: true` after plans align

**Approval:** pending
