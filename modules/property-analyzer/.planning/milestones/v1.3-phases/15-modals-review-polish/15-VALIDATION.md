---
phase: 15
slug: modals-review-polish
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-30
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | `package.json` → `"test": "node --test tests/"` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run task grep verify commands
- **After plan 03:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 15-01-01 | 01 | 1 | MODAL-01 | grep | `Select-String -Path public/index.html -Pattern 'calm-dialog'` | ⬜ pending |
| 15-01-02 | 01 | 1 | MODAL-02, QA-04 | grep | `Select-String -Path public/index.html -Pattern 'inspector-calm'` | ⬜ pending |
| 15-01-03 | 01 | 1 | MODAL-03, MODAL-04 | grep | `Select-String -Path public/index.html -Pattern 'reviewKeepBtn'` | ⬜ pending |
| 15-02-01 | 02 | 2 | MODAL-01 | grep | `Select-String -Path public/css/app.css -Pattern '\.calm-dialog'` | ⬜ pending |
| 15-02-02 | 02 | 2 | MODAL-02, MODAL-04 | grep | `Select-String -Path public/css/app.css -Pattern 'inspector-calm'` | ⬜ pending |
| 15-02-03 | 02 | 2 | MODAL-03 | grep | `Select-String -Path public/css/app.css -Pattern 'review-action-bar'` | ⬜ pending |
| 15-03-01 | 03 | 2 | MODAL-02 | grep | `Select-String -Path public/js/render.js -Pattern 'inspector-calm'` | ⬜ pending |
| 15-03-02 | 03 | 2 | MODAL-03 | grep | `Select-String -Path public/js/imagery.js -Pattern 'reviewKeepBtn'` | ⬜ pending |
| 15-03-03 | 03 | 2 | QA-01, QA-02 | unit | `npm test` | ⬜ pending |

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Review keys 1–5 | MODAL-03 | Interaction | Enter review; press 1–5; confirm actions fire |
| Brain export/import | MODAL-01 | File I/O | Export JSON; import same file; rules list updates |
| Full smoke | Phase goal | E2E | upload → scan → review → save → restore |
| Inspector imagery-first | MODAL-02 | Visual | Open lead; imagery column dominates viewport |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-30