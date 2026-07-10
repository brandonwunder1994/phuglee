---
phase: 55
slug: independence-lock
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-independence.test.js tests/bridge-import-filter.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds full suite; ~5s quick |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (if `public/` touched) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/bridge-independence.test.js tests/bridge-import-filter.test.js` (+ engine IND-04 pattern if engine touched)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 55-01-* | 01 | 1 | IND-04 | processUpload e2e | `node --test --test-name-pattern="IND-04|already_imported" tests/bridge-engine.test.js` | ❌ invert existing | ⬜ pending |
| 55-02-* | 02 | 2 | IND-01–03 | unit/integration | `node --test tests/bridge-independence.test.js` | ❌ Wave 0 | ⬜ pending |
| 55-03-* | 03 | 3 | IND docs | suite + optional live | `npm test` (+ verify-live if public/) | ⚠️ docs | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-independence.test.js` — static bans + module absence + save/process negative side-effect contracts (IND-01, IND-02, IND-03)
- [ ] Invert / replace `processUpload filters rows already in Property Analyzer` in `tests/bridge-engine.test.js` for IND-04 default-off
- [ ] Optional opt-in `applyAlreadyImportedFilter: true` still hard-drops
- [ ] Delete or reframe `tests/bridge-analyzer-push.test.js` so suite does not depend on deleted module
- [ ] Docs: `docs/bridge/DATA-STANDARDS.md` Property Analyzer Cross-Reference; `docs/bridge/GSD-AUDIT.md` auto-push row

*Existing infrastructure covers pure import-filter unit tests (`tests/bridge-import-filter.test.js`).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator day: process → Train → save → download never lands rows in Analyze | IND-01 | Cross-app session inspection | Process a city; confirm Analyzer session not updated; list saves under filter-lists only |

*Primary bar is automated; manual is optional smoke.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
