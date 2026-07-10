# Requirements: Distress OS — v1.7 Filter Accuracy & Grouping

**Defined:** 2026-07-10  
**Core Value:** Filter non-deals with admin learning — Train must show accurate categories and efficient groups so training is usable.

## v1.7 Requirements

Requirements for this milestone only. Each maps to roadmap phases.

### Grouping stability (GROUP)

- [ ] **GROUP-01**: When `violationIssueType` is empty, review groups key free-text descriptions after stripping incidental dates/times so rows that differ only by timestamp stack into one group
- [ ] **GROUP-02**: When type values themselves embed per-row timestamps/dates, grouping still stacks rows that share the same category phrase
- [ ] **GROUP-03**: Rows that already have a clean shared `violationIssueType` (e.g. typed High Grass) continue to stack on the normalized type key (no regression)
- [ ] **GROUP-04**: Singleton (`isSingleton` / badge) is true only when the stabilized group has count === 1

### Category mapping (MAP)

- [x] **MAP-01**: When a source category/issue-type column is present but unmapped (or only in raw cells), process path promotes a real category into `violationIssueType` for Train labels
- [x] **MAP-02**: Not-distressed (false-negative) groups show the real city category when the spreadsheet had one, not only notes or `(no type)`
- [x] **MAP-03**: Promotion must not invent fake types from pure free-text noise when no category signal exists; prefer category-like headers/cells over timestamp-only notes

### Signal shape (SHAPE)

- [x] **SHAPE-01**: Process/review rows keep `matchedIndicators` as string arrays so Train chips can render matches
- [x] **SHAPE-02**: Spreadsheet/export path still joins indicators to a single cell string (export contract unchanged for Analyzer)

### Verification (TEST)

- [ ] **TEST-01**: Automated test: Description-only High Grass rows with differing timestamps → one distressed group with count N
- [ ] **TEST-02**: Automated test: Unmapped category column → `violationIssueType` populated and FN/distressed labels use it
- [ ] **TEST-03**: Automated test: Typed clean High Grass still stacks; `npm test` and `scripts/verify-live.ps1` green

## Future Requirements

Deferred — not in this milestone.

- Server-side multi-tenant auth for admin train
- Smarter multi-column category heuristics beyond promote/map
- Cross-upload soft clustering / embeddings

## Out of Scope

| Feature | Reason |
|---------|--------|
| Train CSS / visual redesign | Accuracy bug, not chrome |
| Phrase mining / brain panel rule lifecycle | Separate domain; works for v1.6 |
| Analyzer vision Keep/Change review | Different product surface |
| Tagger keep/discard policy rewrite | Distress-only rules stay |
| Per-user / per-city brains | Global product decision holds |
| Black-box ML | Controllability |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAP-01 | Phase 48 | Complete |
| MAP-02 | Phase 48 | Complete |
| MAP-03 | Phase 48 | Complete |
| SHAPE-01 | Phase 48 | Complete |
| SHAPE-02 | Phase 48 | Complete |
| GROUP-01 | Phase 49 | Pending |
| GROUP-02 | Phase 49 | Pending |
| GROUP-03 | Phase 49 | Pending |
| GROUP-04 | Phase 49 | Pending |
| TEST-01 | Phase 50 | Pending |
| TEST-02 | Phase 50 | Pending |
| TEST-03 | Phase 50 | Pending |

**Coverage:**
- v1.7 requirements: 12 total
- Mapped to phases: 12/12 ✓
- Unmapped: 0

| Phase | Requirements | Count |
|-------|--------------|-------|
| 48 Category Promotion & Signal Shape | MAP-01–03, SHAPE-01–02 | 5 |
| 49 Stable Group Keys | GROUP-01–04 | 4 |
| 50 Regression Lock | TEST-01–03 | 3 |

---
*Requirements defined: 2026-07-10*  
*Source: MILESTONE-CONTEXT + `.planning/debug/filter-singleton-no-category.md`*  
*Last updated: 2026-07-10 — roadmap phases 48–50 mapped*
