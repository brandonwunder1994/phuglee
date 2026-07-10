# Quick Task 260710-k9c: Confident Category Stacking - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** User request + Irving TX last-upload analysis

<domain>
## Task Boundary

Make Filter/Train review grouping smarter so similar code-violation types stack when we are **confident**, instead of flooding the admin with ~250 singletons that only differ by notes, dates, case numbers, or small free-text tails. City formats always differ — solution must be city-agnostic. Only group when confident.

Example city: Irving TX (`violation-history-report`) — `HGW` with many note variants should stack; unrelated free-text must not.

</domain>

<decisions>
## Implementation Decisions

### Confidence bar
- Only auto-stack when a **high-confidence** signal exists: leading municipal-style type codes and/or incidental noise strip (dates, case IDs, meta, multipliers)
- Do **not** fuzzy-merge free-text by edit distance
- Combo codes stay distinct (`HGW/TD` ≠ pure `HGW`)

### City-agnostic
- No Irving-only dictionary required for grouping
- Code pattern is structural (2–5 letter codes, O/S style, slash/comma combos)

### Preserve
- Phase 49 timestamp stacking
- fence vs pool style free-text stay separate
- `isSingleton = count === 1`
- shortLabel display-only; export/brain row fields not rewritten for display
- keep/kill distress accuracy not traded for grouping

### Claude's Discretion
- Exact denylist of English-ish code tokens
- Key string format (`hgw` vs `code:hgw`)
- Whether labels show cleaned first-seen raw or preferred short code form

</decisions>

<specifics>
## Specific Ideas

- Irving signal: Project Description values like `HGW`, `HGW X2`, `HGW - OVERGROWN…`, `HGW/TD - trash…`, `*CALL BACK*`
- Measured collapse: 283 → ~60 singletons on that export with proposed approach
- Primary files: `lib/bridge-stable-text.js`, `lib/bridge-review-groups.js` (+ tests)

</specifics>

<canonical_refs>
## Canonical References

### Grouping
- `lib/bridge-stable-text.js` — Phase 49 strip + stable keys
- `lib/bridge-review-groups.js` — `buildReviewGroups`
- `.planning/phases/49-stable-group-keys/49-RESEARCH.md` — timestamp-stable keys
- `.planning/debug/filter-singleton-no-category.md` — original singleton diagnosis

### Product rules
- `docs/bridge/TAGGING-RULES.md` — distress tagging (do not break)
- `AGENTS.md` — never wipe filter lists / brain data

</canonical_refs>
