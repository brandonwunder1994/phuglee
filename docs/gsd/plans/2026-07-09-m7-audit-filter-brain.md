# M7 Pre-Implementation Audit — Filter Superpower Brain

> **GSD:** `/gsd:audit-milestone` style readiness audit **before** execute  
> **Date:** 2026-07-09  
> **Status:** `ready_for_execute` after user green-light  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`

---

## 1. Intent vs codebase (gap analysis)

| Requirement (user) | Exists today? | Gap |
|--------------------|---------------|-----|
| Filter/results show AI-marked distressed + **exact signals** + description | Partial: data has `matchedIndicators` + `descriptionNotes`; **UI table omits both** | Show signals + description on groups/rows |
| ✓ Approve / ✗ Deny per item | **No** | Admin review UI + API |
| Section for **not** marked distressed | **No** — `filterDistressOnly` drops rows; only discard count/preview | Return full `notDistressedRows` for review |
| Feedback persists | **No** bridge brain | Global brain JSON store |
| Feedback trains **future** uploads | **No** | Apply brain inside `processUpload` / tag pipeline |
| Global shared quality | N/A | Single global store under data volume |
| Admin-only control | Auth has bootstrap `admin` | Server enforce + client hide |
| Group by violation type (stack 20 weeds) | **No** | Grouping pure functions + UI |
| Superpower learning loop | Analyze has vision brain; **Filter does not** | HITL hybrid for Filter only |

---

## 2. Current architecture (as-is)

### Happy path today

```text
bridge.html upload
  → POST /api/bridge/process (bridge-api.js)
  → processUpload (bridge-engine/index.js)
       parse → normalizeRawRows (tagRow in normalizer)
       → dedupe → filterAlreadyImported
       → filterDistressOnly  ← drops non-strong tags
  → response { rows: kept only, discarded: summaries }
  → bridge.js renderResultsTable (address, issue, tag, confidence, date)
  → save list / export
```

### Key files

| File | Role | M7 impact |
|------|------|-----------|
| `lib/bridge-distress-tagger.js` | Regex categories + `filterDistressOnly` | Extend with brain apply hook |
| `lib/bridge-engine/index.js` | Process pipeline | Inject brain; retain FN rows |
| `lib/bridge-engine/normalizer.js` | Row normalize + tag | Possibly attach `rowId` |
| `lib/bridge-api.js` | HTTP routes | New brain routes; extend process payload |
| `lib/bridge-list-store.js` | Atomic JSON lists | **Pattern to copy** for brain store |
| `lib/config.js` | Paths | Add `BRIDGE_BRAIN_PATH` |
| `public/bridge.html` | Results UI | Train brain sections |
| `public/js/bridge.js` | Client state/table | Groups, decisions, admin gate |
| `public/css/*bridge*` | Styles | Review cards |
| `public/js/auth.js` | Bootstrap admin | Session username for gate |
| `tests/bridge-distress-tagger.test.js` | Tagger tests | Expand |
| `tests/bridge-api*.test.js` | API tests | New brain cases |
| `docs/bridge/TAGGING-RULES.md` | Tagging docs | Document brain layers |

### What we will **not** reuse from Analyze

Analyze (`modules/property-analyzer`) already has Keep/Change review, `learnedRules`, Gemini rule proposals. **Different domain** (vision tiers vs text violation tags). M7 builds a **Filter-native** brain, optionally inspired by Analyze’s event/rule patterns — **no** shared store with Analyze vision brain in v1.

---

## 3. Risk register

| Risk | Severity | Mitigation (phase) |
|------|----------|---------------------|
| Non-admin writes corrupt global brain | Critical | Server 403 + tests (45) |
| Returning all FN rows blows memory on huge city files | High | Cap review payload (e.g. 5k FN rows) + group pagination (43, 47) |
| Type suppress over-blocks good variants | High | Disable/undo; metrics; review panel (46–47) |
| Phrase regex ReDoS | Medium | Literals escaped; complexity limits (46) |
| Process response size regression | Medium | Stream/paginate groups; don’t send raw discarded for non-review reasons (43) |
| Concurrent admin RMW race | Medium | Version field + 409 (45) |
| AUTH_DISABLED local opens brain | Medium | Still require admin header; test-only override (45) |
| Breaking save/export | High | Decisions mutate `rows` before save; tests (45) |
| Water shut-off false suppress | Medium | Skip type brain for water (42) |

---

## 4. Dependency graph (phases)

```text
42 Brain store + apply ─────────────────────────────┐
         │                                          │
         ▼                                          │
43 FN rows + grouping ──► 44 Admin review UX ──► 45 Decisions + type rules
         │                       │                   │
         │                       └───────────────────┤
         │                                           ▼
         └──────────────────────────────────► 46 Phrase mining + panel
                                                     │
                                                     ▼
                                              47 Hardening + metrics + docs
```

- **42** can ship alone (brain applies if rules seeded in tests).  
- **44** needs **43** response shape.  
- **45** needs **42** store + **43** ids + **44** UI (or API-first without UI).  
- **46** needs **45** events.  
- **47** last.

---

## 5. Requirements coverage matrix (pre-ship)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| BRAIN-01 | Global durable brain file | 42 | planned |
| BRAIN-02 | Apply brain on every processUpload | 42 | planned |
| BRAIN-03 | Full not-distressed rows for review | 43 | planned |
| BRAIN-04 | Group by violation type | 43 | planned |
| BRAIN-05 | Show matchedIndicators + descriptions | 44 | planned |
| BRAIN-06 | Admin-only ✓/✗ UI | 44 | planned |
| BRAIN-07 | Deny removes from kept | 45 | planned |
| BRAIN-08 | Approve FN promotes to kept | 45 | planned |
| BRAIN-09 | Type suppress/promote live next upload | 45 | planned |
| BRAIN-10 | Audit events | 45 | planned |
| BRAIN-11 | Phrase mine → proposed only | 46 | planned |
| BRAIN-12 | Admin activate phrase rules | 46 | planned |
| BRAIN-13 | Non-admin 403 on writes | 45 | planned |
| BRAIN-14 | Undo / disable | 47 | planned |
| BRAIN-15 | Metrics | 47 | planned |
| BRAIN-16 | Docs + verify-live | 47 | planned |

---

## 6. Audit verdict

| Check | Result |
|-------|--------|
| Product decisions locked? | **Yes** (D1–D8 in design spec) |
| Code insertion points clear? | **Yes** |
| Conflicts with Analyze vision brain? | **No** (separate) |
| Blocks existing Filter save/export? | **No** if phases ordered |
| Ready to plan phases? | **Yes** |
| Ready to execute? | **Only after user says execute** — start `/gsd:execute-phase 42` |

**Verdict: PASS readiness — proceed with phase plans 42–47; do not implement until user triggers execute.**
