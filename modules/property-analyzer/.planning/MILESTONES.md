# Milestones

## v1.7 Lead Export (Shipped: 2026-07-01)

**Phases:** 27–28 (2 phases, 4 plans)  
**Base:** v1.6 shipped  
**Tests:** 188/188 passing at close  
**Verification:** `.planning/phases/28-export-integrity-tests/28-VERIFICATION.md`

**Goal:** Export the full lead database in a dial-ready spreadsheet — address, contact, lead source type, distress tier, property type, and Street View links.

**Key accomplishments:**
- **Export Database (Excel)** — sidebar + ⌘K; exports all leads unfiltered
- **13-column dial-ready schema** — Cache Date, address, dual Street View URLs, Lead Type/Category, Property Type, contact fields
- **`lib/export-schema.js`** — testable column mapper with imagery hydration
- **`lib/export-profiles.js`** — full vs dial_ready profile contract (28 vs 13 columns)
- **21 export unit tests** — hydration, row-count parity, full-profile regression

**Archived:**
- `.planning/milestones/v1.7-ROADMAP.md`
- `.planning/milestones/v1.7-REQUIREMENTS.md`

---

## v1.6 Review Training Reliability (Shipped: 2026-06-30)

**Phases:** 25–26 (2 phases)  
**Tests:** 133/133 passing  
**Audit:** `.planning/v1.6-MILESTONE-AUDIT.md`

**Goal:** Deferred review training, undo rollback, cheaper Gemini metadata mode, integration tests.

---

## v1.5 Classification Reliability Overhaul (Shipped: 2026-06-30)

**Phases:** 21–24 (4 phases)  
**Base:** v1.4 shipped, 78/78 tests  
**GSD:** `docs/gsd/milestones/M4-classification-reliability.md`  
**Audit:** `.planning/v1.5-CLASSIFICATION-AUDIT.md`

**Goal:** Trustworthy distressed detection — Street View first, satellite only when needed, review when unclear.

**Key deliverables:**
- Street-first imagery routing with cache-before-API satellite (CLASS-01–03)
- Prompt de-bias + tier engine rescope (CLASS-04–05)
- Confidence routing + review queue expansion (CLASS-06–08)
- Golden-set regression + FN/FP metrics (CLASS-09–10)

**Archived:**
- `.planning/milestones/v1.5-ROADMAP.md`
- `.planning/milestones/v1.5-REQUIREMENTS.md`

---

## v1.4 Cyber Premium Interface (Shipped: 2026-06-30)

**Phases:** 16–20 (5 phases, ~12 plans)  
**Base:** v1.3 shipped + unplanned cyber shell pivot  
**Tests:** 78/78 passing at milestone start  
**Audit:** `.planning/v1.4-SITE-AUDIT.md`

**Goal:** Unify all 22 UI surfaces under cyber intelligence console aesthetic.

**Archived:**
- `.planning/milestones/v1.4-ROADMAP.md`
- `.planning/milestones/v1.4-REQUIREMENTS.md`

---

## v1.3 Calm Premium Interface (Shipped: 2026-06-30)

**Phases:** 11–15 (5 phases, 14 plans)  
**Base:** `b51da2f` (v1.2) → shipped on `master`  
**Tests:** 78/78 passing  

**Delivered:** Full UI transformation from cyber-HUD shell to calm premium minimalism — tokens, shell, workflow surfaces, results views, and modals — with all v1.2 backend capabilities preserved.

**Archived:**
- `.planning/milestones/v1.3-ROADMAP.md`
- `.planning/milestones/v1.3-REQUIREMENTS.md`

---

## v1.2 Core Bones — Reliability & Classification Foundation

**Status:** Complete  
**Completed:** 2026-06-30  
**Commit:** `b51da2f`

Atomic writes, tier test harness, unified persistence, tier parity, learned brain in session schema v6. 78 tests passing.

**Phases:** 6–10