# Land Desk Phase 3 — Land Comp Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a Land Vault lead, run **Land Comp** (auto via RealEstateAPI in disclosure states, or manual paste) to set lot FMV + report, then recompute LAO — never house ARV Comping Rules.

**Architecture:** New `lib/leads-platform/land/run-land-comp.js` pulls REAPI PropertyComps/Detail, scores candidates with land rules (lot size, distance, recency, land-like use, priced solds), computes FMV (median price or $/acre × subject acres), writes `landUnderwriting` + `landCompingReport`. Manual path when ND or thin market. Land Vault drawer gets Comp button + report UI.

**Tech Stack:** Existing REAPI client (`comping/reapi-client.js`), ND list, land `lao.js`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-15-land-desk-design.md` § Phase 3

## Global Constraints

- Never use house Comping Rules / renovated SFR ARV as land FMV.
- Never save vendor AVM as `landFmv`.
- 10/15/20 sanity display-only; if FMV ≫ sell band → confidence soft-warn / walk note (do not auto-overwrite).
- House `POST /api/leads/:id/comp` stays land-blocked (`LAND_OUT_OF_SCOPE`); land uses `/land-comp`.
- Preserve land underwriting + landCompingReport on analyzer sync.
- After UI: `verify-live.ps1` + `verify-mobile.ps1 -Pages "/land-vault"`.

---

## File map

| File | Role |
|------|------|
| `lib/leads-platform/land/comping-rules.js` | Score one lot candidate |
| `lib/leads-platform/land/fmv.js` | Median FMV / $/acre FMV |
| `lib/leads-platform/land/run-land-comp.js` | Auto orchestrator |
| `lib/leads-platform/land/manual-land-comp.js` | Manual FMV + comps → report |
| `lib/leads-platform/land/lao.js` | Preserve comps/report fields in normalize |
| `lib/leads-platform/comping/reapi-client.js` | Map lotSqft/acres on detail/comps |
| `lib/leads-platform/api.js` | `POST/GET .../land-comp`, `POST .../land-comp/manual` |
| `lib/leads-platform/analyzer-sync.js` | Preserve landCompingReport |
| `public/js/land-vault-app.js` | Comp button + report + manual panel |
| `tests/land-comping.test.js` | Rules + FMV + orchestrator (mock REAPI) |

---

### Task 1: Rules + FMV math

- [ ] Failing tests for lot size band (±40% lotSqft), distance ≤1mi hard / ≤0.5 preferred, recency ≤24mo, price>0, land-like type boost
- [ ] `computeLandFmv(subject, scored)` → median included prices; if subject has acres and comps have acres, also compute median $/acre × subject acres and pick primary method with note
- [ ] Implement + commit

### Task 2: Auto + manual orchestrators + API

- [ ] `runLandAutoComp(lead, { reapi })` — ND → needsManual; concentric PropertyComps; score; FMV; patch underwriting method=engine; attach report
- [ ] `buildManualLandCompReport({ lead, landFmv, comps, note, sanity })` — min 2 priced lot comps
- [ ] API routes merge onto lead + recompute LAO via `normalizeLandUnderwriting`
- [ ] Tests with mock reapi + commit

### Task 3: Land Vault UI

- [ ] Comp button in drawer; show report (FMV, confidence, included comps); manual panel for ND/thin
- [ ] On success refresh LAO panel with new FMV
- [ ] verify-live + verify-mobile + commit
