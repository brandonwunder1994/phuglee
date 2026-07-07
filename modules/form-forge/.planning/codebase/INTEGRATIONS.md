# Integrations

**Analysis date:** 2026-07-05

## Gmail API

- **Module:** `gmail_client.py`
- **Auth:** OAuth credentials (user runs AUTH setup locally)
- **Used for:** PDF attachment emails, apology resends, email-only requests
- **Errors:** `GmailClientError` — user-actionable messages passed to API

## Excel (portal registry source)

- **Source file:** `C:\Users\brand\Desktop\Online City Portal Forms.xlsx`
- **Import:** `scripts/import_portal_registry.py`
- **Export:** `scripts/export_portal_registry.py`
- **Library:** pandas + openpyxl

## Desktop file mirror

- Completed PDFs copied to `Desktop\Completed City Forms\{State}\`
- Tracked in `completed-forms-manifest.json` and `save_tracker.py`

## MapLibre (coverage map)

- Vendored JS/CSS in `static/vendor/`
- GeoJSON: `static/geo/us-states.geojson`, reference cities
- Bootstrap: pre-computed `data/coverage-map-bootstrap.json`

## External geocoding (one-time scripts)

- `scripts/geocode_cities.py` — Nominatim for city coordinates
- Output: `data/city-coordinates.json`

## No integrations yet

- CRM / Go High Level
- Google Sheets sync
- Cloud hosting / auth beyond localhost