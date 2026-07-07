# Pitfalls Research — Lead Export

**Domain:** Adding export features to existing lead scanner  
**Researched:** 2026-07-01  
**Confidence:** HIGH

## Common Mistakes

### 1. Relative Street View URLs in spreadsheets

**Problem:** Cached URLs are `/api/cached-imagery/streetview/abc.jpg` — Excel hyperlinks fail on another machine or when server is off.  
**Prevention:** Prefix with `window.location.origin` at export time. Document that links require local server running.  
**Phase:** 27

### 2. Confusing Lead Category vs Property Type

**Problem:** User wants both; codebase uses `category` (property/vacant_lot) and `leadTier` (distressed/well_maintained) separately.  
**Prevention:** Map explicitly:
- Lead Category → `leadTierLabel(resultLeadTier(r))`
- Property Type → simplified: "Home" | "Land/Lot" | "Blocked" | "Unavailable"  
**Phase:** 27

### 3. Missing cache date when imagery not hydrated

**Problem:** `cachedAt` lives in server imagery index, not always on `state.results` until `resolveImageryForResult()`.  
**Prevention:** Hydrate all records before export; show blank Cache Date if never scanned/cached.  
**Phase:** 27

### 4. Exporting filtered subset when user expects full database

**Problem:** Current default export uses `getFilteredResults()`.  
**Prevention:** New explicit "Export Database" always uses `state.results` unfiltered.  
**Phase:** 27

### 5. Lead type missing on old sessions

**Problem:** Pre-v5 sessions lack `leadType`; defaults to `code_violation`.  
**Prevention:** Use `resultLeadType(r)` which normalizes; document default in export.  
**Phase:** 27

### 6. Breaking existing 25-column export

**Problem:** Power users may rely on current detailed export (scores, indicators, satellite fields).  
**Prevention:** Keep existing export as `profile: 'full'`; add `profile: 'dial_ready'` for new schema.  
**Phase:** 28 (polish)

### 7. 10k row browser memory

**Problem:** Building 10k rows client-side can freeze UI.  
**Prevention:** Use `requestAnimationFrame` chunking or Web Worker if perf test fails; current scale policy is 10k max.  
**Phase:** 28 if needed

## Warning Signs

- Export row count ≠ `state.results.length` → scope bug
- All Cache Dates blank → imagery index not hydrated
- All Lead Types "Code Violation" → migration not run on session
- Street View URLs 404 → relative URL not absolutized

---
*Pitfalls research for: v1.7 Lead Export*