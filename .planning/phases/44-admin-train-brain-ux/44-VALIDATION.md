---
phase: 44
slug: admin-train-brain-ux
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `44-RESEARCH.md` Validation Architecture + plan verify blocks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-train-ux.test.js` |
| **Full suite command** | `npm test` |
| **Live verify** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~5–20s unit file; full suite ~15–40s |

---

## Sampling Rate

- **After every task commit:** `node --test tests/bridge-train-ux.test.js`
- **After every plan wave:** `npm test`
- **Before `/gsd:verify-work`:** Full suite green + `scripts\verify-live.ps1` exit 0
- **Max feedback latency:** 60 seconds (no watch mode)

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TRAIN-01 | Markup has two train sections + mode control IDs | unit (static HTML) | `node --test tests/bridge-train-ux.test.js` | ❌ Wave 0 |
| TRAIN-01 | Admin can open Train brain; `getReviewGroups` / render both sections | unit | same | ❌ Wave 0 |
| TRAIN-02 | Card HTML includes Approve + Deny with `data-action` | unit (string assert) | same | ❌ Wave 0 |
| TRAIN-03 | `isBridgeAdmin` true only for exact `admin`; non-admin wrap hidden | unit (vm / source) | same | ❌ Wave 0 |
| TRAIN-03 | bridge.js source contains admin gate; default hidden in HTML | unit (source read) | same | ❌ Wave 0 |
| TRAIN-04 | Card render includes `matchedIndicators` + `descriptionSamples` | unit | same | ❌ Wave 0 |
| TRAIN-* | Live page still 200 after HTML/CSS/JS edit | smoke | `scripts\verify-live.ps1` | ✅ scripts exist |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | TRAIN-01,03,04 | unit RED (shell) | `node --test tests/bridge-train-ux.test.js` | ❌ W0 create | ⬜ pending |
| 44-01-02 | 01 | 1 | TRAIN-01,03 | unit GREEN (markup) | `node --test tests/bridge-train-ux.test.js` | ❌ W0 | ⬜ pending |
| 44-01-03 | 01 | 1 | TRAIN-04 hooks | unit GREEN (CSS) | `node --test tests/bridge-train-ux.test.js` | ❌ W0 | ⬜ pending |
| 44-02-01 | 02 | 2 | TRAIN-01–04 | unit RED (behavior) | `node --test tests/bridge-train-ux.test.js` | ⚠️ extend | ⬜ pending |
| 44-02-02 | 02 | 2 | TRAIN-01–04 | unit GREEN (JS wire) | `node --test tests/bridge-train-ux.test.js` | ⚠️ extend | ⬜ pending |
| 44-02-03 | 02 | 2 | TRAIN-* | full suite + live | `npm test` (+ verify-live in action) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bridge-train-ux.test.js` — covers TRAIN-01–04 static HTML/CSS + helper/source behaviors
- [ ] Optional pure helpers export: `window.BridgeTrain` (`isBridgeAdmin`, `getReviewGroups`, `renderTrainGroupCard`) or thin `public/js/bridge-train.js`
- [ ] No framework install required

*Existing infrastructure: `node:test` already used across `tests/`; patterns in `tests/a11y-seo.test.js`, `tests/auth-session.test.js`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin visual: Train tab + two sections + Approve/Deny status | TRAIN-01,02,04 | No browser runner | Login as `admin` → process code-violation file → Train brain tab → open sections → click Approve/Deny → see phase-45 stub status |
| Non-admin never sees train chrome | TRAIN-03 | Session-dependent UI | Login as non-admin → process → confirm no mode tabs / train wrap |

---

## Validation Sign-Off

- [x] All tasks have automated verify (`<automated>`) or Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING test file references
- [x] No watch-mode flags
- [x] Feedback latency < 60s for unit commands
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (plan-check remediation — VALIDATION.md created from research)
