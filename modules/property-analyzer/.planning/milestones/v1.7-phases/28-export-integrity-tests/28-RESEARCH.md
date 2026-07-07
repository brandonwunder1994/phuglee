# Phase 28 Research — Export Integrity + Tests

**Researched:** 2026-07-01

## Already Shipped in Phase 27

| Capability | Location | Tested? |
|------------|----------|---------|
| Dial-ready 13-column schema | `lib/export-schema.js` | ✅ 8 unit tests |
| Imagery hydration before export | `render.js` `prepareDialReadyExport` | ❌ no test |
| Absolute cached image URLs | `export-schema.absoluteUrl` | ✅ unit test |
| Google Maps pano links | `export-schema.buildGoogleMapsStreetViewLink` | ✅ unit test |
| Full profile preserved | `buildExportRows` `profile: 'full'` branch | ❌ no regression test |
| Database row count = all results | `buildDialReadyRows` maps all records | ❌ no explicit assertion |

## Gaps for Phase 28

### EXPORT-10 — Cache Date from hydrated imagery

`buildDialReadyRow` reads `imagery.streetView.cachedAt` after `resolveImageryForResult`. Need test simulating index-map merge (record without inline imagery → index hit → date populated).

### EXPORT-11 / EXPORT-12 — Already unit-tested

Close requirements with integration-style test using realistic deps chain.

### EXPORT-13 — Row count parity

`buildDialReadyRows` must return `records.length` rows with no score-sort dropping leads. Add test with 3+ mixed-tier records asserting length and column keys.

### EXPORT-14 — Full profile regression

Assert `buildExportRows(records, { profile: 'full' })` still contains `'First Name'`, `'Distress Score'`, `'D4D Indicators'` — distinct from dial_ready 13 columns.

### QA-07 — Verification doc

Add `28-VERIFICATION.md` with manual smoke steps + `npm test` evidence. Mark EXPORT-10–14 complete in REQUIREMENTS.md.

## No New UI Expected

Phase 28 is test + verification only unless hydration gap found in testing.

---