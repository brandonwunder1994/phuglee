---
phase: 65
slug: kill-rate-scrub-report
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for Kill-Rate Scrub Report (KILL-01–03).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-kill-rate-scrub.test.js tests/bridge-list-factory-ux.test.js tests/bridge-efficiency-path.test.js` |
| **Wave merge** | quick run + `tests/bridge-independence.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–120s full suite |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (required if `public/` touched) |

---

## Sampling Rate

- **After every task commit:** quick run above
- **After every plan wave:** wave merge command
- **Before claim phase complete:** `npm test` + `verify-live.ps1`
- **Max feedback latency:** ~90s targeted / full suite longer

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 65-01-01 | 01 | 1 | KILL-01–03 | static unit (RED/GREEN split) | `node --test tests/bridge-kill-rate-scrub.test.js` | ❌ Wave 0 | ⬜ pending |
| 65-02-01 | 02 | 2 | KILL-01, KILL-02 | static + source | kill-rate + list-factory + efficiency | ❌ / ✅ | ⬜ pending |
| 65-02-02 | 02 | 2 | KILL-01, KILL-02 | CSS + static | same quick run | ❌ / ✅ | ⬜ pending |
| 65-03-01 | 03 | 3 | KILL-03 | HTML order + copy | quick run | ✅ hosts | ⬜ pending |
| 65-03-02 | 03 | 3 | KILL-01–03 | suite + live | wave merge + `npm test` + verify-live | ⚠️ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-kill-rate-scrub.test.js` — KILL-01 hierarchy labels (RAW/KILLED/KEPT), discardReasons breakdown, KILL-02 proof-chip markers, KILL-03 Save/Preview + Stage, banned Analyze CTAs, LIST/EFF carry-forwards
- [ ] Existing `tests/bridge-list-factory-ux.test.js` — Save list / Preview CSV / teaching pack / independence stub
- [ ] Existing `tests/bridge-efficiency-path.test.js` — Format reused + Save primary carry-forward
- [ ] Existing independence suites — no Analyze push re-coupling

*No new test framework or npm packages.*

---

## Requirement → Proof

| Req | Observable truth | Automated proof | Manual |
|-----|------------------|-----------------|--------|
| **KILL-01** | Results head is display-scale RAW → KILLED → KEPT + kill-reason chips (+ optional samples), not equal KPI tiles only | kill-rate suite: RAW/KILLED/KEPT, discardReasons, `.bridge-kill-flow` | Process real file; hierarchy readable at a glance |
| **KILL-02** | Duration, format reuse, discard/independence proof as chips/HUD | kill-rate + efficiency: proof chip markers, `Format reused` | Day-2 city shows Format reused chip; duration chip present |
| **KILL-03** | Save list primary / Stage voice; Preview CSV secondary; no Analyze push | kill-rate + list-factory: IDs/labels; Stage; banned CTAs; save before train in DOM | Save sits near report; Preview stays ghost |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cinematic hierarchy at a glance | KILL-01 | Visual weight/scale | Process a multi-kill list → RAW/KILLED/KEPT dominate; reasons have counts |
| Multi-reason breakdown | KILL-01 | Real file shape | File with &gt;1 discard reason → multiple reason chips |
| Format reused + duration chips | KILL-02 | Needs day-2 memory city | Re-process known format → `Format reused` chip + time chip |
| Save adjacency / Stage voice | KILL-03 | Layout scroll | After process, Save/Stage visible without scrolling past full table first |
| Train KEPT refresh | KILL-01 | Admin path | Admin Approve/Deny → KEPT number updates without full page reload |
| Reduced motion | QA family | OS setting | `prefers-reduced-motion`: static numbers (no required motion) |
| Mobile 390 | QA family | Viewport | No horizontal overflow; Save ≥ 44px |

---

## Anti-regression locks (must stay green)

| Suite | Why |
|-------|-----|
| `tests/bridge-list-factory-ux.test.js` | Save list, Preview CSV, workflow strip, independence stub |
| `tests/bridge-efficiency-path.test.js` | Format reused, Save primary, no auto-save, no Analyze push |
| `tests/bridge-independence.test.js` (and related) | Analyze boundary |
| Engine accuracy/gold | **Do not touch** processUpload keep/kill engine this phase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers KILL-01–03 RED contracts before implementation
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (&lt; 90s targeted)
- [ ] `nyquist_compliant: true` after plans align
- [ ] `verify-live.ps1` exit 0 after public/ edits (Plan 03)

**Approval:** plans aligned 2026-07-10 — Wave 0 test file created in 65-01; implement 65-02/03 to green
