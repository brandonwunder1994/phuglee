# Design Spec — Land Desk (Land Vault)

**Date:** 2026-07-15  
**Product:** Phuglee Distress OS  
**Surfaces:** `/land-vault` (customer: **Land Vault** / **Land Desk**), `/vault` renamed to **Home Vault**  
**Depends on:** Leads Platform (`2026-07-13-leads-platform-design.md`), Fund buyers catalog (`public/data/fund-buyers/catalog.json`), Wholesale Brain land doctrine (`C:\Users\brand\Projects\wholesale brain\brain\land\`)  
**Related:** Vault Comping ARV (`2026-07-15-vault-comping-arv-design.md`) — house Comp only; land Comp is this spec  

---

## Problem

Analyze and Filter already surface a lot of **vacant land** (and houses that should be underwritten as dirt). The Vault today parks land on a third tab next to Distressed / Well Maintained, scored with house-style priority, with no land diligence, no LAO math, and no builder/fund match.

Wholesale Brain is explicit: land is the **same arbitrage business** with a **different numbers engine**:

```
Demand (builders?) → 7 Land Checks → land comps → site costs → LAO
```

House Comping Rules / ARV must **never** be the primary path for land. Leaving land inside Home Vault trains operators to treat dirt like a weak house lead — and leaves money on the table (especially teardowns priced as ugly flips).

---

## Product goal

1. **Separate inventories** — Home Vault = houses; Land Vault = vacant lots + teardown-as-land.  
2. **Encode Land Brain** on every land lead: 7-check screen → KEEP/TOSS → fund match → LAO → (later) land comps.  
3. **Feed the desk** from Analyze land, teardown promotions, and Filter tax-delinquent / vacant-lot lists.  
4. **Sell deals** — operator leaves with a dial-ready packet and a contract target, not a vague “it’s land” badge.

### Success criteria

| # | Criterion |
|---|-----------|
| 1 | `/vault` shows **only** `distressed` + `well_maintained`; no Land tab; nav label **Home Vault**. |
| 2 | `/land-vault` shows **only** `land` (+ teardown-promoted land); Max-gated like Vault. |
| 3 | Operator can complete **7 checks + KEEP/TOSS** and see **fund match** without leaving Land Vault. |
| 4 | Operator can enter FMV / site costs / fee and get a **LAO** persisted on the lead. |
| 5 | Later phases: land Comp engine, teardown bridge, Filter→Land preferential ingest. |
| 6 | Never wipe `data/leads-catalog/`, `data/filter-lists/`, or analyzer user sessions. |
| 7 | After UI work: `verify-live.ps1` + scoped `verify-mobile.ps1` pass before claiming live. |

---

## Locked product decisions

| Decision | Choice |
|----------|--------|
| Split inventories | **Yes** — land out of Home Vault |
| Home Vault route | Keep `/vault` (stable bookmarks / Max links) |
| Home Vault name | **Home Vault** (was “The Vault”) |
| Land surface route | **`/land-vault`** |
| Land surface names | Nav: **Land Vault** · In-page desk title: **Land Desk** |
| Catalog store | **One** `data/leads-catalog/` — filter by `leadType` (no second store) |
| Home Vault tabs | All \| Distressed \| Well Maintained (**no Land**) |
| Land Vault tabs | All \| Keep queue \| Toss \| Needs screen \| Fund-shaped (filters, not house types) |
| Max gate | Same Max plan as Home Vault |
| Vault-only user (`matt`) | Allow **both** `/vault` and `/land-vault` (update `phuglee-roles`, `auth-guard`, prod verify) |
| House Comp on land | **Forbidden** — Comp button on land leads opens land path only |
| 70% rule | **Banned** for land and houses |
| 10/15/20 | Land **sanity only** — never replaces sold lot comps |
| Fund match source | Existing Gaia / Leviathan / Blackfin (+ future land boxes) in fund catalog |
| **Spec status** | **LOCKED** 2026-07-15 — audit-backed; ready for implementation plan |

---

## Codebase audit lock (2026-07-15) — do not re-derive

Manual review already publishes land into the **same** catalog. Phase 0 does **not** invent a new Analyze → catalog path. It **routes** existing `leadType=land` rows to Land Vault and **excludes** them from Home Vault.

### End-to-end today

```
Analyze Land bucket (filter vacant) OR Needs Review → key 3
  → reviewLandKeep / applyCategoryFields('vacant_lot')
      category: vacant_lot, leadTier: vacant, score: 0, structureOnLot: false
  → reviewAdvance → markReviewedKey → enqueueVaultPublish
  → POST /api/leads/publish-from-analyzer
  → vaultLeadTypeFromResult(vacant | vacant_lot) → leadType: 'land'
  → reviewStatus: 'approved' immediately (no distressed pending gate)
  → upsertLead → data/leads-catalog/
  → GET /api/leads (leadType=all) → currently shows on /vault All + Land tab
```

| Layer | Land value |
|-------|------------|
| Analyzer category | `vacant_lot` |
| Analyzer tier | `vacant` |
| Review filter | `vacant` (UI label **Land**) |
| Catalog | `leadType: 'land'` |

### Files that already work (leave publish path alone in Phase 0–1)

| File | Role |
|------|------|
| `modules/property-analyzer/public/js/imagery.js` | `reviewLandKeep`, `applyCategoryFields('vacant_lot')` |
| `modules/property-analyzer/public/js/session.js` | `publishReviewedLeadToVault` — accepts `leadTier: 'vacant'` |
| `lib/leads-platform/analyzer-sync.js` | `vaultLeadTypeFromResult` → `'land'`; `shouldPublishAnalyzerResult` |
| `lib/leads-platform/publish.js` | Non-distressed defaults `reviewStatus: 'approved'` |
| `lib/leads-platform/schema.js` | `land` in `LEAD_TYPES`; distressed-only approval rule |

### Gaps that leak land onto Home Vault (must fix in Phase 0)

| Gap | Fix |
|-----|-----|
| No `surface` filter — `leadType=all` includes land | `store.js` + `api.js`: `surface=home\|land` |
| `getMeta()` / facets count land in Home KPIs | Meta scoped by surface |
| Map + export with `all` include land | Inherit surface |
| Land tab on `vault.html` | Remove; rename Home Vault |
| No `/land-vault` page or `config` page map | Add `land-vault.html` + `lib/config.js` route |
| Vault-only paths = `{/vault}` only | Add `/land-vault` for `matt` |
| Deep-link land `leadId` on `/vault` | Redirect to `/land-vault?lead=…` |
| Shell / command palette “The Vault” | Home Vault + Land Vault links |

### Explicit non-changes

- Do **not** stop Analyze from calling `publish-from-analyzer` for vacant keeps.
- Do **not** move land into a second catalog directory.
- Do **not** require a new admin “approve land” step (land stays auto-approved on publish).
- Do **not** change Filter list files when shipping Phase 0–1.

---

## Approaches considered

### A. Separate route + shared catalog (chosen)

- `/vault` = Home Vault (houses)  
- `/land-vault` = Land Desk (land)  
- Same `lib/leads-platform` store/API with `leadType` filters  

**Pros:** Clear operator mental model; reuse auth, store, export, dossier patterns; no data migration.  
**Cons:** Two HTML/CSS/JS surfaces to maintain (mitigate by shared modules).

### B. Keep one Vault URL with hard mode switch

**Rejected:** User asked for separate pages and Home Vault rename; land workflow deserves its own chrome (checks, LAO, builders).

### C. Separate `data/land-catalog/` store

**Rejected:** Duplicate sync, IDs, favorites, deal stages; teardown bridge would copy rows between stores.

---

## Information architecture

```
Analyze Land bucket ──┐
Filter vacant / tax ──┼──► analyzer-sync / publish ──► leads-catalog (leadType=land)
Teardown promote ─────┘                                      │
                                                             ├─► GET /api/leads?leadType=land  → Land Vault
                                                             └─► GET /api/leads?leadType=distressed|well_maintained → Home Vault
```

### Nav (shell)

| Link | Href | Active when |
|------|------|-------------|
| Home Vault | `/vault` | vault |
| Land Vault | `/land-vault` | land-vault |

Vault-only users get **both** links (they need land inventory too). Update footer copy from “The Vault” → Home Vault + Land Vault.

### Marketing / gate copy

- Home Vault gate: done-for-you **house** leads (distress + WM).  
- Land Vault gate: done-for-you **land** leads — screened lots, builder-ready packets.  
Honest empty states; no fake rows.

---

## Phased delivery

| Phase | Name | Ships |
|-------|------|-------|
| **0** | Split + rename | Home Vault / Land Vault surfaces; land removed from `/vault` |
| **1** | Land Desk MVP | 7-check checklist + KEEP/TOSS + fund match |
| **2** | LAO calculator | Manual FMV/comps/costs → LAO (no lot-comps API) |
| **3** | Land Comp engine | Lot comps + 10/15/20 sanity (mirror house Comp, land rules) |
| **4** | Teardown bridge | Promote house leads that underwrite as land |
| **5** | Filter → Land | Tax-delinquent / vacant-lot lists preferentially into Land Desk |

Phases 0–1 are the first implementation slice. 2–5 are specified here so schema and UI do not paint into a corner.

---

# Phase 0 — Split + rename

## Scope

1. Rename customer-facing **The Vault** → **Home Vault** on `/vault`, shell nav, gates, titles, under-contract links that say “Vault” where they mean house catalog.  
2. Remove Land tab, land KPI, and land rows from Home Vault UI and default Home Vault API queries.  
3. Add `public/land-vault.html` (+ CSS/JS) for Land Vault.  
4. API: Home Vault list endpoints **exclude** `leadType=land` by default; Land Vault requests **only** `land` (and later teardown-as-land).  
5. Analyzer sync unchanged: still writes `leadType: 'land'` into the same catalog.

## API contract tweaks

| Endpoint | Behavior |
|----------|----------|
| `GET /api/leads` | Add `surface=home\|land` (or infer from `leadType`). `surface=home` → types ∈ {distressed, well_maintained}. `surface=land` → type = land. |
| `GET /api/leads/stats` | Same surface filter so Home KPIs never count land. |
| Existing lead by id | Unchanged; UI routes by `leadType` (land lead opened on Home Vault redirects or deep-links to Land Vault drawer). |

## Out of scope for Phase 0

Land checklist, LAO, Comp, teardown, Filter preferential — those are later phases. Phase 0 may show a plain land table + dossier (satellite-first) so the page is usable.

---

# Phase 1 — Land Desk MVP

## Goal

Every land lead can be screened with Land Brain’s gate and matched to known land buy boxes.

## Pipeline (operator)

```
Open Land Vault → pick lead (satellite-first dossier)
  → Demand: builders / new construction nearby? (pass/fail/unknown)
  → 7 Land Checks (pass/fail/unknown + optional note)
  → Verdict: KEEP | TOSS
  → Fund match chips (Gaia / Leviathan / Blackfin / …)
  → Persist on lead
```

**Rule:** Fail demand or any check without a priced fix → default recommendation **TOSS**. Operator can override to KEEP with a required note (honest exception).

## 7 Land Checks (canonical)

From `brain/land/01-screen-7-checks.md`:

| # | ID | Label | Pass means |
|---|-----|-------|------------|
| 0 | `demandBuilders` | Builders / new builds nearby | Active builder / 2020+ new construction cluster near subject |
| 1 | `infill` | Infill | Houses left/right; neighborhood lot |
| 2 | `utilities` | Utilities | Power / water / sewer cues nearby |
| 3 | `pavedAccess` | Paved access | On paved road |
| 4 | `cleared` | Cleared | Build-ready or light brush (heavy trees → fail or note −$10K) |
| 5 | `flat` | Flat | Relatively flat |
| 6 | `flood` | Flood | Outside 100-year FEMA |
| 7 | `zoning` | Zoning | Residential (or known use); buildable lot size/setbacks |

Check 0 is the **demand gate** (shown first). Checks 1–7 are the classic seven.

Each check stores: `status: 'pass' | 'fail' | 'unknown'`, optional `note` (string).

Wooded clearing cost cue: if `cleared` fails for trees, UI suggests site-cost −$10K for Phase 2 LAO (do not auto-write LAO in Phase 1).

## KEEP / TOSS

| Verdict | Meaning |
|---------|---------|
| `pending` | Not screened yet (default) |
| `keep` | Worth underwriting / calling |
| `toss` | Dead — hide from default Keep queue |

Filters: Needs screen · Keep · Toss · All.

Land priority score (Phase 1): boost KEEP + phone + fund match + tax/code signals; do **not** use house distress tier math.

## Fund match

### Engine

`lib/leads-platform/land/fund-match.js` (new):

- Input: lead geo (state, city, zip, acres if known, flood flag, landOnly).  
- Source: fund catalog entries with `strategyClusters` including `land` and/or buyBoxes with `landOnly: true` / `assetTypes` including `land` or `teardown`.  
- Output: ranked `fundMatches[]`:

```js
{
  fundId: 'leviathan',
  fundName: 'Leviathan Fund',
  buyBoxId: 'fl-vacant',
  score: 0-100,
  oneLiner: '…',
  reasons: ['FL', 'zip/market hit', 'acreage in range'],
  gaps: ['acres unknown', 'flood unknown']
}
```

Match signals (additive): state, market/city, zip / zipPrefixes, acreage min/max, `noFlood` vs lead flood status, `landOnly`, maxPurchase vs ask if present.

**Honest gaps:** missing acres/flood/zoning → lower score + `gaps[]`, never fake a perfect match.

### UI

Drawer section **Buyer shape**: chips for matches ≥ threshold (e.g. score ≥ 40); expand for one-liner + reasons + gaps. Link to fund detail if a fund page exists; otherwise inline pitch notes from catalog.

## Schema (Phase 1 additions)

Persist on lead record (merge-safe; never wipe unrelated fields):

```js
landScreen: {
  demandBuilders: { status, note },
  checks: {
    infill: { status, note },
    utilities: { status, note },
    pavedAccess: { status, note },
    cleared: { status, note },
    flat: { status, note },
    flood: { status, note },
    zoning: { status, note }
  },
  verdict: 'pending' | 'keep' | 'toss',
  verdictNote: '',
  recommendedVerdict: 'keep' | 'toss' | null, // from rules engine
  screenedAt: ISO | null,
  screenedBy: userId | null
},
fundMatches: [ /* as above */ ],
fundMatchedAt: ISO | null
```

## API (Phase 1)

| Method | Path | Role |
|--------|------|------|
| `GET` | `/api/leads/:id/land-screen` | Return screen + matches |
| `PUT` | `/api/leads/:id/land-screen` | Save checks + verdict |
| `POST` | `/api/leads/:id/fund-match` | Recompute matches; persist |

## UI regions (Land Vault)

| ID | Role |
|----|------|
| `#land-vault-gate` | Max upgrade |
| `#land-vault-app` | App root |
| `#land-vault-hero` | Title Land Desk + KPIs (Keep / Needs screen / Fund-shaped / With phone) |
| `#land-vault-filters` | Verdict + geo + signals + search |
| `#land-vault-results` | Table (satellite thumb, address, acres, verdict, top fund, score) |
| `#land-vault-drawer` | Dossier: imagery, 7-check panel, fund match, contact, notes |

Reuse Home Vault table/drawer patterns; **do not** show house Comp / ARV / repair buckets on land leads.

## Phase 1 out of scope

LAO math UI, lot comps API, teardown promote, Filter preferential, FEMA auto-pull (manual check status OK).

---

# Phase 2 — LAO calculator (manual)

## Goal

Operator enters land numbers; software outputs contract target / LAO. **No** comps API yet.

## Math (Land Brain)

```
Land FMV            = operator-entered (from their comps or known ask context)
− Site costs        = clearing + demo + grade (known)
− Investor gap      ≥ $5,000 (default 5000; editable)
= Buyer ceiling
− Assignment fee    = operator fee target
= Contract target
→ Open LAO ≤ contract target (default LAO = contract target, editable lower)
```

**Never** use house `ARV×90% − repairs×2` or 70% rule.

### Optional sanity (display only)

If operator enters nearby **new-construction ARV** + pocket (`sticks` | `suburbia` | `prime`):

| Pocket | Buy band (~contract toward) | Sell band (~to builder) |
|--------|-----------------------------|-------------------------|
| sticks | 10% | 15% |
| suburbia | 15% | 20% |
| prime | 20% | 25% |

Show as warning if FMV ≫ sell band or ≪ buy band — **does not** overwrite FMV.

## Schema

```js
landUnderwriting: {
  landFmv: number | null,
  siteCosts: number | null,      // total
  siteCostParts: { clearing, demo, grade, other },
  investorGap: number,           // default 5000
  assignmentFee: number | null,
  buyerCeiling: number | null,   // computed
  contractTarget: number | null, // computed
  lao: number | null,            // offer to open
  sanity: {
    pocket: 'sticks' | 'suburbia' | 'prime' | null,
    newBuildArv: number | null,
    buyBand: number | null,
    sellBand: number | null
  },
  compsManual: [ { address, soldPrice, soldDate, acres, notes } ],
  method: 'manual',
  updatedAt: ISO | null
}
```

## API / UI

- `PUT /api/leads/:id/land-underwriting` — save inputs; server recomputes derived fields.  
- Drawer panel **LAO** under screen section; show formula breakdown.  
- Export / packet later can include LAO.

## Phase 2 out of scope

Auto lot comps, RealEstateAPI land pull, PDF packet generator (may be Phase 3+).

---

# Phase 3 — Land Comp engine

## Goal

Mirror Home Vault **Comp** UX for land: one click (or manual ND-style path) → land FMV conclusion + report — using **lot comps**, not renovated house ARV.

## Rules (different from house Comping Rules)

Hard match preferences:

- Same / similar **lot size**  
- Same **zoning** / buildability  
- Cleared vs wooded  
- Flat vs sloped  
- Paved vs dirt access  
- Utilities vs none  
- Location / neighborhood (infill)  

Reject: treating Zestimate/AVM as land FMV; using renovated SFR sales as primary land comps; rural mega-acreage unicorns as default.

### 10/15/20

Sanity band only (see Phase 2). If shortcut and comps disagree → **walk / no confident FMV** (honest gate).

### Provider

Prefer same RealEstateAPI stack as house Comp where lot sales exist; land subject detail must expose acres/zoning/land use. If vendor cannot return usable lot solds → manual comps panel (paste + optional upload), same persistence shape as auto.

### Persist

Write `landUnderwriting.landFmv`, `compsManual` or `landComps[]`, `landCompingReport`, set `method: 'engine' | 'manual'`. Re-run LAO from updated FMV if fee/gap present.

### Explicit non-goals

- Do not run house Comping Rules ARV on `leadType=land`.  
- Home Vault Comp remains house-only (already out of scope for land in ARV spec).

---

# Phase 4 — Teardown bridge

## Goal

Rescue deals wholesalers miss: house fails flip math but **contract &lt; land value after demo** → sell as land to builders.

## Flow

```
Home Vault / Analyze distressed lead
  → Operator (or later rules) flags “Underwrite as land / teardown”
  → Confirm: land FMV path + demo estimate
  → Promote: set leadType=land, assetClass=teardown (leaves Home Vault dial queue)
  → Appears on Land Vault with teardown badge
  → catalogStatus stays active unless operator excludes
```

**Locked:** Promotion **moves** the lead to Land Vault (`leadType=land`). It does not dual-list on Home Vault.

### Schema

```js
assetClass: 'vacant_lot' | 'teardown' | null,  // null = infer from leadType
teardown: {
  promotedFromLeadType: 'distressed' | 'well_maintained',
  promotedAt: ISO,
  structureNote: '',
  demoEstimate: number | null,
  reason: 'contract_below_land_value' | 'operator' | 'rule'
}
```

### Rules of thumb (UI copy from brain)

- Active teardown / new-construction corridor  
- Older / small footprint cues (hints only, not hard filters)  
- Pitch: not a fix-and-flip — builder / new construction path  
- Offer math: vacant-lot FMV − demo − ≥$5K − fee → LAO  

### Publish / sync

Analyze may later suggest teardown; Phase 4 MVP is **operator promote** from Home Vault dossier + Land Vault accepts `assetClass=teardown`.

---

# Phase 5 — Filter → Land

## Goal

Government / Filter lists that are **tax delinquent** or **vacant lot / land use** preferentially feed Land Desk rather than dying as house-shaped noise.

## Behavior

1. Filter list metadata / scrub tags: `tax_delinquent`, `vacant_lot`, `land_use`, code weeds/overgrowth on vacant parcels.  
2. When publishing or suggesting Analyze queues, **prefer Land path** for vacant-land rows (land use code, no dwelling, lot-only).  
3. Land Vault filters expose signal chips: Tax delinquent, Code (vacant), Auction/tax sale.  
4. Do **not** wipe or rewrite Filter list files; only tagging + publish routing.  
5. Pre-foreclosure as **primary** land source remains discouraged (brain); do not auto-prefer NOD lists into Land Desk.

## Outreach hook

Surface Tax Dirt script snippet in Land Vault drawer (from `brain/land/tax-dirt-script.md`) when tax signal present — copy-only helper, not a new dialer.

---

## Shared engineering notes

### Code layout

| Path | Role |
|------|------|
| `public/land-vault.html` | Land Vault page |
| `public/css/land-vault.css` | Land-only layout (reuse vault tokens) |
| `public/js/land-vault-app.js` | Desk UI |
| `lib/leads-platform/land/screen.js` | 7-check recommend KEEP/TOSS |
| `lib/leads-platform/land/fund-match.js` | Buy-box matcher |
| `lib/leads-platform/land/lao.js` | LAO math (Phase 2+) |
| `lib/leads-platform/land/comping/` | Land Comp engine (Phase 3) |
| `lib/leads-platform/api.js` | New land routes |
| `public/vault.html` / `vault-app.js` | Home Vault — drop land |

### Design system

Same as Home Vault: tokens, phuglee-components, phuglee-table, premium bg, Max gate. Satellite-first imagery for land. Gold on primary actions; no house repair theater on land.

### Data safety

- Never delete catalog rows when splitting UI.  
- Never touch `data/filter-lists/`, `data/bridge-brain/`, analyzer `users/` sessions.  
- Merge updates to `landScreen` / `landUnderwriting` must not clobber phones, notes, deal stages.

### Verification

| Claim | Proof |
|-------|-------|
| Local Land Vault live | `verify-live.ps1` + feature check on `/land-vault` |
| UI edits | scoped `verify-mobile.ps1 -Pages "/vault,/land-vault"` |
| Home excludes land | API/stats assert `leadType=land` count 0 on home surface |
| Prod later | dedicated verify script (mirror review-ui pattern) when shipped |

---

## Testing

| Phase | Tests |
|-------|-------|
| 0 | Home list excludes land; Land list only land; nav labels |
| 1 | Screen recommend TOSS on fail; KEEP when all pass; fund-match fixtures for Gaia/Leviathan/Blackfin |
| 2 | LAO math unit tests ($5K gap, fee, site costs); 10/15/20 sanity bands |
| 3 | Land comp hard rejects; FMV from lot cluster; disagree-with-sanity → no fake confidence |
| 4 | Promote creates teardown fields; appears on Land Vault |
| 5 | Tag routing fixtures for tax delinquent vacant lots |

---

## Out of scope (whole initiative)

- Rural mega-development / entitlement unicorns as default product  
- Replacing Collect dialer  
- Auto-sending offers / PSA generation (Land Sailor notes stay docs-only until asked)  
- Using house ARV Comp as land FMV  
- Wiping or rebuilding Filter lists  

---

## Implementation order (for planning skill)

1. **Phase 0** — Split surfaces + rename Home Vault  
2. **Phase 1** — Schema `landScreen` + fund-match + Land Desk UI  
3. **Phase 2** — `landUnderwriting` + LAO panel  
4. **Phase 3** — Land Comp engine + report  
5. **Phase 4** — Teardown promote bridge  
6. **Phase 5** — Filter preferential land routing + Tax Dirt snippet  

---

## Open points (resolved in this spec)

| Topic | Resolution |
|-------|------------|
| Land inside Home Vault? | **No** — separate Land Vault |
| Rename The Vault | **Home Vault** |
| New route | `/land-vault` |
| Second catalog DB? | **No** — shared store, surface filter |
| MVP depth | 7-check + KEEP/TOSS + fund match |
| Comp API in MVP? | **No** — Phase 3 |
| Teardown / Filter | Specified now; build after LAO/Comp |
| Where do reviewed land leads go? | **Same catalog** via existing `publish-from-analyzer`; UI/API `surface=land` only (audit lock) |
| Spec lock | **LOCKED** 2026-07-15 — implement via `docs/superpowers/plans/2026-07-15-land-desk.md` |

---

## References

- Wholesale Brain: `brain/land/LAND-BRAIN.md`, `01-screen-7-checks.md`, `03-valuation.md`, `04-offers.md`, `05-teardowns.md`, `06-disposition-builders.md`, `tax-dirt-script.md`, `leads/05-land-gov-lists.md`  
- Buyers: `brain/buyers/gaia-fund.md`, `leviathan-fund.md`, `blackfin-fund.md` + `public/data/fund-buyers/catalog.json`  
- Phuglee: `docs/superpowers/specs/2026-07-13-leads-platform-design.md`, `2026-07-15-vault-comping-arv-design.md`  
