# Requirements: Distress OS — v1.8 Type Column Intelligence

**Defined:** 2026-07-09  
**Core Value:** Filter non-deals with admin learning — Train must use the **correct** city Violation Type column so categories (and brain rules) are not poisoned by wrong maps or unreadable walls of text.

## v1.8 Requirements

Requirements for this milestone only. Each maps to roadmap phases.

### Type column scoring & resolve (COL)

- [ ] **COL-01**: On process, every source column is scored for Violation Type candidacy using header aliases **and** value shapes (category-like, not date-dominated, not address-dominated, reasonable length/uniqueness); system maps **exactly one** winner into `columnMap.violationIssueType` (never blend/concatenate columns)
- [ ] **COL-02**: When no column meets Type candidacy threshold, Type stays empty and rows are still kept for review when distressed (or for FN pool as today) — **never** silent-drop solely because “no type column”
- [ ] **COL-03**: v1.7 `promoteCategoryFromRaw` runs only after scorer/confirm path and only when mapped Type cell is still empty; promote must not override a chosen Type column
- [ ] **COL-04**: Scorer/confirm choice **forces** `columnMap.violationIssueType` (aliases are scorer features, not a parallel first-match winner that can undercut the scorer)

### Format memory & confirm gate (GATE)

- [ ] **GATE-01**: Each city (+ upload type) stores a durable **format fingerprint** (order-independent normalized headers + light value-shape signature — not full-file hash) and last confirmed Type header
- [ ] **GATE-02**: First upload for a city format **or** fingerprint differs from last confirmed for that city → process **pauses** for admin Type-column confirmation before normalize/tag/brain
- [ ] **GATE-03**: Matching fingerprint reuses last confirmed Type column with **no** confirm modal
- [ ] **GATE-04**: Confirm UI shows ranked candidates, suggested winner pre-selected, sample cell values, ability to pick another column, and “No type column” (keep for review)
- [ ] **GATE-05**: Confirm persist is admin-only; non-admin uploads with new/changed format do not hang forever (clear pending/confirm-required state; no infinite server wait)
- [ ] **GATE-06**: Multi-file batch (up to 5): fingerprint/confirm policy is explicit per file or batch (same city); mixed formats do not silently apply one file’s Type column to another

### Display short labels (LBL)

- [ ] **LBL-01**: Train / review group titles use a **display-only** short label when type or description is a long wall of text (deterministic heuristic: first clause / before em-dash / max ~48–64 chars; strip incidental timestamps where already cleaned)
- [ ] **LBL-02**: Full raw type/description remains on the row for distress matching, export, brain keys, and decision payloads — short label must **never** replace stored `violationIssueType` or become the group key
- [ ] **LBL-03**: Decision POST / undo paths use full type labels from group metadata (not scraped truncated DOM titles)

### Process meta & regression (META / TEST)

- [ ] **META-01**: Process/review meta exposes Type resolution: winner header, score (or null), runner-up optional, source (`auto_reuse` | `admin_confirm` | `scorer` | `unresolved`)
- [ ] **TEST-01**: Automated: sheet where alias-first would map a narrative/date/status column → scorer maps the true category Type column
- [ ] **TEST-02**: Automated: same city same fingerprint reuses confirmed header without confirm; fingerprint change requires confirm again
- [ ] **TEST-03**: Automated: short label shortens display; stored type + export + group keys unchanged; `npm test` + `scripts/verify-live.ps1` green

## Future Requirements

Deferred — not in this milestone.

- ML / embeddings column classifier or LLM paraphrase of Type
- Learned global header synonyms across cities
- Confirm every upload (max safety, high fatigue)
- Per-user Type column preferences
- Multi-column Type blend / subtype concatenation into Type
- Server-side multi-tenant auth for admin confirm (header admin remains for local single-tenant)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-column blend into Type | Unstable groups + brain poison |
| Replace stored type with short/LLM text | Breaks distress match, export, brain keys |
| Silent drop when no Type column | Hides real leads |
| Storing format memory inside `global-brain.json` | Separate concern; avoid brain file bloat/coupling |
| Train CSS redesign | Accuracy + labels, not chrome |
| Tagger keep/discard policy rewrite | Distress rules stay |
| Analyzer vision Keep/Change | Different product surface |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COL-01 | Phase 51 | Pending |
| COL-02 | Phase 51 | Pending |
| COL-03 | Phase 51 | Pending |
| COL-04 | Phase 51 | Pending |
| GATE-01 | Phase 52 | Pending |
| GATE-02 | Phase 52 | Pending |
| GATE-03 | Phase 52 | Pending |
| GATE-04 | Phase 52 | Pending |
| GATE-05 | Phase 52 | Pending |
| GATE-06 | Phase 52 | Pending |
| META-01 | Phase 52 | Pending |
| LBL-01 | Phase 53 | Pending |
| LBL-02 | Phase 53 | Pending |
| LBL-03 | Phase 53 | Pending |
| TEST-01 | Phase 54 | Pending |
| TEST-02 | Phase 54 | Pending |
| TEST-03 | Phase 54 | Pending |

**Coverage:** 17/17 v1.8 requirements mapped ✓
