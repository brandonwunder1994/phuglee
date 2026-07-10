# Pitfalls Research

**Domain:** City-spreadsheet Filter pipeline — Type column intelligence (v1.8)
**Researched:** 2026-07-09
**Confidence:** HIGH (code + prior v1.6/v1.7 post-mortems + locked product decisions)

## Critical Pitfalls

### Pitfall 1: Wrong Column Wins as Type (Brain Poison)

**What goes wrong:**
Scorer or alias map picks Status, Description, Violation Date, Code Number, or a free-text narrative column as `violationIssueType`. Train groups by the wrong vocabulary; admin Approve/Deny writes `promote_type` / `suppress_type` rules against those keys; every future upload for every customer inherits poisoned rules.

**Why it happens:**
- Today’s `detectIntakeColumnMap` is **first alias match** with `used` set — order-dependent, not quality-scored (`lib/bridge-intake-schema.js`).
- Aliases already over-claim: `"violation description"`, `"code description"`, `"status description"`, `"condition"` sit on `violationIssueType` while narrative-like text belongs in notes (confirmed in `.planning/debug/filter-singleton-no-category.md`).
- v1.7 promote only runs when type is **empty** — a *wrong* mapped type **blocks** promotion forever (`promoteCategoryFromRaw` early-return).
- Brain `typeRuleMatches` keys on `violationTypeKey(row.violationIssueType)` — garbage in → durable garbage out.

**How to avoid:**
- Score **headers + cell value shapes** (cardinality, short categorical vs long prose, date-like, code-like); pick **one** winner; never blend columns.
- Demote narrative/status/date shapes even when header aliases match.
- Persist the chosen header name (source column), not just the values, so Train audit can show “Type ← `Vio Cat`”.
- Gate first-time / format-change mapping with admin confirm before process continues (locked decision).
- Regression: fixtures where Description / Status / Date would win under alias-first and **must not** win under scorer.

**Warning signs:**
- Train cards titled with full sentences, timestamps, or status enums (`Open`/`Closed`).
- Type rule list fills with one-off free-text keys after a single city Train session.
- Promote helper never fires (mapped type always non-empty but useless).
- High Grass still tags Strong via raw cells while type shows permit/status text.

**Phase to address:**
**COL scoring phase (≈51)** — build scorer before any confirm/persist path; lock wrong-column fixtures in TEST phase.

---

### Pitfall 2: Confirm Gate Blocks Non-Admin or Hangs Process

**What goes wrong:**
Upload requires Type-column confirmation, but non-admin operators (or headless batch) cannot pass the gate. Process never returns rows; UI spins; API 403/202-with-no-follow-through; multi-file batch stalls mid-loop.

**Why it happens:**
- Brain **writes** correctly use `requireAdmin` (`lib/bridge-api.js`); process path is **not** admin-only today — any scoped user can upload.
- Product locks “admin confirms Type column” for first-time/format-change — easy to implement as “block entire `/process` until admin” without a resume token.
- Sync `processUpload` / `processUploadBatch` currently run end-to-end; a mid-flight modal with no server draft leaves orphaned client state.
- `AUTH_DISABLED` / spoofable `X-Phuglee-User` muddies who is “admin” if gate is header-only.

**How to avoid:**
- Split flows:
  1. **Parse + score** → return candidate Type columns + suggested winner + format fingerprint (no brain writes, no list mutation).
  2. **Confirm** (admin-only POST) → persist mapping for city+fingerprint.
  3. **Process** with confirmed (or reused) map → existing pipeline.
- Non-admin on first-time format: return clear `TYPE_COLUMN_CONFIRM_REQUIRED` with suggestion visible read-only; do **not** hang; do **not** invent a map silently.
- Same-format reuse must work without any confirm (locked decision) so day-2 operators are unblocked.
- Never block water shut-off / non-code paths on Type confirm if product treats them differently — document explicitly.
- Timeouts: no infinite “waiting for confirm” server job; client owns the modal; server is stateless between score and process (or short-lived draft keyed by token).

**Warning signs:**
- Non-admin upload returns 403 without payload.
- Process button does nothing after first city of the day.
- Batch of 5 files waits on file 1 confirm and never starts files 2–5.
- Confirm endpoint missing from admin chrome but required by process.

**Phase to address:**
**Confirm gate phase (≈52)** — design score → confirm → process; admin-only **confirm write**, not admin-only **upload**.

---

### Pitfall 3: Format Fingerprint Too Strict or Too Loose

**What goes wrong:**
- **Too strict:** Any header rename, column reorder, extra blank column, or Excel “Column1” drift forces re-confirm every upload → confirm fatigue → admins click-through wrong suggestions.
- **Too loose:** Fingerprint ignores real schema change (new Type column, swapped Status/Type) → reuses last map → silent wrong Type (Pitfall 1 at scale).

**Why it happens:**
- City exports vary weekly (clerk systems, FOIA dumps, “save as xlsx” reorders).
- Multi-file batch (up to 5) often mixes same city / different export generations (`MAX_BATCH_FILES = 5`, `processUploadBatch`).
- Temptation to fingerprint whole file hash or row counts (changes every day) vs header set only (misses renames that matter).

**How to avoid:**
- Fingerprint **normalized header multiset + stable order-independent set**, not file bytes or row counts.
- Include a light **shape signature** for the previously chosen Type column (e.g. median cell length band, distinct-count band) so a header rename that keeps the same column position/shape can soft-match — but a new categorical column forces re-score.
- Store per **cityId + uploadType**, not global.
- On multi-file batch: compute fingerprint **per file**; if any file’s format ≠ confirmed map for that city, require confirm (or process only matching files with explicit `fileFailures`) — never apply City A’s map from file 1 to a divergent file 3 silently.
- Version the fingerprint algorithm; migrations re-ask once rather than silently mismatch.

**Warning signs:**
- Confirm modal every re-upload of the same clerk export.
- After clerk adds one column, Train categories suddenly shift without a confirm.
- Batch `processingMeta.files[]` show different parsers/headers but one shared columnMap.
- Metrics: confirm rate ≈ 100% of uploads (too strict) or ≈ 0% after week 1 with rising wrong-type tickets (too loose).

**Phase to address:**
**Format memory phase (≈52)** with COL scoring; multi-file edge cases in batch integration tests (TEST phase).

---

### Pitfall 4: Short Labels Replace Stored Type (Distress/Export Break)

**What goes wrong:**
Display shortener overwrites `violationIssueType` / `violationTypeLabel` used for:
- `stableTypeKey` / group keys
- brain `typeRuleMatches`
- distress search text / tagger
- export `Violation/Issue Type` column
- decision payloads (`violationTypeLabel` → type rules)

Train looks clean; matching, rules, and Analyzer exports are wrong or collapsed.

**Why it happens:**
- Single field dual-use is the default in UI code (`bridge-train.js` / `bridge.js` title = `group.violationTypeLabel`).
- Shortening “at display time” by mutating the group object in place is easy and wrong.
- Phrase miner / decisions already persist `violationTypeLabel` from the card title DOM (`bridge.js` decision payload) — if title is short, brain stores short.

**How to avoid:**
- **Display-only** field: e.g. `violationTypeDisplayLabel` or client-only truncate in the render function; never write back to row/group type.
- Keep full raw on: normalized rows, export, brain keys, decision API inputs.
- Group key must use full (timestamp-stripped) type — short labels must not merge distinct types that share a 40-char prefix.
- Decision POST must send **full** `violationTypeLabel` / key from group metadata, not from truncated DOM text.
- Tests: long type string → UI short, export/brain still full; two long types that share a short prefix remain two groups.

**Warning signs:**
- Export column shows “High Grass and We…” for every vegetation row.
- Type rules appear as truncated keys that never match next upload’s full strings.
- Group counts collapse after enabling short labels.
- DOM scrape for decisions differs from `group.violationTypeKey`.

**Phase to address:**
**LBL short-label phase (≈53)** — pure display helper + Train/results render only; regression in TEST phase.

---

### Pitfall 5: Silent Drop When No Type Column

**What goes wrong:**
If scorer finds no Type column (or confidence below threshold), pipeline treats rows as “no category” and discards them, or marks all FN with no review path — data loss that v1.7 worked hard to reverse.

**Why it happens:**
- Mental model “must have Type to process.”
- `NO_USABLE_ROWS` / distress filter already drop aggressively; adding another drop condition is a one-line mistake.
- Alias-first sometimes left type empty; promote fixed *some* cases; a “require type column” gate undoes that.

**How to avoid:**
- Locked decision: **no identifiable Type → keep/approve path for review; no silent discard.**
- Empty type still allowed; grouping falls back to stable description keys (v1.7 GROUP).
- Surface `typeColumn: null`, `typeColumnConfidence: 'none'`, `needsTypeReview: true` in process meta — never omit rows solely for missing type.
- Confirm UI: “No Type column detected — process with empty type / pick manually” not “Upload rejected.”

**Warning signs:**
- Cities with description-only exports process 0 kept rows after v1.8.
- Stats show new discard reason like `no_type_column`.
- FN review empty while raw file has addresses + notes.

**Phase to address:**
**COL scoring + process integration (≈51–52)**; explicit negative test in TEST phase.

---

### Pitfall 6: Promotion vs Scorer Conflict

**What goes wrong:**
v1.7 `promoteCategoryFromRaw` and v1.8 Type-column scorer both try to fill `violationIssueType` with different winners:
- Scorer maps header A; promote still copies unmapped header B when A cells are empty on some rows → mixed types mid-file.
- Scorer leaves type empty (low confidence); promote invents from weak category-like header that scorer rejected.
- Double-fill: mapped wrong type blocks promote (Pitfall 1); or promote runs before scorer and “wins” first-cell noise.

**Why it happens:**
- Promote is **first category-like unmapped header wins** (`bridge-category-promote.js`) — no scoring, no confirm.
- Promote only when mapped type empty — assumes map is authoritative when non-empty.
- Two features ship in adjacent milestones without a single “type resolution order” doc.

**How to avoid:**
Define a single resolution order (opinionated):

1. **Confirmed / reused city map** for this fingerprint (absolute winner).
2. Else **scorer suggestion** (if confidence ≥ threshold or admin confirmed this request).
3. Else **promote** only if scorer did not claim a Type column and type still empty (legacy safety net).
4. Never promote over a non-empty mapped/scored type.
5. Never blend scorer column + promote column in one row set.

- When scorer selects a Type column, mark those headers `used` so promote cannot re-read them as “unmapped.”
- When admin confirms column X, disable promote for that process (map is explicit).
- Unit tests: scorer picks `Issue Type`; unmapped `Cat` must not override. Scorer none + unmapped `Vio Cat` → promote still works (v1.7 lock).

**Warning signs:**
- Same file: some rows type from column A, others from B.
- After v1.8, MAP-02 e2e (unmapped category → type populated) fails.
- Confirm UI shows column A but Train labels look like column B values.

**Phase to address:**
**COL scoring phase** must document order; **integration** with normalizer (`normalizeRawRows`) in same or immediately following phase — do not ship scorer without promote interaction tests.

---

### Pitfall 7: Multi-File Batch Format Variance (Up to 5 Files)

**What goes wrong:**
`processUploadBatch` runs `processUpload` **per file** then merges rows (`mergeProcessResults`). File 1 and file 3 for the same city can have different Type columns; a single city-level confirmed map either mis-applies or the batch silently mixes type vocabularies into one Train session → admin trains on blended nonsense.

**Why it happens:**
- Batch API is city/uploadType scoped, not schema-scoped (`lib/bridge-api.js` 1–5 files).
- Cross-file dedupe is **address-only** — different type strings on same parcel collapse; type intelligence doesn’t participate.
- Confirm-once-per-city assumes one schema; FOIA packets often zip multiple clerk extracts.

**How to avoid:**
- Fingerprint **each file** before process; if fingerprints diverge within a batch:
  - **Preferred:** require confirm per distinct fingerprint (or reject batch with `FORMAT_MISMATCH` listing files), **or**
  - Process with per-file maps only when each fingerprint already has a confirmed map.
- Never assign one file’s Type header name to another file that lacks that header (map miss → empty type, not wrong column).
- Surface `processingMeta.files[].typeColumn` / fingerprint in response for audit.
- Tests: 2-file batch, headers differ on Type → no silent single map; 2-file same fingerprint → one confirm reuse.

**Warning signs:**
- `sourceFile: "a.xlsx · b.xlsx"` with Train groups that only appear in one file’s vocabulary.
- Half the batch empty-typed after map points at a header missing in file 2.
- Confirm once, process five, only first file looks right.

**Phase to address:**
**Confirm/format phase + batch integration tests (≈52 / TEST)**.

---

### Pitfall 8: Alias-First Map Still Runs “Under” the Scorer

**What goes wrong:**
New scorer is added as a soft suggestion, but `detectIntakeColumnMap` still claims Type first and fills values; scorer UI shows a different winner; process uses the old map. Feature looks shipped; behavior unchanged or contradictory.

**Why it happens:**
- `normalizeRawRows` → `enhanceColumnMap` → `detectIntakeColumnMap` is the live path; easy to leave it as source of truth and only add UI chrome.
- Field order already special-cases date before type; engineers assume “good enough” and bolt scorer on the side.

**How to avoid:**
- When confirmed/reused/scored Type column exists, **force** `columnMap.violationIssueType = chosenHeader` and ensure that header is not also mapped to `descriptionNotes`.
- If chosen header was previously claimed by notes/date aliases, reassign notes to next-best narrative column (or leave notes empty) — document conflict resolution.
- Deprecate pure alias-first for Type once scorer ships (aliases become **features** inside the scorer, not a parallel winner).
- E2E `processUpload` asserts columnMap Type header equals scorer/confirm choice.

**Warning signs:**
- API returns `suggestedTypeColumn` ≠ `columnMap.violationIssueType`.
- Unit tests pass on pure scorer; processUpload e2e still alias-first.

**Phase to address:**
**COL scoring wired into normalizer (≈51)** — not a UI-only phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep alias-first map + scorer as “hint only” | Fast UI demo | Wrong Type still trains brain | Never for process path |
| Fingerprint = JSON.stringify(headers) in order | Easy | Reorder → false re-confirm | Only prototypes |
| Fingerprint = file sha256 | Exact | Every new row set re-asks | Never |
| Mutate `violationTypeLabel` for short display | One-line UI | Brain/export poison | Never |
| Promote disabled entirely once scorer exists | Less code paths | Description-only / exotic headers regress v1.7 | Never — promote is fallback |
| City-level map without fingerprint | Simple reuse | Schema change silent wrong Type | Never |
| Confirm required for every upload | “Safe” | Ops unusable; click-through errors | Never (locked: reuse same format) |
| Store mapping only in localStorage | No server work | Multi-device / Railway lose map; non-admin machine diverges | Never for production path |
| Soft-fail confirm with auto-pick top score | No hang | Same as no confirm when score is wrong | Only if confidence extremely high **and** product re-opens decision — default no |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `detectIntakeColumnMap` / aliases | Leave Type as first-match winner | Aliases = scorer features; final Type from confirm/reuse/score |
| `promoteCategoryFromRaw` | Run after wrong non-empty map (blocked) or beside scorer (mixed) | Ordered resolution: confirm → score → promote fallback |
| `buildReviewGroups` / `stableTypeKey` | Group on short label | Group on full timestamp-stripped type |
| `applyBrainToRows` / type rules | Train on wrong Type keys | Confirm Type before any Train session on that upload |
| `processUploadBatch` merge | One map for all files | Per-file fingerprint + map; mismatch policy explicit |
| Train decision DOM scrape | POST truncated title | POST full `violationTypeLabel` + key from group payload |
| Filter list save / export | Persist display label | Persist raw `violationIssueType` only |
| Admin `requireAdmin` | Gate entire process | Gate **confirm mapping write** + brain writes only |
| `BRIDGE_BRAIN_ROOT` volume | Treat Type map as brain rule | Separate durable **city format map** store (city-scoped); do not dump into global typeRules |
| Water shut-off uploadType | Force Type confirm like code_violation | Preserve water early-return / pass-through semantics; don’t invent code-violation Type UX |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Score every cell in 100k-row city file | Multi-second process, heap spikes | Sample first N rows (e.g. 200–500) + header features; cap distinct-value tracking | Large clerk extracts / multi-file × 5 |
| Re-parse full workbook on confirm after score | Double OCR/xlsx cost | Return parse token / temp draft **or** re-parse only if acceptable for MVP size | PDFs/OCR batches |
| Load all city format maps into memory every request | Slow process | Per-cityId read; small JSON files | Hundreds of cities |
| Fingerprint includes all cell values | Huge stored maps, slow compare | Headers + coarse shape stats only | Wide sheets |
| Short-label computation in group rebuild O(n) heavy NLP | Train render jank | Cheap truncate / first clause / max chars — no LLM in v1.8 | Large FN caps (5000) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Non-admin can POST city Type map | Hostile map → wrong suppress/promote training fodder for global brain | `requireAdmin` on confirm/persist map (same spirit as brain writes) |
| Auto-confirm via spoofed `X-Phuglee-User: admin` | Same as brain spoof (known soft debt) | Accept for single-tenant local; document; don’t weaken further |
| Map store under user-scoped path only | Admin map not shared → each operator re-confirms, inconsistent Type | City-level durable store (like brain: global quality), not per-user filter-list scope |
| Trust client-sent `columnMap` without server re-validate | Client forces Type = Address column | Server re-checks header exists in file; optional re-score sanity |
| Logging full sheet samples in confirm UI for all roles | PII leakage | Admin-only samples; truncate addresses in logs |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Confirm modal with no sample values | Admin guesses which column is Type | Show top 5 distinct sample cells per candidate column |
| Re-ask every upload | Fatigue → rubber-stamp | Fingerprint reuse; show “Reusing Type column `Vio Cat`” toast |
| Short labels without expand/tooltip | Can’t verify full ordinance text | Truncate in card title; full text in detail / title attribute |
| Error “Admin required” with no next step | Non-admin stuck | Copy: “Ask admin to confirm Type column for this city format once” |
| Batch fails entirely on one format mismatch | Lost work on good files | Partial success + `fileFailures` (already a batch pattern for `NO_USABLE_ROWS`) |
| Suggested column ≠ what clerk named “Type” | Distrust automation | Allow manual header pick from full header list, not only top-3 |

## "Looks Done But Isn't" Checklist

- [ ] **Scorer pure unit tests pass** — still missing: `processUpload` e2e asserts `columnMap.violationIssueType` header
- [ ] **Confirm UI ships** — still missing: durable per-city fingerprint store survives restart / Railway volume
- [ ] **Same format reuses map** — still missing: header-reorder and extra-column fixtures
- [ ] **Short labels in Train** — still missing: export + decision payload still full text; group keys unchanged
- [ ] **No Type column** — still missing: rows kept + reviewable, not `NO_USABLE_ROWS`
- [ ] **Promote still works** when scorer returns none (v1.7 MAP-01–03 green)
- [ ] **Promote does not override** confirmed/scored Type column
- [ ] **Multi-file divergent schemas** — explicit mismatch behavior, not silent one-map
- [ ] **Wrong-column fixtures** (Status / Description / Date) locked red→green
- [ ] **Non-admin upload** same-format city still processes without confirm
- [ ] **Admin confirm** is the only write path for new fingerprints
- [ ] **Water shut-off** not regressed by Type gate
- [ ] **Brain type rules** trained only after correct Type column on a real process
- [ ] **`npm test` + `scripts/verify-live.ps1`** green after wiring

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong column → poisoned type rules | HIGH | Identify bad keys in brain typeRules; admin suppress/delete rules; fix map; re-process city; do **not** mass-promote from bad Train session |
| Fingerprint too strict (ops pain) | LOW | Loosen normalize (order-independent headers); migrate fingerprint version; one re-confirm |
| Fingerprint too loose (silent wrong Type) | MEDIUM | Bump fingerprint version forcing re-confirm; audit recent lists; re-Train affected categories |
| Short labels wrote into stored type | HIGH | Re-process from source files; invalidate rules keyed on truncated labels; fix write path |
| Silent drop no-type | MEDIUM | Remove drop; re-upload; verify FN path |
| Promote/scorer mix | MEDIUM | Enforce resolution order; re-process; clear mixed groups via new processToken |
| Multi-file blend | MEDIUM | Split batch by fingerprint; re-process per schema; discard mixed Train decisions if any |

## Pitfall-to-Phase Mapping

Suggested v1.8 phase framing (numbers continue from 51; exact IDs set in ROADMAP):

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Wrong column wins / brain poison | **≈51 COL scoring** (headers + value shapes, single winner) | Fixtures: Status/Description/Date must not win; processUpload columnMap lock |
| Alias-first still under scorer | **≈51** wire into `normalizeRawRows` | suggested ≡ applied map |
| Silent drop no type | **≈51–52** process integration | Description-only city → kept + reviewable |
| Promote vs scorer conflict | **≈51** resolution order + promote tests | MAP-01–03 still green; no override of scored type |
| Confirm blocks non-admin / hang | **≈52 Confirm gate + format memory** | Non-admin same-format OK; new format → `TYPE_COLUMN_CONFIRM_REQUIRED` not infinite spin |
| Fingerprint strict/loose | **≈52** | Reorder/extra-col reuse; real Type rename re-asks |
| Multi-file format variance | **≈52** batch policy | Divergent files → mismatch or per-file maps |
| Short labels replace stored type | **≈53 LBL display-only** | Export/brain/decisions full; UI short |
| Regression / “looks done” | **≈54 TEST** | Wrong-map, reuse, short-label, promote coexistence, verify-live |

**Phase ordering rationale:** Score correctly **before** persisting maps (don’t confirm garbage). Confirm/fingerprint **before** short labels (labels need stable correct groups). TEST last locks integration.

## Sources

- `lib/bridge-intake-schema.js` — alias-first `detectIntakeColumnMap`, Type aliases including narrative-ish strings
- `lib/bridge-category-promote.js` — empty-type-only promote; first category-like header wins
- `lib/bridge-engine/normalizer.js` — map → promote → tag order
- `lib/bridge-engine/index.js` — `processUpload`, `processUploadBatch`, `MAX_BATCH_FILES = 5`, merge semantics
- `lib/bridge-brain-apply.js` / `lib/bridge-brain-decisions.js` — type rules key on `violationIssueType`
- `lib/bridge-review-groups.js` — group labels/keys from full type/notes
- `lib/bridge-api.js` — `requireAdmin` for brain writes; process not admin-gated
- `.planning/debug/filter-singleton-no-category.md` — empty/wrong type → Train singletons / no category
- `.planning/phases/48-category-promotion-signal-shape/48-RESEARCH.md` — loss chain for unmapped Type
- `.planning/PROJECT.md` — v1.8 locked decisions (single winner, confirm, reuse, display-only short labels, no silent drop)
- `.planning/milestones/v1.7-REQUIREMENTS.md` — MAP/GROUP contracts that v1.8 must not regress

**Confidence notes:**
- Pipeline interaction pitfalls: **HIGH** (current code)
- Fingerprint design tradeoffs: **MEDIUM** (no implementation yet; recommendations opinionated from multi-file + city export variance)
- Confirm UX state machine: **MEDIUM** (product locks clear; HTTP shape not built)

---
*Pitfalls research for: Distress OS v1.8 Type Column Intelligence*
*Researched: 2026-07-09*
