---
phase: 52
slug: format-memory-confirm-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node --test` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-city-format-store.test.js tests/bridge-type-column-score.test.js` |
| **Full suite command** | `npm test` |
| **Live health (UI)** | `powershell -File scripts/verify-live.ps1` when `public/` or server routes change |
| **Estimated runtime** | ~30–90s full suite |

---

## Sampling Rate

- **After every task commit:** `node --test tests/bridge-city-format-store.test.js tests/bridge-type-column-score.test.js`
- **After every plan wave:** `node --test tests/bridge-city-format-store.test.js tests/bridge-engine.test.js`
- **Before `/gsd:verify-work`:** `npm test` green; verify-live if UI/server touched
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-------------------|-------------------|-------------|--------|
| 52-01-01 | 01 | 0 | GATE-01 | unit | `node --test tests/bridge-city-format-store.test.js` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 0 | GATE-02/03 | integration | `node --test tests/bridge-engine.test.js` | ❌ W0 | ⬜ pending |
| 52-02-01 | 02 | 1 | GATE-01 | unit | store suite green | ❌ W0 | ⬜ pending |
| 52-03-01 | 03 | 2 | GATE-02–06 META-01 | integration | engine GATE + META green | ❌ W0 | ⬜ pending |
| 52-04-01 | 04 | 3 | GATE-04/05 | manual+live | confirm UI + verify-live | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-city-format-store.test.js` — fingerprint order-independence, load/save, null typeHeader, temp root isolation
- [ ] Engine GATE fixtures — confirm required, reuse, override, META source, batch mixed
- [ ] Framework install: none
- [ ] Keep green: COL-01–04, MAP promote, water, brain process tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm modal UX (samples, pick, no-type) | GATE-04 | Browser interaction | Upload new city format as admin; confirm modal shows ranked columns; pick alternate; process continues |
| Non-admin clear 409 | GATE-05 | Role headers | Non-admin first upload sees confirm-required message, no hang |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
