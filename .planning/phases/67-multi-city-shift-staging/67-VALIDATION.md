---
phase: 67
slug: multi-city-shift-staging
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 67 — Validation Strategy

> Multi-city shift desk: client sticky queue, staging inventory HUD, brand-heat success.  
> Preserve list APIs + full post-save reset. No new backend. No data wipes.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` + `node:assert/strict` (static source scans) |
| **Config** | `package.json` `"test": "node --test tests/**/*.test.js"` |
| **Phase suite** | `node --test tests/bridge-shift-staging.test.js` |
| **Regression bundle** | `node --test tests/bridge-shift-staging.test.js tests/bridge-list-factory-ux.test.js tests/bridge-efficiency-path.test.js tests/bridge-independence.test.js tests/bridge-list-store.test.js` |
| **Full suite** | `npm test` |
| **Live gate** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` (required after any `public/` edit) |
| **Estimated runtime** | ~20–40s focused · full suite longer |

---

## Sampling Rate

- **Per task:** phase suite (+ touched carry suites)
- **Per wave / plan:** regression bundle above
- **Phase gate (67-03 Task 3):** regression bundle + `npm test` preferred + verify-live
- **Max feedback latency:** ~90s targeted

---

## Requirements → Locks

| Req | Behavior | Automated lock | Manual |
|-----|----------|----------------|--------|
| **SHIFT-01** | Sticky session queue; post-save next-city one-click feel; full reset kept | `SHIFT-01:` in `bridge-shift-staging.test.js` + LIST reset slice in `bridge-list-factory-ux.test.js` | Multi-city save A→B same state |
| **SHIFT-02** | Staging inventory HUD (counts, type heat, ready/download); actions/APIs preserved | `SHIFT-02:` HUD mount + action data-actions + download-all IDs | HUD numbers match table after two saves |
| **SHIFT-03** | Ember/gold flash not green SaaS; Download this list click-only | `SHIFT-03:` CSS heat / no green + EFF flash download + no auto-dl in reset | Visual: flash is gold/ember |

---

## Per-Plan Verification Map

| Plan | Wave | Req | Automated | Status |
|------|------|-----|-----------|--------|
| **67-01** | 1 | SHIFT-03 | `node --test tests/bridge-shift-staging.test.js tests/bridge-list-factory-ux.test.js tests/bridge-efficiency-path.test.js` + verify-live | ⬜ |
| **67-02** | 2 | SHIFT-02 | same + HTML/JS HUD markers | ⬜ |
| **67-03** | 3 | SHIFT-01 | full phase suite + independence + list-store + verify-live (+ `npm test`) | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red*

---

## Wave 0 / New Tests

- [ ] `tests/bridge-shift-staging.test.js` created in **67-01** (SHIFT-03 first; 02/01 append)
- [ ] Existing GREEN forever:
  - [ ] `tests/bridge-list-factory-ux.test.js` — full `resetImportAreaAfterSave` isolation + flash anchors
  - [ ] `tests/bridge-efficiency-path.test.js` — Download this list + no auto-download + no Analyze push
  - [ ] `tests/bridge-independence.test.js` — save under filter-lists only
  - [ ] `tests/bridge-list-store.test.js` / API handlers — CRUD + download-all (no schema change)

### Must stay true (anti-regression)

| Lock | Signal of failure |
|------|-------------------|
| Full reset | Keep `lastResult` / `selectedCity` after save |
| No auto-download | `downloadSavedList(` inside reset body |
| No Analyze push | Banned CTA strings or push module |
| No list wipe | Queue clear calling `DELETE /api/bridge/lists` |
| No new backend | `/api/bridge/shift` appears |
| Heat not green | Flash CSS still `rgba(120, 180, 140` / `#9fd4a8` |

---

## Manual-Only Verifications

| Behavior | Req | Why manual | Instructions |
|----------|-----|------------|--------------|
| Multi-city shift loop | SHIFT-01 | Browser session + eyes | State TX → City A process → Save → heat flash + queue chip → City B one select → process → Save → two chips / HUD ≥2 lists |
| Inventory HUD accuracy | SHIFT-02 | Visual aggregation | Compare HUD lists/records/Ready vs table rows |
| Flash heat color | SHIFT-03 | Visual | Confirm ember/gold island, not green |
| Session clear ≠ data wipe | SHIFT-01 | Destructive check | If “Clear shift strip” exists, click it → lists table still has rows; server lists remain |
| Rename / CSV / delete / download-all | SHIFT-02 | Click path | Each action still works after HUD/queue chrome |

---

## Live / Data Safety

```powershell
# From distress-os root after public/ edits:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Must exit 0 (health + homepage 200). Restart only via scripts\restart.ps1 if needed.
```

**Never:** wipe `data/filter-lists/`, `data/bridge-brain/`, or auto-delete lists after download.

---

## Validation Sign-Off

- [ ] All plans have `<automated>` verify
- [ ] SHIFT-01–03 covered in `bridge-shift-staging.test.js`
- [ ] LIST/EFF/IND regression bundle green
- [ ] verify-live green after public work
- [ ] No new npm packages
- [ ] `nyquist_compliant: true` (static + live sampling)

**Approval:** plans written — ready for execute (`/gsd:execute-phase 67` or plan-by-plan)
---

*Phase: 67-multi-city-shift-staging*  
*Validation written: 2026-07-10*
