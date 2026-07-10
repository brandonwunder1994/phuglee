# Pitfalls Research

**Domain:** Filter independence, multi-list staging, accuracy & brain learning (v2.0) — *adding to existing* Distress OS Filter/brain system  
**Researched:** 2026-07-10  
**Confidence:** HIGH (current `lib/` + `public/js/bridge.js` paths + v1.6–v1.8 post-mortems); MEDIUM on exact phase IDs (roadmap not finalized; phases start ~55)

> **Supersedes** the prior `.planning/research/PITFALLS.md` (v1.8 Type Column Intelligence).  
> v1.8 traps (wrong Type column, Type blend, silent drop, short-label store mutation, water type-suppress) remain **active regression locks** — restated below only where v2.0 work can reintroduce them.

## Critical Pitfalls

### Pitfall 1: `already_imported` Still Hard-Drops After Independence (Silent Workflow Break)

**What goes wrong:**
Filter process still runs `loadImportAddressIndex` + `filterAlreadyImported` **before** brain apply and distress keep (`lib/bridge-engine/index.js`). Rows that match any address in the user’s Analyze session are discarded with reason `already_imported` and never appear in kept lists, Train, or saved downloads.

Under the v2.0 product flow (**Filter → save/download → external enrich/skip-trace → manual Analyze import**), this is often *wrong*:

- Operator purged Analyze (or a city batch) to re-run after better enrichment → Filter still drops those addresses → “0 kept / every record already in Analyze.”
- Operator never intended Analyze as the Filter gate — lists are for *external* prep, not “not already scanned.”
- Stale or partial import index (session file vs API, wrong scope, street-only keys) drops *new* city leads that only share a street token with an old import.

**Why it happens:**
- Cross-ref was designed when Filter **auto-pushed** into Analyze (legacy `bridge-analyzer-push.js` / GSD-AUDIT). Independence removed the *push* (`handleProcess` comment: “do not auto-push”) but left the *pre-filter* coupling.
- `force: true` every process avoids TTL staleness but cannot fix “index still has purged addresses” if disk session / API lag, or the product wrongness of hard-drop itself.
- `noUsableRowsMessage` treats all-imported as a success-shaped empty (“Every record… already in your Analyze session”) — looks intentional, hides data loss for re-work.

**How to avoid:**
- Treat Analyze cross-ref as **optional operator preference**, not a silent hard-drop default for independence:
  - Preferred product: **off by default** for code_violation list factory; surface “already in Analyze” as a *review flag* or soft stat, not remove from downloadable list.
  - If keep-filter remains: require explicit opt-in (`skipAlreadyImported` / UI toggle), never implicit.
- After Analyze purge: index must go empty immediately (disk + API); add invalidate hook / process meta `importIndexCount` visible in UI.
- Never let `already_imported` suppress water shut-off or Train FN review pools without explicit product text.
- Regression: purge Analyze session → re-process same city CSV → rows **kept** (or soft-flagged), not `NO_USABLE_ROWS` solely from import index.

**Warning signs:**
- “Every record in this file is already in your Analyze session” after operator deleted Analyze leads.
- Saved list row counts << city file distress counts while Analyze still holds old addresses.
- External enrich files missing parcels the clerk file clearly contains.
- `processingMeta.importIndexCount` high; `stats.alreadyImported` dominates discards.

**Phase to address:**
**Independence / process-coupling phase (~55)** — decide default + implement before multi-list polish. Accuracy of lists for external workflow depends on this.

---

### Pitfall 2: Re-Introducing Auto-Push (or “Helpful” Half-Push)

**What goes wrong:**
A later plan “wires Analyzer again” for convenience: process or saveList calls `pushRowsToAnalyzer`, attach-to-city re-imports, or UI “Send to Analyze” reappears. External enrich is skipped; Analyze gets un-enriched rows; operators double-import after manual path; product promise (“Filter stages only”) collapses.

**Why it happens:**
- `lib/bridge-analyzer-push.js` and Analyzer `bridge-import-records` still exist (legacy + docs still mention auto-push in GSD-AUDIT).
- Home copy / Analyze UI may still assume “data arrives from Filter.”
- Engineers see empty phone/email fields and “fix” empty contact fields via push instead of external skip-trace.

**How to avoid:**
- Hard product rule: **no Filter process/save path may call push**. Keep module only if needed for one-off recovery tools behind admin flag — default dead code path with test that process handlers never require it.
- Docs: DATA-STANDARDS already says no auto-push — update GSD-AUDIT / home guide so agents don’t “restore” it.
- Manual Analyze import of *enriched* files is the only supported entry after Filter.
- UI copy: “Download → enrich outside → import in Analyze,” never “Push to Analyze.”

**Warning signs:**
- Process response includes `analyzerPush` / import batch IDs.
- Analyze fills with empty phone/email immediately after Filter process.
- Dual paths: some rows pushed, some only saved → operator confusion and duplicates.

**Phase to address:**
**Independence phase (~55)** — delete or quarantine call sites; lock negative tests (“process does not hit bridge-import-records”).

---

### Pitfall 3: Train Decisions Never Land on the Saved List (Accuracy Lost at the Seam)

**What goes wrong:**
Admin Trains on `lastResult` (client working set). Decisions mutate `lastResult.rows` / brain rules via POST body full row arrays. **Save list** POSTs `lastResult.rows` once. Failure modes:

1. **Save before Train** → download still contains denied types; brain may still get rules if Train happens after save, but *this* list is dirty.
2. **Train then process next city without save** → `lastResult` overwritten; trained list evaporates (only brain rules remain).
3. **Train then save** is correct — but UI doesn’t force/order it; multi-city sequential flow (`resetImportAreaAfterSave`) optimizes for next upload, not for “did you train?”
4. **Reload list from disk** has no Train surface — only live process results do. Cannot fix a saved list without re-process.

**Why it happens:**
- Architecture: decisions are **stateless server** + **client lastResult**; lists are a **snapshot store**, not a live Train session (`bridge-list-store.js` has no decision API).
- Save button is optional; Train is on results panel only.
- Multi-list goal (“sequential city uploads persist”) exists partially (saved lists) but Train is still single-slot `lastResult`.

**How to avoid:**
- Product order: **Process → Train (admin) → Save** as guided pipeline; block save of unreviewed? (or soft warn with “N groups not decided”).
- On save: persist **post-decision** rows only; include `brainVersion` / decision count in `processingMeta` for audit.
- Optional: “Save & clear” already clears results — require confirm if open Train groups remain.
- Longer-term accuracy: ability to open a saved list into Train working set (load rows → rebuild groups) without re-upload — only if product wants re-work; otherwise document “Train only on live process.”
- Never write brain rules from a list the admin didn’t see (no batch auto-train on save).

**Warning signs:**
- Deny “Fence Permit” but download still has fence permits.
- Brain rules grow while list downloads don’t change behavior for *this* city batch.
- Operator says “I trained it” but `savedAt` precedes last decision timestamp (no timestamps today — add).

**Phase to address:**
**Multi-list + Train workflow phase (~56)** after independence; accuracy pass must not assume save ≡ trained list.

---

### Pitfall 4: “Accuracy Improvements” That Silently Drop Leads

**What goes wrong:**
In the accuracy pass, someone tightens tagger regex, raises distress threshold, auto-applies proposed phrases, or adds “low confidence drop.” Kept counts look cleaner; **real distress parcels vanish** with no Train path. Violates locked rule: **silent drop of leads when Type unresolved — forbidden** (and the spirit extends to keep/kill accuracy work).

**Why it happens:**
- Success metric misread as “fewer rows” or “fewer Approve/Deny clicks” instead of “fewer *necessary* Approve/Deny because bot was already right.”
- FN pool is capped (`MAX_FN_REVIEW_ROWS`); aggressive drops never enter FN review.
- `filterDistressOnly` already hard-splits; stacking more hard filters is one PR away.

**How to avoid:**
- Accuracy changes must be **reviewable**: wrong keeps → Deny → suppress rule; wrong drops → appear in FN → Deny promote → promote rule.
- Never auto-activate proposed phrases (PHRASE-02 still holds).
- No new discard reason without Train/export visibility and a fixture that proves distressed gold-set rows still kept.
- Type unresolved: keep review path (v1.8 COL/GATE locks).
- Gold-set regression fixtures per city shape (weeds/trash/blight/junk + known FN permits).

**Warning signs:**
- Kept count collapses after “accuracy” PR with no matching brain rule growth.
- Admin Train distressed section empty while clerk file is full of high grass.
- New discard reasons in stats without UI explanation.

**Phase to address:**
**Accuracy pass (~57)** — first plans are measurement + gold fixtures, then keep/kill changes. Never ship drop logic in the same plan as UI chrome.

---

### Pitfall 5: Brain Poison From Wrong Type Vocabulary (Still the Highest-Severity Accuracy Failure)

**What goes wrong:**
Despite v1.8 scorer + confirm, residual paths still train on garbage keys:

- Description/Status/Date wins if confirm is rubber-stamped or format fingerprint too loose.
- Empty type + timestamped notes → singleton groups → admin Deny writes one-off `suppress_type` / phrase noise (see `.planning/debug/filter-singleton-no-category.md`).
- Short label or DOM scrape leaks into `violationTypeLabel` on decision POST (v1.8 LBL partially fixed — re-breakable in Train UX rewrites).
- Promote-from-raw re-blends multi-column Type (forbidden).

Global brain then **suppresses real categories** or **promotes junk** for every customer on every future city.

**Why it happens:**
- Type rules key on `violationTypeKey(row.violationIssueType)` (`bridge-brain-apply.js`).
- Decisions are durable and global by design (not per-city).
- Heterogeneous city files remain permanent — one bad Train session is product-wide.

**How to avoid:**
- Do not open Train until `processingMeta.typeResolution` is trusted (`admin_confirm` / `auto_reuse` with sane header).
- Guardrails: block type-rule writes when type key looks free-text-long / date-like / status enum (or require “confirm poison risk”).
- Preserve v1.8 locks: exclusive Type column, empty-cell-only promote, display-only short labels, no silent drop.
- Phrase rules stay proposed-only until admin activate.
- Recovery path documented: disable bad rules in brain panel; never “mass promote from bad session.”

**Warning signs:**
- Type rule list fills with sentences, timestamps, `Open`/`Closed`.
- After one city Train, other cities’ High Grass vanishes or permits flood kept.
- Singleton rate high on Train distressed.

**Phase to address:**
**Accuracy / Type residual (~57)** + continuous regression from v1.8 TEST phase. Learning phase must not add auto-rules without Type quality gate.

---

### Pitfall 6: Learning Metric Gamed — Fewer Clicks ≠ Better Accuracy

**What goes wrong:**
Milestone success: “Approve/Deny code violations becomes less frequent.” Implementations that **hide groups**, **collapse Train**, **auto-approve**, or **shrink FN caps** reduce clicks while accuracy stays flat or worsens. External lists still full of non-deals; Analyze still wastes scan time.

**Why it happens:**
- Easy to measure decision count; hard to measure precision/recall on heterogeneous cities.
- Proposed phrases auto-activated “to show learning.”
- Suppress-everything admin habit after fatigue.

**How to avoid:**
- Define learning success as **paired metrics**:
  1. Decision volume ↓ on *repeat formats* / known categories  
  2. Kept-list precision ↑ (admin sample audit or gold fixtures)  
  3. FN recall for known distress types not ↓  
- Track `brainAppliedRuleIds` hit rates vs later Deny (rule regret).
- Never count “groups not shown” as learning.
- Efficiency work (runtime, reuse) is peer priority but **must not trade** accuracy (PROJECT.md).

**Warning signs:**
- Metrics dashboard celebrates decision ↓ while support tickets about junk leads ↑.
- Active suppress rules >> promote rules by orders of magnitude.
- Same category re-Denied every week (rules not matching — key mismatch).

**Phase to address:**
**Learning / metrics phase (~58)** — instrument before “smart” automation. Accuracy pass defines gold fixtures first.

---

### Pitfall 7: Export / Enrich / Re-Import Schema Drift (Breaks Manual Analyze Path)

**What goes wrong:**
Filter download (`toExportRow` / list download) changes columns, renames headers, drops address parts, or writes display short types. External skip-trace tools map columns by name; Analyze manual import expects street/city/state/zip (and often phone/email added by enricher). Drift → failed import, blank addresses, or leads without distress context.

**Why it happens:**
- Independence makes **download the product API** to the outside world; previously push used `bridgeRowsToAnalyzerRecords` with fixed field mapping.
- Multi-list “download all” adds `List Name` / `List City` prefix columns (`bridge-list-store.js`) — enrichers may not expect them.
- Accuracy UI work mutates export labels for “cleanliness.”

**How to avoid:**
- Freeze a **Filter export contract** for external enrich + Analyze re-import (document in DATA-STANDARDS):
  - Stable headers: Street Address, City, State, Zip, Violation/Issue Type, …  
  - Full raw type, never short label  
  - Address fields always populated from normalized rows  
- Version export if columns must change; provide mapping guide.
- Single-list download should match what enrichers already use; download-all is a *batch* format — don’t make it the only download.
- After enrich, Analyze import path tested with fixture that has phone/email columns added mid-file.

**Warning signs:**
- Enrich vendor “can’t find address column.”
- Analyze import 0 records after Filter download.
- Type column empty in export but present in Train.

**Phase to address:**
**Independence + export contract (~55–56)** before heavy multi-list UX. Verify on every accuracy export touch.

---

### Pitfall 8: Multi-List Store Looks Done but Staging Is Still Single-Slot

**What goes wrong:**
`bridge-list-store` already supports multi-list CRUD, but operator mental model and Train still bind to **one** `lastResult`. Sequential cities: process A → save A → process B works **only if** save happened. Process A → process B without save destroys A’s working set. “Multi-list staging” milestone ships UI table polish without fixing:

- No draft auto-save of process results  
- No multi-city Train queue  
- Clear-all lists is one confirm away from wiping a day’s work (Agents.md: never agent-wipe; UI still dangerous)  
- Index RMW races under multi-tab save (`writeIndex` last-writer-wins)

**Why it happens:**
- List store was bolted for download staging; Train/brain never multi-session.
- `resetImportAreaAfterSave` deliberately clears results for next drop — good for speed, bad if save skipped.

**How to avoid:**
- Explicit staging states: `processed_unsaved` vs `saved` vs `downloaded`.
- Autosave draft list on successful process (or prompt) so sequential cities can’t clobber.
- Multi-list UI: show unsaved badge if lastResult dirty.
- Clear-all: typed confirm; never agent-invoked.
- Optional file lock / version on `index.json` if multi-tab is real.

**Warning signs:**
- Operators re-upload the same city “because it disappeared.”
- Saved lists empty after long Train session.
- Two tabs: one list missing from index.

**Phase to address:**
**Multi-list staging phase (~56)**.

---

### Pitfall 9: Stale or Scope-Wrong Import Index (Purge / Multi-Tenant)

**What goes wrong:**
Even with `force: true`, index can be wrong:

- API fails → disk session still has old addresses (or reverse).  
- Header spoof / vault scope loads another user’s 10k addresses → mass `already_imported`.  
- Docs still claim 5‑min cache; process forces refresh but other callers might not.  
- Street-only keys over-match different parcels.

**Why it happens:**
- Dual source (`GET /api/import-address-index` + `distressAnalyzerSession_LATEST.json`).
- Fuzzy match ≥ 0.92 + street keys (`import-filter.js`).
- Spoofable `X-Phuglee-User` (known soft debt).

**How to avoid:**
- If cross-ref remains: show index source + count + scope in UI; “Refresh index” control after purge.
- Prefer exact composite keys over street-only for hard-drop (if hard-drop kept at all — see Pitfall 1).
- On independence, default cross-ref **off** eliminates most of this class.

**Warning signs:**
- Different machines disagree on already_imported counts.
- Non-admin sees another plan vault’s imports.
- Purge Analyze, process still strips.

**Phase to address:**
**Independence (~55)** with any residual cross-ref work; security notes for later sessions milestone.

---

### Pitfall 10: Water Shut-Off Type-Suppress or Confirm Regression

**What goes wrong:**
Accuracy/brain/learning changes apply `suppress_type` / Type confirm gates to water shut-off. Water lists thin out or block on Type column. Locked: **water shut-off must never type-suppress** (BRAIN-03); v1.8 skips Type confirm for water.

**Why it happens:**
- Shared `applyBrainToRows` / process gate — easy to drop `uploadType === 'water_shut_off'` early-return while refactoring.

**How to avoid:**
- Keep water early-return in brain apply; no type rules; process gate skip.
- Dedicated e2e: water file + active suppress rules for a type string that appears in notes → still kept.
- Train on water should not write type suppress (decision path already skips phrase mining for water — extend discipline to type rules if needed).

**Warning signs:**
- Water kept count drops after brain-heavy city Train.
- Water upload stuck on Type confirm modal.

**Phase to address:**
**Every accuracy/brain phase** — regression in final TEST (~60).

---

### Pitfall 11: Decision Payload / List Mutation Race (409, 15MB, Wrong Rows)

**What goes wrong:**
Decision POST ships full row arrays (known soft debt, 15MB cap). Multi-list or large FN caps → payload fail, partial apply, or client/server list divergence. Brain version 409 mid-Train; client snapshot undo desyncs from server rules. Admin re-clicks Deny → duplicate hitCounts or conflicting promote/suppress.

**Why it happens:**
- Stateless decision API trusts client rows as source of truth.
- No server-side processToken store for working lists.

**How to avoid:**
- Short term: keep caps; fail clearly; don’t retry with stale version without reload.
- Accuracy work: prefer **rowIds + type key** mutations against a server process session if building multi-list Train — don’t enlarge POST bodies further.
- Undo remains split (client list + server rule) — document; never invent “undo save list.”

**Warning signs:**
- Train actions 413/400 on big cities.
- 409 loops; rules apply but UI rows don’t move.
- Undo restores rows but suppress rule remains (or reverse).

**Phase to address:**
**Learning hardening (~58)** if touching decisions; otherwise leave alone and don’t pile multi-list Train on full-array POST without redesign.

---

### Pitfall 12: Heterogeneous City Files Treated as One Schema (Batch / Format Memory)

**What goes wrong:**
Multi-file batch (≤5) or multi-city day ops apply one Type map / one Train vocabulary to divergent clerk exports. Format fingerprint too loose → silent wrong Type (brain poison). Too strict → confirm fatigue → rubber-stamp. Permanent constraint: cities are not interchangeable.

**Why it happens:**
- Batch merge is address-dedupe across files (`mergeProcessResults`); type vocabularies mix in one Train session.
- Efficiency goals push “reuse everything.”

**How to avoid:**
- Keep v1.8 per-file fingerprint policy (FORMAT_MISMATCH / per-fingerprint maps).
- Don’t “efficiency” away confirm on real schema change.
- Multi-list: **one list per city process**, not one mega-list of mixed schemas for Train.
- Cross-city learning is via **global brain rules on stable type keys**, not via shared column maps.

**Warning signs:**
- One Train session shows categories from two unrelated ordinance systems.
- Confirm rate 0% with rising wrong-type tickets.

**Phase to address:**
**Accuracy residual + multi-list (~56–57)**; never “optimize” confirm in efficiency-only phase without fixtures.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leave `already_imported` hard-drop “as is” while removing push | Fast independence demo | External re-work & purge workflows silently empty | **Never** for v2.0 default — decide explicitly |
| Reuse `bridge-analyzer-push` for “manual one-click import” | Feels integrated | Skips enrich; re-couples modules | Never as default path |
| Autosave list without post-Train rows | Never lose process | Downloads include junk admin would have Denied | Only if marked `unreviewed` and Train can reopen |
| Auto-activate proposed phrases to “show learning” | Metrics move | Global false suppress/promote | **Never** |
| Measure only decision count ↓ | Easy KPI | Hides precision collapse | Never as sole success bar |
| Train on short labels / DOM text | Pretty cards | Brain keys never match next upload | **Never** |
| Blend Type columns for “more signal” | Richer labels | Group/brain destruction | **Never** (v1.8 lock) |
| Silent drop unresolved Type | Cleaner FN UI | Data loss | **Never** |
| Clear filter-lists to “test multi-list” | Clean env | Destroys real operator work (Agents.md) | **Never** without explicit user wipe request |
| Fingerprint = file hash | Exact | Re-confirm every day | Never |
| Client-only multi-list (localStorage) | No server work | Lost on other device / Railway | Never for production path |
| Suppress-all on Deny fatigue | Quiet Train | Brain poison, empty future keeps | Never — fix Type/grouping instead |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `filterAlreadyImported` / Analyze session | Keep hard-drop after independence | Opt-in or soft-flag; default off for list factory |
| `bridge-analyzer-push.js` | Call from process/save “for convenience” | No call sites on Filter happy path; manual Analyze import only |
| `saveList` + Train decisions | Save pre-decision rows | Process → Train → Save; persist post-mutation rows |
| `lastResult` vs multi-list | Assume disk lists are Trainable | Live process Train; or explicit load-to-Train feature |
| Export / enrich vendors | Rename Filter columns freely | Freeze export contract; full type + address fields |
| Analyze manual import | Expect push-shaped records only | Accept enriched CSV/XLSX with phone/email + address |
| Global brain `typeRules` | Train before Type confirm | Gate Train on trusted `typeResolution` |
| `promoteCategoryFromRaw` | Re-enable multi-column blend | Empty-cell-only after exclusive Type map |
| Water shut-off | Share code_violation suppress path | Early-return; no type suppress; no Type confirm block |
| `FILTER_LISTS_ROOT` volume | Wipe lists during deploy/test | Agents.md hard rule; volume-safe paths only |
| Import index cache | Trust 5‑min TTL after purge | force refresh + UI count; prefer independence off |
| Batch `processUploadBatch` | One map for mixed files | Per-file fingerprint; no silent schema merge |
| Decision POST full arrays | Add multi-list Train without redesign | Caps + clear errors; consider processToken later |
| Form Forge attach | Confuse attach with Analyze push | Attach = city tracker/FOIA KPI only |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Decision POST full city rows every Approve/Deny | Slow Train, 413, UI freeze | Don’t grow payload; later server session | Large FN + kept (multi‑MB JSON) |
| Download-all loads every `rows.json` | Heap spike, timeout | Stream/cap; warn on huge recordCount | Dozens of cities × 10k rows |
| `force: true` import index every process | Extra API/disk on each upload | OK if cross-ref stays; remove work if cross-ref off | High-frequency reprocess |
| Re-score Type on every cell of 100k rows | Multi-second process | Keep sample-based scorer (v1.8) | Huge clerk extracts |
| Rebuild review groups client-side repeatedly | Train jank | Server groups; cheap shortLabel | FN cap 5k |
| Multi-list index rewrite per save without lock | Lost list entries | Version/lock if multi-tab | Parallel tabs / vault users |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Non-admin brain writes | Poison global quality for all customers | Keep `requireAdmin` on decisions/phrase activate |
| Spoof `X-Phuglee-User` to read others’ lists / import index | Cross-tenant list + false already_imported | Document single-tenant; sessions later; don’t widen trust |
| Auto-push re-enabled without auth | Writes Analyze session for claimed user | No push on Filter path |
| Persist Type map / brain under wipeable path | Lost learning; re-train tax | Volume-safe roots like lists/brain |
| Client-sent columnMap / rows trusted blindly | Hostile type keys / injected promotes | Server re-validate headers; admin-only rule writes |
| Clear-all lists exposed without strong confirm | One-click day loss | Typed confirm; Agents.md for agents |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No guidance: Train vs Save order | Dirty downloads; wasted Train | Pipeline steps: Process → Train → Save → Download |
| “Already in Analyze” empty result after purge | Operator thinks city has no distress | Soft flag + message with index count; or disable filter |
| Multi-list table without unsaved warning | Lost process when next city dropped | Dirty state badge; autosave draft |
| Learning celebrated as fewer buttons | False confidence | Show rule hits + sample audit |
| Download-all as only export | Enricher breaks on extra columns | Per-list download primary |
| Confirm rubber-stamp on Type | Brain poison | Samples + require glance; reuse only on fingerprint match |
| Singleton walls of timestamp text | Train fatigue → bad Denies | Stable group keys (v1.7/v1.8) + short display labels |
| Clear all lists too easy | Catastrophic data loss | Strong confirm; no agent automation |

## "Looks Done But Isn't" Checklist

- [ ] **Independence:** Process/save paths have **zero** calls to `pushRowsToAnalyzer` / bridge-import-records — verified by test, not comment alone
- [ ] **Independence:** `already_imported` default behavior decided (off / opt-in / soft-flag) — purge → re-process keeps rows
- [ ] **Independence:** UI/docs say download → external enrich → **manual** Analyze import
- [ ] **Export contract:** Single-list CSV/XLSX headers stable; full Type; addresses intact; enrich fixture round-trips to Analyze
- [ ] **Multi-list:** Sequential cities cannot destroy unsaved process without warning; drafts or forced save
- [ ] **Train → Save:** Saved list rows match post-decision kept set; brain rules not the only artifact of Train
- [ ] **Accuracy:** Gold fixtures (distress kept + permit FN) green after keep/kill changes
- [ ] **Accuracy:** No new silent drop for unresolved Type; promote empty-only; no Type blend
- [ ] **Learning:** Phrases proposed-only until activate; suppress/promote regret visible
- [ ] **Learning bar:** Decision ↓ **and** precision/recall not worse on gold set
- [ ] **Water:** No type-suppress; no Type confirm block
- [ ] **Heterogeneous cities:** Batch divergent schemas don’t share one silent map
- [ ] **User data:** No test/deploy path deletes `data/filter-lists/` or brain volume
- [ ] **`npm test` + `scripts/verify-live.ps1`** green after wiring

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| already_imported emptied re-work list | MEDIUM | Disable/opt-out cross-ref; purge/fix index; re-process; re-download |
| Auto-push reintroduced junk into Analyze | MEDIUM | Stop push; purge Analyze import batch; re-import enriched files only |
| Saved list pre-Train (dirty) | LOW–MEDIUM | Re-process city; Train; save new list; delete dirty list |
| Brain poison (wrong Type / bad Deny) | HIGH | Brain panel disable bad type/phrase rules; fix Type map; re-process; do **not** mass-train from poisoned session |
| Silent drop accuracy PR | MEDIUM | Revert drop; restore FN path; re-run gold fixtures |
| Export schema broke enrich | MEDIUM | Restore headers; re-download; notify enrich mapping |
| Clear-all lists | HIGH | Restore from backup/volume snapshot if any; else re-process cities (irreversible without backup) |
| Water suppress regression | MEDIUM | Restore water early-return; re-process water files |
| Decision 409 / desync | LOW | Reload process results; check brain version; undo last if available |
| Multi-file schema blend Train | MEDIUM | Split by fingerprint; discard mixed decisions if rules look wrong |

## Pitfall-to-Phase Mapping

Suggested v2.0 framing (phase numbers continue from **~55**; exact IDs set in ROADMAP). **Accuracy-first ordering:** stop silent data loss and brain poison before UX polish.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| already_imported hard-drop / purge break | **~55 Independence & process coupling** | Purge Analyze → re-process keeps (or soft-flags); importIndex visible |
| Auto-push resurrection | **~55** | Negative test: process/save never hits push/import-records |
| Export/enrich/Analyze schema drift | **~55–56 Export contract** | Fixture: Filter download → mock enrich columns → Analyze import |
| Multi-list still single-slot / unsaved clobber | **~56 Multi-list staging** | Process A, process B without save → warn/draft; lists durable |
| Train decisions ≠ saved list | **~56** | Deny type → save → download lacks those rows |
| Silent drop “accuracy” | **~57 Accuracy pass** | Gold distress kept; FN reviewable; no new silent reasons |
| Wrong Type / singleton brain poison | **~57** (+ carry v1.8 locks) | Wrong-column fixtures; singleton rate; rule key audit |
| Learning metric gamed | **~58 Learning instrumentation** | Decision ↓ with stable/↑ precision on gold; phrases not auto-on |
| Decision payload / 409 races | **~58** if touching decisions | Large-file Train; version conflict UX |
| Water suppress / Type gate | **All brain/accuracy phases + ~60 TEST** | Water e2e with hostile type rules |
| Heterogeneous batch maps | **~56–57** | Divergent batch → mismatch or per-file maps |
| User list wipe | **All phases (Agents.md)** | No plan deletes filter-lists/brain data |
| Full regression lock | **~60 TEST** | Independence + multi-list + accuracy gold + verify-live |

**Phase ordering rationale:**
1. **Decouple Filter from Analyze correctly** (push gone *and* import hard-drop decided) so external workflow is real.  
2. **Make multi-list staging trustworthy** so sequential cities and Train→Save don’t lose work.  
3. **Accuracy pass with gold fixtures** before learning automation — never train faster on wrong labels.  
4. **Learning metrics + phrase discipline** so Approve/Deny volume falls for the right reason.  
5. **TEST/verify-live** locks independence, water, Type, and export contract.

## Sources

- `lib/bridge-engine/index.js` — pipeline order: normalize → dedupe → **import filter** → brain → distress; `force: true` index; water/NO_USABLE_ROWS messages  
- `lib/bridge-engine/import-filter.js` — `already_imported` hard remove  
- `lib/analyzer-import-index.js` — API + disk session index, 5‑min cache, scope keys  
- `lib/bridge-analyzer-push.js` — legacy push still in tree  
- `lib/bridge-api.js` — process does not auto-push; list CRUD; decision 409  
- `lib/bridge-list-store.js` — multi-list filesystem store; download-all column prefix; index RMW  
- `lib/bridge-brain-apply.js` / `bridge-brain-decisions.js` — type/phrase order; water no-op; global rules  
- `lib/bridge-export.js` / `bridge-intake-schema.js` — export contract fields  
- `public/js/bridge.js` — `lastResult`, Train apply, saveCurrentList, resetImportAreaAfterSave  
- `docs/bridge/DATA-STANDARDS.md` — no auto-push; already_imported semantics  
- `.planning/debug/filter-singleton-no-category.md` — empty/wrong type → Train singletons  
- `.planning/PROJECT.md` — v2.0 goals; out of scope auto-push; learning bar; carried v1.6–v1.8 locks  
- `.planning/STATE.md` — milestone intent; phases from 55  
- `Agents.md` — never wipe filter-lists / bridge-brain  
- Prior v1.8 PITFALLS (superseded): wrong Type, confirm gate, fingerprint, short labels, silent drop, promote/scorer conflict  

**Confidence notes:**
- Coupling / list / Train seam pitfalls: **HIGH** (live code)  
- Product default for `already_imported` under independence: **MEDIUM** (recommend off/opt-in; final product decision in requirements)  
- Exact phase numbers: **MEDIUM** (roadmap not written; topics ordered accuracy-first)

---
*Pitfalls research for: Distress OS v2.0 Filter Independence & Learning*  
*Researched: 2026-07-10*
