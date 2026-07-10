# Quick Task 260710-k9c: Confident Category Stacking — Research

**Researched:** 2026-07-10  
**Domain:** Filter/Bridge Train review grouping — municipal code + free-text category collapse  
**Confidence:** HIGH (measured on live Irving TX export)

## Summary

Phase 49 strips incidental **dates/times** so `"High Grass … 01/15"` stacks with `"… 01/16"`. That is not enough for real city exports where the **same category code** (e.g. Irving `HGW`) is followed by per-complaint notes, slash-combos, multipliers (`X2`), case IDs (`PS-2026-04-3104`), and callback meta (`*CALL BACK*`). Those rows still key as unique free-text → hundreds of Train singletons.

**Measured (Irving TX `violation-history-report (52).xlsx`, 2767 grid rows, 648 with Name or Description):**

| Key strategy | Groups | Singletons | Rows in multi-groups |
|--------------|--------|------------|----------------------|
| Current `stableTypeKey` (date/time strip only) | 317 | 283 | 365 |
| Proposed leading-code + noise strip | **101** | **60** | **588** |

Top proposed stacks: `hgw`×262, `pog`×58, `td`×31, `toe`×25, `tlb`×21 — without merging fence-vs-pool style free-text.

## User constraints

- Cities always differ (no Irving-only hardcode of HGW meaning)
- Group only when **confident**
- Goal: collapse ~250 singleton Train cards when they share a real category signal
- Do not change keep/kill distress accuracy for the sake of grouping

## Approaches considered

### A — Fuzzy string clustering (edit distance / Jaccard)
- **Pros:** Collapses near-duplicates without structure  
- **Cons:** Low confidence; can merge fence vs pool, water vs grass; hard to explain on Train card  
- **Verdict:** Reject for auto-merge. Too easy to over-group.

### B — City-specific code dictionary (HGW → High Grass)
- **Pros:** Perfect labels for known cities  
- **Cons:** Does not scale; user said cities always differ  
- **Verdict:** Reject as required path. Optional later via brain type rules.

### C — Expand noise strip + leading municipal **code extraction** (RECOMMENDED)
- **Pros:** City-agnostic pattern (`2–5` letter codes, `O/S`-style, `HGW/TD` combos); high precision; measured win on Irving; preserves combo sets (`hgw+td` ≠ pure `hgw`)  
- **Cons:** Codes that look like English words need denylist (`OTHER`, `STOP`, `TEST`); bare `/` must not split `O/S` into `o+s`  
- **Verdict:** Ship this.

### D — Batch frequency rekey (only rekey if head appears ≥N times)
- **Pros:** Extra safety  
- **Cons:** Same file twice with different N could key differently; harder to test  
- **Verdict:** Defer. Leading-code is already high confidence without batch stats.

## Recommended design

### Pipeline (pure, in `lib/bridge-stable-text.js`)

1. **`stripIncidentalNoise(text)`** — superset of timestamps:
   - existing US/ISO dates + times
   - case IDs: `PS-2026-06-4613`, `CE-2026-722`, `ICS` variants
   - asterisk meta blocks `*…*`
   - multipliers `X2` / `x3`
   - dangling separators cleanup

2. **`extractLeadingTypeCodes(text)` → `string[] | null`**
   - After noise strip + uppercasing, match a **leading code run only**
   - Token patterns:
     - `[A-Z]{2,5}` (HGW, POG, TLB, …)
     - `[A-Z]/[A-Z]` (O/S) kept as one token → normalize to `os`
   - Separators between codes: `,` `/` `+` `&` (with optional spaces)
   - Stop at first non-code token / long free-text
   - **Denylist** single-token English-ish codes: `OTHER`, `STOP`, `TEST`, `NONE`, `UNKNOWN`, `SIGNS`, `ITEMS`, `PARKING`, `VACANT`, `NO`, `YES` → treat as non-code (fall through)
   - Normalize: lower, strip internal `/`, sort unique, join with `+`
   - Return null if no confident codes

3. **`stableTypeKey` / `stableDescriptionKey` upgrade**
   - If leading codes found → key = `code:<sorted>` (or just sorted codes — pick one; prefer bare sorted join for shorter keys: `hgw`, `hgw+td`)
   - Else → existing strip → lower/collapse (type uses `violationTypeKey`; description never `__unknown__`)
   - Clean typed English ("High Grass and Weeds") → no code match → **unchanged Phase 49 behavior**

### Wire

- `buildReviewGroups` already calls `stableTypeKey` / `stableDescriptionKey` — upgrade helpers only if signatures stay compatible
- Labels: prefer first-seen cleaned display (existing); optional display of short code when label is long free-text
- `isSingleton` remains pure `count === 1`
- Do **not** use `shortLabel` for keys
- Do **not** mutate process rows / export columns

### Confidence rules (product)

| Situation | Action |
|-----------|--------|
| Leading `HGW`, `HGW - OVERGROWN…`, `HGW*meta*` | Stack on `hgw` |
| `HGW/TD` vs pure `HGW` | **Separate** groups (combo set is the key) |
| `fence permit` vs `pool permit` | Separate (no leading codes) |
| Timestamp-only variance | Still stack (Phase 49 preserved) |
| `OTHER - …` different reasons | **Do not** code-stack; full free-text key after noise strip |
| Pure numeric heads (`1`, `4`) | Keep as free-text keys (exact after strip) — may still multi-stack if identical |

## Integration points

| File | Role |
|------|------|
| `lib/bridge-stable-text.js` | Pure strip/extract/stable keys |
| `lib/bridge-review-groups.js` | Consumer only (already wired) |
| `tests/bridge-stable-text.test.js` | Unit matrix for codes/noise |
| `tests/bridge-review-groups.test.js` | Irving-like HGW stack + fence/pool split + Phase 49 regressions |
| Brain / export / shortLabel | Unchanged |

## Pitfalls

1. **O/S split:** do not tokenize bare `/` as separator for single-letter pairs  
2. **Over-broad English codes:** denylist required  
3. **Ordinance numbers:** do not strip `12-3457`-style as dates (Phase 49 lock)  
4. **Brain type keys:** group `violationTypeKey` becomes code-normalized — Approve/Deny type rules may fire more consistently across HGW variants (desirable; document)  
5. **Combo explosion:** many unique combos remain singletons — acceptable; better than wrong merge

## Out of scope

- Fuzzy merge of free-text without codes  
- City-specific HGW→English expansion dictionaries  
- UI redesign of Train cards  
- Changing distress tagger keep/kill

## Artifact

- Simulation script (dev-only): `scripts/_irving-group-sim.js`  
- Source sample: `~/Downloads/violation-history-report (52).xlsx` (Irving open violations by type)

---

*Research complete for quick task 260710-k9c*
