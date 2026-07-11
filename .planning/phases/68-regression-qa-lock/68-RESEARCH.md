# Phase 68: Regression QA Lock - Research

**Researched:** 2026-07-10  
**Domain:** v2.1 Filter Scrub Theater — permanent milestone regression bar (v1.6–v2.0 locks + theater contracts + full suite + verify-live + mobile/a11y motion)  
**Confidence:** HIGH

## Summary

Phase 68 does **not** invent product theater. Phases 61–67 ship the scrub desk, dossier, idle proof, live feed, kill-rate report, Train theater, and multi-city shift. Phase 68 is the **milestone permanent bar** required by **QA-01..03**: (1) all Filter independence / accuracy / brain / processUpload locks from v1.6–v2.0 stay green under `npm test`, (2) `scripts/verify-live.ps1` exits 0 after milestone work with `/bridge` reachable (homepage already covered by verify-live), (3) mobile 390 + desktop 1440 layout, primary CTAs ≥ 44px, and reduced-motion paths verified for FEED / KILL / THTR motion.

This is the same **lock-and-ship** family as Phases 50, 54, and **60**. Prefer **gates-only when already green**; add focused **theater contract tests** only for new surface contracts introduced in 64–67 (and pure feed/report helpers if any). Do not re-implement IND/ACC/BRAIN/COL/GATE engines. Zero new npm packages. Never wipe `data/filter-lists/` or `data/bridge-brain/`.

**Research-time baseline (2026-07-10, pre-61–67 product):** full suite **577 pass / 0 fail**; v2.0 permanent bar still greppable (`TEST-01 (v2.0)` / `TEST-02 (v2.0)`); focused engine COL/GATE/water + v1.8 TEST patterns green. Theater DOM/CSS for FEED/KILL/THTR and `bridge.css` `prefers-reduced-motion` are **not yet present** (phases 61–67 pending) — Phase 68 must re-baseline after those phases and lock whatever they ship.

**Primary recommendation:** **2 plans** matching Phase 60: Plan 01 packages permanent bar + theater contract tests + TEST-PLAN map + QA checklist; Plan 02 is the ship gate (`npm test` + verify-live + `/bridge` 200 + checklist evidence). If 61–67 already land green theater contracts, compress packaging to docs/titles only.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** Locked decisions from `68-CONTEXT.md` are NON-NEGOTIABLE.

### Locked Decisions

#### Gates
- `npm test` green including independence / accuracy / brain / processUpload locks
- `scripts/verify-live.ps1` exit 0; `/bridge` + homepage 200
- Mobile 390 + desktop 1440 checks documented or automated where practical
- Reduced-motion paths verified for feed / report / theater

#### Phase boundary (CONTEXT domain)
- Formal lock: full suite green on **v1.6–v2.0 bars** + **new theater tests as needed**
- Prefer **gates-only when already green**; add tests for new theater contracts
- 390/1440 layout; 44px CTAs; reduced-motion for FEED/KILL/THTR

### Claude's Discretion
- Add focused unit tests for pure feed/report helpers if introduced in 64–67
- Screenshot checklist vs automated if no visual regression harness

### Deferred Ideas (OUT OF SCOPE)
- New product features

**Also locked by REQUIREMENTS / ROADMAP / AGENTS (not in CONTEXT but mandatory):**
- Requirements: **QA-01**, **QA-02**, **QA-03** only
- Depends on Phases 61–67
- No processUpload keep/kill rewrite; no Analyze re-couple; no React
- AGENTS.md: never wipe filter-lists / bridge-brain / Form Forge / Analyzer users; verify-live after public edits
- CI in this repo = `npm test` (`node --test tests/**/*.test.js`) — no GitHub Actions required
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **QA-01** | All Filter independence / accuracy / brain / processUpload locks from v1.6–v2.0 stay green (`npm test`) | **Exists:** independence `TEST-01 (v2.0)`, gold `TEST-02 (v2.0)`, engine IND-04 + COL/GATE/water + v1.7/v1.8 TEST, brain suites, train UX, list factory, LRN, EFF. **Gap:** no explicit **v2.1** permanent-bar packaging / TEST-PLAN section; suite count will drift after 61–67. **Action:** keep green + package (TEST-PLAN section O + optional `QA-01 (v2.1)` titles); full `npm test` ship gate. |
| **QA-02** | `scripts/verify-live.ps1` exit 0 after milestone work; `/bridge` health + homepage 200 | **Exists:** verify-live checks `/api/health` + `/` (homepage) with auto-ensure/restart. **Gap:** verify-live does **not** hit `/bridge`; `scripts/verify.ps1` full sweep does include `/bridge`. CONTEXT requires `/bridge` + homepage. **Action:** ship gate = verify-live exit 0 **plus** explicit `/bridge` HTTP 200 (thin script extension **or** documented extra Invoke-WebRequest in plan). |
| **QA-03** | Mobile 390 + desktop 1440: no horizontal overflow; primary CTAs ≥ 44px; reduced-motion paths verified for FEED/KILL/THTR | **Exists:** peer CSS patterns (`prefers-reduced-motion` in command/collect/home/a11y; `min-height: 44px` on coverage dock); phase 30/31/44 checklist culture; no Playwright harness. **Gap:** `public/css/bridge.css` currently has **no** `prefers-reduced-motion` / 44px CTA locks (theater not shipped); no automated 390/1440 overflow test. **Action:** after 64–66 ship, add static theater contracts where greppable + **checklist** for visual 390/1440 (screenshot optional per discretion). |
</phase_requirements>

---

## Permanent bars to keep (v1.6–v2.0)

These must remain green under `npm test`. Phase 68 **packages and gates** them; it does not re-implement product logic.

### Core permanent bar (must never silently disappear)

| Bar | Milestone origin | Automated file(s) | Greppable anchors | What it locks |
|-----|------------------|-------------------|-------------------|---------------|
| **Independence no-push + already_imported default-off** | v2.0 TEST-01 | `tests/bridge-independence.test.js` (+ engine IND-04) | `TEST-01 (v2.0)`, `IND-01`, `IND-02`, `IND-03`, `already_imported` | No Analyze push strings on Filter write paths; push module gone; process/save invent no Analyzer sessions; hard-drop off unless `applyAlreadyImportedFilter === true` |
| **Gold ACC processUpload** | v2.0 TEST-02 / Phase 57 | `tests/bridge-accuracy-gold.test.js` + `tests/fixtures/bridge/gold/*` | `TEST-02 (v2.0)`, `ACC-01`, `ACC-02`, `ACC-03` | keep/deny/water/type/silent-drop against gold corpus |
| **Type / format / water composition** | v1.8 + v2.0 TEST-03 | `tests/bridge-engine.test.js` (+ gold water) | `COL-`, `GATE-`, `water`, `TEST-01 (v1.8)`, `TEST-02 (v1.8)`, `TEST-03 (v1.8)`, `IND-04` | processUpload Type scoring/confirm, format memory, water shut-off paths |
| **Live server** | every regression lock | `scripts/verify-live.ps1` | health + home 200 | Site reachable after work |

### Supporting bars (also green under `npm test` — keep)

| Bar | Origin | File(s) | Anchors |
|-----|--------|---------|---------|
| Train shell + admin gate | v1.6 TRAIN | `tests/bridge-train-ux.test.js` | train wrap hidden default, `isBridgeAdmin`, Approve/Deny cards, non-admin hide |
| Brain store / apply / decisions / API / hardening | v1.6 BRAIN/HARD | `tests/bridge-brain-*.test.js` | brain rules, apply, decisions, API, hardening |
| List factory UX | v2.0 LIST | `tests/bridge-list-factory-ux.test.js` | `LIST-01..03`, Save list primary, no Push Analyze CTAs |
| Learning metrics anti-game | v2.0 LRN | `tests/bridge-learning-metrics.test.js` | `LRN-01`, `LRN-02` |
| Efficiency operator path | v2.0 EFF | `tests/bridge-efficiency-path.test.js` | `EFF-01`, `EFF-02`, Format reused, flash download |
| Description-only / Vio Cat / typed stack | v1.7 TEST | `tests/bridge-engine.test.js` | bare `(TEST-01|02|03)` description-only / Vio Cat / stack — **leave titles** |
| Category promote / stable groups / short labels / type scorer | v1.7–v1.8 | engine + dedicated unit files | MAP/GROUP/LBL/COL unit contracts |
| Import filter / list store / dedup / export / API handlers | core Filter | matching `tests/bridge-*.test.js` | suite inclusion |

### Documented map today

| Doc section | Covers |
|-------------|--------|
| `docs/bridge/TEST-PLAN.md` **§N. v2.0 permanent regression bar** | TEST-01..03 (v2.0) → independence + gold + engine + verify-live |
| Earlier TEST-PLAN sections | ACC, LRN, EFF, LIST, engine GATE/COL rows |

**Phase 68 packaging gap:** no **§O. v2.1 permanent regression bar (QA-01..03)** yet. Recommend append (same pattern as §N) mapping QA-01 (suite bars), QA-02 (verify-live + `/bridge`), QA-03 (theater contracts + checklist).

### Naming collision table (carry-forward)

| Title fragment | v1.7 | v1.8 | v2.0 | **v2.1 (this phase)** |
|----------------|------|------|------|------------------------|
| TEST-01 | Description-only High Grass groups | Alias-first Type trap | Independence no-push + already_imported | **Do not reuse bare TEST-01** |
| TEST-02 | Unmapped Vio Cat | Fingerprint FP change | Gold ACC | **Do not reuse bare TEST-02** |
| TEST-03 | Typed stack + suite/live | shortLabel + suite/live | verify-live + Type/format/water | **Do not reuse bare TEST-03** |
| **QA-0N** | — | — | — | **Use `QA-0N (v2.1): …` for new titles** |

Leave all v1.7 / v1.8 / v2.0 titled tests **untouched** unless a real regression forces a minimal fix.

### Quick permanent-bar commands

```powershell
# v2.0 core bar
node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js
node --test --test-name-pattern="IND-04|GATE-|COL-|water|TEST-0" tests/bridge-engine.test.js

# Supporting UX / brain bars (representative)
node --test tests/bridge-train-ux.test.js tests/bridge-list-factory-ux.test.js tests/bridge-efficiency-path.test.js tests/bridge-learning-metrics.test.js

# Full CI + live
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Then /bridge 200 (QA-02 gap fill — see Live gate section)
```

**Research-time counts (2026-07-10):**

| Gate | Result |
|------|--------|
| Full `npm test` | **577 pass / 0 fail** (~4.2s) |
| Independence + gold + train + list + EFF + LRN name filter | **60 pass / 0 fail** (sample pack) |
| Engine COL/GATE/water/TEST-0 focused | **27 pass / 0 fail** under name pattern |
| `public/css/bridge.css` `prefers-reduced-motion` / 44px | **0 matches** (expected pre-theater) |

Re-record exact counts in Phase 68 SUMMARY after 61–67 land (count will rise).

---

## How to add theater contract tests

### Standard approach (project proven)

Filter UI locks in this repo are **static source contracts**, not Playwright:

| Pattern | Used by | Mechanism |
|---------|---------|-----------|
| **HTML/CSS/JS greps** | `bridge-list-factory-ux`, `bridge-efficiency-path`, `bridge-train-ux` | `fs.readFileSync` + `assert.match` / `assert.equal(includes…)` |
| **Pure helper unit via `vm`** | `bridge-train-ux` | Load `bridge-train.js` (or marked pure block) into sandbox |
| **processUpload e2e** | gold / engine / independence | Real pipeline with temp roots |
| **Meta fixture presence** | gold `TEST-02 (v2.0)` | `fs.existsSync` on corpus files |

**Do not introduce** browser automation, visual regression CI, or a new test framework for Phase 68.

### Recommended new file (when theater ships)

```
tests/bridge-scrub-theater.test.js   # NEW (preferred single theater bar)
# OR extend:
tests/bridge-train-ux.test.js        # THTR only if small delta
tests/bridge-list-factory-ux.test.js # only if SAVE/Stage contracts expand
```

Prefer **one new file** for v2.1 theater surface so `QA-0N (v2.1)` titles stay greppable and Plan 01 does not tangle v2.0 LIST/EFF files.

### Title convention (mandatory for new tests)

```text
QA-01 (v2.1): …          # only if packaging a suite meta-assert
QA-03 (v2.1): FEED …     # feed reduced-motion / feed DOM
QA-03 (v2.1): KILL …     # kill-rate hierarchy / Save primary
QA-03 (v2.1): THTR …     # train theater pivot / admin gate
FEED-02 / QA-03 (v2.1): prefers-reduced-motion feed path
KILL-03 / QA-03 (v2.1): Save list remains primary post-scrub CTA
THTR-03 / QA-03 (v2.1): non-admin never sees train/brain chrome
```

Dual-tag product IDs (FEED/KILL/THTR) with `QA-03 (v2.1)` when the lock is a11y/layout/motion; use pure FEED/KILL/THTR titles if the product phase already dual-tagged.

### Contract catalog (add only what 61–67 actually ship)

Planner/executor should inventory DOM hooks after 64–67 and assert **real** strings — not invent IDs. Expected contract *families* from CONTEXT + REQUIREMENTS:

#### FEED (Phase 64)

| Contract family | Static assert idea | Reduced-motion |
|-----------------|--------------------|----------------|
| Feed mount / container id or class in HTML or JS render path | `assert.match(js, /scrub.?feed|bridge-scrub-feed|activity.?feed/i)` against **actual** hook | — |
| Status language vocabulary | kept / no-distress / discarded / already-in-Analyze strings present in JS | — |
| No unlabeled fake addresses as proof | banned decorative-only patterns if product documents them | — |
| **FEED-02** | `bridge.css` (or page CSS) contains `@media (prefers-reduced-motion: reduce)` rules that target feed selectors; JS does not require animation for comprehension (static summary path greppable) | **Required** |

#### KILL (Phase 65)

| Contract family | Static assert idea |
|-----------------|--------------------|
| RAW → KILLED → KEPT hierarchy (display-scale language) | strings + container hooks in HTML/JS |
| Kill-reason breakdown / proof chips | meta chips not only buried sentence |
| **KILL-03** Save/Stage primary | `id="bridge-save-list"` + primary class; Preview CSV secondary (carry LIST-01 / EFF) |
| No Push/Send Analyze CTAs | reuse `BANNED_CTAS` list from list-factory/efficiency |

#### THTR (Phase 66)

| Contract family | Static assert idea |
|-----------------|--------------------|
| Theater pivot when open groups | JS: open-group count → train default (not equal Kept/Train/Brain peer tabs) |
| Mission header / open-group count | greppable mission chrome |
| Brain secondary | brain not third equal peer tab |
| **THTR-03** admin gate | preserve `isBridgeAdmin` + train wrap hidden default — **existing train-ux tests stay**; add thin theater titles only if chrome IDs change |

#### Pure helpers (discretion)

If 64–67 extract pure functions (e.g. `stageScrubFeedRows`, `computeKillRateSummary`):

```js
// Prefer unit tests without DOM — same style as BridgeTrain vm helpers
const { stageScrubFeedRows } = loadPureHelper();
assert.equal(stageScrubFeedRows(rows).length, …);
```

Do **not** re-test processUpload keep/kill truth — gold + engine already lock accuracy.

### Implementation sketch (theater static file)

```js
/**
 * Phase 68 / v2.1 Filter Scrub Theater surface locks (QA-03 + FEED/KILL/THTR).
 * Static HTML/CSS/JS contracts — no browser automation.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');

test('QA-03 (v2.1): bridge.css defines prefers-reduced-motion for theater', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  // After 64–66: also match feed/report/theater selector fragments inside reduce blocks if stable
});

test('KILL-03 / QA-03 (v2.1): Save list remains primary post-scrub CTA', () => {
  assert.match(html, /id="bridge-save-list"/);
  assert.match(html, /Save list/);
  assert.equal(html.includes('Send to Analyze'), false);
});

test('THTR-03 / QA-03 (v2.1): train wrap stays fail-closed hidden by default', () => {
  // Prefer existing train-ux; thin dual-tag OK if needed for greppability
  assert.match(html, /id="bridge-train-wrap"/);
  assert.match(html, /bridge-train-wrap[^>]*\bhidden\b|hidden[\s\S]{0,80}bridge-train-wrap/);
});
```

**Wave 0 rule:** Do not invent feed/report class names before 64–67. Plan 01 opens with “inventory shipped hooks from 64–67 SUMMARY/VERIFICATION → write asserts against those strings.”

### What not to test as theater contracts

| Temptation | Why skip |
|------------|----------|
| Pixel screenshots as CI | No harness; checklist/screenshot optional only |
| Full browser process animation timeline | Static contracts + reduced-motion CSS suffice |
| Re-running gold keep/kill as “theater proof” | Already QA-01 permanent bar |
| Softening admin gate for “demo” | THTR-03 / TRAIN-03 hard rule |

---

## verify-live gate (QA-02)

### Current behavior (`scripts/verify-live.ps1`)

| Check | URL | Pass |
|-------|-----|------|
| Health | `http://127.0.0.1:3000/api/health` (or `DISTRESS_OS_PORT`) | HTTP 200 |
| Homepage | `http://127.0.0.1:3000/` | HTTP 200 |
| Recovery | Calls `ensure-server.ps1` then `restart.ps1` if down | exit 0 only when both 200 |

**Does not check:** `/bridge`.

### Related scripts

| Script | Role |
|--------|------|
| `scripts/verify-live.ps1` | Fast agent gate — health + home; auto-start headless |
| `scripts/verify.ps1` | Heavier monorepo verify — includes routes `/`, `/heat`, **`/bridge`**, `/forge/`, `/analyzer/` |
| `scripts/restart.ps1` / `ensure-server.ps1` | Headless start only — never blocking `node server.js` in agent shell |

### QA-02 required ship gate

CONTEXT + REQUIREMENTS: verify-live exit 0 **and** `/bridge` + homepage 200.

**Recommended packaging (planner choice):**

| Option | Action | Pros / cons |
|--------|--------|-------------|
| **A (preferred minimal)** | Keep verify-live as-is; Plan 02 adds one explicit check: `Invoke-WebRequest http://127.0.0.1:3000/bridge` → 200 after verify-live | Zero script risk; matches Phase 44 SUMMARY practice |
| **B** | Thin-extend `verify-live.ps1` to also require `/bridge` 200 | Single command forever; slightly changes global AGENTS gate (usually beneficial) |
| **C** | Run full `npm run verify` | Heavier; pulls Form Forge/Analyzer route sweep — overkill for Filter milestone lock |

**Recommendation:** Option **A** in Plan 02 ship gate, or Option **B** if agent prefers one script forever (document change in SUMMARY). Do **not** wire live HTTP into `npm test`.

### Ship gate command block (copy for plans / TEST-PLAN)

```powershell
# From repo root (cwd: distress-os)
npm test
if ($LASTEXITCODE -ne 0) { throw "npm test failed" }

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
if ($LASTEXITCODE -ne 0) { throw "verify-live failed" }

# QA-02 /bridge explicit (Option A)
$bridge = Invoke-WebRequest -Uri "http://127.0.0.1:3000/bridge" -UseBasicParsing -TimeoutSec 8
if ($bridge.StatusCode -ne 200) { throw "/bridge not 200" }
Write-Host "QA-02 ok bridge=200"

# If verify-live fails first:
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restart.ps1
# then re-run verify-live + /bridge check
```

### AGENTS.md live rules (non-negotiable)

1. After any `public/` / `server.js` edit: verify-live before claiming live  
2. Start only via restart/ensure/run-hidden — never agent-shell `node server.js`  
3. Never wipe filter-lists / bridge-brain as part of QA  
4. Preview URLs: http://127.0.0.1:3000/ and http://localhost:3000/

Phase 68 itself may only need public edits if fixing a red theater contract; prefer test/docs-only when green.

---

## Mobile / reduced-motion verification checklist (prior-phase pattern)

### Patterns from prior phases

| Phase | Artifact | What it did | Reuse for QA-03 |
|-------|----------|-------------|-----------------|
| **23** Global chrome motion | `CHECKLIST.md` | Checkbox: `prefers-reduced-motion` disables stagger | Checkbox culture |
| **29** States microinteractions | `CHECKLIST.md` + PLAN | Explicit “disable pulse/hover/modal rise under reduce” | Motion inventory style |
| **30** A11y / perf / SEO | `CHECKLIST.md` | Global reduced-motion audit + suites green | Milestone a11y checklist |
| **31** Cross-app QA | `AUDIT.md` table | Per-page pass table (Brand / States / A11y / SEO) | **Table audit** for `/bridge` only |
| **44** Train UX | Manual UAT in SUMMARY | Non-blocking admin/non-admin login paths; verified `/bridge` 200 | Manual UAT appendix |
| **60** Regression lock | Automated only | No visual checklist (no theater UI scope) | Automated bar packaging |

**Impeccable / design bible:** all theater must respect `prefers-reduced-motion` (v2.1 style DO). Peer surfaces already implement reduce media queries; **bridge.css does not yet** (pre-64).

### Recommended QA-03 deliverable shape

Combine **automated where practical** + **documented checklist** (CONTEXT discretion: screenshot optional).

#### A. Automated (add in theater contract tests when greppable)

| Check | How |
|-------|-----|
| Reduced-motion CSS exists for FEED/KILL/THTR | `assert.match(css, /prefers-reduced-motion:\s*reduce/)` + selector fragments for feed/report/theater |
| Primary CTAs ≥ 44px | Grep `min-height:\s*44px` or `min-height:\s*2\.75rem` on process / save / train decision buttons (match shipped rules) |
| Stable primary IDs | `bridge-process`, `bridge-save-list`, train decision buttons still present |
| Viewport meta | `bridge.html` has `width=device-width` (already true) |

#### B. Manual / documented checklist (blocking for phase complete if automated cannot see layout)

Create either:
- `.planning/phases/68-regression-qa-lock/68-QA-CHECKLIST.md`, **or**
- a section inside `68-0N-SUMMARY.md` / VERIFICATION human section

**Template (mirror Phase 31 table + Phase 44 UAT):**

```markdown
# Phase 68 QA-03 Checklist — /bridge only

**Date:** YYYY-MM-DD  
**Browser:** (Chrome/Edge)  
**How to emulate reduced-motion:** DevTools → Rendering → Emulate CSS media feature prefers-reduced-motion: reduce  
**How to set width:** DevTools device toolbar 390×844 and 1440×900 (or window resize)

## Layout

| Viewport | No horizontal overflow | Primary CTAs ≥ 44×44 (tap) | Notes | Pass |
|----------|------------------------|----------------------------|-------|------|
| 390 (mobile) | [ ] desk / feed / report / train / shift | [ ] Process, Save/Stage, Train Approve/Deny | | |
| 1440 (desktop) | [ ] same surfaces | [ ] same CTAs | | |

## Reduced motion (FEED / KILL / THTR)

| Surface | With reduce: static summary or non-essential motion off | Comprehension without motion | Pass |
|---------|----------------------------------------------------------|------------------------------|------|
| FEED (during/after process) | [ ] no mandatory ticker/scroll animation | [ ] status language still readable | |
| KILL report | [ ] hierarchy readable without count-up animation | [ ] RAW/KILLED/KEPT + chips visible | |
| THTR train | [ ] pivot/chrome usable without motion | [ ] open-group mission + decisions clear | |

## Admin gate smoke (optional, non-blocking if train-ux automated)

| Path | Expected | Pass |
|------|----------|------|
| Admin + open groups | Train theater / train chrome visible | |
| Non-admin | No train/brain chrome | |

## Screenshots (optional — Claude's discretion)

- [ ] 390 first paint desk
- [ ] 390 kill report
- [ ] 1440 train theater (admin)
- Store under `.planning/phases/68-regression-qa-lock/screenshots/` only if useful for VERIFICATION

## Automated gates attached

- [ ] `npm test` exit 0
- [ ] `scripts/verify-live.ps1` exit 0
- [ ] `/bridge` HTTP 200
```

### Overflow practical tip (no harness)

Without Playwright:
1. Open `/bridge` at 390 and 1440  
2. Confirm `document.documentElement.scrollWidth <= window.innerWidth` in console (optional one-liner note in checklist)  
3. Fail if sticky desk / feed / train forces page-level horizontal scroll  

Do **not** require Lighthouse as Phase 68 gate (Phase 30 already set shell bar).

### 44px CTA guidance

Peer precedent: `coverage-dock.css` uses `min-height: 44px` for touch targets. For Filter, assert CSS on:

- Process climax button (`#bridge-process` or shipped class)
- Save list / Stage (`#bridge-save-list`)
- Train Approve/Deny (`data-action="approve|deny"` buttons)

If product uses padding-only without min-height, checklist tap-target measurement is acceptable for QA-03 with a note; prefer CSS min-height for automated greppability.

---

## Gap Analysis (tree vs QA-01..03)

| Req | Existing coverage | In `npm test`? | Gap for Phase 68 |
|-----|-------------------|----------------|------------------|
| **QA-01** independence | ✅ `TEST-01 (v2.0)` in independence suite | ✅ | Keep green; optional TEST-PLAN §O + `QA-01 (v2.1)` meta |
| **QA-01** gold ACC | ✅ `TEST-02 (v2.0)` + gold fixtures | ✅ | Keep green; never delete fixtures |
| **QA-01** Type/format/water | ✅ COL/GATE/water + v1.8 TEST + gold water | ✅ | Focused pattern re-run at ship |
| **QA-01** brain / train / LIST / LRN / EFF | ✅ dedicated test files | ✅ | Keep green; include in full suite only (no re-impl) |
| **QA-02** homepage + health | ✅ verify-live.ps1 | n/a (script) | Explicit final task |
| **QA-02** `/bridge` 200 | ⚠️ verify.ps1 only; Phase 44 manual | partial | **Add** Option A or B check |
| **QA-03** reduced-motion FEED/KILL/THTR | ❌ not in bridge.css yet | ❌ | After 64–66: static CSS/JS contracts + checklist |
| **QA-03** 390/1440 overflow | ❌ no visual harness | ❌ | Checklist (optional screenshot) |
| **QA-03** 44px CTAs | ⚠️ peer CSS only; not bridge | ❌ | CSS min-height after product phases + assert |
| **Theater surface contracts** | ❌ pre-61 | ❌ | New `bridge-scrub-theater.test.js` (or dual-tags in product phase tests) |

**Already green — do not re-implement (only keep green):** all v1.6–v2.0 bars listed above; Phase 60 packaging of TEST-01/02 (v2.0).

**Product still pending at research time:** Phases 61–67 (CONTEXT only). Phase 68 plans must assume theater hooks land first; if plan-phase runs before 67 completes, mark theater asserts as “depends on 64–66 shipped strings.”

---

## Standard Stack

### Core

| Library / Tool | Version / Location | Purpose | Why Standard |
|----------------|--------------------|---------|--------------|
| `node:test` + `node:assert/strict` | Node 20+ | Automated contracts | `package.json` `"test": "node --test tests/**/*.test.js"` |
| Existing permanent bar suites | `tests/bridge-*.test.js` | QA-01 v1.6–v2.0 locks | Phase 60 inventory |
| Static UI contracts | fs + assert.match | Theater surface without Playwright | list-factory / train-ux / efficiency |
| `scripts/verify-live.ps1` | repo scripts | Health + homepage; auto-ensure | AGENTS.md mandatory |
| Checklist markdown | phase dir | QA-03 layout/motion human gate | Phases 30/31/44 |

### Supporting

| Module / File | Purpose | When to Use |
|---------------|---------|-------------|
| `docs/bridge/TEST-PLAN.md` | Case → file map | Append §O v2.1 QA permanent bar |
| `scripts/verify.ps1` | Full route sweep including `/bridge` | Reference only; optional heavy gate |
| `public/css/bridge.css` / `bridge.js` / `bridge.html` | Theater surface under test | Read-only unless red fix |
| Temp roots in tests | Isolation | Never wipe production data dirs |
| Peer CSS reduce patterns | Copy structure | command-center, collect, coverage-dock |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static theater contracts | Playwright e2e | Out of stack; slower; not used in 56/59/60 |
| Checklist for 390/1440 | Percy/Chromatic | No harness; overkill for one page |
| Extend verify-live with `/bridge` | Document-only homepage | CONTEXT requires `/bridge` — need explicit check |
| New meta `tests/bridge-v21-bar.test.js` that only re-requires other files | Dual-tag + TEST-PLAN | Meta re-require adds little; prefer real asserts |
| Full monorepo `npm run verify` as only live gate | verify-live + `/bridge` | Faster agent loop; enough for Filter milestone |

**Installation:** none — zero new npm packages.

---

## Architecture Patterns

### Recommended touch set (Phase 68)

```
tests/
├── bridge-independence.test.js      # KEEP green (QA-01)
├── bridge-accuracy-gold.test.js     # KEEP green (QA-01)
├── bridge-engine.test.js            # KEEP green (QA-01 composition)
├── bridge-train-ux.test.js          # KEEP green (THTR-03 base)
├── bridge-list-factory-ux.test.js   # KEEP green (KILL-03 Save primary base)
├── bridge-efficiency-path.test.js   # KEEP green
├── bridge-learning-metrics.test.js  # KEEP green
├── bridge-brain-*.test.js           # KEEP green
├── bridge-scrub-theater.test.js     # ADD if 64–67 need surface locks
└── fixtures/bridge/gold/            # NEVER delete

docs/bridge/
└── TEST-PLAN.md                     # EXTEND §O v2.1 QA-01..03 map

.planning/phases/68-regression-qa-lock/
├── 68-QA-CHECKLIST.md               # ADD (or SUMMARY section) for QA-03
└── screenshots/                     # OPTIONAL

scripts/
└── verify-live.ps1                  # RUN; optional thin /bridge extend (Option B)
```

### Pattern 1: Milestone regression lock (50 / 54 / 60 family)

1. Inventory permanent bars vs REQUIREMENTS (this RESEARCH).  
2. Add only true gaps (theater contracts, `/bridge` check, checklist, TEST-PLAN §O).  
3. Full `npm test`.  
4. verify-live + `/bridge` 200.  
5. Record pass counts in SUMMARY for drift tracking (Phase 60: 522; research now: **577** pre-theater).

### Pattern 2: Prefer gates-only when green

If after 61–67:
- Theater contracts already dual-tagged in product-phase tests, **and**
- reduced-motion / 44px already greppable, **and**
- suite green  

Then Phase 68 Plan 01 is mostly **docs + checklist + ship gate** (Phase 60 Plan 02 style). Only write new tests for **missing** greppable locks.

### Pattern 3: Theater contract file (v2.1)

Single `bridge-scrub-theater.test.js` with `QA-03 (v2.1)` / FEED / KILL / THTR titles; static only; optional pure helper units.

### Pattern 4: Live gate separate from unit suite

`npm test` never starts HTTP. Final task: verify-live then `/bridge`.

### Pattern 5: Disambiguated QA titles

Always `QA-0N (v2.1): …` for new permanent-bar packaging tests. Never overwrite `TEST-0N (v2.0)` or v1.7/v1.8 titles.

### Anti-Patterns to Avoid

- Re-implementing independence, gold, or engine Type scorer “while locking”  
- Deleting gold fixtures or independence suite  
- Overwriting v1.7 / v1.8 / v2.0 TEST titles  
- Claiming QA-02 from homepage alone without `/bridge`  
- Claiming QA-03 from `phuglee-a11y.css` alone without FEED/KILL/THTR paths  
- Playwright / new framework  
- Wiping runtime data stores  
- Product scope creep (new desk features in Phase 68)  
- Inventing feed DOM IDs before 64–67 ship  

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Independence proof | New push mocks | Existing independence + IND-04 | Already permanent |
| Gold accuracy | New fixture framework | `bridge-accuracy-gold.test.js` | Phase 57/60 bar |
| Theater UI lock | Playwright | Static HTML/CSS/JS contracts | Project standard |
| Live health | Ad-hoc curl only | `verify-live.ps1` + `/bridge` check | Auto-ensure + AGENTS |
| Reduced-motion | Custom JS polyfill tests | CSS `@media (prefers-reduced-motion)` + static assert | Peer pattern |
| 390 overflow CI | Headless browser farm | Checklist + optional console scrollWidth | No harness |
| New test runner | Jest/Vitest | `node:test` | package.json CI |

**Key insight:** Unit/phase suites already prove engine truth. Phase 68 freezes the **composed v2.1 bar** so future work cannot re-couple Analyze, drop gold, ship dead server, or regress theater a11y/layout.

---

## Common Pitfalls

### Pitfall 1: Confusing TEST-* milestone IDs

**What goes wrong:** Planner renames v1.7 description-only TEST-01 thinking it is independence.  
**How to avoid:** New titles use `QA-0N (v2.1)`; leave all prior TEST titles.  
**Warning signs:** Focused `TEST-01` runs wrong semantic.

### Pitfall 2: QA-01 = independence only

**What goes wrong:** Ship with gold or brain red because only independence was re-run.  
**How to avoid:** Full `npm test` is the QA-01 gate; quick bar is diagnostic only.

### Pitfall 3: QA-02 without `/bridge`

**What goes wrong:** verify-live green, Filter route broken (static 404 / server map).  
**How to avoid:** Explicit `/bridge` 200 in ship gate (Option A or B).

### Pitfall 4: Theater tests written before hooks exist

**What goes wrong:** Asserts invent `#bridge-scrub-feed` that product never shipped → permanent red or false green on wrong string.  
**How to avoid:** Inventory 64–67 VERIFICATION/SUMMARY strings first; gates-only if product phases already added contracts.

### Pitfall 5: Treating checklist as optional when CSS cannot prove layout

**What goes wrong:** QA-03 claimed from a single `prefers-reduced-motion` match while 390 overflows.  
**How to avoid:** Checklist is part of success criteria for overflow + tap targets when not automated.

### Pitfall 6: Product scope creep in lock phase

**What goes wrong:** “While we’re here” desk polish in Phase 68.  
**How to avoid:** `files_modified` = tests + docs + optional verify-live; product only if a lock fails.

### Pitfall 7: Wiping runtime data

**What goes wrong:** Operator lists/brain destroyed during “cleanup.”  
**How to avoid:** Temp roots only; never delete `data/filter-lists/` or `data/bridge-brain/`.

### Pitfall 8: Blocking node server in agent shell

**What goes wrong:** Server dies when Job Object ends; false verify failures.  
**How to avoid:** restart/ensure/verify-live only.

---

## Code Examples

### Existing permanent bar titles (keep)

```js
// tests/bridge-independence.test.js
// TEST-01 (v2.0): already_imported hard-drop off by default
// IND-01/02 / TEST-01 (v2.0): write paths ban Analyze push strings

// tests/bridge-accuracy-gold.test.js
// TEST-02 (v2.0): gold ACC fixtures remain under tests/fixtures/bridge/gold
// ACC-01 / TEST-02 (v2.0): gold keep-distress-mixed …

// tests/bridge-train-ux.test.js
// isBridgeAdmin true only for exact session user admin
// bridge train wrap exists and is hidden by default
```

### TEST-PLAN §O sketch (append before Execution order)

```markdown
## O. v2.1 permanent regression bar (QA-01..03)

| ID | Case | Expected | Auto |
|----|------|----------|------|
| QA-01 (v2.1) | v1.6–v2.0 independence / gold / brain / processUpload locks | Full suite green | ✓ `npm test` (+ independence, gold, engine, brain, train, list, LRN, EFF files) |
| QA-02 (v2.1) | Live server after milestone | health + home + /bridge 200 | ✓ `scripts/verify-live.ps1` + `/bridge` check |
| QA-03 (v2.1) | Theater a11y/layout | reduced-motion FEED/KILL/THTR; 44px CTAs; 390/1440 no overflow | ✓ theater static tests + phase checklist |
```

### Reduced-motion CSS pattern (peer — implement in product phases, lock in 68)

```css
/* Peer pattern: public/css/command-center.css etc. */
@media (prefers-reduced-motion: reduce) {
  .bridge-scrub-feed /* actual selectors from 64 */,
  .bridge-kill-report /* actual from 65 */,
  .bridge-train-theater /* actual from 66 */ {
    animation: none;
    transition: none;
  }
}
```

### Ship gate (PowerShell)

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
$b = Invoke-WebRequest -Uri "http://127.0.0.1:3000/bridge" -UseBasicParsing -TimeoutSec 8
if ($b.StatusCode -ne 200) { exit 1 }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ad-hoc smoke after Filter work | Named permanent bars + regression lock phases | 50 / 54 / 60 | QA-01 packaging model |
| Independence by convention | `TEST-01 (v2.0)` dual-tags + IND-04 | Phase 60 | No-push + already_imported locked |
| Gold as research fixtures | Gold in `npm test` forever | Phase 57/60 | TEST-02 bar |
| Homepage-only live check for Filter | verify-live + explicit `/bridge` for milestone | Phase 44 habit; formalize in 68 | QA-02 |
| Motion without a11y path | `prefers-reduced-motion` on theater | v2.1 design bible + 64–66 | QA-03 FEED-02 etc. |
| Cross-app brand audit tables | Phase 31 AUDIT.md | v1.3 | Checklist template for 390/1440 |

**Deprecated/outdated:**
- `lib/bridge-analyzer-push.js` — must stay gone  
- Default Analyze-index hard-drop — must stay opt-in only  
- Equal peer Train/Kept/Brain as default when open groups exist — theater must not regress to that  
- Claiming Filter “live” without verify-live  

---

## Open Questions

1. **Extend verify-live.ps1 with `/bridge` (Option B) vs Plan-only check (Option A)?**  
   - What we know: CONTEXT wants `/bridge` + homepage; script today is health+home.  
   - **Recommendation:** Option A for minimal risk; Option B if user wants AGENTS single command forever.

2. **One plan or two?**  
   - What we know: Phase 60 used packaging then ship gate.  
   - **Recommendation:** 2 plans (01 contracts/docs/checklist, 02 suite+live); compress to 1 if theater contracts already landed green in 64–67.

3. **Where does checklist live?**  
   - **Recommendation:** `68-QA-CHECKLIST.md` if multi-plan; else SUMMARY “Human verification” section (Phase 44 style). Screenshots optional.

4. **Will suite stay at 577?**  
   - No — 61–67 and theater tests will raise count. SUMMARY records post-phase exact count; do not force 577.

5. **Product phases may already add dual-tagged FEED/KILL/THTR tests — then what?**  
   - Prefer gates-only: Phase 68 greps those titles into TEST-PLAN §O and does not duplicate.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include this section for VALIDATION.md generation.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick bar | `node --test tests/bridge-independence.test.js tests/bridge-accuracy-gold.test.js` |
| Theater bar | `node --test tests/bridge-scrub-theater.test.js` (when added) |
| Full suite | `npm test` |
| Live gate | `scripts/verify-live.ps1` + `/bridge` 200 |
| Layout/motion | `68-QA-CHECKLIST.md` (or SUMMARY) |
| Estimated runtime | ~5–20s suite + live; checklist manual ~10–15 min |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| QA-01 | Independence no-push + already_imported | static + e2e | `node --test tests/bridge-independence.test.js` | ✅ |
| QA-01 | Gold ACC keep/deny/water/type | e2e process | `node --test tests/bridge-accuracy-gold.test.js` | ✅ |
| QA-01 | Type/format/water processUpload | e2e process | `node --test --test-name-pattern="IND-04\|GATE-\|COL-\|water\|TEST-0" tests/bridge-engine.test.js` | ✅ |
| QA-01 | Brain / train / LIST / LRN / EFF | unit + static | covered by `npm test` | ✅ |
| QA-01 | Full suite green | suite | `npm test` | ✅ |
| QA-02 | health + homepage | smoke live | `scripts/verify-live.ps1` | ✅ script |
| QA-02 | `/bridge` 200 | smoke live | Invoke-WebRequest `/bridge` or verify.ps1 routes | ⚠️ not in verify-live |
| QA-03 | FEED reduced-motion | static CSS/JS | theater test pattern | ❌ pending 64 |
| QA-03 | KILL hierarchy + Save primary | static | theater + list-factory | partial ✅ Save |
| QA-03 | THTR admin gate | static + vm | train-ux (+ theater if pivot IDs) | ✅ base / ⚠️ theater pivot pending 66 |
| QA-03 | 390/1440 no overflow | checklist | human checklist | ❌ template to add |
| QA-03 | CTAs ≥ 44px | CSS assert and/or checklist | theater test + checklist | ❌ pending product CSS |

### Sampling Rate

- **Per task commit:** quick permanent bar (independence + gold) if packaging tests  
- **Per wave merge:** `npm test`  
- **Phase gate:** Full suite green + verify-live + `/bridge` 200 + QA-03 checklist complete  
- **Max feedback latency:** ~120s automated; checklist same session  

### Wave 0 Gaps

- [ ] After 64–67: inventory theater DOM/CSS hooks for contract tests  
- [ ] Add `tests/bridge-scrub-theater.test.js` **or** confirm product-phase tests already dual-tag FEED/KILL/THTR  
- [ ] Append `docs/bridge/TEST-PLAN.md` §O v2.1 QA permanent bar  
- [ ] Ship-gate `/bridge` 200 (Option A or B)  
- [ ] Create QA-03 checklist artifact  
- [ ] Framework install: **none**  
- [ ] Missing v1.6–v2.0 suites: **None** — already in `npm test`  

### Suggested plan shape (for planner)

| Plan | Wave | Intent | Primary files |
|------|------|--------|---------------|
| **68-01** | 1 | Permanent bar packaging: theater contracts as needed + TEST-PLAN §O + QA checklist template | `tests/bridge-scrub-theater.test.js` (if needed), `docs/bridge/TEST-PLAN.md`, `68-QA-CHECKLIST.md` |
| **68-02** | 2 | Ship gate: full `npm test` + verify-live + `/bridge` 200 + checklist filled | SUMMARY / VERIFICATION evidence only if green |

If compressed to **1 plan:** packaging + suite + live + checklist in one autonomous plan (still two task groups).

---

## Sources

### Primary (HIGH confidence)

- `68-CONTEXT.md` locked gates + discretion  
- `.planning/REQUIREMENTS.md` QA-01..03; `.planning/ROADMAP.md` Phase 68  
- `.planning/v2.1-FILTER-SCRUB-THEATER.md` D6 verify + reduced-motion DO  
- Phase 60: `60-RESEARCH.md`, `60-01-PLAN.md`, `60-02-PLAN.md`, `60-VERIFICATION.md` (packaging + ship gate template)  
- Live tree: independence / gold / engine / train-ux / list-factory / efficiency / learning-metrics / brain tests  
- `docs/bridge/TEST-PLAN.md` §N v2.0 permanent bar  
- `scripts/verify-live.ps1`, `scripts/verify.ps1` (routes include `/bridge`)  
- `AGENTS.md` live + no-wipe rules  
- Research runs 2026-07-10: full suite **577/0**; permanent bar packs green; bridge.css no reduced-motion yet  

### Secondary (MEDIUM confidence)

- Phase 30/31 checklists and AUDIT.md for a11y/cross-app table pattern  
- Phase 44 SUMMARY manual UAT + `/bridge` 200 practice  
- Peer CSS `prefers-reduced-motion` / `min-height: 44px` on command/collect/coverage  
- Phase 50/54 regression-lock research family  

### Tertiary (LOW confidence)

- Exact DOM IDs for feed/report/theater after 61–67 (not shipped at research time — re-inventory at plan/execute)  
- Whether product phases will pre-land dual-tagged tests (prefer gates-only if they do)  

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Permanent bar inventory | HIGH | Files grepped; suite 577/0; Phase 60 packaging verified in tree |
| Theater contract method | HIGH | Matches list-factory / train-ux / efficiency static patterns |
| verify-live + `/bridge` gap | HIGH | Script read; verify.ps1 contrast confirmed |
| QA-03 checklist pattern | HIGH | Phase 30/31/44 artifacts exist |
| Exact post-61–67 hooks | MEDIUM | Product phases not executed at research time |
| Plan count 1 vs 2 | MEDIUM | Discretion; 2 preferred |

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (30 days — re-verify pass counts and theater hooks after 61–67)

**Baseline to beat / keep:**

| Metric | Value (research time) |
|--------|------------------------|
| Full suite | **577** pass / 0 fail (pre-theater product) |
| Independence + gold packaging | `TEST-01 (v2.0)` / `TEST-02 (v2.0)` present |
| Live | health=200 home=200 via verify-live; `/bridge` to assert at ship |
| Theater reduced-motion in bridge.css | **not yet** — lock after 64–66 |

---

*Phase: 68-regression-qa-lock*  
*Research completed: 2026-07-10*  
*Ready for planning: yes (depends on 61–67 for theater hook strings; permanent-bar gates can be planned now)*
