---
phase: 62
slug: city-dossier
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for CITY-01 (ops dossier) and CITY-02 (demoted no-list outcomes).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Quick run command** | `node --test tests/bridge-city-dossier.test.js tests/bridge-api-handlers.test.js` |
| **Full suite command** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |
| **UI route** | `http://127.0.0.1:3000/bridge` |
| **Estimated runtime** | ~5–20s targeted; full suite ~30–90s; live ~few seconds |

---

## Sampling Rate

- **After every task commit:** quick run above (dossier static + history/city-outcome handlers)
- **After every plan wave:** `npm test`
- **After any `public/` edit:** `scripts\verify-live.ps1` exit 0 before claiming live
- **Before `/gsd:verify-work`:** Full suite green + verify-live + manual CITY criteria
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | CITY-01, CITY-02 | static unit | `node --test tests/bridge-city-dossier.test.js` | ❌ Wave 0 | ⬜ pending |
| 62-01-02 | 01 | 1 | CITY-02 | API handler | `node --test --test-name-pattern="city-outcome\|history" tests/bridge-api-handlers.test.js` | ⚠️ extend | ⬜ pending |
| 62-02-01 | 02 | 2 | CITY-01, CITY-02 | static HTML gate | node -e html markers | ✅ product | ⬜ pending |
| 62-02-02 | 02 | 2 | CITY-01, CITY-02 | static CSS gate | node -e css markers | ✅ product | ⬜ pending |
| 62-02-03 | 02 | 2 | CITY-01, CITY-02 | static + suite + live | `node --test tests/bridge-city-dossier.test.js` + `npm test` + verify-live | ❌→✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CITY-01 | History API returns cityId + history | API | history cases in `bridge-api-handlers.test.js` | ✅ |
| CITY-01 | Lists summaries include cityId / recordCount / status | API | lists CRUD in `bridge-api-handlers.test.js` | ✅ |
| CITY-01 | Client dossier shell + last scrub + cityId list filter | static | `tests/bridge-city-dossier.test.js` | ❌ Wave 0 |
| CITY-01 | Eager history on city select (not modal-only) | static | dossier test scans `onCityChange` / `loadCityDossierHistory` | ❌ Wave 0 |
| CITY-02 | Outcome POST five statuses + notes + water_shutoff | API | city-outcome cases in handlers test | ⚠️ soft gap → Plan 01 |
| CITY-02 | Radiogroup demoted; drawer collapsed default | static + manual | dossier test + `/bridge` smoke | ❌ Wave 0 |
| CITY-02 | saveCityOutcome payload fields preserved | static | dossier test scans POST body keys | ✅ as-built lock |
| Regression | Independence / accuracy / brain locks | suite | `npm test` | ✅ |
| Regression | Live health | script | `scripts/verify-live.ps1` | ✅ script |

---

## Wave 0 Requirements

- [ ] `tests/bridge-city-dossier.test.js` — CITY-01 dossier DOM/JS contracts; CITY-02 drawer + payload locks (Plan 01 Task 1)
- [ ] Extend `tests/bridge-api-handlers.test.js` — POST `/api/bridge/city-outcome` statuses/notes/water_shutoff (Plan 01 Task 2)
- [ ] Framework install: **none**
- [ ] No new deps; no browser e2e harness required this phase

*Existing infrastructure covers history GET + lists CRUD; city-outcome handler tests are the soft gap.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dossier paints after city select with real session data | CITY-01 | Needs Forge cities + optional history | Open `/bridge` → select state/city → see case-file (last scrub / attaches / staged lists); type cards visible without waiting on slow history |
| Outcome scrap default collapsed | CITY-02 | Visual hierarchy | After city select, five radios **not** full-height wall; click “City replied — no usable list” (or summary) → radios appear → Save still works |
| Rapid city switch no cross-paint | CITY-01 | Race timing | Switch cities quickly; dossier city name/stats match final selection |
| Post-save no ghost dossier | CITY-01 | Reset path | Save list → import area resets → dossier hidden until next city pick |
| other_source notes required | CITY-02 | Tracker rule | Open drawer → Contact another source → Save disabled/error without notes |

---

## Sampling Continuity

| Wave | Plans | Automated gate |
|------|-------|----------------|
| 1 | 62-01 | dossier test file exists (partial RED OK) + city-outcome handlers GREEN |
| 2 | 62-02 | dossier test GREEN + `npm test` + verify-live |

No 3 consecutive tasks without automated verify (each task has `<automated>`).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers MISSING dossier UI contracts + city-outcome soft gap
- [x] No watch-mode flags
- [x] Feedback latency &lt; 90s targeted
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plans aligned 2026-07-10 — execute Wave 0 then implementation
