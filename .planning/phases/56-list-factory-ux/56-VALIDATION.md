---
phase: 56
slug: list-factory-ux
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-list-store.test.js tests/bridge-list-factory-ux.test.js tests/bridge-independence.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90s full suite |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (if `public/` touched) |

---

## Sampling Rate

- **After every task commit:** quick run above
- **After every plan wave:** `npm test`
- **Before claim live:** `verify-live.ps1` if public/ edited
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 56-01-* | 01 | 1 | LIST-01, LIST-03 | static unit | `node --test tests/bridge-list-factory-ux.test.js` | ❌ Wave 0 | ⬜ pending |
| 56-02-* | 02 | 1–2 | LIST-01, LIST-02 | static + store | factory-ux + list-store | ❌ / ✅ | ⬜ pending |
| 56-03-* | 03 | 2 | LIST-01–03 | suite + live | `npm test` + verify-live | ⚠️ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-list-factory-ux.test.js` — LIST-01/03 CTA + forbidden Analyze strings + workflow copy; LIST-02 process-does-not-wipe static
- [ ] Optional: extend `tests/bridge-list-store.test.js` multi-city accumulate assert
- [ ] Existing list-store + API + independence cover backend durability

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dirty-guard confirm on process overwrite | LIST-02 | Browser confirm | Process city → do not save → process again → confirm dialog |
| Process → Save → Download all → persist after restart | LIST-01–03 | E2E browser | Full operator loop; restart server; lists remain |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity OK
- [ ] Wave 0 covers MISSING refs
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` after plans align

**Approval:** plans aligned — Wave 0 test file created in 56-03; all tasks have automated verify
