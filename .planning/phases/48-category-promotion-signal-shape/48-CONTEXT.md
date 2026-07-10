# Phase 48: Category Promotion & Signal Shape - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** PRD Express Path (REQUIREMENTS.md + debug diagnosis + user `/gsd:new-milestone` execute)

<domain>
## Phase Boundary

Process path promotes real city categories into `violationIssueType` and keeps `matchedIndicators` as string arrays on process/review rows so Train can label FN/distressed groups and render chips. Export still joins indicators for Analyzer. No grouping-key changes (phase 49). No Train CSS. No phrase-miner changes.

</domain>

<decisions>
## Implementation Decisions

### MAP
- Promote real category columns into `violationIssueType` when unmapped or only in raw cells
- FN groups must show real city category when spreadsheet had one
- Do not invent fake types from pure free-text noise; prefer category-like headers/cells over timestamp-only notes

### SHAPE
- Process/review rows: `matchedIndicators` stays a **string array**
- Export/spreadsheet path: still join to single cell string (Analyzer contract)

### Stack
- Existing Node shell + pure modules in `lib/bridge-engine/*` / normalizer / intake schema
- TDD preferred; unit + processUpload contract tests

### Claude's Discretion
- Exact heuristics for category-like headers (e.g. match "cat", "type", "violation type", "issue type", "vio")
- Whether promotion lives in normalizer vs a small pure helper called from engine

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — MAP-01, MAP-02, MAP-03, SHAPE-01, SHAPE-02

### Diagnosis
- `.planning/debug/filter-singleton-no-category.md` — root cause (unmapped category; indicators stringified)

### Code anchors
- `lib/bridge-engine/normalizer.js`
- `lib/bridge-intake-schema.js`
- `lib/bridge-engine/index.js`
- `lib/bridge-review-groups.js` (consumes type/indicators — do not change keys here)
- Existing tests under `tests/` for engine / normalizer / train

</canonical_refs>

<deferred>
## Deferred Ideas

- Stable group keys / timestamp stripping → Phase 49
- Full regression suite lock → Phase 50
- Train CSS, phrase mining, Analyzer vision — out of milestone

</deferred>

---
*Phase: 48-category-promotion-signal-shape*  
*Context gathered: 2026-07-10 via PRD Express Path*
