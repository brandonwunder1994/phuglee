# Requirements: Distress OS — v2.0 Filter Independence & Learning

**Defined:** 2026-07-10  
**Core Value:** Collect → filter non-deals with a brain that learns from admin Approve/Deny → save clean lists for external enrichment → **manual** Analyze import. Filter and Analyze stay independent.

## v2.0 Requirements

Requirements for this milestone only. Each maps to roadmap phases.

### Independence (IND)

- [x] **IND-01**: Process, save, Train, and list APIs never auto-push or write leads into Analyze (no `bridge-import-records` / session write from Filter)
- [x] **IND-02**: Legacy Analyze-push adapter (`bridge-analyzer-push` and any call sites/UI) is deleted or quarantined so it cannot be re-wired without failing tests
- [x] **IND-03**: Automated negative tests prove process + save paths never require Analyze push and never invent Analyze session writes
- [x] **IND-04**: `already_imported` Analyze-index filtering is **off by default** (re-work / purge / re-filter keeps full lists); optional enable only via explicit opt-in if implemented later

### Saved lists (LIST)

- [x] **LIST-01**: After process (and optional Train), operator’s primary path is **Save list** then **Download** (one or all) — not “send to Analyze”
- [x] **LIST-02**: Saved multi-city lists persist until the operator deletes them (process, restart, and deploy do not wipe the list store)
- [x] **LIST-03**: UI workflow and copy teach Process → (Train) → Save → Download for external enrich → manual Analyze import

### Accuracy (ACC)

- [x] **ACC-01**: Gold city fixtures lock residual keep/kill failures (real distress kept; junk denied; water never type-suppressed) — implement fixes, not audit-only
- [x] **ACC-02**: Accuracy changes never silent-drop leads solely for “no Type,” unresolved map, or cleaner kept counts — rows stay for review / FN pool / explicit reasons
- [x] **ACC-03**: v1.7–v1.8 locks preserved: single Type winner (no blend), empty-only category promote, stable group keys, display-only short labels, format confirm on first/changed fingerprint

### Learning (LRN)

- [x] **LRN-01**: Admin can see paired learning metrics: Approve/Deny (or decisions-per-comparable-process) trend **and** gold-set precision/recall not degrading
- [x] **LRN-02**: Metrics cannot be satisfied by hiding Train groups, auto-activating phrases, or silent-dropping rows — learning success requires real rule apply coverage
- [x] **LRN-03**: Type suppress/promote still apply on process from admin decisions; phrases remain proposed-only until admin activate (no unsupervised live ML)

### Efficiency (EFF)

- [ ] **EFF-01**: Operator path to a saved list is shorter for day-2 / known formats: format auto-reuse, stacked Train where applicable, bulk download — without trading away accuracy
- [ ] **EFF-02**: No single-dimension “efficiency” that increases silent drops, skips Train when needed, or re-couples Filter to Analyze

### Regression (TEST)

- [ ] **TEST-01**: Independence regression suite locks no-push + `already_imported` default-off behavior
- [ ] **TEST-02**: Gold accuracy fixtures from ACC run in CI (`npm test`) and stay green
- [ ] **TEST-03**: `scripts/verify-live.ps1` green after milestone work; processUpload e2e still covers Type/format/water paths

## Future Requirements

Deferred — not in this milestone roadmap.

- Richer independence UI messaging pack beyond LIST-03 minimum
- Explicit freeze/version of download column contract for enrich vendors (beyond current export)
- Soft-flag `already_imported` in UI without drop (if opt-in dedupe returns)
- Full admin learning health dashboard (time-series, per-type effectiveness charts)
- Phrase mining quality pass beyond proposed-only gate
- Explicit large-file runtime budget phase (only if a real city is slow)
- List tags/folders, load-saved-list-back-into-Train
- Server-side multi-tenant sessions for admin

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-push / “Send to Analyze” from Filter | External enrich → manual Analyze import |
| Skip-trace or enrichment inside Filter | Wrong product boundary |
| Silent drop leads for cleaner lists | Hides inventory; destroys trust |
| Multi-column Type blend | Brain poison; v1.8 anti-pattern |
| Non-admin Train / per-user brains | Global quality control |
| Auto-activate phrases / ML without admin gate | Controllability |
| Auto-save every process to lists | Clutters staging; loses Train-before-Save |
| Auto-delete lists after download | Destroys operator work |
| Shared store with Analyzer learned-brain | Different domain |
| Analyze vision review redesign | Separate product surface |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IND-01 | Phase 55 | Complete |
| IND-02 | Phase 55 | Complete |
| IND-03 | Phase 55 | Complete |
| IND-04 | Phase 55 | Complete |
| LIST-01 | Phase 56 | Complete |
| LIST-02 | Phase 56 | Complete |
| LIST-03 | Phase 56 | Complete |
| ACC-01 | Phase 57 | Complete |
| ACC-02 | Phase 57 | Complete |
| ACC-03 | Phase 57 | Complete |
| LRN-01 | Phase 58 | Complete |
| LRN-02 | Phase 58 | Complete |
| LRN-03 | Phase 58 | Complete |
| EFF-01 | Phase 59 | Pending |
| EFF-02 | Phase 59 | Pending |
| TEST-01 | Phase 60 | Pending |
| TEST-02 | Phase 60 | Pending |
| TEST-03 | Phase 60 | Pending |

**Coverage:**
- v2.0 requirements: 18 total
- Mapped to phases: 18 (roadmap complete)
- Unmapped: 0

---
*Requirements defined: 2026-07-10*  
*Last updated: 2026-07-10 after roadmap — traceability filled (phases 55–60)*
