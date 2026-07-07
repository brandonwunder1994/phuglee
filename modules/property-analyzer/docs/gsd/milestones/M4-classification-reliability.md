# M4 — Classification Reliability Overhaul (v1.5)

> **Status:** `complete`  
> **Created:** 2026-06-30  
> **Base:** v1.4 shipped (78/78 tests, cyber UI complete)  
> **Scope:** Classification & decision layer only — **not** UI reskin. Backend save/tier persistence hooks preserved.

---

## Goal

Make distressed-property detection **accurate, consistent, and trustworthy** while keeping API costs low:

1. **Street View first** — default for every property  
2. **Satellite only when needed** — no Street View, blurred, or home not visible  
3. **Use cached satellite** when already paid for — no redundant API calls  
4. **Needs Review** when both views still can't classify  
5. **Fix the decision layer** — prompts + tier rules, not replace Gemini vision

**Audit:** `.planning/v1.5-CLASSIFICATION-AUDIT.md`  
**Architecture:** `.planning/codebase/ARCHITECTURE.md`  
**Concerns:** `.planning/codebase/CONCERNS.md`

---

## Operating model (locked for this milestone)

```
Street View (default, cheap)
    ↓
Can we see the home clearly?
    NO  → satellite (API only if not cached)
    ↓
Still unclear?
    → Needs Review (don't guess distressed or well-maintained)
```

**Explicitly out of scope:** Running satellite on every property.

---

## Execution order

| Order | ID | Item | Depends on | Phase |
|-------|----|------|------------|-------|
| 1 | M4-01 | Imagery routing — street-first, satellite-on-demand | — | 21 |
| 2 | M4-02 | Prompt de-bias — observe signals, don't default to well-maintained | — | 21 |
| 3 | M4-03 | Tier engine rescope — stop silent score downgrades | M4-02 | 21 |
| 4 | M4-04 | Confidence scoring + review routing | M4-01, M4-03 | 22 |
| 5 | M4-05 | Blurred / obstructed / unavailable handling | M4-01 | 22 |
| 6 | M4-06 | Expand tier review queue (low-confidence lane) | M4-04 | 22 |
| 7 | M4-07 | Golden-set regression + review metrics | M4-03 | 23 |
| 8 | M4-08 | Learned-brain asymmetry + distress promotion rules | M4-03 | 23 |
| 9 | M4-09 | 100k-scale cache policy + re-tier without re-vision | M4-01 | 24 |
| 10 | M4-10 | Classification smoke + precision/recall report | M4-07 | 24 |

---

## Items

### M4-01 — Street-First Imagery Routing

**Status:** `done`  
**Priority:** P0

**Why:** Satellite fusion code exists but fallback triggers are incomplete. Blurred/obstructed Street View does not consistently escalate to satellite.

**What it fixes:** Properties with bad Street View get a second chance via satellite (cached first). API only called when cache miss.

**Key files:**
- `public/js/app.js` — `processAddress`, `finalizeStreetAnalysis`
- `imagery-cache.js`, `property_imagery/`
- `routes/maps.js` — `/api/property-imagery`, `/api/satellite-base64`

**Success criteria:**
- [ ] Street View attempted first on every scan
- [ ] Satellite API called only when: SV absent, AI marks blurred/unavailable/obstructed, or SV fetch fails
- [ ] Cached `satelliteClassification` reused when present — no duplicate API call
- [ ] `usedSatellite` and `qualityFlags` accurately reflect path taken
- [ ] Tests for routing decision matrix (≥8 cases)

---

### M4-02 — Prompt De-Bias (Observation vs Decision)

**Status:** `done`  
**Priority:** P0

**Why:** Prompts instruct Gemini to be "CONSERVATIVE" and "prefer well_maintained when uncertain" — systematic missed distress.

**What it fixes:** AI reports visible signals objectively; tier engine applies business rules.

**Key files:**
- `public/js/config.js` — `buildD4DIndicatorGuide`, `buildD4DStreetScoringGuide`, `buildAnalysisPrompt`
- `public/js/scan.js` — `buildStaticTierRules`

**Success criteria:**
- [ ] Remove "prefer well_maintained when uncertain" language
- [ ] Prompts require listing all visible moderate+ signals even on otherwise normal homes
- [ ] `lead_tier` in JSON still accepted but tier engine remains source of truth
- [ ] Document prompt change in phase summary for regression comparison

---

### M4-03 — Tier Engine Rescope

**Status:** `done`  
**Priority:** P0  
**Depends on:** M4-02

**Why:** `score >= 6 && !looksVisuallyDistressed` silently demotes to well_maintained — misses distress when combos aren't tagged.

**What it fixes:** Downgrade only with explicit manicured proof or high-confidence maintained signals; borderline → review.

**Key files:**
- `lib/tier-engine.js` — `computeLeadTier`, `looksVisuallyDistressed`
- `lib/result-classify.js`
- `tests/fixtures/tier-cases.json`

**Success criteria:**
- [ ] High AI score no longer auto-demoted without manicured exemption or explicit soft-only path
- [ ] Boarded/structural/junk combos still force distressed (no regression)
- [ ] Fixture cases updated: false-negative cases added, conservative downgrade cases revised
- [ ] `npm test` passes; server/client tier parity holds

---

### M4-04 — Classification Confidence + Routing

**Status:** `done`  
**Priority:** P1  
**Depends on:** M4-01, M4-03

**Why:** Gemini returns `confidence` but it doesn't gate review or auto-accept.

**What it fixes:** High confidence auto-classifies; low confidence → tier review or needs review.

**Key files:**
- `lib/result-classify.js` — `computeNeedsReview`
- `public/js/imagery.js` — review mode entry
- `public/js/session.js` — tier counts

**Success criteria:**
- [ ] `classificationConfidence` field on records (composite of street/sat confidence, qualityFlags, signal agreement)
- [ ] Thresholds documented and tunable (default: <65 → review lane)
- [ ] Filter/count for low-confidence properties in UI (minimal — uses existing review infrastructure)
- [ ] Tests for routing thresholds

---

### M4-05 — Blurred / Obstructed / Unavailable Split

**Status:** `done`  
**Priority:** P1  
**Depends on:** M4-01

**Why:** `unavailable` and `blurred` conflated; Gemini failures lumped with true blur.

**What it fixes:** Clear buckets — retry vs satellite vs review vs blurred list.

**Key files:**
- `lib/result-classify.js` — `isBlurredImagery`, `inferCategory`
- `public/js/config.js` — `buildNeedsReviewResult`
- `public/js/app.js` — `migrateImageryFailuresToBlurred`

**Success criteria:**
- [ ] `imageryQuality` or equivalent distinguishes: ok / degraded / unusable
- [ ] Transient Gemini failure → retry or review, not permanent blurred
- [ ] True blur → satellite attempt (if not cached) before blurred bucket
- [ ] Review pages unchanged structurally; blurred list behavior preserved

---

### M4-06 — Tier Review Queue Expansion

**Status:** `done`  
**Priority:** P1  
**Depends on:** M4-04

**Why:** Review queue today is mostly land-vs-home; tier mistakes require manual spot-check.

**What it fixes:** Low-confidence and borderline distress (score 5–7 + one moderate flag) surface in review.

**Key files:**
- `public/js/imagery.js` — `openReviewMode`, filters
- `public/js/review.js` — `getFilteredResults`
- `public/index.html` — sidebar review buttons (if needed)

**Success criteria:**
- [ ] New filter or review kind: low-confidence tier (optional alongside existing tier + needs_review modes)
- [ ] Keyboard shortcuts 1–5 unchanged for existing flows
- [ ] `reviewStats` tracks low-confidence reviews separately

---

### M4-07 — Golden-Set Regression

**Status:** `done`  
**Priority:** P2  
**Depends on:** M4-03

**Why:** Rule changes need replay benchmark; currently "change rule and hope 10k leads still work."

**What it fixes:** Script replays saved audit JSONL + review-corrected addresses through tier engine.

**Key files:**
- `routes/gemini.js` — audit export
- `scripts/` — new golden-set runner
- `tests/fixtures/` — golden cases from review corrections

**Success criteria:**
- [ ] `npm run test:golden` (or equivalent) replays ≥50 fixture records
- [ ] Reports tier changes vs baseline when rules change
- [ ] Document how to add addresses from review corrections

---

### M4-08 — Learned Brain — Distress Promotion Path

**Status:** `done`  
**Priority:** P2  
**Depends on:** M4-03

**Why:** Learned rules can promote well_maintained easily; distress promotion guarded harder — asymmetric for false negatives.

**What it fixes:** User corrections that identify missed distress propagate as aggressively as false-positive reductions.

**Key files:**
- `public/js/scan.js` — `applyLearnedTierRules`, `captureCorrectionEvent`
- `lib/learned-brain.js`

**Success criteria:**
- [ ] Approved distress-promoting rules apply without over-blocking
- [ ] `never_when_indicators` still protects boarded/structural
- [ ] Tests for rule application symmetry

---

### M4-09 — Scale Policy (100k leads)

**Status:** `done`  
**Priority:** P2  
**Depends on:** M4-01

**Why:** Future uploads must not 2× API cost; re-tiering on rule changes should not re-call Gemini.

**Key files:**
- `imagery-cache.js`
- `public/js/app.js` — `recalibratePropertyScores`
- `scripts/migrate-imagery.js`

**Success criteria:**
- [ ] Documented cache-first policy for satellite
- [ ] `recalibratePropertyScores` re-tiers from saved indicators without vision re-call
- [ ] Cost estimate: API calls per 1k leads documented in phase summary

---

### M4-10 — Classification Smoke + Metrics

**Status:** `done`  
**Priority:** P2  
**Depends on:** M4-07

**Why:** Productization requires measurable accuracy claims.

**Key files:**
- `.planning/phases/24-classification-metrics/`
- Review correction exports

**Success criteria:**
- [ ] Manual smoke log: street OK → distressed; street bad → satellite; both bad → review
- [ ] False negative / false positive rates from `tierCorrections` reported
- [ ] `npm test` 78+ passing at milestone close

---

## GSD phases (continues from v1.4 phase 20)

| Phase | Name | Items | Status |
|-------|------|-------|--------|
| 21 | Street-First Routing + Decision Fix | M4-01, M4-02, M4-03 | complete ✓ |
| 22 | Confidence + Imagery Edge Cases | M4-04, M4-05, M4-06 | complete ✓ |
| 23 | Regression + Learning Loop | M4-07, M4-08 | complete ✓ |
| 24 | Scale + Metrics | M4-09, M4-10 | complete ✓ |

**Plans:** `.planning/phases/21-*` through `24-*` (created at plan-phase)

---

## Constraints

- **Street View default** — satellite API only on documented triggers
- **Use imagery cache** — prefer stored satellite over new fetch
- **Keep review pages** — extend, don't replace
- **No UI milestone** — minimal filter/badge hooks only
- **`npm test` must pass** after every phase
- **No breaking session schema** — additive fields only (e.g. `classificationConfidence`)

---

## Out of scope

| Item | Reason |
|------|--------|
| Satellite on every property | User cost constraint |
| Replace Gemini / new vision model | Build on existing strength |
| React migration | Unrelated |
| Cyber UI changes | v1.4 complete |
| New paid APIs | Free stack |

---

## Milestone completion

M4 is **done** when all ten items are `done` and:

- [ ] Street-first + satellite-on-demand routing verified by tests + smoke log
- [ ] Distressed detection improved on golden set (FN rate down vs baseline)
- [ ] Confidence routes uncertain leads to review
- [ ] `npm test` passes (78+ tests)
- [ ] `.planning/v1.5-CLASSIFICATION-AUDIT.md` findings addressed or explicitly deferred with reason

---

## Progress log

| Date | Item | Event |
|------|------|-------|
| 2026-06-30 | M4 | Milestone created from classification audit + user direction (street-first, satellite on-demand) |

---

## Next step

`/gsd:plan-phase 21` — Street-First Routing + Decision Fix