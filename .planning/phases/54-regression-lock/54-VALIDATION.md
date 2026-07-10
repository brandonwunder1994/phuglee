---
phase: 54
slug: regression-lock
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test --test-name-pattern="v1\\.8" tests/bridge-engine.test.js` |
| **Full suite command** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~30–90s suite + live |

---

## Sampling Rate

- **After every task commit:** v1.8 pattern engine tests + related COL/GATE/LBL units
- **After every plan wave:** `npm test`
- **Phase gate:** `npm test` green + `scripts/verify-live.ps1` exit 0
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-------------------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | TEST-01 | e2e process | engine TEST-01 (v1.8) | ⚠️ partial | ⬜ pending |
| 54-01-02 | 01 | 1 | TEST-02 | e2e process | engine TEST-02 FP change + reuse | ❌/✅ | ⬜ pending |
| 54-01-03 | 01 | 1 | TEST-03 | e2e process | engine shortLabel composition | ❌ | ⬜ pending |
| 54-02-01 | 02 | 2 | TEST-03 | suite+live | `npm test` + verify-live | ✅ scripts | ⬜ pending |

---

## Wave 0 Requirements

- [ ] TEST-01 (v1.8) suggestedHeader trap + process map tags
- [ ] TEST-02 (v1.8) fingerprint-change reconfirm (primary gap)
- [ ] TEST-03 (v1.8) processUpload shortLabel composition
- [ ] Do not rename/overwrite v1.7 TEST-01/02/03 semantics
- [ ] Framework install: none

---

## Manual-Only Verifications

*None required if automated suite + verify-live pass — optional browser smoke of confirm + short titles.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Sampling continuity
- [ ] Wave 0 gaps closed
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` after execution

**Approval:** pending
