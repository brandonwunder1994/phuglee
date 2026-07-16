# Land Desk Phase 5 — Filter → Land Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tax-delinquent / vacant-lot / land-use Filter signals preferentially route toward Land Desk (tags + Analyze hints + Land Vault chips), with a Tax Dirt copy helper — without wiping Filter list files or auto-preferring NOD/pre-foreclosure.

**Architecture:** Pure routing helpers in `lib/leads-platform/land/filter-route.js`. Filter `saveList` attaches additive `landRoute` metadata. Analyzer sync normalizes land signal labels. Land Vault exposes fixed signal chips + Tax Dirt snippet when tax signal present.

**Spec:** `docs/superpowers/specs/2026-07-15-land-desk-design.md` § Phase 5

## Constraints

- Never delete/truncate `data/filter-lists/` or rewrite existing lists en masse.
- Pre-foreclosure / LP / NOD alone must **not** prefer Land path.
- Tax Dirt is copy-only (no dialer).
- After UI: `verify-live.ps1` + `verify-mobile.ps1 -Pages "/land-vault,/bridge"`.

## File map

| File | Role |
|------|------|
| `lib/leads-platform/land/filter-route.js` | Scrub tags + preferLandPath |
| `lib/leads-platform/land/tax-dirt-script.js` | Script lines (from brain) |
| `lib/bridge-list-store.js` | Additive `landRoute` on save |
| `lib/bridge-distress-tagger.js` | Attach `landScrubTags` on tag |
| `lib/leads-platform/analyzer-sync.js` | Normalize land signal tags |
| `public/js/land-vault-app.js` + html/css | Signal chips + Tax Dirt |
| `modules/property-analyzer/public/js/review.js` | Tax list → prefer Land review hint |
| `tests/land-filter-route.test.js` | Routing fixtures |

## Tasks

- [x] Task 1: filter-route + tax-dirt modules + tests
- [x] Task 2: Filter save metadata + tagger enrichment
- [x] Task 3: Analyzer sync signal labels + Analyze import hint
- [x] Task 4: Land Vault chips + Tax Dirt UI + verify
