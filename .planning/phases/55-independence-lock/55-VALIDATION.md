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
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (required when `public/` touched — plan 55-03) |

---

## Sampling Rate

- **After every task commit:** Run focused suite for touched area (see map below)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green; if public/ changed, verify-live green
- **Max feedback latency:** 90 seconds

---

## Wave Map (aligned with PLAN frontmatter)

| Wave | Plans | Parallel? | Focus |
|------|-------|-----------|-------|
| **1** | **55-01**, **55-02** | yes (no file overlap) | IND-04 engine default-off + tests; IND-01..03 push delete + independence suite |
| **2** | **55-03** | after 01+02 | Docs + UI copy; `npm test` + `scripts\verify-live.ps1` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 55-01-T1 | 01 | 1 | IND-04 | static (source gate) | `node -e` checks `applyAlreadyImportedFilter === true` + opt-in branch in `lib/bridge-engine/index.js` | ✅ engine exists | ⬜ pending |
| 55-01-T2 | 01 | 1 | IND-04 | processUpload e2e + pure | `node --test --test-name-pattern="IND-04\|already_imported\|…"` on `bridge-engine`, `bridge-edge-cases`, **`bridge-stress`**, `bridge-import-filter` | ⚠️ invert/split existing; stress processUpload tests currently always-on | ⬜ pending |
| 55-02-T1 | 02 | 1 | IND-02 | module absence | `node -e` require.resolve bridge-analyzer-push → MODULE_NOT_FOUND | ⚠️ module still exists until plan runs | ⬜ pending |
| 55-02-T2 | 02 | 1 | IND-01–03 | unit/integration | `node --test tests/bridge-independence.test.js tests/bridge-api-handlers.test.js` | ❌ created in-plan (Wave 0 item) | ⬜ pending |
| 55-03-T1 | 03 | 2 | IND docs | docs static | node one-liner on DATA-STANDARDS + GSD-AUDIT | ✅ docs exist | ⬜ pending |
| 55-03-T2 | 03 | 2 | IND-01/02/04 messaging | suite + live | `npm test` **then** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` | ✅ public/js/bridge.js | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky / to invert*

### Stress suite (IND-04 — plan 55-01 Task 2)

| Test (current → target) | File | Action |
|-------------------------|------|--------|
| `filters analyze matches but keeps new addresses in same file` | `tests/bridge-stress.test.js` | Invert/split → two IND-04 processUpload tests (default-off keep + opt-in hard-drop) |
| `import filter catches St vs Street against analyze index` | `tests/bridge-stress.test.js` | **Keep** pure `filterAlreadyImported` unit |

---

## Wave 0 Requirements

Wave 0 scaffolds are **created in-plan** (not a separate pre-plan wave). Plans own creation/inversion:

- [ ] `tests/bridge-independence.test.js` — static bans + module absence + save/process negative side-effect contracts (IND-01, IND-02, IND-03) — **created by 55-02 Task 2**
- [ ] Invert / replace `processUpload filters rows already in Property Analyzer` in `tests/bridge-engine.test.js` for IND-04 default-off — **55-01 Task 2**
- [ ] Invert / split stress processUpload Analyze-index test in `tests/bridge-stress.test.js` (default-off + opt-in); keep pure filter unit — **55-01 Task 2**
- [ ] Opt-in `applyAlreadyImportedFilter: true` still hard-drops (engine + stress) — **55-01 Task 2**
- [ ] Delete or reframe `tests/bridge-analyzer-push.test.js` so suite does not depend on deleted module — **55-02 Task 1**
- [ ] Docs: `docs/bridge/DATA-STANDARDS.md` Property Analyzer Cross-Reference; `docs/bridge/GSD-AUDIT.md` auto-push row — **55-03 Task 1**
- [ ] UI copy honesty when alreadyImported/importIndexCount are 0 — **55-03 Task 2**

*Existing infrastructure covers pure import-filter unit tests (`tests/bridge-import-filter.test.js`) — keep green; do not treat as Wave 0 gap.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator day: process → Train → save → download never lands rows in Analyze | IND-01 | Cross-app session inspection | Process a city; confirm Analyzer session not updated; list saves under filter-lists only |

*Primary bar is automated; manual is optional smoke.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies noted as in-plan
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (created inside 55-01 / 55-02 / 55-03)
- [ ] Stress suite included in IND-04 verify path
- [ ] Wave map matches plan frontmatter (01+02 wave 1, 03 wave 2)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter after execution proves green

**Approval:** pending
