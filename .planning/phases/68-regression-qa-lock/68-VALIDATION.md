---
phase: 68
slug: regression-qa-lock
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for v2.1 milestone regression bar (QA-01..03): v1.6–v2.0 permanent locks + theater surface contracts + full suite + verify-live + `/bridge` + mobile/a11y motion.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick permanent bar** | `node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js` |
| **Engine composition pack** | `node --test --test-name-pattern="IND-04\|GATE-\|COL-\|water\|TEST-0" tests/bridge-engine.test.js` |
| **Theater pack** | `node --test tests/bridge-scrub-theater.test.js` (when added) or product dual-tag files |
| **Full suite command** | `npm test` |
| **Live gate** | `scripts/verify-live.ps1` (health + homepage) **+** explicit `/bridge` HTTP 200 |
| **Layout/motion gate** | `.planning/phases/68-regression-qa-lock/68-QA-CHECKLIST.md` |
| **Estimated runtime** | ~5–20s suite + live; checklist manual ~10–15 min |

---

## Sampling Rate

- **After every task commit:** Quick bar — independence + gold; add scrub-theater if Task 1 touched it
- **After every plan wave:** `npm test`
- **Before `/gsd:verify-work`:** Full suite green + verify-live exit 0 + `/bridge` 200 + QA-03 checklist complete
- **Max feedback latency:** ~120 seconds automated; checklist same session

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 68-01-T1 | 01 | 1 | QA-03 | static UI contracts | `node --test tests/bridge-scrub-theater.test.js` (or product dual-tags) | ⚠️ pending inventory | ⬜ pending |
| 68-01-T2 | 01 | 1 | QA-01..03 | docs map + checklist | `docs/bridge/TEST-PLAN.md` §O + `68-QA-CHECKLIST.md` | ⚠️ gap | ⬜ pending |
| 68-02-T1 | 02 | 2 | QA-01 / QA-03 | focused packs | independence + gold + engine pattern + theater | ✅ / ⚠️ theater | ⬜ pending |
| 68-02-T2 | 02 | 2 | QA-01..03 | suite + live + checklist | `npm test` + verify-live + `/bridge` + checklist fill | ✅ suite/script | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/gap*

---

## Phase Requirements → Test Map

| Req ID | Behavior | Automated Command | File Exists |
|--------|----------|-------------------|-------------|
| QA-01 | Independence no-push + already_imported | `node --test tests/bridge-independence.test.js` | ✅ |
| QA-01 | Gold ACC keep/deny/water/type/silent-drop | `node --test tests/bridge-accuracy-gold.test.js` | ✅ |
| QA-01 | Type/format/water processUpload | engine `IND-04\|GATE-\|COL-\|water\|TEST-0` pattern | ✅ |
| QA-01 | Brain / train / LIST / LRN / EFF | covered by `npm test` | ✅ |
| QA-01 | Full suite green | `npm test` | ✅ |
| QA-02 | health + homepage | `scripts/verify-live.ps1` | ✅ script |
| QA-02 | `/bridge` 200 | Invoke-WebRequest `/bridge` after verify-live (Option A) | ⚠️ not in verify-live |
| QA-03 | FEED reduced-motion + surface | theater static / product dual-tags | ⚠️ after 64 |
| QA-03 | KILL hierarchy + Save primary | theater + list-factory | partial ✅ Save |
| QA-03 | THTR admin gate | train-ux (+ theater if pivot IDs) | ✅ base |
| QA-03 | 390/1440 no overflow | human checklist | ⚠️ template in Plan 01 |
| QA-03 | CTAs ≥ 44px | CSS assert and/or checklist | ⚠️ after product CSS |

---

## Wave 0 Requirements

- [ ] After 64–67: inventory theater DOM/CSS/JS hooks for contract tests
- [ ] Add `tests/bridge-scrub-theater.test.js` **or** confirm product-phase tests already dual-tag FEED/KILL/THTR
- [ ] Append `docs/bridge/TEST-PLAN.md` §O v2.1 QA permanent bar
- [ ] Create `68-QA-CHECKLIST.md` for layout/motion human gate
- [ ] Ship-gate `/bridge` 200 (Option A Plan-only check; Option B optional script extend)
- [ ] Framework install: **none**
- [ ] Missing v1.6–v2.0 suites: **None** — already in `npm test`

*If theater contracts already dual-tagged and reduced-motion greppable: Wave 0 code gaps = docs + checklist + ship gate only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No horizontal overflow at 390 / 1440 | QA-03 | No Playwright visual harness | Open `/bridge`; DevTools device toolbar 390×844 and 1440×900; optional `scrollWidth <= innerWidth` |
| Primary CTA tap targets ≥ 44px | QA-03 | Padding-only buttons may not grep | Measure Process / Save/Stage / Train Approve-Deny; prefer CSS min-height for auto assert |
| Reduced-motion FEED/KILL/THTR comprehension | QA-03 | Motion timeline not static-testable fully | DevTools → Rendering → prefers-reduced-motion: reduce; confirm static summary path |
| Admin train theater pivot (optional smoke) | THTR / QA-03 | Covered by train-ux automated | Admin + open groups vs non-admin hide |

*Automated half (static CSS/JS) is required when greppable; checklist is blocking for overflow when CSS cannot prove layout.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify (suite + live for ship plan; checklist for QA-03 layout)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers packaging/theater gaps only (no missing v1.6–v2.0 product e2e)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s targeted automated
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] QA-02 includes explicit `/bridge` 200 (not homepage alone)
- [ ] New permanent-bar titles use `QA-0N (v2.1)` — never overwrite v1.7/v1.8/v2.0 TEST titles

**Approval:** pending planner → execute
