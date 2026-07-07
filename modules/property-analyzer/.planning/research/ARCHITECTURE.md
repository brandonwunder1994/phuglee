# Architecture Research — Lead Export

**Domain:** Export pipeline integration  
**Researched:** 2026-07-01  
**Confidence:** HIGH

## Current Export Flow

```
exportBtn / sidebarExport* / ⌘K
    → exportResults(format, { scope: 'current' | 'all' })
        → getFilteredResults() OR state.results
        → buildExportRows(records)
        → XLSX.utils.json_to_sheet → download
```

**Key files:**
- `public/js/render.js` — `buildExportRows`, `exportResults`, `updateExportButtons`
- `public/js/session.js` — sidebar export button listeners
- `public/js/app.js` — ⌘K export commands

## Proposed Architecture (v1.7)

### Option A: Extend `buildExportRows` with profile (recommended)

```javascript
buildExportRows(records, { profile: 'dial_ready' | 'full' })
exportResults(format, { scope: 'all', profile: 'dial_ready' })
```

- Preserves existing filter-scoped export for power users
- New "Export Database" button uses `scope: 'all', profile: 'dial_ready'`
- Single code path; testable column mapping

### Data Resolution per Row

```
record
  ├─ address fields: r.street, r.city, r.state, r.postal (direct)
  ├─ contact: r.firstName + r.lastName, r.phone, r.email
  ├─ leadType: leadTypeLabel(resultLeadType(r))
  ├─ leadCategory: leadTierLabel(resultLeadTier(r))
  ├─ propertyType: categoryLabel(resultCategory(r))  // Home / Vacant Lot / etc.
  ├─ cacheDate: formatDate(resolveImageryForResult(r)?.imagery?.streetView?.cachedAt)
  └─ streetViewUrl: absoluteUrl(getCachedImageryUrls(r).streetView)
```

### Imagery Hydration

Before building rows for database export:
1. Ensure `fetchImageryIndexMap()` has run (already on session load)
2. Loop `state.results` calling `resolveImageryForResult(r)`
3. For records missing imagery, optionally batch-hydrate from server index

### UI Changes

| Surface | Change |
|---------|--------|
| Sidebar overflow | Rename "Excel — all leads" → "Export Database (Excel)" with new schema |
| ⌘K | Add "Export full database" command |
| `exportBtn` toolbar | Keep current-filter behavior OR align to database export (decide in phase 27) |

### Test Strategy

- Unit test: `buildExportRows` dial_ready profile column keys + label mapping
- Unit test: cache date formatting from epoch ms
- Unit test: Street View URL absolutization
- Integration: export all 3 fixture records → verify row count = `state.results.length`

## Build Order

1. **Column mapper module** — `lib/export-schema.js` (shared Node + browser UMD) or inline in render.js
2. **Hydration hook** — ensure imagery index loaded before database export
3. **UI entry point** — dedicated database export button
4. **Tests** — column contract tests

---
*Architecture research for: v1.7 Lead Export*