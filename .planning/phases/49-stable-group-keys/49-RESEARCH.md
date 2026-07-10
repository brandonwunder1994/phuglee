# Phase 49: Stable Group Keys - Research

**Researched:** 2026-07-10  
**Domain:** Filter/Bridge review grouping — timestamp-stable free-text and type keys; singleton = count === 1  
**Confidence:** HIGH

## Summary

Phase 49 fixes the **distressed singleton flood** diagnosed in `.planning/debug/filter-singleton-no-category.md`: when `violationIssueType` is empty (or type cells embed per-row dates/times), `buildReviewGroups` keys each row by **exact** free-text / full type string. Descriptions like `"High Grass and Weeds - 01/15/2024 10:30"` vs `"… 01/16/2024 11:00"` become N unique map keys → N groups with `count === 1` → Singleton badges. Phase 43 intentionally locked “empty type → exact description”; that product rule is wrong for real city free-text with incidental timestamps and is **superseded** here for grouping keys only.

Work stays in `lib/bridge-review-groups.js` (+ pure strip/stable-key helper). Do **not** change Train CSS, phrase miner, MAP/SHAPE (Phase 48), or invent new singleton heuristics. `isSingleton` already is pure `count === 1` — it becomes correct once keys stabilize. Clean typed High Grass continues to use `violationTypeKey` after strip (no-op on clean labels) so GROUP-03 is a regression guard, not a redesign.

**Primary recommendation:** Add pure `stripIncidentalTimestamps` + `stableGroupTextKey`; use them for **both** empty-type `descriptionKey` and non-empty type keys before `violationTypeKey`; keep labels human-readable (prefer cleaned phrase, first-seen); leave `isSingleton = count === 1` untouched.

## User Constraints

### Locked Decisions

**GROUP**
- Empty type: key free-text after stripping incidental dates/times
- Type values with embedded timestamps: still stack on category phrase
- Clean typed High Grass continues to stack on normalized type key (no regression)
- `isSingleton` remains pure `count === 1` after stable keys

**Stack**
- Primary file: `lib/bridge-review-groups.js` (+ pure helpers if needed)
- TDD: unit tests for grouping; engine contract if needed

### Claude's Discretion

- Timestamp strip regex (US dates, ISO, times)
- Whether to also normalize whitespace/punctuation on free-text keys

### Deferred Ideas (OUT OF SCOPE)

- Regression e2e lock suite → Phase 50
- MAP/SHAPE already phase 48

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GROUP-01 | Empty type: free-text descriptions keyed after stripping incidental dates/times → rows differing only by timestamp stack | `descriptionKey = stableGroupTextKey(descriptionNotes)` when type stabilizes to `__unknown__` |
| GROUP-02 | Type values with embedded per-row timestamps still stack on shared category phrase | Apply same strip **before** `violationTypeKey` on `violationIssueType` for mapKey / group.violationTypeKey |
| GROUP-03 | Clean shared type (typed High Grass) still stacks on normalized type key | Strip is no-op on clean labels; existing case/spacing tests must stay green |
| GROUP-04 | Singleton only when stabilized group has `count === 1` | Keep `g.isSingleton = g.count === 1`; do not add description-based singleton flags |

---

## Where Keys Fragment (line-level)

### Anchor 1 — Exact description key when type empty

```45:53:lib/bridge-review-groups.js
    const typeLabel = String(row.violationIssueType || '').trim();
    const typeKey = violationTypeKey(row.violationIssueType);
    const descTrimmed = String(row.descriptionNotes || '').trim();
    const isUnknown = typeKey === '__unknown__';
    const descriptionKey = isUnknown ? descTrimmed : null;

    const mapKey = isUnknown
      ? `${section}|${typeKey}|${descriptionKey}`
      : `${section}|${typeKey}`;
```

Phase 43 locked exact `descriptionNotes` for empty type. Diagnosis e2e: 3 High Grass rows, type `''`, notes differ only by timestamp → **3 groups**, each `count=1`, `isSingleton=true`. **Confidence: HIGH.**

### Anchor 2 — `violationTypeKey` has no timestamp strip

```41:47:lib/bridge-brain-store.js
function violationTypeKey(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return key || '__unknown__';
}
```

Type cell `"High Grass and Weeds - 01/15/2024 10:30"` vs `"… 01/16/2024"` → distinct typeKeys → GROUP-02 failure even when type is non-empty (e.g. alias mapped free-text “violation description” into type). **Confidence: HIGH.**

### Anchor 3 — Singleton is already pure count

```123:124:lib/bridge-review-groups.js
  for (const g of map.values()) {
    g.isSingleton = g.count === 1;
```

Train UI (`public/js/bridge-train.js`) displays `group.isSingleton || count === 1`. **No UI change.** GROUP-04 is satisfied by fixing keys so multi-row stacks get `count > 1`. **Confidence: HIGH.**

### Anchor 4 — Label vs key (display can stay readable)

```81:92:lib/bridge-review-groups.js
    // Label: first non-empty type label, else description, else '(no type)'
    if (!g._labelSet) {
      if (typeLabel) {
        g.violationTypeLabel = typeLabel;
        ...
```

Keys must stabilize; labels may still show first-seen raw text. **Recommend** setting `violationTypeLabel` from the **stripped** phrase (not full timestamped string) so Train titles look like categories. Raw variants remain in `descriptionSamples` (up to 5). **Confidence: HIGH** for keys; **MEDIUM** for label preference (discretion / UX polish).

### Anchor 5 — Existing test that must stay vs tests that encode the bug

| Test (current) | Phase 49 fate |
|----------------|---------------|
| empty type + **two different** descriptions → 2 singletons | **KEEP** — fence vs pool are real different categories |
| 20 rows same clean type → 1 group | **KEEP** — GROUP-03 |
| case/spacing stacks via violationTypeKey | **KEEP** |
| isSingleton iff count === 1 | **KEEP** |
| **NEW** empty type + same phrase different timestamps → 1 group count N | **ADD** — GROUP-01 / TEST-01 precursor |
| **NEW** typed values with embedded timestamps → 1 group | **ADD** — GROUP-02 |
| **NEW** after stack, isSingleton false when count > 1 | **ADD** — GROUP-04 integration |

**Confidence: HIGH.**

---

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| `lib/bridge-review-groups.js` | existing | `buildReviewGroups`, `groupIdFor`, `assignRowIds` | Primary locked file; all key changes land here |
| Pure strip helper | **add in review-groups or `lib/bridge-stable-text.js`** | `stripIncidentalTimestamps`, `stableGroupTextKey` | Unit-testable; matches v1.6 pure-module pattern |
| `violationTypeKey` from `lib/bridge-brain-store.js` | existing | lower + collapse whitespace; empty → `__unknown__` | Reuse **after** strip; do not reimplement case/space rules |
| `node:test` + `node:assert/strict` | Node 20+ | TDD unit matrix | Project standard (`npm test`) |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `tests/bridge-review-groups.test.js` | GROUP-01–04 unit contracts | Primary verification |
| `tests/bridge-engine.test.js` | Optional processUpload smoke: description-only High Grass timestamps → 1 distressed group | Nice-to-have; full lock is Phase 50 |
| `lib/bridge-brain-apply.js` | Type rule matching via raw `violationTypeKey` | **Out of scope** unless planner expands; see Open Questions |
| `public/js/bridge-train.js` | Displays isSingleton / labels | Read-only; no CSS/logic change |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Strip only in `buildReviewGroups` | Change global `violationTypeKey` to strip timestamps | Global change helps brain apply match timestamped types, but risks rule-key drift and is broader than CONTEXT primary file |
| Fuzzy / embedding cluster | Soft similarity groups | Out of milestone; uncontrollable; deferred Future Requirements |
| Hash-only description keys without strip | `sha1(notes)` | Still unique per timestamp; does not stack |
| Strip only digits | Nuke all numbers | Destroys ordinance codes / parcel fragments; too aggressive |
| Leave label timestamped, strip keys only | Cleaner keys, uglier Train titles | Acceptable minimum; prefer cleaned label |

**Installation:** none — no new npm packages.

```bash
node --test tests/bridge-review-groups.test.js
npm test
```

---

## Architecture Patterns

### Recommended project structure

```
lib/
├── bridge-review-groups.js     # MODIFY — stable keys + optional cleaned labels
├── bridge-stable-text.js       # CREATE (preferred) — pure strip + stableGroupTextKey
└── bridge-brain-store.js       # REUSE violationTypeKey only — do not change unless Open Q resolved

tests/
└── bridge-review-groups.test.js  # EXTEND — timestamp stack matrix; keep different-desc split
```

**Discretion resolution (recommended):** Prefer **`lib/bridge-stable-text.js`** pure module so strip regex is unit-tested in isolation, then import from `bridge-review-groups.js`. If planner wants zero new files, colocate helpers at top of `bridge-review-groups.js` and export for tests.

### Pattern 1: Stable key pipeline (all paths)

```
raw type / description
  → stripIncidentalTimestamps(text)
  → collapse leftover separators / whitespace
  → violationTypeKey(...)          # lower + spaces; empty → '__unknown__'
  → mapKey / group.violationTypeKey / descriptionKey
```

**Typed path (GROUP-02 + GROUP-03):**

```javascript
const typeLabelRaw = String(row.violationIssueType || '').trim();
const typeKey = stableGroupTextKey(typeLabelRaw); // wraps strip + violationTypeKey
const isUnknown = typeKey === '__unknown__';
```

**Empty-type path (GROUP-01):**

```javascript
const descTrimmed = String(row.descriptionNotes || '').trim();
const descriptionKey = isUnknown ? stableGroupTextKey(descTrimmed) : null;
// Note: if strip leaves empty, stableGroupTextKey → '__unknown__' or ''?
// Prefer: after strip, if empty string → descriptionKey '' (still stacks empty-desc rows together)
// Do NOT use '__unknown__' as descriptionKey (confuses with type key).
```

**Prescribed empty-after-strip behavior:**  
`stableGroupTextKey` for **type** returns `__unknown__` when empty (via `violationTypeKey`).  
For **descriptionKey only**, use a sibling that returns `''` when stripped empty (or `stableGroupTextKey` then map `__unknown__` → `''` for description sub-keys). Prevents mapKey `section|__unknown__|__unknown__` ambiguity with typed unknown.

Recommended:

```javascript
function stableDescriptionKey(text) {
  const stripped = stripIncidentalTimestamps(String(text || ''));
  const key = String(stripped || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return key; // may be ''
}
```

### Pattern 2: Timestamp strip (discretion — prescribe defaults)

Strip **whole** incidental date/time tokens; then cleanup.

| Pattern class | Examples to strip | Notes |
|---------------|-------------------|-------|
| US date | `1/5/2024`, `01/15/24`, `01-15-2024` | `\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b` |
| ISO date | `2024-01-15` | `\b\d{4}-\d{2}-\d{2}\b` |
| ISO datetime | `2024-01-15T10:30:00`, with optional `Z` / offset | After ISO date, optional `T` time |
| Time 24h | `10:30`, `10:30:00` | `\b\d{1,2}:\d{2}(:\d{2})?\b` — run **after** dates so date parts win first |
| Time 12h | `10:30 AM`, `10:30:00 pm` | Optional `\s*[AaPp][Mm]\b` after time |
| Compact US datetime | `01/15/2024 10:30` | Covered by date + time sequential strip |

**Post-strip cleanup (recommend YES — discretion):**

1. Collapse whitespace to single spaces  
2. Strip leftover dangling separators: trailing/leading `-`, `|`, `/`, `,`, `:` and runs of `- -`  
3. Collapse multiple spaces again  
4. Trim  

**Do not strip (safety):**

| Token | Why |
|-------|-----|
| Bare years alone mid-phrase without date structure | Risk over-strip; optional later |
| Ordinance-like `12-34` without year length | Date regex requires 2–4 digit year segment |
| Address house numbers | No date shape |
| “High Grass” with no date | No-op → GROUP-03 |

### Pattern 3: mapKey / groupId consistency

```javascript
const mapKey = isUnknown
  ? `${section}|${typeKey}|${descriptionKey}`
  : `${section}|${typeKey}`;

groupIdFor(section, typeKey, descriptionKey)
// already includes descriptionKey when typeKey === '__unknown__' OR descriptionKey != null
```

After stable keys, identical phrases → identical `descriptionKey` → same `groupId`. **Do not change** hash algorithm. **Confidence: HIGH.**

### Pattern 4: Label policy

| Source | Label recommendation |
|--------|----------------------|
| Non-empty type | Prefer `stripIncidentalTimestamps(typeLabelRaw)` cleaned (or first raw if strip empty) |
| Empty type, has notes | Prefer cleaned description phrase for `violationTypeLabel` |
| Neither | `'(no type)'` unchanged |

`descriptionSamples` should still store **raw** distinct descriptions (timestamps visible in expand) so trainers see variance. Max 5 unchanged.

### Pattern 5: `isSingleton` (GROUP-04)

```javascript
g.isSingleton = g.count === 1;
```

- **Do not** set singleton from “description path” or free-text heuristics.  
- **Do not** force multi-row free-text groups to singleton for phrase mining.  
- Phrase miner uses decision events + samples, not `isSingleton` (debug eliminated that hypothesis).

### Anti-patterns to avoid

- **Re-locking Phase 43 exact description** — tests that require timestamped High Grass to be N singletons are bugs relative to v1.7.  
- **Changing `isSingleton` formula** — e.g. `count === 1 \|\| isUnknown` would re-badge stacked free-text as singleton.  
- **Stripping inside Train UI only** — server groups would still fragment.  
- **Mutating row.violationIssueType in grouping** — grouping must not rewrite process rows; only group keys/labels.  
- **Aggressive NLP / stopword stripping of category words** — out of scope; only incidental dates/times.  
- **Scope into MAP/SHAPE** — Phase 48 owns category promotion and indicator arrays.  
- **Full e2e regression suite** — Phase 50 (optional one engine smoke is fine).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case/space normalize | Custom lower/trim again ad hoc | `violationTypeKey` after strip | Same keys as brain type rules for clean types |
| Soft clustering | Embeddings / Levenshtein groups | Exact stable key after strip | Controllable; milestone forbids ML |
| UI singleton badge rewrite | Client-side merge of cards | Server stable keys | UI already faithful |
| Date parsing library (moment/dayjs/chrono) | New npm dep | Small pure regex strip | Zero bridge util deps; municipal formats are narrow |
| Rewrite `groupIdFor` scheme | New UUID groups | Existing sha1 digest | Decisions/tests depend on deterministic ids |

**Key insight:** Rows already share a real-world category phrase; timestamps are noise in the **key**, not the product entity. Strip noise, keep exact phrase match — do not invent fuzzy categories.

---

## Common Pitfalls

### Pitfall 1: Over-stripping non-dates

**What goes wrong:** Ordinance codes, “Section 12-34”, or times embedded in legitimate labels collapse incorrectly.  
**Why:** Over-broad `\d+` or short numeric patterns.  
**How to avoid:** Only structured date/time regexes above; unit matrix with `"Code 12-3457"` / `"High Grass"` unchanged.  
**Warning signs:** Clean types split or merge incorrectly in GROUP-03 tests.

### Pitfall 2: Under-stripping common city formats

**What goes wrong:** `01/15/2024 10:30:00 AM` or ISO forms still unique.  
**Why:** Regex misses 12h AM/PM or `T` separator.  
**How to avoid:** Fixture matrix from diagnosis strings + ISO + US + time-only suffixes.  
**Warning signs:** Still N singletons for “same category different ts”.

### Pitfall 3: Leaving dangling separators in keys

**What goes wrong:** `"high grass and weeds -"` vs `"high grass and weeds -"` with double spaces still fragment, or two variants `"high grass -"` vs `"high grass"`.  
**Why:** Strip removes date but leaves `" - "` / `" | "`.  
**How to avoid:** Mandatory post-strip separator/whitespace cleanup.  
**Warning signs:** Two groups with nearly identical labels.

### Pitfall 4: Breaking “different free-text = different groups”

**What goes wrong:** Fence permit and pool permit stack together.  
**Why:** Over-normalization or emptying all descriptions.  
**How to avoid:** Keep existing test: empty type + two **different** descriptions → 2 groups.  
**Warning signs:** Red test or FN section one mega-group.

### Pitfall 5: Changing global `violationTypeKey` without tests

**What goes wrong:** Brain type rules, apply matching, decision keys shift; hundreds of tests assert exact keys.  
**Why:** Tempting one-function fix for GROUP-02 + apply.  
**How to avoid:** Default scope = grouping helpers only; if expanding to `violationTypeKey`, run full `npm test` and treat as explicit plan task.  
**Warning signs:** `bridge-brain-*.test.js` failures.

### Pitfall 6: Brain apply still misses timestamped types (known gap)

**What goes wrong:** After stacking, admin denies group with stable key `high grass and weeds`, but apply uses raw `violationTypeKey(row.violationIssueType)` including timestamps → rule does not hit rows.  
**Why:** Apply path not in Phase 49 locked stack.  
**How to avoid:** Document gap; optional small follow-up: use `stableGroupTextKey` in `typeRuleMatches`. Prefer **not** blocking GROUP-01–04.  
**Warning signs:** Train groups look fixed; re-process still doesn’t suppress timestamped types.

### Pitfall 7: Mutating process rows or export shape

**What goes wrong:** Grouping rewrites `descriptionNotes` / type on rows → export/brain side effects.  
**Why:** “Clean the data at source” urge.  
**How to avoid:** Pure key derivation only; rows stay as process produced them (Phase 48 owns type promotion).  
**Warning signs:** Export or tagger tests change unexpectedly.

### Pitfall 8: Label still full timestamp (UX only)

**What goes wrong:** One stacked group titled with first row’s timestamped notes.  
**Why:** Keys fixed, label still first raw.  
**How to avoid:** Set label from stripped phrase; samples keep raw.  
**Warning signs:** User still thinks groups are “timestamp categories”.

---

## Code Examples

### Target keying loop (sketch)

```javascript
// lib/bridge-review-groups.js — buildReviewGroups (target behavior)
// Source: phase research; replaces exact-description Phase 43 rule

const { stripIncidentalTimestamps, stableTypeKey, stableDescriptionKey } =
  require('./bridge-stable-text'); // or local helpers

function buildReviewGroups(rows, section) {
  const map = new Map();

  for (const row of rows || []) {
    const typeLabelRaw = String(row.violationIssueType || '').trim();
    const typeKey = stableTypeKey(typeLabelRaw); // strip → violationTypeKey
    const descTrimmed = String(row.descriptionNotes || '').trim();
    const isUnknown = typeKey === '__unknown__';
    const descriptionKey = isUnknown ? stableDescriptionKey(descTrimmed) : null;

    const mapKey = isUnknown
      ? `${section}|${typeKey}|${descriptionKey}`
      : `${section}|${typeKey}`;

    // label: cleaned type, else cleaned desc, else '(no type)'
    const typeLabelClean = stripIncidentalTimestamps(typeLabelRaw).replace(/\s+/g, ' ').trim();
    const descLabelClean = stripIncidentalTimestamps(descTrimmed).replace(/\s+/g, ' ').trim();
    // ... same group accumulation; isSingleton = count === 1 at end
  }
}
```

### Strip helper sketch (discretion defaults)

```javascript
// lib/bridge-stable-text.js
// Source: research prescription for US municipal exports

const DATE_US_RE = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
const DATE_ISO_RE = /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\b/g;

function stripIncidentalTimestamps(text) {
  let s = String(text || '');
  s = s.replace(DATE_ISO_RE, ' ');
  s = s.replace(DATE_US_RE, ' ');
  s = s.replace(TIME_RE, ' ');
  // dangling separators
  s = s.replace(/[\s]*[-–—|,;:/]+[\s]*/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
```

**Caution:** Separator cleanup must not delete internal hyphens in words (rare). Prefer replacing separator **runs surrounded by spaces** first, then trim ends:

```javascript
s = s.replace(/\s+[-–—|,;:/]+\s+/g, ' ');
s = s.replace(/^[-–—|,;:/]+\s*/, '').replace(/\s*[-–—|,;:/]+$/, '');
s = s.replace(/\s+/g, ' ').trim();
```

### Existing tests to keep (different free-text)

```136:151:tests/bridge-review-groups.test.js
test('buildReviewGroups: empty type + two different descriptions → 2 singleton groups', () => {
  // fence permit only vs pool permit expired — MUST remain 2 groups
  ...
});
```

### New tests (required for phase)

```javascript
// GROUP-01
test('empty type + same phrase different timestamps → 1 group count N', () => {
  const rows = assignRowIds([
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/15/2024 10:30',
      matchedIndicators: ['weeds']
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/16/2024 11:00',
      streetAddress: '456 Oak'
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/17/2024 09:15',
      streetAddress: '789 Pine'
    })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].isSingleton, false);
  assert.equal(groups[0].violationTypeKey, '__unknown__');
});

// GROUP-02
test('typed values with embedded timestamps stack', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'High Grass and Weeds - 01/15/2024 10:30' }),
    row({ violationIssueType: 'High Grass and Weeds - 01/16/2024 11:00' })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].isSingleton, false);
});

// GROUP-03 regression already covered by case/spacing + 20-row tests
```

---

## Recommended Plan Split (1–2 plans)

| Plan | Focus | Deliverables | Req |
|------|--------|--------------|-----|
| **49-01 Stable keys** (preferred single plan) | Pure strip/stable helpers + wire `buildReviewGroups` + unit matrix + keep different-desc split | `bridge-stable-text.js` (or colocated), review-groups keying, tests | GROUP-01–04 |
| **Optional 49-02** | Engine smoke only if not folded into 49-01 | `processUpload` description-only timestamp CSV → 1 distressed group | GROUP-01 precursor for Phase 50 |

**Recommendation: 1 plan** — single module domain, clear TDD waves inside one PLAN:

1. **Wave 0:** failing tests for timestamp stack + strip unit matrix  
2. **Wave 1:** pure `stripIncidentalTimestamps` / stable key helpers green  
3. **Wave 2:** wire `buildReviewGroups`; labels cleaned; `isSingleton` unchanged; full `npm test`

**2 plans only if** planner wants helper isolation reviewed separately from wiring.

**Out of both plans:** Train CSS, phrase miner, MAP/SHAPE, full TEST-01–03 suite lock (Phase 50), global brain-apply key change unless explicitly added.

---

## State of the Art (this codebase)

| Old Approach (v1.6 Phase 43) | Current Target (v1.7 Phase 49) | Impact |
|------------------------------|--------------------------------|--------|
| Empty type → **exact** descriptionNotes | Empty type → description after **timestamp strip** + case/space normalize | High Grass free-text stacks |
| Non-empty type → `violationTypeKey` only | Type → strip timestamps then `violationTypeKey` | Timestamped type cells stack |
| `isSingleton = count === 1` | Unchanged formula; counts become real | Singleton badge stops lying |
| Phase 48 promotes real category columns | Still depends on 48 for unmapped category → typed path | Free-text path still needs 49 |

**Deprecated/outdated:**
- Phase 43 locked decision “Empty type → group by exact description” — **superseded for keys** by GROUP-01 (CONTEXT + REQUIREMENTS).  
- Design spec §8 “often singleton” for empty type — still true for **truly unique** free-text; not for timestamp variants.

---

## Open Questions

1. **Should `violationTypeKey` / brain-apply also strip timestamps?**  
   - What we know: GROUP-02 is grouping-only; apply uses raw type keys.  
   - What's unclear: whether production type cells commonly include timestamps (alias “violation description” suggests yes).  
   - Recommendation: **Phase 49 default = grouping only.** Add optional task “stable keys in typeRuleMatches” only if time allows; otherwise note for post-50 polish.

2. **How aggressive on month-name dates (`Jan 15, 2024`)?**  
   - What we know: diagnosis cases use numeric US dates.  
   - Recommendation: **v1 numeric US + ISO + times only.** Month names = follow-up if fixtures appear.

3. **descriptionKey case sensitivity**  
   - Phase 43 used exact case.  
   - Recommendation: **lower + collapse** on free-text keys so `"High Grass"` / `"high grass"` stack (align with type keys).

4. **Phase 48 dependency**  
   - Unmapped category → type promoted → typed stacking path (GROUP-03) works without free-text.  
   - Description-only files still need GROUP-01 regardless of 48.  
   - Planner should assume 48 MAP may or may not be merged; GROUP unit tests use synthetic rows either way.

---

## Validation Architecture

> `workflow.nyquist_validation` is enabled (`.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-review-groups.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GROUP-01 | Empty type; notes differ only by timestamp → 1 group count N | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 add |
| GROUP-02 | Type cells with embedded timestamps → 1 group | unit | `node --test tests/bridge-review-groups.test.js` | ❌ Wave 0 add |
| GROUP-03 | Clean typed High Grass still stacks; case/space | unit | existing tests + keep green | ✅ extend if needed |
| GROUP-04 | isSingleton true only when count === 1 after stable stack | unit | existing + GROUP-01 assert `isSingleton === false` | ⚠️ extend |
| (helper) | strip matrix: US/ISO/time; leave clean text; leave different phrases distinct | unit | same file or `tests/bridge-stable-text.test.js` | ❌ Wave 0 |
| (safety) | empty type + fence vs pool still 2 groups | unit | existing test | ✅ keep |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-review-groups.test.js`  
- **Per wave merge:** `npm test`  
- **Phase gate:** `npm test` green (verify-live not required unless `public/` or `server.js` touched — not expected)

### Wave 0 Gaps

- [ ] Failing tests: timestamped free-text High Grass → single group  
- [ ] Failing tests: timestamped type values → single group  
- [ ] Strip unit matrix (US, ISO, AM/PM, cleanup separators)  
- [ ] Assert different free-text still splits (existing — must remain green)  
- [ ] Optional: `tests/bridge-stable-text.test.js` if helper is a separate module  
- [ ] Optional engine smoke (Phase 50 owns full TEST-01)

*(No new test framework install.)*

---

## Code Anchors (planner quick ref)

| File | Lines / symbol | Role in Phase 49 |
|------|----------------|------------------|
| `lib/bridge-review-groups.js` | `buildReviewGroups` L41–142 | **Primary edit** — stable typeKey + descriptionKey |
| `lib/bridge-review-groups.js` | `groupIdFor` L14–25 | No algorithm change; consumes stable keys |
| `lib/bridge-review-groups.js` | `isSingleton` L124 | **Do not change formula** |
| `lib/bridge-brain-store.js` | `violationTypeKey` L41–47 | Reuse after strip; avoid editing by default |
| `lib/bridge-brain-apply.js` | `typeRuleMatches` L22–26 | Out of scope gap (timestamped apply) |
| `lib/bridge-engine/index.js` | `buildReviewGroups(kept/FN)` | No change if pure groups fixed |
| `tests/bridge-review-groups.test.js` | L136–151 exact empty-type split | Keep; add timestamp stack tests |
| `.planning/debug/filter-singleton-no-category.md` | Resolution block | Diagnosis contract for success |
| Phase 48 | MAP/SHAPE | Upstream type fill + array indicators; not this phase |

---

## Sources

### Primary (HIGH confidence)

- `.planning/debug/filter-singleton-no-category.md` — confirmed root cause (exact description + no type timestamp strip)  
- `lib/bridge-review-groups.js` — keying L45–53; isSingleton L124; labels L81–92  
- `lib/bridge-brain-store.js` — `violationTypeKey` L41–47  
- `tests/bridge-review-groups.test.js` — Phase 43 contracts including empty-type exact split  
- `.planning/REQUIREMENTS.md` — GROUP-01–04  
- `.planning/phases/49-stable-group-keys/49-CONTEXT.md` — locked decisions  
- `.planning/phases/43-review-payload-grouping/43-CONTEXT.md` — original “exact description” lock (superseded for keys)

### Secondary (MEDIUM confidence)

- Design spec `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` §4.2–4.3, §8 empty-type edge case  
- `lib/bridge-brain-apply.js` type matching without strip — behavioral gap for post-decision apply  
- Label-cleaning UX preference (not strictly required by GROUP-*)

### Tertiary (LOW confidence)

- Month-name date formats in city exports — not seen in diagnosis fixtures  
- Exact separator cleanup aggressiveness — tune if unit matrix finds false merges

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new deps; single primary module; anchors line-verified  
- Architecture: **HIGH** — clear key pipeline; Phase 43→49 supersession documented  
- Pitfalls: **HIGH** — over/under strip, different-desc regression, brain-apply gap, isSingleton formula all evidenced  

**Research date:** 2026-07-10  
**Valid until:** 2026-08-09 (stable domain; re-check if `buildReviewGroups` or `violationTypeKey` refactored)
