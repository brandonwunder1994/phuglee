---
name: leads-platform
description: Build and maintain Phuglee The Vault (Leads Platform) at /vault — curated leads catalog, filters, scoring, Max plan gates. Use when working on vault.html, vault-app.js, lib/leads-platform/, or /api/leads routes.
---

# Leads Platform (The Vault)

Customer-facing name: **The Vault**. Engineering codename: **Leads Platform**. Route: `/vault`.

## When to use

- Implementing or debugging the curated leads database
- Adding filters, scoring, export, favorites, or publish pipeline
- Evolving `vault.html` / `vault.css` / `vault-app.js`
- Any work under `lib/leads-platform/` or `/api/leads/*`

## Read first

1. `docs/superpowers/specs/2026-07-13-leads-platform-design.md` — canonical design
2. `docs/superpowers/plans/2026-07-13-leads-platform.md` — implementation tasks
3. `PRODUCT.md` — brand anti-patterns (no fake leads, no generic SaaS)
4. `public/vault.html` + `public/css/vault.css` — current preview/gate UI

## Product rules (non-negotiable)

1. **Distressed leads** only publish when `reviewStatus === 'approved'`.
2. **Never wipe** `data/filter-lists/`, `data/bridge-brain/`, or `data/leads-catalog/` unless user explicitly asks.
3. **No fake leads** in production UI — use `tests/fixtures/leads/` for dev/tests.
4. **Max plan** (`plan === 'max'`) required for catalog data; Pro gets upgrade gate with honest copy.
5. **verify-live.ps1** must pass before saying Vault is live.

## Lead types

| ID | Source bucket | Gate |
|----|---------------|------|
| `distressed` | Analyze Distressed | Approved review only |
| `well_maintained` | Analyze WM | QA pass |
| `land` | Analyze Land | QA pass |

## Architecture

```
Analyze scan → manual review → analyzer-sync → data/leads-catalog/ → GET /api/leads → vault-app.js
```

- **Sync:** `lib/leads-platform/analyzer-sync.js` — reads `PDA_DATA_ROOT/users/*/distressAnalyzerSession_LATEST.json`
- **Store:** `lib/leads-platform/store.js` — disk JSON (like bridge-list-store)
- **API:** `lib/leads-platform/api.js` — mounted in `server.js`
- **Client:** `public/js/vault-app.js` — vanilla, Phuglee design system
- **Scoring:** `lib/leads-platform/scoring.js` — `priorityScore` 0–100

## UI regions (DOM contracts)

| ID | Role |
|----|------|
| `#vault-gate` | Non-Max upgrade overlay |
| `#vault-app` | Max user app root |
| `#vault-hero` | Type tabs + KPIs |
| `#vault-filters` | Filter rail |
| `#vault-results` | Table |
| `#vault-drawer` | Lead dossier |

## Design system

- Layer 0–1: `tokens.css`, `phuglee-components.css`, `phuglee-table`
- Layer 2: shell nav, premium bg (`has-premium-bg`)
- Layer 3: `vault.css` only for Vault layout/theater

Match Filter desk density. Gold score column, orange hot signals. No scanlines/blur on live Max table.

## Filters (AND signal stack)

Signal chips use **AND** logic — lead must have all selected tags. Combine with geo, score range, and free-text `q`.

## Reuse existing code

| Need | Look at |
|------|---------|
| Disk store patterns | `lib/bridge-list-store.js` |
| Export CSV/XLSX | `lib/bridge-export.js` |
| Plan / scope | `modules/property-analyzer/lib/user-session.js` |
| Auth | `lib/phuglee-auth.js`, `public/js/auth-session.js` |
| Intake columns | `docs/bridge/DATA-STANDARDS.md` |
| Analyze buckets | v3.1 scan desk phases |

## Testing

```bash
node scripts/sync-vault-from-analyzer.js --force
node --test tests/leads-platform.test.js
npm test
powershell -File scripts/verify-live.ps1
```

## Milestone

v4.0 phases 89–97. Roadmap: `.planning/milestones/v4.0-ROADMAP.md`
