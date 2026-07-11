---
phase: 63
slug: idle-proof-process-climax
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.  
> Requirements: **IDLE-01** (live idle metrics from lists API / `savedLists`), **IDLE-02** (Process climax; date demoted, still required).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-idle-proof-process-climax.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90s full suite; ~2s quick static |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live.ps1` (required when `public/` touched) |

---

## Sampling Rate

- **After every task commit:** Run that task’s `<automated>` verify (static node one-liner and/or quick test file)
- **After every plan wave:** `npm test` when tests exist (wave 2); static + verify-live on wave 1
- **Before `/gsd:verify-work`:** Full suite green + verify-live green if public/ changed
- **Max feedback latency:** 90 seconds

---

## Wave Map (aligned with PLAN frontmatter)

| Wave | Plans | Parallel? | Focus |
|------|-------|-----------|-------|
| **1** | **63-01** | n/a (single) | IDLE-01 live idle strip from `savedLists` (HTML mount + CSS + compute/render) |
| **2** | **63-02** | after 01 | IDLE-02 upload climax + date meta demotion + static locks + `npm test` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 63-01-T1 | 01 | 1 | IDLE-01 | static HTML/CSS | `node -e` mount `#bridge-idle-proof` + CSS + not 3-up | ✅ public files | ⬜ pending |
| 63-01-T2 | 01 | 1 | IDLE-01 | static JS + live | `node -e` compute/render wire + `scripts\verify-live.ps1` | ✅ bridge.js | ⬜ pending |
| 63-02-T1 | 02 | 2 | IDLE-02 | static HTML/JS + live | climax order/meta + date gate + FormData omit + verify-live | ✅ public files | ⬜ pending |
| 63-02-T2 | 02 | 2 | IDLE-01, IDLE-02 | unit/static suite | `node --test tests/bridge-idle-proof-process-climax.test.js` then `npm test` | ❌ Wave 0 in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky / to create*

---

## Wave 0 Requirements

Wave 0 scaffolds are **created in-plan** (63-02 Task 2), not a separate pre-plan wave:

- [ ] `tests/bridge-idle-proof-process-climax.test.js` — IDLE-01 mount/wire/empty/no idle-stats; IDLE-02 climax ids + process date gate + FormData omits response date
- [ ] Existing infrastructure covers list store/API (`tests/bridge-list-store.test.js` etc.) — **read-only for 63**; no engine rewrite tests required
- [ ] Independence / list-factory suites must stay green under full `npm test`

*Existing lists API + `savedLists` path is production-complete — 63 is surface proof only.*

---

## Requirement → Observable Truths

| Req | Observable when done | Automated? |
|-----|----------------------|------------|
| **IDLE-01** | `#bridge-idle-proof` shows live counts from lists inventory (0 when empty; matches sum of `recordCount` / list length / latest `createdAt` after save+reload) | Static wire + optional manual match |
| **IDLE-02** | Dropzone + Process dominate upload step; response date compact meta; process still errors without date; attach still requires date | Static DOM/CSS/JS + manual smoke |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Strip matches API after save | IDLE-01 | Browser + operator inventory | Open `/bridge` empty → 0 lists; Save a list → strip updates; hard reload → same counts as Saved lists total |
| Date gate still catches empty | IDLE-02 | Browser confirm + focus | Select city/type/files; leave date empty; Process → error + focus date; fill date → process proceeds |
| Visual climax hierarchy | IDLE-02 | Visual QA | Upload step: dropzone largest stage; Process primary fire; date not a peer essay block |
| No early feed/report | scope | Visual QA | During process: loading panel unchanged (no address feed); after process: no kill-rate hierarchy yet (65) |

*Primary bar is automated static + suite + verify-live; manual is optional smoke before verify-work.*

---

## Out-of-scope (must not appear as “done” criteria)

| Deferred | Phase |
|----------|-------|
| Live scrub activity feed during process | 64 |
| Kill-rate RAW→KILLED→KEPT report | 65 |
| Multi-city shift inventory HUD elevation | 67 |
| City-scoped dossier metrics ownership | 62 (global idle must not double-build conflicting systems) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies noted as in-plan
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers MISSING test file (created inside 63-02 Task 2)
- [x] Wave map matches plan frontmatter (01 wave 1, 02 wave 2)
- [x] No watch-mode flags
- [x] Feedback latency &lt; 90s
- [x] `nyquist_compliant: true` set in frontmatter (plans include automated verify + in-plan test file)
- [ ] Execution proves green (flip task statuses during execute)

**Approval:** plans aligned 2026-07-10 — IDLE-01 → IDLE-02 sequential; public surface only; date gate kept
