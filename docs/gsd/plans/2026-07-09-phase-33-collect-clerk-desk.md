# Phase 33 — Collect Work Desk (REVISED)

> **GSD:** `/gsd:execute-phase 33`

**Goal:** Kill the empty two-tile hub. Collect is **work-first**: primary action owns the page; tracker is secondary chrome. H1 = **Hit the Clerk**.

**Architecture:** Rebuild `collect-hub` only. Preserve `btn-start-requests` → `openStartRequestsDialog`. Tracker remains link to `/forge/portal`.

---

## Quality bar

| Pass | Fail |
|------|------|
| Primary Start is the visual boss (>60% weight) | Two equal peer tiles |
| H1 Hit the Clerk | Request Your Data |
| Feels mid-job (desk), not menu | Centered void island |
| Tracker secondary | Tracker same size as Start |

---

## Target layout

```
STEP 01 · COLLECT
HIT THE CLERK
Lead: pull at source before aggregators…

┌─ PRIMARY (wide) ──────────────────────────────┐
│ Start a batch                                 │
│ Cities · PDF email · plain email · portal     │
│ [ START REQUESTS ]  ← fire, large             │
│ Note: nothing sends until you confirm         │
└───────────────────────────────────────────────┘
  secondary: Track Requests → (text link or slim bar, not peer card)
TRUST line
```

Deep wizard/dialogs **unchanged**.

---

## Files
- `public/collect.html`
- `public/css/distress-collect-hub.css`

---

## Tasks
- [ ] HTML: replace grid with primary desk + secondary tracker
- [ ] CSS: upper layout density (not vertical center void); grit panels
- [ ] Smoke: Start opens dialog; tracker navigates
- [ ] `npm test` + screenshots
- [ ] Commit: `feat(collect): work-first clerk desk replaces peer-tile hub`

## Done when
Landing on Collect feels like **starting the job**, not picking an app icon.
