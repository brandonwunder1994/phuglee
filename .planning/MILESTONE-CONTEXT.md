# Milestone Context — Filter Accuracy & Grouping (v1.7)

**Source:** User conversation + gsd-debugger diagnose-only (2026-07-09/10)  
**Debug artifact:** `.planning/debug/filter-singleton-no-category.md`  
**Consumed by:** `/gsd:new-milestone`  
**User directive:** Write GSD plans and execute them (scope approved)

## Goal

Fix Filter / Train brain **accuracy and efficiency** so real-world categories stack correctly, timestamps do not create false singletons, false-negative rows show real city categories, and signal chips remain visible.

## Locked product decisions

| ID | Decision |
|----|----------|
| D1 | Surface: **Filter / Bridge Train grouping + normalizer only** (not Analyze, not phrase-miner rules) |
| D2 | **GROUP:** Stabilize empty/free-text group keys — strip dates/times; stack same category/phrase/indicator |
| D3 | **MAP:** Promote real category columns into `violationIssueType` when unmapped/raw |
| D4 | **SHAPE:** Keep `matchedIndicators` as **arrays** on process rows for Train chips; join only on export |
| D5 | Singleton badge remains pure `count === 1` after correct keys (no UI inventing) |
| D6 | Existing typed High Grass rows still stack on type key as today |
| D7 | Stack: same Node + vanilla Bridge stack; pure modules + tests first |

## Symptoms (user)

1. Distressed flooded with **singletons** that only differ by **timestamp** but share the same category (e.g. High Grass and Weeds)
2. Not-distressed shows **no category** when source data had one

## Root causes (diagnosed)

- Empty `violationIssueType` → group by exact full description; timestamps → N keys
- Free-text mapped into type with timestamps → distinct type keys
- Category columns unmapped → type never promoted; FN labels fall back to notes / `(no type)`
- `matchedIndicators` stringified before grouping → empty chips in Train

## Explicit non-goals

- Train CSS redesign
- Phrase mining rule changes / brain panel redesign
- Analyzer vision review
- Per-user brains / multi-tenant auth
- Rewriting tagger keep/discard policy (v1.6 distress-only rules stay)

## Success tests (must pass)

1. Description-only rows + timestamps for same High Grass category → **1 distressed group**, count N
2. Unmapped category column (e.g. "Vio Cat") → `violationIssueType` set; Train shows category
3. Typed High Grass still stacks on type
4. Signal chips show matched indicators arrays on process path
5. `npm test` + `scripts/verify-live.ps1` green
