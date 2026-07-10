# Requirements: Distress OS — v1.6 Filter Superpower Brain

**Defined:** 2026-07-09  
**Core Value:** Collect → Filter → Analyze with seamless navigation; Filter must kill non-deals and improve via admin training.  
**Source:** `/gsd:new-milestone` + MILESTONE-CONTEXT.md (locked product decisions)  
**Codebase map:** `.planning/codebase/` (via `/gsd:map-codebase`)

## v1.6 Requirements

### Runtime brain

- [x] **BRAIN-01**: System persists a global Filter brain file on a durable volume-safe path (same durability pattern as filter lists)
- [x] **BRAIN-02**: System applies active brain rules on every Filter process so future uploads improve for all users
- [x] **BRAIN-03**: Water shut-off uploads are never type-suppressed by the brain

### Review payload

- [x] **REV-01**: Admin can access full not-distressed row payloads after process (false-negative pool), not only discard previews
- [x] **REV-02**: System groups review rows by normalized city Violation/Issue Type (stack identical types; empty type uses description)
- [x] **REV-03**: Each review group exposes matched distress signals and description samples that triggered (or failed) the flag
- [x] **REV-04**: Each process row has a stable rowId for decision targeting

### Admin training UX

- [x] **TRAIN-01**: Admin can open Train brain on Filter results with two sections: marked distressed and not marked distressed
- [x] **TRAIN-02**: Admin can Approve or Deny a stacked violation-type group with one action
- [x] **TRAIN-03**: Non-admin users never see train controls
- [x] **TRAIN-04**: Train UI shows matched signals and description samples on each group card

### Decisions and list mutation

- [x] **DEC-01**: Admin Deny on distressed removes those rows from the current kept list
- [x] **DEC-02**: Admin Approve on not-distressed promotes those rows into the current kept list as distressed
- [x] **DEC-03**: Deny on distressed writes an active global suppress_type rule for that violation type
- [x] **DEC-04**: Approve on not-distressed writes an active global promote_type rule for that violation type
- [x] **DEC-05**: Every decision appends an audit event (who, when, type, counts, samples)
- [x] **DEC-06**: Non-admin brain write APIs return 403 ADMIN_REQUIRED

### Phrase learning depth

- [x] **PHRASE-01**: System mines phrase candidates from free-text / singleton decisions into proposed rules only
- [x] **PHRASE-02**: Proposed phrase rules never affect process until admin activates them
- [x] **PHRASE-03**: Admin can view, activate, reject, or disable type and phrase rules in a Filter brain panel

### Hardening

- [ ] **HARD-01**: Admin can undo the last training decision (list snapshot client-side + rule revert server-side)
- [ ] **HARD-02**: Brain file enforces caps on events and rules; version conflicts return 409
- [ ] **HARD-03**: Admin can view brain metrics (decision counts, active/proposed rule counts)
- [ ] **HARD-04**: Tagging documentation describes base regex + brain layers; npm test and verify-live pass

## Future Requirements (deferred)

- Server-side authenticated sessions (replace spoofable X-Phuglee-User for production multi-tenant)
- Per-city brain scopes
- ML fine-tuning pipeline
- Non-admin read-only brain metrics dashboard

## Out of Scope

| Feature | Reason |
|---------|--------|
| Analyze vision Keep/Change redesign | Separate product; has its own learned-brain |
| Shared store with Analyzer learned-brain | Different domain (vision tiers vs text tags) |
| Per-user training brains | Product is global quality for all customers |
| Non-admin training | Quality control / sellable tool integrity |
| Black-box auto ML without admin gate | Controllability requirement |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRAIN-01 | Phase 42 | Complete |
| BRAIN-02 | Phase 42 | Complete |
| BRAIN-03 | Phase 42 | Complete |
| REV-01 | Phase 43 | Complete |
| REV-02 | Phase 43 | Complete |
| REV-03 | Phase 43 | Complete |
| REV-04 | Phase 43 | Complete |
| TRAIN-01 | Phase 44 | Complete |
| TRAIN-02 | Phase 44 | Complete |
| TRAIN-03 | Phase 44 | Complete |
| TRAIN-04 | Phase 44 | Complete |
| DEC-01 | Phase 45 | Complete |
| DEC-02 | Phase 45 | Complete |
| DEC-03 | Phase 45 | Complete |
| DEC-04 | Phase 45 | Complete |
| DEC-05 | Phase 45 | Complete |
| DEC-06 | Phase 45 | Complete |
| PHRASE-01 | Phase 46 | Complete |
| PHRASE-02 | Phase 46 | Complete |
| PHRASE-03 | Phase 46 | Complete |
| HARD-01 | Phase 47 | Pending |
| HARD-02 | Phase 47 | Pending |
| HARD-03 | Phase 47 | Pending |
| HARD-04 | Phase 47 | Pending |

**Coverage:**
- v1.6 requirements: 24 total
- Mapped to phases: 24/24 ✓
- Unmapped: 0

| Phase | Requirements |
|-------|--------------|
| 42 Brain store + runtime apply | BRAIN-01, BRAIN-02, BRAIN-03 |
| 43 Review payload + grouping | REV-01, REV-02, REV-03, REV-04 |
| 44 Admin Train brain UX | TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04 |
| 45 Decisions + type rules + list mutation | DEC-01–DEC-06 |
| 46 Phrase mining + brain panel | PHRASE-01, PHRASE-02, PHRASE-03 |
| 47 Hardening + metrics + docs | HARD-01, HARD-02, HARD-03, HARD-04 |

---
*Requirements defined: 2026-07-09 via GSD new-milestone*  
*Traceability: 2026-07-09 via gsd-roadmapper*  
*Last updated: 2026-07-09*
