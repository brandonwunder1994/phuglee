# Stack Research — Lead Export

**Domain:** Spreadsheet export for real-estate lead databases  
**Researched:** 2026-07-01  
**Confidence:** HIGH

## Current Stack (no additions required)

| Layer | Tool | Role in export |
|-------|------|----------------|
| Client | SheetJS (`XLSX`) | Already loaded; `json_to_sheet` + `writeFile` for xlsx; `sheet_to_csv` for csv |
| Client | `buildExportRows()` in `render.js` | Existing row builder — extend, don't replace |
| Server | `imagery-cache.js` | `cachedAt` timestamps + `publicUrl` for Street View |
| Client | `getCachedImageryUrls()` / `imageryIndexMapCache` | Resolves per-record imagery URLs at export time |
| Client | `LEAD_TYPES` in `review.js` | Canonical lead type labels |

## Stack Additions

**None required for v1.7 MVP.**

Optional future:
- `papaparse` — only if CSV import round-trip needed (not this milestone)
- Server-side export endpoint — only if 50k+ rows cause browser memory issues (defer)

## Integration Points

1. **Hydrate imagery before export:** Call `resolveImageryForResult()` on each record so `cachedAt` and URLs populate from `imageryIndexMapCache`
2. **Absolute Street View URLs:** Cached URLs are relative (`/api/cached-imagery/...`); spreadsheet needs `window.location.origin + url` for clickability
3. **Google Maps pano link (optional column):** Build `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LNG` from `viewMeta` when browser-viewable link preferred over image URL

## What NOT to Add

- New npm dependency for Excel — SheetJS already works
- Server export pipeline — client-side is sufficient for current 10k lead scale policy

---
*Stack research for: v1.7 Lead Export*