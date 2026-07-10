---
phase: 57
slug: accuracy-structure-pass
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 57 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` + `node:assert/strict` |
| **Quick run** | `node --test tests/bridge-accuracy-gold.test.js tests/bridge-distress-tagger.test.js` |
| **Full suite** | `npm test` |
| **Baseline** | 482 pass (pre-phase) |
| **Live gate** | `scripts/verify-live.ps1` only if `public/` touched |

## Sampling Rate

- After task commit: gold (+ tagger if touched)
- After wave: `npm test`
- Max feedback latency: ~90s

## Per-Task Verification Map

| Task | Plan | Wave | Req | Automated Command | Status |
|------|------|------|-----|-------------------|--------|
| Gold fixtures + ACC-01/02 tests | 01 | 1 | ACC-01, ACC-02 | `node --test tests/bridge-accuracy-gold.test.js` | ⬜ |
| Fix reds in tagger/engine | 02 | 2 | ACC-01 | gold + tagger | ⬜ |
| Silent-drop + ACC-03 locks | 03 | 3 | ACC-02, ACC-03 | gold + engine pattern | ⬜ |

## Wave 0 Requirements

- [ ] `tests/fixtures/bridge/gold/*` — ACC keep/deny/water fixtures
- [ ] `tests/bridge-accuracy-gold.test.js` — ACC-01/02 processUpload contracts
- [ ] Optional ACC-03 wrapper titles or document existing COL/GATE/LBL/GROUP locks

## Manual-Only

None required if processUpload e2e covers gold (optional operator spot-check on real FOIA deferred).

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` after plans align

**Approval:** pending
