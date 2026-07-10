---
status: diagnosed
trigger: "filter-singleton-no-category — Filter Train brain UI shows many singleton groups for rows that share the same real-world category (e.g. High Grass and Weeds) because descriptions differ only by timestamp; not-distressed groups show no category / (no type) even when source data must have had a category field."
created: 2026-07-09T00:00:00.000Z
updated: 2026-07-09T12:00:00.000Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — empty/unstable violationIssueType + exact-description grouping causes timestamp singletons; FN no-category is lost/unmapped type
test: e2e processUpload Description-only CSV + unit grouping cases
expecting: ROOT CAUSE FOUND (diagnose-only)
next_action: return structured diagnosis; no code fixes

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: |
  - Rows with the same violation/issue category (e.g. High Grass and Weeds) stack into ONE group with count N, not N singleton groups.
  - Timestamps in free-text description/notes must NOT split an otherwise-identical category into separate groups.
  - Not-distressed (false-negative) groups should show the real city category/type when the source spreadsheet has one.
  - Singleton status should only apply when the true type/category is unique, not when description text differs by incidental time stamps.

actual: |
  - Distressed section: many items marked as singleton; user can see they are the same category (High Grass and Weeds) but different timestamps on each row cause them to not stack.
  - Not-distressed section: UI indicates no category for them — user believes source data always had some category/type; this is wrong product behavior.

errors: none reported (logic/UX accuracy issue, not crash)

reproduction: |
  1. Login as admin on Filter / Bridge
  2. Process a city code-violation upload that includes High Grass and Weeds (or similar) with description notes that include timestamps
  3. Open Train brain → Marked distressed: observe many singleton cards for same category
  4. Open Not marked distressed: observe missing/no category labels

started: |
  Discovered after v1.6 Filter Superpower Brain shipped (phases 42–47) and deployed to Railway.
  Grouping logic introduced in phase 43 (bridge-review-groups); Train UI phase 44; not a regression of pre-v1.6 thin discards.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Phrase miner "singleton" language is conflated with group isSingleton
  evidence: phrase miner never reads isSingleton; mines from descriptionSamples/violationTypeLabel on decision events. UI badge is purely count===1 from buildReviewGroups. Design docs use "singleton free-text" as product language for one-by-one groups, but code paths are separate.
  timestamp: 2026-07-09T12:00:00.000Z

- hypothesis: High Grass rows are not tagged Strong Distressed (tagger bug)
  evidence: tagger matches weeds/grass in descriptionNotes and raw cells; e2e kept 3 High Grass rows as Strong Distressed Signal with empty type. Tagger works; grouping is the failure.
  timestamp: 2026-07-09T12:00:00.000Z

- hypothesis: Train UI invents Singleton without server isSingleton
  evidence: bridge-train.js only displays group.isSingleton || count===1; server sets isSingleton = count===1. UI is faithful.
  timestamp: 2026-07-09T12:00:00.000Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-07-09T11:30:00.000Z
  checked: lib/bridge-review-groups.js buildReviewGroups
  found: |
    Lines 45–53: typeKey = violationTypeKey(violationIssueType); when typeKey === '__unknown__',
    descriptionKey = exact trim(descriptionNotes); mapKey = section|__unknown__|descriptionKey.
    Lines 81–92: label = first non-empty type, else full description, else '(no type)'.
    Line 124: isSingleton = count === 1.
  implication: Empty type + timestamped notes → N unique keys → N singleton cards titled with full notes.

- timestamp: 2026-07-09T11:32:00.000Z
  checked: lib/bridge-brain-store.js violationTypeKey
  found: empty/whitespace → '__unknown__'; no timestamp stripping; full string lowercased only.
  implication: Type field containing "High Grass and Weeds - 01/15/2024 10:30" is a DISTINCT typeKey per row.

- timestamp: 2026-07-09T11:35:00.000Z
  checked: Phase 43 CONTEXT / RESEARCH / PLAN
  found: Locked decision "Empty type → group by exact description". Tests explicitly require empty type + two descriptions → 2 singleton groups.
  implication: Product bug relative to user expectation, but intentional v1.6 design — not an accidental regression.

- timestamp: 2026-07-09T11:40:00.000Z
  checked: lib/bridge-distress-tagger.js
  found: buildSearchText includes violationIssueType, descriptionNotes, AND every raw cell. Vegetation patterns match "weeds"/"high grass" loosely. Rows kept Strong even when type empty.
  implication: Distressed pool fills with empty-type High Grass rows; grouping then fragments them.

- timestamp: 2026-07-09T11:45:00.000Z
  checked: lib/bridge-engine/normalizer.js + bridge-intake-schema.js
  found: |
    - Column map may leave violationIssueType null (header "Description" → descriptionNotes only).
    - Alias "violation description" maps free-text (with timestamps) INTO type.
    - Fallback only when BOTH type and notes empty AND matchedIndicators: dumps raw cells into descriptionNotes, never into violationIssueType.
    - buildNormalizedRow stores matchedIndicators as joined string for export.
  implication: Real category can exist in source but never land in violationIssueType; runtime groups lose array indicators.

- timestamp: 2026-07-09T11:50:00.000Z
  checked: e2e processUpload Description-only CSV
  found: |
    3 High Grass rows kept, type='', notes differ only by timestamp.
    reviewGroups.distressed → 3 groups, each count=1, isSingleton=true, key=__unknown__,
    labels = full notes including timestamps; matchedIndicators on groups = [] (string form on rows).
    FN groups labeled with free-text notes, key=__unknown__.
  implication: Reproduces user distressed singleton symptom end-to-end.

- timestamp: 2026-07-09T11:55:00.000Z
  checked: unmapped category column "Vio Cat"
  found: High Grass in unmapped col still tags Strong via raw search; type stays ''; notes only "ts1"/"ts2"; groups labeled "ts1"/"ts2" singletons. FN "Fence Permit" in unmapped col → label is notes "admin" not category.
  implication: Source category can be completely absent from Train labels when unmapped.

- timestamp: 2026-07-09T12:00:00.000Z
  checked: public/js/bridge-train.js display
  found: Title = violationTypeLabel; Singleton badge when isSingleton; "No matched signals" when indicators array empty; "(no type)" only when server label is that string.
  implication: UI correctly surfaces server grouping defects; does not invent missing categories.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  PRIMARY (distressed singletons): When violationIssueType is empty (or type values themselves include per-row timestamps),
  buildReviewGroups keys empty-type rows by exact descriptionNotes (Phase 43 locked rule). Timestamps in free-text
  notes make every row a unique group with count=1 → isSingleton. Tagger still marks High Grass Strong via description/raw
  regex, so the Train distressed section fills with singleton cards whose titles look like the same category.

  PRIMARY (FN no category): violationIssueType is often empty for FN rows because (a) no type column mapped,
  (b) category only in unmapped raw headers, or (c) free-text-only exports. Label falls back to descriptionNotes
  or '(no type)'. Normalizer never promotes raw category text into violationIssueType for non-distress rows
  (raw dump only runs when matchedIndicators exist). Real city category is lost before Train UI.

  SECONDARY: matchedIndicators coerced to export string in buildNormalizedRow → buildReviewGroups only unions
  Array → Train chips always "No matched signals" on real process path, hiding the vegetation category signal
  that could have helped users identify groups.

  NOT a phrase-miner conflation; NOT a Train UI badge bug; NOT a tagger false-negative on High Grass text.

fix: (diagnose-only — not applied)
verification: (diagnose-only)
files_changed: []
