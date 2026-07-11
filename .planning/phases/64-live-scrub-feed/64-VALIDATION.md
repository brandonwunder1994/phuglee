---
phase: 64
slug: live-scrub-feed
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for FEED-01 / FEED-02 (client-staged live scrub feed; no SSE).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-scrub-feed.test.js` |
| **Wave merge / regression pack** | `node --test tests/bridge-scrub-feed.test.js tests/bridge-independence.test.js tests/bridge-list-factory-ux.test.js tests/bridge-engine.test.js` |
| **Full suite command** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **Estimated runtime** | ~2–8s focused; full suite longer; live ~few seconds |

---

## Sampling Rate

- **After every task commit:** `node --test tests/bridge-scrub-feed.test.js`
- **After every plan wave:** quick pack above (include independence when touching process path)
- **Before `/gsd:verify-work`:** `npm test` green + `scripts\verify-live.ps1` exit 0 (public/ edited)
- **Max feedback latency:** ~90 seconds targeted

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | FEED-01, FEED-02 | unit (Wave 0) | `node --test tests/bridge-scrub-feed.test.js` | ❌ Wave 0 | ⬜ pending |
| 64-01-02 | 01 | 1 | FEED-01, FEED-02 | unit pure helper | same | ❌ Wave 0 | ⬜ pending |
| 64-02-01 | 02 | 2 | FEED-01, FEED-02 | static HTML/CSS | node -e DOM/CSS gate / feed tests | ❌ until 02 | ⬜ pending |
| 64-02-02 | 02 | 2 | FEED-01, FEED-02 | static JS wire | node -e processUpload order + reduced-motion | ❌ until 02 | ⬜ pending |
| 64-02-03 | 02 | 2 | FEED-01, FEED-02 | unit + suite + live | feed tests + `npm test` + verify-live | ❌ / ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| **FEED-01** | `buildScrubFeedEvents` maps kept / no-distress / discarded / already-in-Analyze from fixture payload | unit | `node --test tests/bridge-scrub-feed.test.js` | ❌ Wave 0 |
| **FEED-01** | Cap ≤ SCRUB_FEED_CAP (32); remainder from stats when totals &gt; sample | unit | same | ❌ Wave 0 |
| **FEED-01** | No synthetic addresses when pools empty | unit | same | ❌ Wave 0 |
| **FEED-01** | Samples `notDistressedRows` for no-distress (not only `discarded[]`) | unit | same | ❌ Wave 0 |
| **FEED-01** | Loading panel contains `#bridge-scrub-feed` (+ summary) in `bridge.html` | static | feed tests after Plan 02 | ❌ Wave 0 → Plan 02 |
| **FEED-01** | `processUpload` stages feed from BridgeScrubFeed before `renderResults` | static | source order assert in feed tests | ❌ Plan 02 |
| **FEED-01** | No SSE / EventSource in feed path | static | assert absence in helper + bridge.js | ❌ Wave 0 / Plan 02 |
| **FEED-02** | `getScrubFeedPlayOptions({ reducedMotion: true })` → maxMs 0 / no stagger | unit | feed tests | ❌ Wave 0 |
| **FEED-02** | bridge.js uses `matchMedia('(prefers-reduced-motion: reduce)')` for play path | static | feed tests / source scan | ❌ Plan 02 |
| **FEED-02** | CSS `@media (prefers-reduced-motion: reduce)` for feed animation classes | static | CSS assert in feed tests | ❌ Plan 02 |
| Regression | Independence / engine processUpload still green | suite | `npm test` | ✅ existing |
| Live | health + homepage 200 | smoke | `scripts\verify-live.ps1` | ✅ script |

---

## Wave 0 Requirements

- [ ] `tests/bridge-scrub-feed.test.js` — pure event builder: status mapping, cap, remainder, no fakes, already-imported honesty, FEED-02 play options
- [ ] `public/js/bridge-scrub-feed.js` — pure helper under test (Plan 01 ships with tests)
- [ ] Plan 02 extends same file with DOM/wire static contracts for `#bridge-scrub-feed`
- [ ] Framework install: **none**
- [ ] **No SSE** infrastructure — deferred; do not add stream tests as product path

*Wave 0 complete when Plan 01 pure suite is green; mark `wave_0_complete: true` after 64-01 SUMMARY.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staged play feel after real process (~≤2s) | FEED-01 | Browser timing / visual | Process multi-row city file on `/bridge`; during post-response beat see address/status rows then results |
| Reduced-motion OS setting | FEED-02 | OS media query | Enable prefers-reduced-motion; process file; see static summary (optional static samples), no multi-second stagger |
| Layout 390 / 1440 | FEED-01 chrome | Visual | No horizontal overflow in feed list; loading panel readable |
| TYPE_COLUMN_CONFIRM interrupt | FEED-01 cleanup | Modal path | Trigger confirm (admin); feed/timers must not run under dialog |

*Manual checks document confidence; phase gate is automated suite + verify-live.*

---

## Out of Scope (do not validate here)

| Item | Owner |
|------|-------|
| SSE / server-streamed process events | Deferred / Future requirements |
| Kill-rate RAW → KILLED → KEPT results report | Phase 65 |
| Train theater pivot | Phase 66 |
| Engine keep/kill rewrite | Out of milestone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers pure helper FEED-01/02 mapping + play options
- [ ] Plan 02 covers DOM mount, wire order, reduced-motion static, suite + live
- [ ] No watch-mode flags
- [ ] Feedback latency &lt; 90s targeted
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** plans aligned 2026-07-10 — execute Plan 01 (Wave 0 pure helper) then Plan 02 (mount + wire + live)
