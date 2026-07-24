# Documents tab — simple signed / pending desk

**Date:** 2026-07-22  
**Surface:** `/under-contract` profile → **Documents tab only**  
**Status:** Awaiting user approval  

## Problem

Documents is a heavy “contract vault” instrument: dual-column preview desk, package cards with many actions, full file list, kind dropdown + Send via SignNow, import panel, attention band. Operators want a **status board** for what is signed vs waiting, simple type labels, click-to-view, and one clear **Send Doc** entry into the **existing** send flows.

## Goal

On Documents, in a few seconds answer:

1. What is **pending signatures**?  
2. What is **signed / back**?  
3. Can I **open** a signed (or viewable) agreement?  
4. Can I **send** a doc without hunting chrome?

## Non-goals

- New SignNow backend or package model  
- Changing AOC / JV / Amendment / PSA form dialogs (reuse as-is)  
- Board redesign  
- Overview / Buyers / Comms / Media  
- Multi-tenant or new doc types beyond the four  

**Optional keep (recommended):** **Refresh signed** (sync SignNow) as a quiet toolbar control so pending → signed still works without leaving the tab. Import signed PDF can stay as a secondary control or move under a “More” later — **default plan: keep Refresh signed; hide import behind no primary chrome** (operator can use existing upload path only if we keep a small secondary control — see decisions).

### Locked product decisions

| Decision | Choice |
|----------|--------|
| Doc type labels | **Purchase Contract**, **AOC**, **JV Agreement**, **Amendment** only |
| Buckets | **Pending signatures** · **Signed** |
| Missing / not sent | **Do not list** empty package slots in either bucket |
| Status source | Existing `buildPackageModel` / `signNowPending` + `documents` (no API rewrite) |
| View | Click label (or row) → **modal** preview (reuse `viewUrl` / openDocViewer patterns) |
| Send | Single **Send Doc** → type chooser modal → existing send pipeline |
| Design only | No process logic changes; route into current `openSendNewPsa` / `openAocAction` / `openSendJv` / `openAmendment` |

## Information architecture

```
Documents
├── Toolbar: [Refresh signed]  ·  [Send Doc]
├── Pending signatures
│     · Purchase Contract  (awaiting…)
│     · AOC …
└── Signed
      · Purchase Contract  (click → modal)
      · JV Agreement …
```

Empty states:

- Pending empty: “Nothing waiting on signatures.”  
- Signed empty: “No signed packages on this deal yet.”  
- Both empty: short line + Send Doc still available  

## Package status mapping (existing)

Reuse `PACKAGE_SLOTS` + `buildPackageModel(deal)`:

| Model status | UI bucket |
|--------------|-----------|
| `pending` | Pending signatures |
| `complete` (has document on deal) | Signed |
| `missing` | Hidden from both lists |

Display titles (UI only — rename for display, keep keys):

| Key | Label |
|-----|--------|
| `psa` | Purchase Contract |
| `aoc` | AOC |
| `jv` | JV Agreement |
| `amendment` | Amendment |

When multiple signed files match a slot, show one row per package type (primary doc); optional count badge if >1.

## Interactions

### View

- Click row/label in **Signed** (or Pending if SignNow provides a preview URL — usually only signed PDFs have `viewUrl`).  
- Open **modal** (`<dialog>` or centered overlay matching Edit/PSA dialogs): title = type label, iframe/`viewUrl`, Close + Open in tab.  
- Prefer dedicated docs viewer dialog so we drop the dual-column preview rail.  
- Reuse `openDocViewer` logic or extract `openDocViewerModal(doc, title)`.

### Send Doc

1. Click **Send Doc**  
2. Modal: choose type — Purchase Contract | AOC | JV Agreement | Amendment (radio or four large buttons)  
3. Confirm → close type modal → run existing:

| Type | Existing entry |
|------|----------------|
| Purchase Contract | `sendPackageKind('psa')` / `openSendNewPsa` path |
| AOC | `openAocAction(deal)` |
| JV | `openSendJv(deal)` |
| Amendment | `openAmendment(deal)` |

4. Respect waiting-for-signatures / permission rules already used on send actions.

### Refresh signed

- Keep `POST …/sync-signnow` via existing `refreshSignedDocuments`.  
- After success, re-render docs desk; packages move pending → signed when ingested.

## What to remove / de-emphasize

- Dual-column “preview desk” split  
- Per-package Send / Resend / View button grid (view becomes row click; send becomes global Send Doc)  
- Primary “Send package” select + Send via SignNow bar  
- Attention band (“Needs attention…”)  
- Full “Files on deal” list of every file name (operator sees typed packages only)  
- Import panel as default chrome (**decision: omit from primary UI**; raw file list gone — if import still needed later, add “Import PDF” secondary)

## Visual design (product register)

- Match Overview snapshot: formal section titles, text-length underlines, readable cards, dark ops surface  
- Two equal sections stacked (or dual column on wide: Pending | Signed)  
- **Pending** rows: warm/amber status cue  
- **Signed** rows: green/success cue  
- Row = clickable label (button or role=button), keyboard focusable  
- Layout integrity: real gaps, stack under ~768  
- No next-move theater, no package-card action sprawl  

### Recommended layout (Approach A)

**Two stacked buckets + sticky toolbar** (recommended):

1. Top bar: title “Documents” meta · Refresh signed · **Send Doc** primary  
2. **Pending signatures** list  
3. **Signed** list  

**Approach B — Side-by-side Pending | Signed** on desktop: more dashboard-like; less vertical space for long lists.  
**Approach C — Keep package cards, strip chrome only:** still too heavy for the brief.

**Recommendation: A.**

## Accessibility

- Lists as `<ul>` / buttons with clear names (“Purchase Contract, pending signatures”)  
- Modal: focus trap, Escape to close, restore focus  
- `prefers-reduced-motion` on any status flash after refresh  

## Success criteria

| # | Pass if |
|---|---------|
| D1 | Open Documents → only Pending + Signed; no dual preview desk |
| D2 | Labels are exactly the four formal names |
| D3 | SignNow pending appears under Pending; after refresh + signed PDF, under Signed |
| D4 | Click signed label → modal with PDF/preview |
| D5 | Send Doc → type → existing AOC/PSA/JV/Amendment flow unchanged |
| D6 | Board/contracts UI unchanged |

## Files likely touched

- `public/under-contract.html` — docs panel markup  
- `public/js/under-contract.js` — render, send modal, view modal  
- `public/css/under-contract.css` — simple desk styles  
- `tests/under-contract.test.js`  
- Cache bump  
- Optional: `DESIGN.md` Documents instrument row  

## Out of scope reminders

No new CRM fields. No change to SignNow API. Design + UI routing only.
