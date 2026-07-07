# Research Summary — v1.7 Lead Export

**Synthesized:** 2026-07-01  
**Confidence:** HIGH

## Recommendation

Extend existing `buildExportRows` / `exportResults` with a `dial_ready` profile rather than replacing export. Add a dedicated "Export Database" action that always exports all `state.results` with the user's fixed column schema.

## Stack

No new dependencies. SheetJS + existing imagery index + `LEAD_TYPES` labels.

## Column Mapping (user spec → code)

| Export Column | Source |
|---------------|--------|
| Cache Date | `imagery.streetView.cachedAt` (formatted) |
| Street Address | `r.street` |
| City | `r.city` |
| State | `r.state` |
| Zip Code | `r.postal` |
| Street View Image URL | `getCachedImageryUrls(r).streetView` → absolute cached link |
| Google Maps Street View Link | Built from `viewMeta.panoId` or lat/lng → `google.com/maps` pano URL |
| Lead Type | `leadTypeLabel(resultLeadType(r))` |
| Lead Category | `leadTierLabel(resultLeadTier(r))` — Distressed, Well Maintained, etc. |
| Property Type | Home / Land/Lot from `resultCategory(r)` |
| Contact Name | `firstName` + `lastName` |
| Phone | `r.phone` |
| Email | `r.email` |

## Suggested Additions (P2 — deferred)

| Column | Why |
|--------|-----|
| Manually Reviewed | Shows human-verified leads after review pass |
| Distress Score | Sort/prioritize in Excel without reopening app |
| Satellite URL | Fallback when Street View unavailable |

**User confirmed:** Both Street View URL columns included in v1.7 (cached image + Maps browser link).

## Watch Out For

1. Hydrate imagery index before export or Cache Date / SV URL will be blank
2. Keep existing detailed export as separate profile
3. Absolutize cached imagery URLs for spreadsheet hyperlinks

## Proposed Phases

| Phase | Focus |
|-------|-------|
| 27 | Dial-ready column schema + full-database export |
| 28 | UI polish, imagery hydration, tests, optional P2 columns |

---
*Summary for: v1.7 Lead Export*