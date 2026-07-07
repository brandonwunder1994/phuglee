---
phase: 13
slug: workflow-surfaces
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-30
---

# Phase 13 — Validation Strategy

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
- **After plan 03 (JS wave):** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | FLOW-01, QA-04 | grep | `Select-String -Path public/index.html -Pattern 'Upload spreadsheet'` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | FLOW-02, FLOW-05, QA-04 | grep | `Select-String -Path public/index.html -Pattern 'scanLogToggle'` | ✅ | ⬜ pending |
| 13-01-03 | 01 | 1 | FLOW-03, QA-04 | grep | `Select-String -Path public/index.html -Pattern 'summaryBreakdownToggle'` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | FLOW-01 | grep | `Select-String -Path public/css/app.css -Pattern 'empty-workspace'` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | FLOW-02 | grep | `Select-String -Path public/css/app.css -Pattern 'scan-progress-slim'` | ✅ | ⬜ pending |
| 13-02-03 | 02 | 2 | FLOW-03, FLOW-04 | grep | `Select-String -Path public/css/app.css -Pattern 'summary-hero-row'` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 2 | FLOW-02, FLOW-05 | grep | `Select-String -Path public/js/app.js -Pattern 'setAgentPanelCollapsed\(true\)'` | ✅ | ⬜ pending |
| 13-03-02 | 03 | 2 | FLOW-04 | grep | `Select-String -Path public/js/review.js -Pattern 'pushLiveTierAlert'` | ✅ | ⬜ pending |
| 13-03-03 | 03 | 2 | FLOW-03, QA-01, QA-02 | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements — 78-test suite + grep ID checks

*No new test files required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Empty state calm card | FLOW-01 | Visual layout | Load app with no file; confirm 2 buttons, no dashed copper border |
| Slim scan bar height | FLOW-02 | Visual | Start scan; confirm no Active Scan tag; bar ~120px with log collapsed |
| Tier toast bottom-right | FLOW-04 | Interaction | During scan, verify single toast auto-dismisses in ~4s |
| Breakdown persistence | FLOW-03 | Interaction | Expand breakdown; refresh; confirm sessionStorage restores state |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-30