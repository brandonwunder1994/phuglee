# Feature Research

**Domain:** Filter / Data Bridge — Type Column Intelligence (v1.8)
**Researched:** 2026-07-09
**Confidence:** HIGH (codebase + locked milestone decisions); MEDIUM (industry mapping-UX norms)

## Context (already shipped — do not re-spec as new)

| Capability | Where | Role relative to v1.8 |
|------------|-------|------------------------|
| Alias-based column map | `detectIntakeColumnMap` / `INTAKE_FIELD_ALIASES` | Baseline header match; **first-match only** — gap v1.8 closes |
| Category promote when type empty | `promoteCategoryFromRaw` | Safety net for *unmapped* category headers; does **not** fix wrong mapped column |
| Distress tagger | `tagRow` / raw-row search | Still matches unmapped cells; wrong Type still poisons Train groups/labels |
| Stable review groups | `buildReviewGroups` + `bridge-stable-text` | Groups on `violationIssueType` / cleaned description — need correct Type first |
| Train approve/deny + brain rules | Train UX + `global-brain.json` | Consumes type labels/keys; short labels must not rewrite stored type used for rules |

**Gap statement:** Alias-first mapping can claim the wrong column (e.g. long “Ordinance Description” as Type) or miss short headers (`Vio Cat`). Promote only runs when Type is empty. No per-city format memory. Train shows full type/description walls of text (samples truncated at 160 chars only).

## Feature Landscape

### Table Stakes (Users Expect These)

Features admins assume after city spreadsheet upload. Missing = Filter feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Score every column → pick ONE Type column** | City exports use dozens of header names; first alias match is not “smart” | MEDIUM | Score = header alias strength + value-shape (category-like, not dates, not addresses, reasonable length / low unique-ratio). **Single winner only** — never blend cells. |
| **Admin confirm Type column on first city format** | Mapping mistakes poison Train groups and brain rules; human gate is table stakes for import tools (Flatfile/OneSchema pattern) | MEDIUM | Gate before full process continues (or re-process with confirmed map). Show suggested column + sample values. |
| **Confirm again when sheet format changes** | Cities change export templates; silent reuse of old column name fails | MEDIUM | Format fingerprint = ordered normalized headers (and optionally sheet name). Diff from last confirmed fingerprint → re-confirm. |
| **Same format reuses last confirmed Type column** | Repeat uploads for same city should be zero-friction | LOW–MEDIUM | Persist per city (+ uploadType) last fingerprint + confirmed header name. Auto-apply without modal when match. |
| **No identifiable Type → keep rows for review** | Silent “no category” / discard feels like data loss | LOW | Do **not** invent type; do **not** drop as no-category. Empty type + stable description grouping (v1.7) still stacks; admin reviews. |
| **Display-only short labels for long type/description** | Train cards unreadable with 200+ char walls of text | LOW–MEDIUM | Shorten for UI only (title/tooltip/expand shows full). Full raw retained on row + export + distress match + brain keys. |
| **Regression lock (wrong map / reuse / labels)** | Prior milestones ship with e2e processUpload locks | MEDIUM | Lock: wrong alias beaten by value-shape; fingerprint reuse; short label ≠ stored type mutation |

### Differentiators (Competitive Advantage)

Not required for “import works,” but align with Distress OS core value: filter non-deals with admin learning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Value-shape scoring beyond headers** | Beats competitors that only rename columns; works when headers are opaque (`Col3`, `Code`, `Vio`) | MEDIUM | Signals: median/p90 length, date-fraction, address-fraction, uniqueness, category-token density, promote-style header regex. Rank columns; pick top. |
| **Per-city format memory (not global map)** | Each municipality’s export is a product surface; memory reduces admin tax without coupling cities | LOW–MEDIUM | Store under city-scoped durable path (mirror filter-lists / brain volume rules). Not a second “brain” of type rules. |
| **Suggested column + sample strip in confirm UI** | Admin decides in seconds (header + 3–5 sample cells + score rationale) | MEDIUM | UX differentiator vs blind dropdown of all headers. |
| **Short “categorize-at-a-glance” labels in Train/groups** | Admin can approve/deny type stacks faster → better global brain | LOW | Prefer first clause / before em-dash / max ~48–64 chars; optional strip incidental timestamps already cleaned for keys. |
| **Explicit “Type column confidence” in process meta** | Debug wrong maps without re-reading raw sheets | LOW | Expose winner header, score, runner-up, confirm source (`auto_reuse` \| `admin_confirm` \| `unresolved`) on `processingMeta`. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Multi-column blend / concatenate Type** | “Capture category + subtype” | Destroys stable group keys; invents synthetic types; breaks brain type rules | Single winner column; subtype stays in descriptionNotes or unmapped raw |
| **Replace stored type with paraphrase / LLM short label** | Pretty Train titles | Distress match, export, brain promote/suppress, group keys all desync from source | Display-only short label field; raw `violationIssueType` unchanged |
| **Auto-map forever without format gate** | Frictionless uploads | Template drift maps wrong column silently; Train learns garbage | Reuse only when fingerprint matches last confirmed |
| **Silent drop when no Type column** | “Cleaner” FN list | Hides real distressed rows; user believes city had no category | Keep for review; empty type + description path |
| **Per-user Type column preferences** | Multi-admin flexibility | Conflicts with global quality product; one city’s format should be shared | Per-city (shared) confirmed mapping |
| **ML / embeddings column classifier (v1)** | SOTA mapping | Opaque, hard to test, overkill for ~10 columns | Deterministic scores + admin confirm; ML later if needed |
| **Rewrite aliases only (no value-shape)** | Smallest change | v1.7 already extended aliases/promote; still picks narrative columns that *are* in type alias list | Score + single winner + confirm |
| **Short labels as new group keys** | Cleaner stacking | Collisions (two long types share prefix) merge wrong groups | Keys stay on full/stable type text (v1.7); short label is display only |
| **Confirm every upload** | Maximum safety | Admin fatigue; defeats format memory | Confirm first time + format change only |
| **Touch filter-lists / wipe data to “reset maps”** | Dev convenience | Violates Agents.md user-work preservation | Separate city-format store; never tidy user lists |

## Expected Admin Upload Flow

```
1. Admin selects city + upload type, drops spreadsheet(s)
2. Parse headers + sample rows
3. Score all columns for Violation Type candidacy
4. Compute format fingerprint (normalized header set/order)
5. Lookup city format memory:
   ├── fingerprint matches last confirmed → apply saved Type column (no modal)
   ├── first upload OR fingerprint differs → CONFIRM GATE
   │     ├── show ranked candidates + samples
   │     ├── admin picks ONE Type column (or “None / review without type”)
   │     └── persist fingerprint + confirmed header
   └── no column scores above threshold → unresolved
         └── keep all rows for review (no silent drop); optional soft prompt
6. Full processUpload with forced columnMap.violationIssueType = confirmed header
7. Promote-when-empty still runs only if Type cell empty (v1.7 safety net)
8. Tagger / brain / groups / Train as today
9. Train UI shows short display labels; hover/expand = full raw
```

**Confirm-gate UX minimum:**
- Suggested header pre-selected
- Sample values (not just header name)
- Ability to choose a different column
- Ability to choose “No type column” (keep for review)
- Explicit save as this city’s mapping for this format

## Feature Dependencies

```
Value-shape + alias scoring (COL-score)
    └──requires──> Existing header normalize + aliases (shipped)
    └──feeds──> Single winner Type column selection
                    └──requires──> Confirm gate OR format reuse
                         ├──requires──> Per-city format fingerprint store
                         └──feeds──> processUpload columnMap override
                                        └──enhances──> Category promote (empty only)
                                        └──enhances──> Stable groups / Train / brain

Display short labels (LBL)
    └──requires──> Correct type/description on rows (COL path)
    └──must-not──> Mutate violationIssueType / export / match text
    └──enhances──> Train group cards + FN list readability

Regression tests (TEST)
    └──requires──> COL-score + format memory + LBL pure helpers
```

### Dependency Notes

- **Scoring requires shipped aliases/normalize:** Reuse `normalizeHeader`, alias lists, `isCategoryLikeHeader` patterns; add value-shape on top.
- **Confirm gate requires scoring output:** UI ranks candidates; do not confirm raw unranked header lists only.
- **Format reuse requires durable city store:** Fingerprint + confirmed header; volume-safe path like brain/lists (do not put in gitignored filter-list blobs unless intentional).
- **Short labels require correct Type first:** Labels on wrong long narrative still fail the product; order COL before LBL polish if phased.
- **Promote remains secondary:** If winner column is correct but cell empty, promote still fills; if winner is wrong, promote does not un-wrong it.
- **Conflicts:** Short-label-as-key conflicts with stable groups; multi-column blend conflicts with single winner + brain type rules.

## MVP Definition

### Launch With (v1.8)

Minimum to close the milestone goal: true Type column + confirm-when-new + readable Train.

- [ ] **COL-score** — Score headers + value shapes; pick single Type column (no blend)
- [ ] **COL-confirm** — Admin confirm first time per city format or when fingerprint changes
- [ ] **COL-reuse** — Same fingerprint reuses last confirmed Type column automatically
- [ ] **COL-unresolved** — No identifiable Type → keep for review (no silent drop)
- [ ] **LBL-display** — Display-only short labels in Train/groups; full raw for match + export
- [ ] **TEST-lock** — Automated cases: wrong alias vs value-shape winner; format reuse; short label does not change stored type / export

### Add After Validation (v1.8.x / next)

- [ ] Runner-up column shown when scores are close (admin tie-break)
- [ ] Confidence badge on process summary (“Type column: Ordinance Code · reused”)
- [ ] Admin “forget this city’s format mapping” control (explicit only)
- [ ] Batch multi-file: one confirm if all files share fingerprint; re-confirm if mixed

### Future Consideration (v2+)

- [ ] Learned header synonyms from confirmed maps (still admin-gated)
- [ ] Soft clustering / embeddings for free-text categories (deferred since v1.7)
- [ ] Multi-tenant server sessions for who confirmed maps
- [ ] Auto-detect Type vs Description split when both high-score

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Single-winner Type scoring | HIGH | MEDIUM | P1 |
| Per-city format fingerprint + reuse | HIGH | MEDIUM | P1 |
| Admin confirm on first/changed format | HIGH | MEDIUM | P1 |
| Keep-for-review when unresolved | HIGH | LOW | P1 |
| Display-only short labels | HIGH | LOW–MEDIUM | P1 |
| Regression tests (map/reuse/label) | HIGH | MEDIUM | P1 |
| Sample strip + rank rationale in confirm UI | MEDIUM | MEDIUM | P2 |
| processingMeta confidence / source | MEDIUM | LOW | P2 |
| Forget mapping control | MEDIUM | LOW | P2 |
| Close-score tie-break UI | MEDIUM | LOW | P2 |
| Learned synonyms / ML classifier | LOW (now) | HIGH | P3 |
| Multi-column blend | — | — | **Anti** |
| Paraphrase stored type | — | — | **Anti** |

**Priority key:**
- P1: Must have for v1.8 launch
- P2: Should have when P1 green
- P3: Future / explicit defer

## Scoring Heuristics (opinionated defaults)

Use for COL-score design; requirements author may tune thresholds.

| Signal | Type-column positive | Type-column negative |
|--------|----------------------|----------------------|
| Header alias hit | Strong boost (`violation type`, `category`, `case type`, short `vio cat`) | — |
| Narrative header | Mild if also type-like | Strong penalty (`description`, `notes`, `narrative`, `memo`) |
| Date header / date-shaped values | — | Strong penalty (leave to violationDate) |
| Address-shaped values | — | Strong penalty (streetAddress) |
| Median length 8–80 chars | Boost | p90 ≫ 120 or many >200 → penalty (description) |
| Category token density | Boost (grass, weeds, junk, permit, … optional) | Pure free-text sentences |
| Uniqueness | Moderate cardinality (repeated categories) | Near-unique every row (IDs/notes) or single constant junk |
| Timestamp-only cells | — | Exclude (promote already does) |

**Winner rule:** Highest score; if below min threshold → unresolved (keep for review). Never average/blend top-N columns into one field.

## Competitor / Ecosystem Feature Analysis

| Feature | Import platforms (Flatfile, OneSchema, CSVBox) | Generic ETL / BI | Distress OS approach |
|---------|-----------------------------------------------|------------------|----------------------|
| Column mapping | Header match + user confirm template | Schema-on-read, often manual | Score + **one** Type winner + city format memory |
| Template memory | Per-workspace / per-source templates | Connection-level schemas | **Per city + format fingerprint** (municipality exports) |
| Value inference | Sample preview common | Type inference for SQL | Value-shape for **category vs narrative vs date vs address** |
| Display labels | Rarely domain-specific | Truncate in grids | Domain: categorize-at-a-glance without mutating match text |
| Wrong map cost | Bad CRM fields | Bad warehouse columns | **Bad Train groups + brain rules** — higher cost → confirm gate |

## Complexity Notes (for roadmap phasing)

| Workstream | Est. complexity | Depends on | Risk |
|------------|-----------------|------------|------|
| Pure column scorer | MEDIUM | intake aliases, promote header regex | False confidence on narrative-as-type aliases |
| Fingerprint + city store | MEDIUM | durable path, city id normalization | Fingerprint too strict (column order) or too loose (ignore renames) |
| Confirm API/UI gate | MEDIUM | processUpload pause or two-phase process | Blocking UX; batch multi-file edge cases |
| Short label helper + Train wire | LOW | review group label field or client-only | Accidentally writing short text into stored type |
| Tests | MEDIUM | fixtures with real-ish city headers | Under-specifying “same format” |

**Suggested phase order (for roadmap, not requirements IDs):**
1. Pure scorer + single winner (unit tests)
2. Format fingerprint store + reuse path
3. Admin confirm gate wired into upload flow
4. Short labels (display path only)
5. E2E / regression lock + verify-live

## Sources

- Codebase: `lib/bridge-intake-schema.js` (`detectIntakeColumnMap`, aliases — first-match)
- Codebase: `lib/bridge-engine/normalizer.js` (map → promote-if-empty → tag)
- Codebase: `lib/bridge-category-promote.js` (category-like headers; first unmapped cell; no blend)
- Codebase: `lib/bridge-review-groups.js` (labels from full type/description; samples raw)
- Codebase: `public/js/bridge-train.js` (sample truncate 160 only; title = full `violationTypeLabel`)
- Project: `.planning/PROJECT.md` v1.8 locked decisions (single winner, confirm gate, display-only labels)
- Project: v1.7 MAP/GROUP requirements (promote + stable keys — must not regress)
- Ecosystem pattern: import tools use template memory + human confirm on schema change (Flatfile/OneSchema-class UX) — MEDIUM confidence on product norms; HIGH confidence that silent wrong map is unacceptable for Train/brain

---
*Feature research for: Distress OS Filter — Type Column Intelligence (v1.8)*
*Researched: 2026-07-09*
*Downstream: requirements author picks COL-*/LBL-*/TEST-* for v1.8-REQUIREMENTS.md*
