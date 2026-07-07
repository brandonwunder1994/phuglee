---
phase: 12
slug: shell-simplification
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-30
---

# Phase 12 — Validation Strategy

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

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` + ID preservation grep checklist
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SHELL-01, SHELL-05 | grep | `Select-String -Path public/index.html -Pattern 'hud-bar'` | ✅ | ⬜ pending |
| 12-01-02 | 01 | 1 | SHELL-02, SHELL-04 | grep | `Select-String -Path public/index.html -Pattern 'sidebarOverflowMenu'` | ✅ | ⬜ pending |
| 12-01-03 | 01 | 1 | SHELL-03, QA-04 | grep | `Select-String -Path public/index.html -Pattern 'id="hudStatus"'` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | SHELL-01–03 | grep | `Select-String -Path public/css/app.css -Pattern 'top: 0'` | ✅ | ⬜ pending |
| 12-02-02 | 02 | 2 | SHELL-02, SHELL-05 | grep | `Select-String -Path public/css/app.css -Pattern 'border-left: 3px solid var\(--accent\)'` | ✅ | ⬜ pending |
| 12-03-01 | 03 | 2 | SHELL-04 | grep | `Select-String -Path public/js/app.js -Pattern 'Save backup now'` | ✅ | ⬜ pending |
| 12-03-02 | 03 | 2 | SHELL-04, QA-02 | unit | `npm test` | ✅ | ⬜ pending |
| 12-03-03 | 03 | 2 | QA-01 | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements — 78-test suite + grep ID checks

*No new test files required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Command bar single row at 1280px | SHELL-03 | CSS layout needs viewport | Resize to 1280×800; confirm title/file/save/status + Start/Stop on one row |
| Overflow menu sections | SHELL-02, SHELL-04 | Interaction | Click More → Settings, Data, Export sections visible; admin buttons work |
| ⌘K backup commands | SHELL-04 | Interaction | ⌘K → search "backup" → run Save/Load/Download commands |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-30