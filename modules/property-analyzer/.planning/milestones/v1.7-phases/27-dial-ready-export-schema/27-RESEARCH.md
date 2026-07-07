# Phase 27 Research — Dial-Ready Export Schema

**Researched:** 2026-07-01

## Key Findings

- `buildExportRows` in `render.js` already handles Excel/CSV via SheetJS — extend with `profile: 'dial_ready'`
- Imagery cache date + URL live in server index (`imagery.streetView.cachedAt`, `publicUrl`)
- `viewMeta.panoId` / `panoLat` available for Google Maps browser pano links
- Lead types defined in `review.js` `LEAD_TYPES` (5 canonical types)
- Lead Category = `resultLeadTier()`; Property Type = simplified `resultCategory()`

## Implementation Approach

1. `lib/export-schema.js` — testable column mapper (UMD)
2. `exportResults({ scope: 'all', profile: 'dial_ready' })` — hydrates imagery then exports
3. Sidebar "Export Database (Excel)" + ⌘K command wired to dial_ready profile
4. Existing filter-scoped export unchanged (`profile: 'full'`)

---