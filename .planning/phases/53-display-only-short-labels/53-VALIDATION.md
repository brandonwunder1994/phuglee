---
phase: 53
slug: display-only-short-labels
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node --test` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-short-label.test.js tests/bridge-review-groups.test.js tests/bridge-train-ux.test.js` |
| **Full suite command** | `npm test` |
| **Live health (UI)** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` after `public/` edits |
| **Estimated runtime** | ~30–90s full suite |

---

## Sampling Rate

- **After every task commit:** quick run command above
- **After every plan wave:** `npm test`
- **Before `/gsd:verify-work`:** full suite + verify-live if UI touched
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-------------------|-------------------|-------------|--------|
| 53-01-01 | 01 | 0 | LBL-01 | unit | `node --test tests/bridge-short-label.test.js` | ❌ W0 | ⬜ pending |
| 53-01-02 | 01 | 0 | LBL-02/03 | unit | review-groups + train-ux extensions | ⚠️ partial | ⬜ pending |
| 53-02-01 | 02 | 1 | LBL-01 | unit | pure short-label green | ❌ W0 | ⬜ pending |
| 53-03-01 | 03 | 2 | LBL-01/02 | unit | groups emit shortLabel; keys full | ⚠️ | ⬜ pending |
| 53-04-01 | 04 | 3 | LBL-01/03 | unit+live | Train UI + DOM scrape kill + verify-live | ⚠️ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/bridge-short-label.test.js` — pure matrix
- [ ] Extend review-groups + train-ux for shortLabel + LBL-03 no DOM scrape
- [ ] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tooltip shows full wall of text | LBL-01 | Browser hover | Open Train with long type; title attribute shows full label |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity
- [ ] Wave 0 covers MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` after execution

**Approval:** pending
