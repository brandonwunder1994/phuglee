# Land Desk Phase 4 — Teardown Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators promote a Home Vault house lead to Land Vault as a **teardown** (`leadType=land`, `assetClass=teardown`) so it leaves the house dial queue and gets land underwriting (demo cost → LAO).

**Architecture:** `POST /api/leads/:id/promote-to-land` mutates the same catalog row (no copy). Schema adds `assetClass` + `teardown{}`. Home Vault drawer gets “Underwrite as land / teardown”; Land Vault shows a Teardown badge and can filter teardowns.

**Tech Stack:** Existing leads-platform store/API, vault-app.js, land-vault-app.js, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-15-land-desk-design.md` § Phase 4

## Global Constraints

- Promotion **moves** the lead (`leadType` becomes `land`) — not dual-listed on Home Vault.
- Only promote `distressed` or `well_maintained` (reject already-land).
- Preserve phones, notes, overlays, deal stages, enrichment, imagery.
- Seed `landUnderwriting.siteCostParts.demo` from `demoEstimate` when provided; recompute LAO stack if FMV present.
- Never wipe catalog / filter-lists / bridge-brain.
- After UI: `verify-live.ps1` + `verify-mobile.ps1 -Pages "/vault,/land-vault"`.

---

## File map

| File | Role |
|------|------|
| `lib/leads-platform/land/teardown.js` | `promoteLeadToTeardown(lead, opts)` |
| `lib/leads-platform/schema.js` | `assetClass`, `teardown` |
| `lib/leads-platform/store.js` | Index `assetClass` for filters |
| `lib/leads-platform/api.js` | `POST .../promote-to-land` |
| `lib/leads-platform/analyzer-sync.js` | Preserve assetClass/teardown on merge |
| `public/js/vault-app.js` | Promote button + confirm modal fields |
| `public/js/land-vault-app.js` | Teardown badge + optional filter |
| `tests/land-teardown.test.js` | Promote unit + API |

---

### Task 1: Promote engine + schema + API

- [x] `promoteLeadToTeardown` sets leadType=land, assetClass=teardown, teardown meta, optional demo on underwriting
- [x] API Max-gated; returns `{ ok, lead, redirect: '/land-vault?lead=...' }`
- [x] Tests + commit

### Task 2: UI

- [x] Home Vault: action “Underwrite as land” → note + demo estimate → POST → redirect to Land Vault
- [x] Land Vault: badge “Teardown” on rows/drawer; queue filter chip Teardown (`assetClass=teardown`)
- [x] verify + commit
