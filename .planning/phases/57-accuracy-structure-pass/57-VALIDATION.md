---
phase: 57
slug: accuracy-structure-pass
status: ready
nyquist_compliant: true
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
| Gold fixtures (5 shapes) | 01 | 1 | ACC-01, ACC-02 | fixture existence node -e gate | ⬜ |
| ACC-01/02 processUpload gold suite | 01 | 1 | ACC-01, ACC-02 | `node --test tests/bridge-accuracy-gold.test.js` | ⬜ |
| Fix reds in tagger/engine only | 02 | 2 | ACC-01 | `node --test --test-name-pattern="ACC-01" tests/bridge-accuracy-gold.test.js` | ⬜ |
| Full gold green after fixes | 02 | 2 | ACC-01 | `node --test tests/bridge-accuracy-gold.test.js` | ⬜ |
| ACC-02 silent-drop bans + FN inventory | 03 | 3 | ACC-02 | `node --test --test-name-pattern="ACC-02" tests/bridge-accuracy-gold.test.js` | ⬜ |
| ACC-03 regression + full suite | 03 | 3 | ACC-03 | gold + engine COL/GATE/… pattern + `npm test` | ⬜ |

## Wave 0 Requirements

- [ ] `tests/fixtures/bridge/gold/*` — ACC keep/deny/type-trap/no-type/water fixtures
- [ ] `tests/bridge-accuracy-gold.test.js` — ACC-01/02 processUpload contracts
- [ ] Optional ACC-03 wrapper titles or document existing COL/GATE/LBL/GROUP locks

## Manual-Only

None required if processUpload e2e covers gold (optional operator spot-check on real FOIA deferred).

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` after plans align

**Approval:** plans ready for execute-phase
