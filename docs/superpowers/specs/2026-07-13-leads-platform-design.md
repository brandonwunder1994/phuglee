# Design Spec — The Vault (Leads Platform)

**Date:** 2026-07-13  
**Product:** Phuglee Distress OS  
**Surface:** `/vault` (customer name: **The Vault**)  
**Codename:** Leads Platform  
**Milestone:** v4.0 (phases 89–97)  
**Depends on:** v3.0 Filter design system (tokens + phuglee-components), v3.1 Analyze scan desk (four buckets)

---

## Problem

The Vault today is a **gated marketing preview**: blurred mock rows, honest “sample data” copy, and a Max-plan upgrade CTA. That was correct for positioning, but it cannot become a paid product in this form.

Operators who pay for **done-for-you leads** expect a premium database experience comparable to DealSauce, PropStream, BatchLeads, PropWire, or Deal Machine — without abandoning Phuglee’s gritty, ops-first brand.

Meanwhile, Phuglee already runs the pipeline that *produces* lead quality:

1. **Filter** — city scrub, distress tagging, list staging (`lib/bridge-list-store.js`, `docs/bridge/DATA-STANDARDS.md`)
2. **Analyze** — Street View scan, four buckets (Distressed / Well Maintained / Land / Blocked), scoring and signals

The Vault should be the **published catalog** at the end of that pipeline — not a separate data silo with fake rows.

## Product goal

A **high-quality, user-friendly Leads Platform** where Max-plan members browse, filter, and explore curated leads ready to call or export.

### Lead types (locked)

| Type | ID | Source | Publish gate |
|------|-----|--------|--------------|
| Distressed | `distressed` | Analyze Distressed bucket + Filter distress signals | `reviewStatus === 'approved'` only |
| Well Maintained | `well_maintained` | Analyze WM bucket | QA pass + usable address |
| Land / Vacant Lot | `land` | Analyze Land bucket | QA pass + usable parcel/address |

**Distressed leads never ship to the Vault until full review and processing complete.** This is a product promise, not a nice-to-have.

### Success criteria

1. Max user opens `/vault` and sees **real catalog data** (or honest empty state), never frosted fakes.
2. Default view is a **dense, sortable table** with search and **stackable motivation filters** (AND logic).
3. Expanding a lead shows **actionable dossier**: signals, score, owner contact, ARV/repair when available, photos/comps when available.
4. Pro / non-Max users see **upgrade gate** with the same honest preview pattern as today (no fake “live” claims).
5. UI matches Phuglee brand: dark earth, cream headlines, gold heat on primary actions — same shell as Filter/Analyze.
6. `npm test` green; `scripts/verify-live.ps1` exit 0 after public edits.

---

## Design principles

1. **Proof over decoration** — Real pipeline fields only; empty states say what’s coming, not placeholder addresses.
2. **Dial-ready first paint** — Table + filters dominate; marketing chrome is minimal inside the app.
3. **Stack signals like an ops desk** — Motivation filters combine with AND logic to surface top-priority leads.
4. **One weapon, one look** — Reuse `tokens.css`, `phuglee-components.css`, `phuglee-table`, shell nav.
5. **Do not break the pipeline** — Publishing reads from Analyze/Filter outputs; Vault does not re-implement scrub or scan logic.
6. **Never wipe operator data** — `data/leads-catalog/` is a new store; never touch `data/filter-lists/` or `data/bridge-brain/` as part of Vault work.

---

## Approaches considered

### A. Evolve `/vault` in place (recommended)

Keep the existing route and nav label. Replace mock layer with live app when `plan === 'max'`. Store catalog under `data/leads-catalog/`. APIs at `/api/leads/*`.

**Pros:** Matches current marketing, shell nav, and Max positioning. Smallest user confusion.  
**Cons:** `vault.css` carries legacy preview styles to retire carefully.

### B. New route `/leads` + redirect from `/vault`

Same backend as A but new URL canonical.

**Pros:** Cleaner engineering name.  
**Cons:** Breaks existing links, SEO, and shell copy for marginal gain.

### C. Separate `modules/leads-platform/` micro-app

Standalone module like property-analyzer with own server mount.

**Pros:** Hard isolation.  
**Cons:** Duplicates shell, auth, and design-system wiring; fights “one war room” product goal.

**Decision:** **Approach A.** Engineering codename “Leads Platform”; customer surface remains **The Vault** at `/vault`.

---

## User flow

```
Sign in (Max) → /vault
  → Lead type tabs (All | Distressed | WM | Land)
  → KPI strip (counts, fresh this week)
  → Filter rail (geo, signal stack, score, presets, search)
  → Results table (sort, paginate / virtual scroll)
  → Row click → detail drawer (dossier)
  → Actions: call link, copy, favorite, note, export selection
```

Non-Max users: same URL, **upgrade gate** overlay (evolved from current vault-gate), no API data.

---

## Page regions

| Region | DOM prefix (proposed) | Role | Elevation |
|--------|----------------------|------|-----------|
| Hero strip | `.vault-hero` | Type tabs + KPIs | Featured |
| Filter rail | `#vault-filters` | All filter controls | Primary work |
| Results table | `#vault-results` | Dense data grid | Primary work |
| Detail drawer | `#vault-drawer` | Lead dossier | Overlay / climax |
| Bulk bar | `#vault-bulk-bar` | Export / favorite selection | Sticky footer |
| Upgrade gate | `.vault-gate` | Pro upgrade CTA | Modal layer (non-Max) |

---

## Data model — `LeadRecord`

Canonical JSON stored in `data/leads-catalog/{leadId}.json` with `index.json` for listing metadata.

### Identity

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `leadId` | string | yes | Stable hash from normalized address + city + state |
| `address` | string | yes | Street line |
| `city` | string | yes | |
| `state` | string | yes | 2-letter |
| `zip` | string | no | |
| `parcel` | string | no | When available from county |
| `lat` / `lng` | number | no | Geocode when available |

### Classification

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `leadType` | enum | yes | `distressed` \| `well_maintained` \| `land` |
| `propertyType` | string | no | SFR, duplex, commercial, vacant lot, etc. |
| `occupancy` | enum | no | `owner` \| `vacant` \| `unknown` |
| `reviewStatus` | enum | yes | `approved` \| `pending` — only `approved` in catalog |

### Scoring

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `priorityScore` | int 0–100 | yes | Composite rank for default sort |
| `distressTier` | int 1–10 | no | From Analyze when distressed |
| `confidence` | enum | yes | `high` \| `medium` \| `low` |
| `signalTags` | string[] | yes | Motivation/distress labels for filter stack |

### Financials (optional enrichment)

| Field | Type | Notes |
|-------|------|-------|
| `estARV` | number | Display with source tag |
| `estRepairs` | number | |
| `estEquity` | number | Derived when possible |
| `lastSale` | object | `{ date, price }` |
| `assessedValue` | number | |

### Owner

| Field | Type | Notes |
|-------|------|-------|
| `ownerName` | string | |
| `phones` | string[] | Click-to-call on mobile |
| `email` | string | |
| `mailingAddress` | string | |
| `entityType` | enum | `individual` \| `llc` \| `estate` \| `unknown` |

### Media & comps

| Field | Type | Notes |
|-------|------|-------|
| `streetViewUrl` | string | From Analyze when scanned |
| `photos` | string[] | URLs |
| `comps` | array | `{ address, soldDate, price, sqft }` |

### Ops meta

| Field | Type | Notes |
|-------|------|-------|
| `publishedAt` | ISO string | Catalog ingest time |
| `sourceCity` | string | Pipeline origin |
| `pipelineVersion` | string | Traceability |
| `sourceListId` | string | Filter list provenance |

### Per-user overlays (not in canonical lead file)

Stored under `data/leads-catalog/_users/{username}/`:

| Field | Notes |
|-------|-------|
| `favorites` | leadId set |
| `notes` | leadId → text |
| `presets` | saved filter JSON |

---

## Scoring model (display)

**`priorityScore` (0–100)** — default table sort, descending.

Composite formula (v1, tunable in `lib/leads-platform/scoring.js`):

```
base = leadTypeWeight
  + distressTier * 8          (distressed only, cap 80)
  + signalCount * 4           (cap +20)
  + highConfidence ? 5 : 0
  + hasPhone ? 10 : 0
  + recencyBoost(publishedAt)   (0–10, decay over 90d)
```

Signal tags map from existing pipeline vocabulary (`docs/bridge/TAGGING-RULES.md`, Analyze indicators). No new ML in v4.0 — display and rank only.

---

## Filters

| Filter | UI control | Query logic |
|--------|------------|-------------|
| Lead type | Tabs | `leadType = X` or all |
| State | Select | `state = X` |
| City | Searchable select | `city = X` |
| Signal stack | Multi chips | `signalTags` contains **all** selected |
| Priority score | Range slider | `min ≤ priorityScore ≤ max` |
| Owner type | Checkboxes | `entityType in [...]` |
| Equity band | Chips | bucket on `estEquity` |
| Added | Presets | `publishedAt` relative window |
| Free text | Search | address, owner, parcel, phone substring |
| Saved preset | Dropdown | persisted per-user JSON |

---

## API (v1)

All routes require authenticated session. Data routes require `plan === 'max'` (or admin).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/leads` | List with query filters + pagination |
| GET | `/api/leads/:id` | Single lead dossier |
| GET | `/api/leads/meta` | KPI counts by type, cities, signal facets |
| POST | `/api/leads/export` | CSV/XLSX for selected ids (rate limited) |
| GET | `/api/leads/user/favorites` | User favorites |
| PUT | `/api/leads/user/favorites/:id` | Toggle favorite |
| PUT | `/api/leads/user/notes/:id` | Upsert note |
| GET/PUT | `/api/leads/user/presets` | Saved filters |
| POST | `/api/leads/publish` | Internal: ingest from pipeline (admin/cron) |

---

## Publish pipeline integration

```
Filter list (ready) ──┐
                      ├──► Analyze session (scanned buckets)
                      │         │
                      │         ▼
                      │    QA / review gate
                      │         │
                      └────────► publishLead() ──► leads-catalog
```

`publishLead()` maps Analyze result rows + Filter row metadata → `LeadRecord`. Distressed requires explicit approval flag from review desk (v4.0: manual admin publish; v4.1: automated hook post Phase 86 Review Desk).

**Do not** read directly from `data/filter-lists/` at query time — publish creates an immutable catalog snapshot.

---

## Visual design

### Relationship to current Vault preview

The mock table in `vault.html` is the **layout DNA**: toolbar chips, search, six-column grid (Address, City, Signal, Score, Owner, Phone). The live product **removes blur/frost for Max users** and wires real data.

### Brand alignment

| Element | Treatment |
|---------|-----------|
| Background | `has-premium-bg` + subtle heat (Collect/Filter parity) |
| Table | `phuglee-table` dense variant, JetBrains Mono data cells |
| Chips | `phuglee-chip` / vault filter chips — gold active state |
| Score column | Gold numeric emphasis (existing `.vault-mock-score` tokenized) |
| Hot signals | Orange accent (existing `.vault-mock-signal--hot`) |
| Upgrade gate | Keep gold vault frame for non-Max; honest copy |

### Anti-slop (from PRODUCT.md)

- No fake leads presented as live
- No generic purple SaaS
- No cyber HUD scanlines on the live table (preview-only chrome retired for Max)
- No emoji status indicators

### Responsive

- **≥900px:** Full six-column table
- **640–900px:** Hide phone + owner columns; tap row for drawer
- **<640px:** Card list fallback optional in Phase 92; minimum viable is scrollable table

---

## Plan gating

| Plan | Vault access |
|------|--------------|
| `max` | Full catalog + export limits TBD |
| `pro` | Upgrade gate only |
| `lite` / anonymous | Auth required; upgrade gate |

Reuse `resolveSessionScope()` — Max users already map to `storageKey: '_vault'` for shared catalog reads; per-user overlays use username.

---

## Out of scope (v4.0)

- Stripe billing integration (CTA remains mailto / external until billing milestone)
- Map view / territory choropleth
- CRM sync (Podio, REISift, etc.)
- Skip tracing purchase flow
- Multi-tenant white-label
- React rewrite

---

## Testing strategy

- Fixture catalog in `tests/fixtures/leads/` (never production data)
- API tests: auth, plan gate, filter query, publish idempotency
- Route test: `/vault` serves shell; Max mock session sees table mount point
- Playwright: 390 + 1440 screenshots, filter interaction smoke
- `verify-live.ps1` after every public CSS/JS edit

---

## Open decisions (defaults chosen)

| Question | Default for v4.0 |
|----------|------------------|
| Shared vs per-user catalog | **Shared** catalog for all Max users; per-user favorites/notes |
| Export cap | 500 rows per export, 5 exports/day (tunable constants) |
| Pagination | 50 per page, cursor-based for API |
| Land ARV | Show when enrichment exists; never invent |

---

## Related files

| File | Role |
|------|------|
| `public/vault.html` | Page shell |
| `public/css/vault.css` | Vault-specific layout |
| `public/js/vault-app.js` | Client app (new) |
| `lib/leads-platform/*` | Schema, store, API, scoring |
| `docs/superpowers/plans/2026-07-13-leads-platform.md` | Implementation plan |
