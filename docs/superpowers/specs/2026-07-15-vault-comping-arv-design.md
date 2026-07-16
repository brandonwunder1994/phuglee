# Design Spec — Vault Comping (Confident ARV)

**Date:** 2026-07-15  
**Product:** Phuglee Distress OS  
**Surface:** `/vault` lead drawer — **Comp** button  
**Depends on:** Leads Platform (`docs/superpowers/specs/2026-07-13-leads-platform-design.md`), Wholesale Brain (`C:\Users\brand\Projects\wholesale brain`)  
**Env:** `REALESTATE_API_KEY`, `REALESTATE_API_BASE` (Railway service `phuglee`)

---

## Problem

Operators open leads in The Vault and still leave Phuglee to run comps (PropStream, Propelio, Zillow). That burns time that should go to seller calls and contracts.

Wholesale Brain is clear: **ARV is not an AVM**. ARV is a conclusion from renovated sold comps under **Comping Rules** (formerly taught as Compmandments — product language is always **Comping Rules**). Today Vault may show enrichment `estARV` / static `comps` when present, but there is no one-click Comping Rules engine, report, or durable save of the underwriting trail.

Non-disclosure states (especially Texas) cannot get reliable sold prices from public-record APIs without MLS. Trial RealEstateAPI credits do **not** include Premium MLS. Propelio has MLS solds in ND states but **no public comps API** we can call.

## Product goal

From a Vault lead, click **Comp** and get a **confident ARV** (or an honest gate when we cannot) with a full report: comps, confidence, pass/fail against Comping Rules — then **persist ARV + comps + report on that lead** so it is always there.

Operators should spend time bringing in contracts and talking to people, not living in comps software — except in ND states where they briefly use Propelio and upload the result.

### Success criteria

1. Disclosure-state lead → Comp → ARV + comps + Comping Rules report saved on the lead without manual spreadsheet work.
2. Non-disclosure lead → Comp → Manual Comp panel → paste ARV/comps + **upload Propelio report file** → same stored shape on the lead.
3. Re-open lead later → ARV, comps, report, and uploaded files still present.
4. Vendor AVM / Zestimate is **never** saved as `estARV`.
5. Low-confidence / no priced solds → no fake confident ARV; UI says what failed.
6. `REALESTATE_API_KEY` server-only; never in browser or git.
7. After UI work: `scripts/verify-live.ps1` and scoped `verify-mobile.ps1` pass before claiming live.

---

## Locked decisions

| Decision | Choice |
|----------|--------|
| Scope v1 | **ARV only** (no repairs, MAO, LAO) |
| Surface | Vault lead drawer only |
| Approach | Thin RealEstateAPI pull + **Phuglee Comping Rules engine** |
| Data provider | RealEstateAPI.com (PropertyComps + Detail/Bulk; Search `ids_only` free scout) |
| Renovated comps | Hybrid: auto-rank likely renovated; flag uncertain; exclude unusable |
| On Comp click | **Save** `estARV` + comps + report on the lead immediately (auto path) |
| Naming | **Comping Rules** everywhere in UI/docs (not Compmandments) |
| ND states | Manual via Propelio; paste ARV/comps; **upload full Propelio report** |
| Propelio API | **None** for v1 — UI-only |
| Premium MLS | Out of scope until approved; do not fake ND ARV without priced solds |

---

## Approaches considered

### 1. Thin pull + Comping Rules engine (chosen)

Server calls RealEstateAPI for subject + sold candidates; Phuglee scores Comping Rules, computes ARV, writes report + fields on lead.

**Pros:** Matches Wholesale Brain; we own confidence; AVM never becomes ARV.  
**Cons:** We maintain rules + geo helpers.

### 2. Trust vendor comps/AVM

**Rejected:** Violates brain; weak pass/fail story.

### 3. Manual-only always

**Rejected for disclosure states:** Fights the “don’t manual-comp” goal. Kept only for ND.

---

## Architecture

```
Vault drawer Comp
        │
        ├─ state ∈ non-disclosure?
        │         YES → Manual Comp panel
        │               (ARV + comps paste + Propelio file upload)
        │               → persist on lead
        │
        └─ NO → Full-stack auto Comp
                  1. Subject PropertyDetail
                  2. Concentric PropertyComps / Search
                  3. OSM road barriers + Street View links
                  4. Comping Rules score each candidate
                  5. ARV from accepted cluster
                  6. Confidence gate
                  7. Persist estARV + comps + compingReport
```

**Code layout (proposed)**

| Path | Role |
|------|------|
| `lib/leads-platform/comping/` | Engine: rules, ARV math, confidence, ND list |
| `lib/leads-platform/comping/reapi-client.js` | Server-only RealEstateAPI client |
| `lib/leads-platform/comping/barriers.js` | OSM / road barrier check |
| `lib/leads-platform/api.js` | Routes: `/comp`, `/comp/manual`, `/comp/report-file` |
| `public/js/vault-app.js` | Comp button, report UI, manual panel, upload |
| `public/css/vault.css` | Comp report / panel styles only |

**Env**

| Variable | Where | Notes |
|----------|-------|--------|
| `REALESTATE_API_KEY` | Railway `phuglee` + local `.env` | Backend/secret key only |
| `REALESTATE_API_BASE` | Default `https://api.realestateapi.com` | Overridable |

Never expose the private key to the browser. Use frontend key only if we add AutoComplete later (optional, not required for Comp).

---

## Comping Rules (engine)

Product name: **Comping Rules**. Derived from Wholesale Brain (Max + Jamil + RJ + Jerry ARV path). 70% rule remains banned elsewhere; irrelevant for ARV-only v1.

### Hard rules (fail → exclude from ARV cluster)

1. **Usable sale price** — Must have a positive sold/close price. `$0` / missing → exclude (common in ND without MLS).
2. **Property type** — Same class (SFR≠condo≠mobile). Mobile only vs mobile; land leads do not use this house ARV path (land Comp out of scope v1 or explicit reject).
3. **Size band** — Prefer ±100 sf; hard-fail beyond ±10% (or ±250 sf if we document that as max fallback for thin markets with confidence penalty).
4. **Beds / baths** — Exact match preferred; hard-fail extreme mismatches (e.g. 2/1 vs 4/3) unless thin-ladder mode with penalty.
5. **Major road / barrier** — Subject→comp geodesic crosses primary/highway (OSM) → hard-fail. If barrier service unavailable → soft-fail + “verify roads” flag (do not silently pass).
6. **Non–arms-length** when detectable → hard-fail.

### Soft rules (penalty / flag; may remain with reduced weight)

7. **Distance (concentric)** — Start 0.25 mi → 0.5 → 1.0. Never skip nearer comps to cherry-pick far ones. Thin ladder: → 5.0 mi then expand time/sf → **low confidence**.
8. **Recency** — Prefer ≤90 days; 0–6 mo good; 6–12 ok with haircut; >12 mo cautious / thin ladder only.
9. **Age** — ~±10 years when possible.
10. **Lot** — Similar size/usability.
11. **Construction / style** — Brick≠frame≠stucco; ranch≠2-story when detectable.
12. **Renovated for ARV** — Rank likely renovated first; flag uncertain; do not use clearly distressed/as-is solds as primary ARV comps.
13. **Actives / DOM** — Actives validate, do not set ARV. If nearby renovated actives median DOM ≥90 → apply **−5%** soft haircut to ARV and tag market soft.
14. **New-construction ceiling** — If ARV > comparable new builds nearby → flag and cap or require medium confidence max.
15. **Street View** — Report includes subject (+ comps) Street View links. Optional operator **block pass/kill** stored on lead; auto path may save ARV without it, but **high confidence** prefers pass recorded when UI supports it.
16. **Basement / untitled ADU** — ≤50% sf credit in adjustments; don’t inflate living sf.
17. **Feature adjustments** (Jamil bands) — bed/bath/garage/pool/traffic by price band before averaging.
18. **Conservative haircut** — Optional ~5–10% safety on final ARV for “high” only when market soft or renovated evidence thin; always disclosed in report.

### Thin-comps ladder (RJ)

If too few survivors after ideal band:

1. Expand radius 0.25 → 0.5 → 1.0 → 5.0 mi  
2. Expand sold window up to ~2 years  
3. Widen sf band for rough $/sf  

Each expansion **lowers confidence**. If still no priced usable comps → **no confident ARV**.

### ARV math

1. Take accepted comps (aim **5–6**, minimum **3** for high confidence).  
2. Apply dollar adjustments to each.  
3. Drop statistical outliers (e.g. trim high/low or IQR).  
4. Compute **trimmed mean or median** of adjusted prices (document chosen method in report).  
5. Apply DOM soft haircut and optional conservative haircut.  
6. Apply new-construction ceiling check.  
7. **Never** set ARV from RealEstateAPI `estimatedValue` / lender AVM / “new construction forecast ARV” product fields — those may appear as **sanity lines only**.

### Confidence levels

| Level | Meaning | Persist `estARV`? |
|-------|---------|-------------------|
| `high` | ≥3 solid renovated-ish comps, close, recent, barriers OK | Yes — primary |
| `medium` | Usable cluster with soft penalties / uncertain reno | Yes — with warning banner |
| `low` | Thin ladder / weak evidence | Save report; `estARV` provisional or null per gate below |
| `manual` | Operator Propelio path | Yes — operator-verified |
| `blocked` | ND auto attempt, or zero priced solds | No auto ARV; force manual |

**Gate:** Auto path with `low` and fewer than 3 priced survivors → do **not** overwrite a prior `high`/`medium`/`manual` ARV without confirm; prefer saving report with `compConfidence: 'blocked'` and message.

### Renovation heuristics (no Premium MLS photos)

Signals for “likely renovated” (score, never absolute):

- Recent sale with flip-like hold period when prior sale exists  
- Cash buyer + quick resale when detectable  
- High $/sf vs neighborhood median of same size band  
- MLS flags when present (`mlsHasPhotos`, sold via MLS, etc.)  

Uncertain → included only with flag; operator can re-run or use manual overlay later.

---

## Non-disclosure states

### Detection

Maintain a canonical list of U.S. non-disclosure states (include **TX** and peers per current real-estate ND list). Lead `state` ∈ list → **manual path**.

### Manual Comp panel (UX)

1. Explain: public-record prices unavailable; use Propelio for MLS solds.  
2. One-click **copy address**; link/open Propelio if we have a stable URL pattern, else instruct open Propelio.  
3. Required: **ARV** (number).  
4. Required: **≥3 comps** rows (address, sold price, sold date, sqft, beds, baths; optional distance/notes).  
5. Required or strongly required: **upload Propelio full comp report** (PDF and/or image).  
6. Optional: short note.  
7. **Save Comp Report** → persist same lead fields as auto, `compSource: 'manual_propelio'`, `compConfidence: 'manual'`.  
8. Optional v1 nicety: run Comping Rules **distance/size/recency flags** on pasted comps (prices trusted from Propelio).

### File upload

- Accept: `application/pdf`, `image/png`, `image/jpeg`, `image/webp` (and optionally zip of same).  
- Max size: **25 MB** per file; allow multiple files if Propelio splits pages.  
- Store on volume under leads catalog, e.g. `data/leads-catalog/comp-reports/{leadId}/` (or under `PDA_DATA_ROOT/leads-catalog/...` in production).  
- Metadata on lead: `compReportFiles: [{ id, filename, mime, size, uploadedAt, path }]`.  
- Serve via authenticated download route (Max/session required); do not public-CDN secrets.  
- **Never wipe** existing operator files as part of deploys or “cleanup.”

### Re-Comp

Re-click Comp with existing data → confirm **Replace existing comps/ARV/report?** then auto or manual flow as appropriate.

---

## Data model (lead extensions)

Existing: `estARV`, `comps[]` (schema already allows comps).

Add / formalize:

```text
estARV: number | null
comps: Array<{
  address, soldDate, price, sqft, beds, baths,
  distanceMi?, yearBuilt?, lotSqft?,
  ruleResults?: Array<{ id, status: 'pass'|'soft'|'fail', detail }>,
  renovation?: 'likely'|'uncertain'|'as_is',
  adjustedPrice?: number,
  includedInArv?: boolean,
  source?: string
}>
compingReport: {
  version: string,
  subject: { ... },
  arv: number | null,
  arvMethod: string,
  confidence: 'high'|'medium'|'low'|'manual'|'blocked',
  source: 'reapi'|'manual_propelio',
  rulesSummary: [...],
  marketTag?: 'soft'|'balanced'|'hot'|null,
  haircuts: [...],
  sanity: { avm?, newConstructionCeiling?, notes: [] },
  generatedAt: ISO string,
  creditsUsed?: number
}
compReportFiles: Array<{ id, filename, mime, size, uploadedAt, path }>
compedAt: ISO string | null
compConfidence: string | null
compSource: 'reapi'|'manual_propelio'|null
compBlockPass?: 'pass'|'kill'|null   // Street View block, optional
```

Analyzer sync must **not** overwrite a newer `compedAt` ARV with stale AVM enrichment (preserve Comp results on merge).

---

## API

All routes: authenticated, Max plan (same Vault gate), server-side only for REAPI.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/leads/:id/comp` | Auto Comp (disclosure). Body optional overrides. Returns report + updated lead fields. |
| `POST` | `/api/leads/:id/comp/manual` | ND/manual: JSON `{ arv, comps[], note? }` |
| `POST` | `/api/leads/:id/comp/report-file` | multipart upload Propelio report |
| `GET` | `/api/leads/:id/comp/report-file/:fileId` | Download stored report |
| `GET` | `/api/leads/:id/comp` | Return last `compingReport` + files metadata |

**Errors**

| Case | Behavior |
|------|----------|
| Missing `REALESTATE_API_KEY` | 503 with clear config message |
| ND state on auto endpoint | 400 → use manual |
| REAPI 401/429 | Surface safe message; no key leak |
| <3 priced comps after ladder | `blocked` / low; no fake ARV |
| Manual missing ARV or <3 comps | 400 validation |
| Upload too large / bad mime | 400 |

**Credit discipline**

- Prefer PropertyComps with Comping Rules–aligned filters.  
- `ids_only: true` for free scouting when useful.  
- Detail Bulk for top candidates only (not entire zip).  
- Cache subject + comps report on lead; avoid re-billing on drawer open (only on Comp click / confirm replace).

---

## Vault UI

### Comp button

- In lead drawer header/actions.  
- Label: **Comp**.  
- If already comped: show ARV chip + “Re-comp”.

### Auto report view

Sections:

1. **ARV** (large) + confidence badge + `compedAt`  
2. **How we got here** — method, haircuts, market tag  
3. **Comping Rules checklist** — pass/soft/fail counts  
4. **Comps table** — included vs excluded; per-rule reasons; renovation flag  
5. **Sanity** — AVM reference (labeled not ARV), new-build ceiling if any  
6. **Street View** — links (+ optional pass/kill)  
7. **Files** — uploaded reports if any  

Match Vault design system (tokens, phuglee-components, desk density). No fake leads. No purple SaaS chrome.

### Manual panel

Wizard-like single panel: address copy, ARV input, comps editor (add row / paste), file dropzone for Propelio report, Save.

---

## Full-stack quality layers (automation depth)

Aligned with “confident without manual comps” in **disclosure** states:

| Layer | v1 ship |
|-------|---------|
| Comping Rules + cluster ARV + report + save | Required |
| Concentric / thin ladder | Required |
| Renovation heuristics + flags | Required |
| Street View links | Required |
| OSM road barrier hard-fail | Required (degrade to soft flag if OSM down) |
| Actives DOM −5% soft | Required when actives fetchable within credit budget |
| Operator Street View pass/kill | Required for **high** confidence stretch goal; medium allowed without |
| Premium MLS photos/remarks | Not on trial — later |
| Vision auto-kill on Street View | Out of scope v1 |
| Propelio API | Out of scope |

---

## Security & ops

1. Rotate any API key ever pasted into chat; store only in Railway / `.env`.  
2. Server-to-server REAPI only (`x-api-key`).  
3. Log credit usage per Comp (no secrets in logs).  
4. Do not commit `.env` or report binaries.  
5. Never wipe `data/leads-catalog/` or `comp-reports/`.

---

## Testing

| Test | Assert |
|------|--------|
| Unit: Comping Rules | Distance, size, recency, barrier, price=$0 exclude |
| Unit: ARV math | Outlier drop, median/trim, haircuts |
| Unit: ND detection | TX → manual path |
| Integration: mock REAPI | Report shape + lead persist |
| Manual upload | File metadata + download auth |
| UI | Comp button, report render, manual panel |
| Live | `verify-live.ps1`; `verify-mobile.ps1` for Vault pages after UI |

Fixtures: disclosure subject with priced solds; ND subject forcing manual; thin market → blocked.

---

## Out of scope (v1)

- Repairs / 90% MAO / LAO  
- Analyze desk Comp button  
- Land Comp pipeline (land brain)  
- Premium MLS / Propelio API integration  
- Treating Norton Instant Offer / AVM average as ARV  
- 70% rule anywhere  

---

## Implementation phases (for planning skill)

1. Schema + store fields + merge rules (preserve Comp over AVM)  
2. REAPI client + Comping Rules engine + ARV + confidence  
3. Barriers (OSM) + Street View links + DOM haircut  
4. API routes + Railway env wiring  
5. Vault UI auto report  
6. ND manual panel + Propelio file upload  
7. Tests + verify-live / verify-mobile  

---

## Open points (resolved in this spec)

| Topic | Resolution |
|-------|------------|
| Compmandments naming | **Comping Rules** |
| ND without MLS API | Manual Propelio + upload report |
| Trial no Premium MLS | Expected; disclosure auto, ND manual |
| Save on click | Yes for auto; Save button for manual |
| Propelio connect | No API — use their software directly |

---

## References

- Wholesale Brain: `BRAIN.md`, `brain/process/02-arv-compmandments.md`, `brain/audits/learning-update-recovered-transcripts.md`, `brain/educators/jamil-damji.md`, `brain/educators/jerry-norton.md`, `brain/educators/rj-bates-cassi.md`  
- RealEstateAPI: PropertySearch, PropertyDetail/Bulk, PropertyComps; Premium MLS separate approval  
- Vault: `docs/superpowers/specs/2026-07-13-leads-platform-design.md`
