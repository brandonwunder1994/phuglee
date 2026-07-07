# Phase 28 Verification

**Verified:** 2026-07-01  
**Status:** PASSED

## Requirements

| REQ | Status | Evidence |
|-----|--------|----------|
| EXPORT-10 | ✅ | `Index hydration` + `Satellite cachedAt fallback` tests in `tests/export-schema.test.js` |
| EXPORT-11 | ✅ | `absoluteUrl` tests (with/without origin) |
| EXPORT-12 | ✅ | `buildGoogleMapsStreetViewLink` — panoId, panoLat/lng, targetLat/lng, address fallback |
| EXPORT-13 | ✅ | `row count parity` + `no-score-sort` tests |
| EXPORT-14 | ✅ | `tests/export-profiles.test.js` — full vs dial_ready column contract |
| QA-07 | ✅ | `npm test` — 188 pass (16 export-schema + 5 export-profiles) |

## Commands

```
npm test → 188 pass
```

## Manual Smoke (recommended)

1. Load session with scanned leads
2. Sidebar → **Export Database (Excel)**
3. Open xlsx — verify **13 columns**, row count = lead count in app
4. Sidebar → **Excel — current list** — verify detailed columns (Distress Score, D4D Indicators, etc.)

---