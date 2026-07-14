# Filter Bridge — reference

## Error codes

| Code | Meaning |
|------|---------|
| `TYPE_COLUMN_CONFIRM_REQUIRED` | Admin must pick Violation/Issue Type column for this fingerprint |
| `ADMIN_REQUIRED` | Non-admin tried to confirm Type mapping |
| `INVALID_TYPE_COLUMN` | Confirmed header not in file |
| `NO_USABLE_ROWS` | Every row discarded (no address / no distress / dup / etc.) |
| `OCR_UNAVAILABLE` | Tesseract not runnable; upload Excel/CSV or fix OCR env |
| `UNSUPPORTED_FILE` | Legacy `.doc` or unsupported type |

## Confirm payload (`TYPE_COLUMN_CONFIRM_REQUIRED` details)

- `formatFingerprint` — header fingerprint for city memory
- `candidates[]` — `{ header, score, samples, reasons, keepPreview? }`
- `suggestedHeader` — only when scorer confidence is high; else `null`
- `keepPreview` on candidates: `{ strongDistressed, discarded, sampleSize }`

## Pipeline order (`processUpload`)

1. Parse by extension → headers + rows
2. Type gate (code_violation) → confirm or auto_reuse
3. Normalize + tag
4. Dedupe (+ optional already_imported)
5. Superpower Brain (code_violation)
6. `filterDistressOnly` (Strong Distressed only)
7. Review groups / draft / results UI

## Disk roots

- Lists: `FILTER_LISTS_ROOT` / `data/filter-lists/`
- Brain: `BRIDGE_BRAIN_ROOT` / `data/bridge-brain/`
- City Type memory: `BRIDGE_CITY_FORMATS_ROOT` / `data/bridge-city-formats/`
- Drafts: `FILTER_DRAFTS_ROOT` / `data/filter-drafts/`

## Family PDF extractors

- GENF / Enforcement Detail → `pdf-enforcement-detail.js`
- CEU / Code Cases Status → `pdf-code-cases-status.js`
- Application Name / Street # → `pdf-code-compliance.js`
- E-Gov PIR → `pdf-egov.js`
- Generic OCR table rebuild → `textToAoa` / `extractedRowsToAoa` in `pdf.js`
