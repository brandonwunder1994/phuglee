# Phase 50: Regression Lock - Research

**Researched:** 2026-07-10  
**Domain:** Filter/Bridge accuracy regression lock — processUpload e2e contracts + full suite + live server gate  
**Confidence:** HIGH

## Summary

Phase 50 does **not** implement new product features. Phases 48 (MAP/SHAPE) and 49 (stable group keys) already ship the accuracy fixes: category promotion into `violationIssueType`, array-shaped `matchedIndicators` on the process path, and timestamp-stable review group keys via `lib/bridge-stable-text.js` + wired `buildReviewGroups`. Unit matrices already lock GROUP-01..04 and MAP unit behavior.

What remains is the **end-to-end regression lock** required by TEST-01..03: `processUpload` contracts that prove the diagnosis fixtures no longer produce false singletons or missing categories, plus a green full `npm test` and `scripts/verify-live.ps1` gate. The critical gap is TEST-01 — no engine test currently asserts description-only High Grass rows with differing timestamps collapse to **one** distressed group with count N. TEST-02 is largely covered by the existing MAP-01/02 processUpload test (strengthen if needed). TEST-03 needs an explicit typed High Grass stack contract plus the suite + live gates.

**Primary recommendation:** One plan — extend `tests/bridge-engine.test.js` with TEST-01/03 processUpload contracts (reuse diagnosis CSV shapes), assert TEST-02 still green (existing or tightened), run `npm test` + `scripts/verify-live.ps1`, optionally add a short TAGGING-RULES note on Train grouping / category promotion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**TEST**
- Description-only High Grass + timestamps → one distressed group count N
- Unmapped category column → type populated; labels use it
- Typed High Grass still stacks; full suite + verify-live green

### Claude's Discretion

- New test file vs extend existing engine/grouping tests
- Whether to document fix in TAGGING-RULES briefly

### Deferred Ideas (OUT OF SCOPE)

None within milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Automated: Description-only High Grass rows with differing timestamps → one distressed group with count N | processUpload CSV with empty type column + timestamped description notes; assert `reviewGroups.distressed` length 1, count N, `isSingleton === false` |
| TEST-02 | Automated: Unmapped category column → `violationIssueType` populated; FN/distressed labels use it | Existing `processUpload promotes unmapped Vio Cat…` + MAP unit tests; strengthen distressed group label if weak |
| TEST-03 | Automated: Typed clean High Grass still stacks; `npm test` + `scripts/verify-live.ps1` green | processUpload with shared typed High Grass → 1 group count N; full suite gate; live health/home 200 |
</phase_requirements>

---

## Gap Analysis (current tree vs TEST-01..03)

| Req | Unit coverage (post-48/49) | processUpload / e2e | Gap for Phase 50 |
|-----|----------------------------|---------------------|------------------|
| **TEST-01** | ✅ `bridge-review-groups.test.js` GROUP-01 (synthetic rows, empty type + timestamps → 1 group count 3) | ❌ **Missing** — no engine CSV path | **Primary work:** add processUpload contract |
| **TEST-02** | ✅ `bridge-category-promote.test.js` MAP matrix | ✅ `bridge-engine.test.js` MAP-01/02 Vio Cat → type + FN group label | **Mostly locked** — keep green; optional assert distressed group label includes High Grass |
| **TEST-03** | ✅ 20-row typed stack + case/spacing + stable-text clean no-op | ⚠️ Partial — fixture path groups by type but not explicit “typed High Grass count N” lock | Add explicit typed processUpload stack; run `npm test` + `verify-live.ps1` |

**Also green already (do not re-implement):**
- SHAPE-01/02 — array indicators on process path; export join (`bridge-intake-schema`, engine, export tests)
- MAP-03 — description-only free text does not invent type
- GROUP-02/04 unit — timestamped type cells stack; `isSingleton` formula
- `lib/bridge-stable-text.js` pure strip/stable keys wired into `buildReviewGroups`

**Diagnosis fixture shapes (authoritative reproduction):** `.planning/debug/filter-singleton-no-category.md`
- Description-only: 3 High Grass rows, `type=''`, notes differ only by US timestamps → **was** 3 singleton groups
- Unmapped `Vio Cat`: High Grass distressed + Fence Permit FN → **was** notes-only / `(no type)` labels

---

## Standard Stack

### Core

| Library / Tool | Version / Location | Purpose | Why Standard |
|----------------|--------------------|---------|--------------|
| `node:test` + `node:assert/strict` | Node 20+ | Automated contracts | Project standard (`package.json` `"test": "node --test tests/**/*.test.js"`) |
| `processUpload` | `lib/bridge-engine` | Full pipeline e2e (parse → normalize → tag → brain → groups) | Only path that proves MAP + GROUP compose for Train |
| `buildReviewGroups` | `lib/bridge-review-groups.js` | Unit grouping (already locked in Phase 49) | Do not re-test units unless engine fails |
| `scripts/verify-live.ps1` | repo scripts | Health + homepage HTTP 200; auto-ensure server | AGENTS.md mandatory live gate |

### Supporting

| Module / Doc | Purpose | When to Use |
|--------------|---------|-------------|
| `tests/bridge-engine.test.js` | processUpload contracts | **Primary file for TEST-01..03 e2e** |
| `tests/bridge-review-groups.test.js` | GROUP unit matrix | Already covers precursors — do not duplicate unless broken |
| `tests/bridge-category-promote.test.js` | MAP unit matrix | Keep green; no new product code |
| `docs/bridge/TAGGING-RULES.md` | Operator-facing tagging/brain docs | Optional brief note (discretion) |
| `docs/bridge/TEST-PLAN.md` | Case ID → automated file map | Optional one-line TEST-01..03 mapping |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `bridge-engine.test.js` | New `tests/bridge-v17-accuracy.test.js` | New file isolates milestone; engine file already owns processUpload contracts and MAP tests — **prefer extend** |
| Full browser e2e (Playwright) | processUpload + group asserts | Out of stack; Train UI already faithful to server groups (Phase 43/44) |
| Wire `verify-live` into `npm test` | Separate PowerShell gate | Live server is not a unit test; keep separate per AGENTS.md / TESTING.md |

**Installation:** none — no new npm packages.

```bash
node --test tests/bridge-engine.test.js
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

---

## Architecture Patterns

### Recommended project structure (Phase 50 touch set)

```
tests/
└── bridge-engine.test.js     # EXTEND — TEST-01, TEST-03 processUpload; tighten TEST-02 if needed

docs/bridge/
└── TAGGING-RULES.md          # OPTIONAL — brief Train grouping / category promote note

# Read-only (assert green; no product rework unless a test fails):
lib/bridge-category-promote.js
lib/bridge-stable-text.js
lib/bridge-review-groups.js
lib/bridge-engine/normalizer.js
lib/bridge-intake-schema.js
scripts/verify-live.ps1
```

### Pattern 1: processUpload contract (engine e2e)

**What:** In-memory CSV buffer → `processUpload({ buffer, filename, city, uploadType: 'code_violation' })` → assert `result.rows` / `result.notDistressedRows` / `result.reviewGroups`.

**When to use:** Any accuracy claim that depends on normalizer + tagger + grouping composition (TEST-01, TEST-02, TEST-03).

**Existing setup to copy** (`tests/bridge-engine.test.js`):
- `before`/`after` temp `BRIDGE_BRAIN_ROOT`
- Stub `loadImportAddressIndex` to empty set
- `CITY = { id: 'arizona-marana', city: 'Marana', state: 'Arizona' }`

### Pattern 2: Explicit TEST-named assertions

**What:** Test titles include requirement IDs so gate failure maps to REQUIREMENTS.md.

**Example names:**
- `processUpload: description-only High Grass + timestamps → 1 distressed group count N (TEST-01)`
- `processUpload: unmapped Vio Cat type + labels (TEST-02)` — keep/rename existing MAP test
- `processUpload: typed clean High Grass stacks count N (TEST-03)`

### Pattern 3: Live gate is separate from unit suite

**What:** `npm test` never starts the HTTP server. Phase 50 Task N must run `scripts/verify-live.ps1` (exits 0 only if `/api/health` and `/` return 200; auto-ensure/restart if down).

**When to use:** Final verification task only — not mid-edit unless `public/` or `server.js` changed (Phase 50 should not need those).

### Anti-Patterns to Avoid

- **Re-implementing strip/promote in tests:** Import production behavior via `processUpload` only; do not re-code timestamp regex in the test.
- **Duplicating GROUP unit tests in engine file:** Unit matrix already in `bridge-review-groups.test.js`; engine tests should use multi-row CSVs and assert **group count / isSingleton / labels**.
- **Changing product code “to make tests pass” without a real regression:** Phase 50 is a lock. If a contract fails, fix is a bugfix in 48/49 modules — not new heuristics.
- **Browser automation for Train badges:** Server `isSingleton` / labels are source of truth.
- **Blocking `node server.js` in agent shell:** Always use `scripts/verify-live.ps1` / `restart.ps1` (Job Object kills).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timestamp strip in e2e | Custom test-only normalizer | Real `processUpload` → `buildReviewGroups` | Must lock production path |
| Category invent from notes | Fake type assignment in fixture setup | Unmapped `Vio Cat` column for TEST-02; empty type + notes for TEST-01 | Matches diagnosis |
| Live health check | curl one-off in chat | `scripts/verify-live.ps1` | Ensures + restarts headless; AGENTS.md |
| New test framework | Jest/Vitest | `node:test` | Project standard |
| New fixture files unless needed | Large golden CSV corpus | Inline CSV strings in engine tests (Phase 48 pattern) | Fast, readable, no fixture drift |

**Key insight:** The bug was composition (empty type + exact keys + unmapped headers). Unit tests prove pieces; Phase 50 locks the **composed** processUpload path that Train actually sees.

---

## Common Pitfalls

### Pitfall 1: TEST-01 CSV accidentally maps Description → type

**What goes wrong:** Header aliases like `violation description` map free-text **into** `violationIssueType`, so the case becomes GROUP-02 (typed timestamp stack) not empty-type GROUP-01.

**Why it happens:** Intake aliases include description-like type headers.

**How to avoid:** Use headers that leave type empty, e.g. `Property Address,Description` or `Property Address,Notes` — same as MAP-03 fixture. Confirm `result.rows[*].violationIssueType` is empty (or only promoted if a category column exists — TEST-01 must have **no** category column).

**Warning signs:** Distressed groups have non-`__unknown__` type keys while you intended description-only.

### Pitfall 2: Rows not tagged Strong Distressed

**What goes wrong:** Notes without vegetation keywords → rows land in `notDistressedRows` or are discarded; TEST-01 asserts on wrong section.

**Why it happens:** Keep filter is distress-only for code_violation.

**How to avoid:** Notes must include High Grass / weeds language (diagnosis used that). Assert `result.rows.length === N` kept Strong before asserting groups.

**Warning signs:** `reviewGroups.distressed` empty or length 0 while FN has the rows.

### Pitfall 3: Asserting group length without count

**What goes wrong:** Multiple groups still pass a weak “some High Grass group exists” assert.

**How to avoid:** Exact: `distressed.length === 1`, `groups[0].count === N`, `isSingleton === false`.

### Pitfall 4: Treating verify-live as optional

**What goes wrong:** Suite green but server dead; user opens localhost and sees failure.

**How to avoid:** Explicit final task: `verify-live.ps1` exit 0. Phase 50 CONTEXT locks this.

### Pitfall 5: Editing TAGGING-RULES without a doc assertion

**What goes wrong:** Doc bit-rots (Phase 47 pattern used a hardening test for Superpower Brain section).

**How to avoid:** If documenting, either keep the note tiny (no test) or add a one-line match test like HARD-04. Prefer **tiny optional note** without new test unless planner wants parity.

### Pitfall 6: Scope creep into brain-apply timestamp strip

**What goes wrong:** Phase 49 open question — type rules match raw keys; timestamped type cells may miss rules.

**How to avoid:** Out of Phase 50 scope. Document only if a TEST fails for that reason (unlikely for clean typed High Grass TEST-03).

---

## Code Examples

Verified patterns from this repo (Phase 48 engine contracts + diagnosis fixtures).

### TEST-01 — description-only High Grass timestamps (processUpload)

```javascript
// Pattern: tests/bridge-engine.test.js MAP/processUpload contracts
// Fixture shape: .planning/debug/filter-singleton-no-category.md (e2e description-only)

test('processUpload: description-only High Grass + timestamps → 1 distressed group count N (TEST-01)', async () => {
  const csv = [
    'Property Address,Description',
    '100 Main St,High Grass and Weeds - 01/15/2024 10:30',
    '200 Oak Ave,High Grass and Weeds - 01/16/2024 11:00',
    '300 Pine Rd,High Grass and Weeds - 01/17/2024 09:15'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'desc-timestamps.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 3, 'all three High Grass rows kept Strong');
  // type must stay empty (MAP-03) — grouping uses stable description keys
  for (const row of result.rows) {
    assert.equal(String(row.violationIssueType || '').trim(), '');
  }

  const distressed = result.reviewGroups.distressed || [];
  assert.equal(distressed.length, 1, 'timestamp variants must stack into one group');
  assert.equal(distressed[0].count, 3);
  assert.equal(distressed[0].isSingleton, false);
  assert.equal(distressed[0].violationTypeKey, '__unknown__');
});
```

### TEST-02 — existing MAP processUpload (keep / slightly strengthen)

```javascript
// Source: tests/bridge-engine.test.js — already present
// 'processUpload promotes unmapped Vio Cat into type and FN labels (MAP-01/02)'
//
// Minimum asserts already cover:
// - grass.violationIssueType includes 'High Grass'
// - fenceFn.violationIssueType includes 'Fence Permit'
// - FN group label is Fence*, not 'admin' or '(no type)'
//
// Optional strengthen for TEST-02 wording:
// - distressed group label includes High Grass when Vio Cat present
```

### TEST-03 — typed clean High Grass stack + gates

```javascript
test('processUpload: typed clean High Grass stacks count N (TEST-03)', async () => {
  const csv = [
    'Property Address,Violation Type,Notes',
    '100 Main St,High Grass and Weeds,yard check A',
    '200 Oak Ave,High Grass and Weeds,yard check B',
    '300 Pine Rd,High Grass and Weeds,yard check C'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'typed-high-grass.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);
  assert.ok(result.rows.length >= 3);
  const grassGroups = (result.reviewGroups.distressed || []).filter((g) =>
    /high grass/i.test(g.violationTypeLabel || g.violationTypeKey || '')
  );
  assert.equal(grassGroups.length, 1);
  assert.ok(grassGroups[0].count >= 3);
  assert.equal(grassGroups[0].isSingleton, false);
});

// Final gate (shell, not node:test):
// npm test
// powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

### Optional TAGGING-RULES note (discretion — recommend brief)

Add under Filter Superpower Brain or a short “Train review grouping” subsection:

```markdown
### Train review grouping (v1.7 accuracy)

- Unmapped category-like columns (e.g. `Vio Cat`) promote into Violation/Issue Type so FN and distressed labels show the city category.
- Incidental dates/times in free-text descriptions or type cells are stripped for **group keys only** so same-category rows stack; Singleton is only when group count === 1.
- Process rows keep matched signal indicators as arrays for Train chips; export still joins with `; `.
```

No product code change required for the note.

---

## Recommended Plan Split

| Plan | Focus | Deliverables | Req |
|------|--------|--------------|-----|
| **50-01 Regression lock (single plan)** | Missing processUpload contracts + full suite + verify-live + optional docs | Extend `bridge-engine.test.js`; optional `TAGGING-RULES.md`; gates green | TEST-01, TEST-02, TEST-03 |

**Recommendation: 1 plan** (user request + single domain):

1. **Task 1 — TEST-01 e2e:** Add failing then green processUpload description-only timestamp stack test (if already green after 49, still add the contract — it is the lock).
2. **Task 2 — TEST-02/03 contracts:** Ensure Vio Cat MAP test remains (rename/tag TEST-02); add typed High Grass stack processUpload (TEST-03 product assert).
3. **Task 3 — Gates + optional docs:** `npm test` green; `scripts/verify-live.ps1` exit 0; optional TAGGING-RULES brief note; optional TEST-PLAN.md row for v1.7 accuracy cases.

**Discretion resolution (recommended):**
- **Extend** `tests/bridge-engine.test.js` — do **not** create a new test file (processUpload contracts already live there; grouping units already in `bridge-review-groups.test.js`).
- **Do document** a short TAGGING-RULES note — operators/admins need to know why Train stacks and why categories appear; keep it ≤15 lines.

**Out of scope:** Train CSS, phrase miner, brain-apply key strip, new MAP/GROUP heuristics, Playwright, monorepo `scripts/verify.ps1` full sweep (optional extra; not required by CONTEXT — CONTEXT specifies `npm test` + `verify-live.ps1`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 43 exact description keys | Phase 49 stable strip keys | 2026-07-10 | Timestamp free-text stacks |
| Unmapped category lost | Phase 48 promoteCategoryFromRaw | 2026-07-10 | FN/distressed labels show city category |
| Indicators joined early | Phase 48 array on process path | 2026-07-10 | Train chips render |
| Diagnosis-only e2e (manual) | Phase 50 automated processUpload lock | this phase | Prevents silent accuracy regression |

**Deprecated/outdated:**
- Relying only on unit GROUP tests for “Train is fixed” — Train sees processUpload output; TEST-01 must be engine-level.
- Phase 43 “empty type → exact description” as product truth — superseded for keys by GROUP-01 / Phase 49.

---

## Open Questions

1. **Does TEST-02 need a new test or only keep existing MAP e2e?**  
   - What we know: MAP-01/02 processUpload already asserts type population + FN labels.  
   - What's unclear: whether planner wants an explicit `TEST-02` name / distressed label strengthen.  
   - Recommendation: Rename or alias-comment existing test as TEST-02; add one distressed group label assert if missing.

2. **Should `docs/bridge/TEST-PLAN.md` get v1.7 rows?**  
   - What we know: TESTING.md says update TEST-PLAN when adding bridge coverage.  
   - Recommendation: Optional small table rows under a “Train accuracy (v1.7)” section — low cost.

3. **Is Phase 49 fully merged before Phase 50 execute?**  
   - What we know: `lib/bridge-stable-text.js` + GROUP unit tests are present in tree now.  
   - Recommendation: Planner assumes 49 is done; if TEST-01 fails on execute, fix is in stable-text/review-groups (49 domain), not new Phase 50 product design.

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-engine.test.js` |
| Full suite command | `npm test` |
| Live gate | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TEST-01 | Description-only High Grass + timestamps → 1 distressed group count N | processUpload e2e | `node --test --test-name-pattern="TEST-01" tests/bridge-engine.test.js` | ❌ Wave 0 — add to engine |
| TEST-02 | Unmapped category → type + labels | processUpload e2e (+ unit MAP) | `node --test --test-name-pattern="Vio Cat\|TEST-02" tests/bridge-engine.test.js` | ✅ engine MAP test; optional rename |
| TEST-03 | Typed High Grass stacks | processUpload e2e | engine TEST-03 pattern | ❌ Wave 0 — add explicit typed stack |
| TEST-03 | Full suite green | suite | `npm test` | ✅ infrastructure |
| TEST-03 | Live server green | smoke | `scripts\verify-live.ps1` | ✅ script exists |

**Supporting (already green — regression only):**

| Precursor | File | Role |
|-----------|------|------|
| GROUP-01..04 units | `tests/bridge-review-groups.test.js` | Key stability |
| strip/stable units | `tests/bridge-stable-text.test.js` | Pure helpers |
| MAP units | `tests/bridge-category-promote.test.js` | Promote heuristics |
| MAP-03 engine | `tests/bridge-engine.test.js` | No invent from free text |
| SHAPE engine | `tests/bridge-engine.test.js` | Indicator arrays |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-engine.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green **and** `scripts/verify-live.ps1` exit 0 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-engine.test.js` — TEST-01 processUpload description-only timestamp stack (count N, one group)
- [ ] `tests/bridge-engine.test.js` — TEST-03 processUpload typed clean High Grass stack
- [ ] (optional) Tag/rename existing Vio Cat processUpload as TEST-02; assert distressed label
- [ ] (optional) `docs/bridge/TAGGING-RULES.md` — brief v1.7 Train grouping / promote note
- [ ] Framework install: none — `node:test` already used

Existing unit infrastructure covers GROUP/MAP precursors — Phase 50 Wave 0 is **engine contract gaps + gates**, not a new harness.

---

## Sources

### Primary (HIGH confidence)

- `.planning/phases/50-regression-lock/50-CONTEXT.md` — locked TEST decisions
- `.planning/REQUIREMENTS.md` — TEST-01..03, GROUP/MAP/SHAPE traceability
- `.planning/debug/filter-singleton-no-category.md` — diagnosis e2e fixtures and expected failures
- `tests/bridge-engine.test.js` — existing MAP processUpload contracts
- `tests/bridge-review-groups.test.js` — GROUP-01..04 unit matrix (Phase 49)
- `tests/bridge-stable-text.test.js` — strip/stable unit matrix
- `lib/bridge-stable-text.js`, `lib/bridge-review-groups.js`, `lib/bridge-category-promote.js` — production lock targets
- `scripts/verify-live.ps1`, `AGENTS.md` — live gate rules
- `.planning/codebase/TESTING.md` — node:test patterns, verify-live not in npm test
- `package.json` — `"test": "node --test tests/**/*.test.js"`

### Secondary (MEDIUM confidence)

- Phase 48/49 RESEARCH + PLAN + SUMMARIES — deferred full e2e lock to Phase 50; unit precursors intentional
- `docs/bridge/TAGGING-RULES.md` — Superpower Brain section; no v1.7 grouping note yet
- Phase 47 HARD-04 doc-assert pattern — optional if planner wants doc tests

### Tertiary (LOW confidence)

- None material — domain is fully in-repo; no external library research required

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — pure Node test runner + existing engine patterns; no new deps
- Architecture: **HIGH** — gap matrix verified against current tests/ and lib/
- Pitfalls: **HIGH** — drawn from diagnosis + Phase 49 research + intake alias traps

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (stable internal domain; re-check only if processUpload shape or reviewGroups contract changes)
