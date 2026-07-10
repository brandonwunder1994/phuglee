---
phase: 48
slug: category-promotion-signal-shape
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-intake-schema.test.js tests/bridge-category-promote.test.js tests/bridge-export.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Quick run for touched modules
- **After every plan wave:** `npm test`
- **Before phase verify:** Full suite green
- **Live verify:** only if public/server touched (`scripts/verify-live.ps1`)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | SHAPE-01/02 | unit | intake + export tests | ⚠️ extend | ⬜ pending |
| 48-01-02 | 01 | 1 | SHAPE-01 | engine | bridge-engine.test.js | ⚠️ extend | ⬜ pending |
| 48-02-01 | 02 | 2 | MAP-01/03 | unit | bridge-category-promote.test.js | ❌ W0 | ⬜ pending |
| 48-02-02 | 02 | 2 | MAP-01/02 | engine | bridge-engine.test.js | ⚠️ extend | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/bridge-category-promote.test.js` — MAP matrix
- [ ] Extend intake/export/engine tests for array indicators + unmapped category

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Train chips show signals on real city file | SHAPE-01 | Needs admin + real upload | Admin → process → Train → chips non-empty for vegetation |
| FN shows city category label | MAP-02 | Needs real unmapped-header file | Process sheet with `Vio Cat` → Train not-distressed labels |

---

## Phase Gate

- [ ] `npm test` green
- [ ] SHAPE: array on process, string on export
- [ ] MAP: unmapped category promotes; no invent from notes
