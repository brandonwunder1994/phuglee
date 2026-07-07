---
phase: 14
slug: results-data-views
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-30
---

# Phase 14 — Validation Strategy

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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | DATA-01, DATA-02 | grep | `Select-String -Path public/index.html -Pattern 'filterOverflowMenu'` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | DATA-04, QA-04 | grep | `Select-String -Path public/index.html -Pattern 'id="bulkSelectToggleBtn"'` | ✅ | ⬜ pending |
| 14-02-01 | 02 | 2 | DATA-01, DATA-02 | grep | `Select-String -Path public/css/app.css -Pattern 'filter-segmented'` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | DATA-03, DATA-05 | grep | `Select-String -Path public/css/app.css -Pattern 'card-body-calm'` | ✅ | ⬜ pending |
| 14-02-03 | 02 | 2 | DATA-04 | grep | `Select-String -Path public/css/app.css -Pattern 'bulk-edit-bar'` | ✅ | ⬜ pending |
| 14-03-01 | 03 | 2 | DATA-03 | grep | `Select-String -Path public/js/render.js -Pattern 'card-body-calm'` | ✅ | ⬜ pending |
| 14-03-02 | 03 | 2 | DATA-01 | grep | `Select-String -Path public/js/session.js -Pattern 'filterOverflowToggle'` | ✅ | ⬜ pending |
| 14-03-03 | 03 | 2 | QA-01, QA-02 | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Filter row at 1280px | DATA-01 | CSS layout | Resize to 1280×800; segment + More on one row |
| Search prominence | DATA-02 | Visual | Search row wider than sort label; clear focal point |
| 10k virtual scroll | QA-03 | Performance | Load large session; scroll cards grid — no gaps/flicker |
| Bulk edit flow | DATA-04 | Interaction | Edit → select cards → tier change → Done |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-30