---
name: filter-bridge
description: Build and maintain Phuglee Filter (/bridge) — intake of PDF/Word/CSV/Excel/JPG into a canonical Excel sheet, Type-column confirm, distress tagging, Superpower Brain, Train, and saved lists. Use when working on bridge.html, bridge.js, lib/bridge-engine/, bridge-type-column-score, paste-to-excel, OCR, or Superpower Brain.
---

# Filter Bridge (Filter / Data Bridge)

Route: `/bridge`. Product name: **Filter**. Engineering: Data Bridge.

## When to use

- Intake or parse failures (PDF/Word/JPG/Excel/CSV)
- Type-column confirm dialog wrong or confusing
- Distress keep/kill feels random
- Paste-to-Excel / Superpower Brain / Train / saved Filter lists
- Anything under `lib/bridge-engine/`, `lib/bridge-*.js`, `public/bridge.html`, `public/js/bridge.js`

## Hard contract (non-negotiable)

```
Drop file → Canonical Excel sheet → Type confirm → Filter → Download
```

1. **Intake** always produces one filterable sheet (real headers + rows) before Type confirm.
2. **Type confirm** is a decision with evidence: samples + score + keep preview — never guess.
3. **Filter** runs only after a deliberate Type pick (or explicit “No type column”).
4. **Paste-to-Excel** is an **escape hatch** only when a brand-new layout fails — not the primary path.
5. New city layouts get a fixture under `tests/fixtures/bridge/` + a focused test — do not special-case only in chat.

## Never wipe user work

Do not delete/truncate `data/filter-lists/`, `data/bridge-brain/`, or city format memory unless the user explicitly asks. Restart is fine; data lives on disk.

## Read first

1. [docs/bridge/DATA-STANDARDS.md](../../../docs/bridge/DATA-STANDARDS.md) — columns, retention, lopsided/scanned PDFs
2. [docs/bridge/TAGGING-RULES.md](../../../docs/bridge/TAGGING-RULES.md) — Strong Distressed Signal
3. [reference.md](reference.md) — file map + error codes

## Key modules

| Need | Path |
|------|------|
| Orchestrator | `lib/bridge-engine/index.js` |
| Type scorer | `lib/bridge-type-column-score.js` |
| Distress tag | `lib/bridge-distress-tagger.js` |
| PDF → Excel | `lib/bridge-engine/parsers/pdf.js` + family extractors + `pdf-ocr.js` |
| Word | `lib/bridge-engine/parsers/docx.js` (text/tables; images via OCR fallback) |
| Paste hatch | `lib/paste-to-excel.js` |
| Brain | `lib/bridge-brain-store.js`, `lib/bridge-brain-apply.js` |
| UI | `public/bridge.html`, `public/js/bridge.js` |

## Agent rules when editing Filter

1. Prefer fixing intake → sheet over adding another workaround layer.
2. Type confirm defaults only when scorer confidence is high; otherwise require explicit pick.
3. Lopsided PDF: upright OCR → family rebuild → AOA → in-memory xlsx (never ship title-banner headers when a family recovers ≥2 address rows).
4. After UI/engine edits: `powershell -File scripts/verify-live.ps1` before saying Filter is live.

## Verify

```bash
node --test tests/bridge-type-column-score.test.js tests/bridge-engine.test.js
powershell -File scripts/verify-live.ps1
```
