# Phase 46: Phrase mining + brain panel - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Bridge phrase candidate mining + admin brain rule panel (HITL proposed→active)  
**Confidence:** HIGH

## Summary

Phase 46 adds the **depth learning layer** for the Filter Superpower Brain: after admin decisions (phase 45), a pure miner extracts free-text phrase candidates into **`phraseRules` with `status: proposed` only**. Proposed rules must **never** affect `processUpload`. An admin **Filter brain panel** lists type rules + proposed/active phrases and can activate / reject / disable them via API. Once `status: active`, phase 42’s `applyBrainToRow` already applies phrase promote/suppress against `buildSearchText(row)`.

This phase does **not** implement undo, caps, version 409, or full metrics polish (phase 47). It does **not** share Analyzer `learned-brain.js` storage — only the pattern of capped arrays and pure helpers.

**Primary recommendation:** Create pure `lib/bridge-phrase-miner.js` (literal-escaped candidates, ≥2 same-direction evidence → propose); hook after decision save; admin-only `GET /api/bridge/brain` + `POST /api/bridge/brain/rules/:id/status`; brain panel UI on `/bridge` with three rule lists (type / proposed phrase / active phrase).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Never auto-activate mined phrases
- ≥2 same-direction evidence before propose (planner may refine threshold)
- Escape literals; no untrusted regex ReDoS
- Panel: type rules + proposed phrases + active phrases

### Claude's Discretion
- Exact stopword list, n-gram window (1–3 tokens recommended), and candidate length bounds beyond ≥4
- Whether miner runs synchronously inside decision save vs post-save pure recompute from events
- Panel chrome (drawer vs inline section) as long as it matches existing bridge design system
- Rule id prefix scheme (`pr_…` / `tr_…`) if not already set by phase 45/42

### Deferred Ideas (OUT OF SCOPE)
- Full undo stack (phase 47)
- Public metrics dashboard for non-admin
- Auto-live mined phrases
- Analyzer vision learned-brain store / APIs
- Per-city or per-user phrase brains
- Untrusted free-form regex entry from UI (literals only unless admin-curated later)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHRASE-01 | System mines phrase candidates from free-text / singleton decisions into proposed rules only | `minePhrasesFromEvent` / `extractCandidates`; status always `proposed` on create; evidence from decision events (descriptions + issue type); threshold ≥2 same-direction |
| PHRASE-02 | Proposed phrase rules never affect process until admin activates them | Phase 42 apply already filters `status === 'active'`; miner never writes `active`; tests assert proposed no-op on `applyBrainToRow` |
| PHRASE-03 | Admin can view, activate, reject, or disable type and phrase rules in a Filter brain panel | `GET /api/bridge/brain` + `POST .../rules/:id/status`; panel sections for type / proposed phrase / active phrase; admin-only 403 |
</phase_requirements>

## Standard Stack

### Core

| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| `lib/bridge-phrase-miner.js` | **create** | Extract candidates + propose rules from events | Pure domain; unit-testable without HTTP |
| `lib/bridge-brain-decisions.js` | phase 45 | Call miner after event append / before save | Single write path for training |
| `lib/bridge-brain-store.js` | phase 42 | Persist `phraseRules` + `typeRules` | Atomic JSON already established |
| `lib/bridge-brain-apply.js` | phase 42 | Apply only `active` phrase rules | Consumer for activate path |
| `lib/bridge-api.js` | existing | `GET /brain`, `POST /brain/rules/:id/status` | Same router as process/lists |
| `public/js/bridge.js` + `public/bridge.html` | existing | Brain panel UI | Filter surface only (D1) |
| `node:test` + `node:assert/strict` | built-in | Miner + API + apply integration | Project standard (`npm test`) |
| Node `crypto` | built-in | Phrase rule ids (`pr_` + hex) | Same as list ids in `bridge-list-store` |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/bridge-distress-tagger.js` `buildSearchText` | Apply-side match surface | Integration test activate → apply |
| `public/js/phuglee-session-headers.js` | `X-Phuglee-User` on brain fetches | All admin panel API calls |
| `lib/phuglee-user.js` / `requireAdmin` (phase 45) | 403 `ADMIN_REQUIRED` | All brain read (panel) + rule status writes |
| Analyzer `learned-brain.js` | **Pattern only** (capArray, pure helpers) | Do **not** import or share store |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Literal substring match | Full untrusted regex | ReDoS risk; CONTEXT forbids |
| Auto-activate after N hits | Proposed-only | Product law D6 / PHRASE-02 |
| Shared Analyzer brain file | Filter-native JSON | Forbidden domain coupling |
| NLP / TF-IDF / external ML | Simple token/phrase counts | Overkill; HITL hybrid is intentional |
| Server-side session for panel | Stateless GET brain | Consistent with phase 45 stateless decisions |

**Installation:** none — no new npm packages.

```bash
npm test
node --test tests/bridge-phrase-miner.test.js
node --test tests/bridge-brain-api.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-phrase-miner.js       # CREATE — extractCandidates, minePhrasesFromEvent, maybe recomputeFromEvents
├── bridge-brain-decisions.js    # MODIFY — invoke miner after event
├── bridge-brain-store.js        # MODIFY if needed — upsertPhraseRule helpers
├── bridge-brain-apply.js        # VERIFY — only status===active phrases
├── bridge-api.js                # MODIFY — GET brain, POST rules/:id/status
public/
├── bridge.html                  # MODIFY — brain panel markup
├── js/bridge.js                 # MODIFY — load/render/actions
└── css/…                        # MODIFY — panel styles matching bridge system
tests/
├── bridge-phrase-miner.test.js  # CREATE
└── bridge-brain-api.test.js     # EXTEND — status transitions + non-admin 403
```

### Pattern 1: Mine after decision, never auto-activate

**What:** After phase 45 writes an audit event, run miner; append or reinforce `phraseRules` with `status: 'proposed'` only.  
**When to use:** Every decision that carries description/type samples (especially singletons / free-text).  
**Example:**

```js
// Source: design spec §7 + phase-46 plan interfaces
function minePhrasesFromEvent(event, brain) {
  const direction = resolveDirection(event); // 'promote' | 'suppress' | null
  if (!direction) return brain;

  const texts = [
    ...(event.descriptionSamples || []),
    event.violationTypeLabel || ''
  ].filter(Boolean);

  const candidates = texts.flatMap(extractCandidates);
  // tally evidence against brain.events (or event-local multi-samples)
  // if candidate has ≥2 same-direction evidence and no opposite conflict → upsert proposed
  return brainWithProposedOnly(brain, candidates, direction, event.id);
}
```

### Pattern 2: Evidence threshold + direction map

**What:** Direction from section/action (design + phase plan).  
**When to use:** Mapping decisions to `promote_phrase` vs `suppress_phrase`.

| Section | Action | Phrase direction |
|---------|--------|------------------|
| `not_distressed` | `approve` | promote (false negative → learn phrase) |
| `distressed` | `deny` | suppress (false positive → learn phrase) |
| `distressed` | `approve` | optional weak promote / affirmation only — prefer type rules; miner may skip or require weak signals |
| `not_distressed` | `deny` | affirmation of correct exclude — **do not** spam suppress phrases |

**Threshold:** ≥2 same-direction evidence for the same normalized candidate before creating a proposed rule. Single one-off never proposes.

### Pattern 3: Safe literal patterns (anti-ReDoS)

**What:** Store `patternType: 'literal'` and escape when compiling for apply.  
**When to use:** All mined rules in v1.

```js
// Source: common JS escape; design spec §8 ReDoS row
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchLiteral(searchText, pattern) {
  // Prefer includes for literals (no regex engine)
  return String(searchText).toLowerCase().includes(String(pattern).toLowerCase());
}

// If apply path uses RegExp:
// new RegExp(escapeRegExp(pattern), 'i')  — never new RegExp(userRaw)
```

**Reject** `patternType: 'regex'` from miner. If phase 42 allowlists regex, gate with max length + try/catch and never throw process-wide.

### Pattern 4: extractCandidates

**What:** Tokenize free text into length-bounded phrases.  
**Recommended defaults (discretion):**

- Lowercase, strip punctuation except internal hyphens
- Tokens length ≥ 4; drop pure numbers
- Small English stopword set: `the, and, for, with, from, that, this, were, been, have, into, over, under, upon, near, property, address, street, code, violation` (tune in implementation)
- Unigrams + bigrams (+ optional trigrams) joined with single spaces
- Cap candidates per event (e.g. 20) to bound CPU

```js
function extractCandidates(text) {
  const raw = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const tokens = raw.split(/\s+/).filter((t) => t.length >= 4 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
  const out = new Set();
  for (let i = 0; i < tokens.length; i++) {
    out.add(tokens[i]);
    if (i + 1 < tokens.length) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return [...out];
}
```

### Pattern 5: Rule status machine

| Status | Process apply? | Panel actions |
|--------|----------------|---------------|
| `proposed` | No | Activate → `active`; Reject → `rejected` |
| `active` | Yes | Disable → `disabled` |
| `rejected` | No | (optional re-propose later — out of scope) |
| `disabled` | No | Activate again if needed |

```http
POST /api/bridge/brain/rules/:id/status
Headers: x-phuglee-user: admin
Body: { "status": "active" | "rejected" | "disabled" }
→ 200 { ok, rule, brainSummary }
```

Also:

```http
GET /api/bridge/brain
Headers: x-phuglee-user: admin
→ 200 { version, typeRules, phraseRules, metrics, events?: tail }
```

Non-admin → **403** `{ code: 'ADMIN_REQUIRED' }` (same as DEC-06).

### Pattern 6: Brain panel UX

**What:** Admin-only entry “Filter brain” on results/train toolbar.  
**Sections (locked):**

1. **Active type rules** — suppress/promote + Disable  
2. **Proposed phrase rules** — Approve (activate) / Reject  
3. **Active phrase rules** — Disable  
4. Light counts (full metrics polish in 47)

**Empty states** for fresh installs. After activate, optional note: “Applies on next file process.” Match existing bridge cards/toolbar — no new visual language (design §6).

### Anti-Patterns to Avoid

- **Miner sets `status: 'active'`:** Violates PHRASE-02 and CONTEXT.  
- **Applying proposed in phase 42 apply:** Must filter `status === 'active'`.  
- **`new RegExp(cityDescription)`:** ReDoS / hang process.  
- **Importing Analyzer learned-brain:** Domain contamination.  
- **Non-admin GET brain for “read-only dashboard”:** Deferred; panel is admin-only.  
- **Mining from water shut-off:** Skip — water is pass-through; phrase N/A.  
- **Proposing suppress from not_distressed+deny:** Correct exclusions should not poison phrase suppress list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NLP pipeline / embeddings | Custom ML stack | Token/bigram counts + ≥2 evidence | Spec is HITL hybrid, not ML |
| Untrusted regex engine | User-editable regex UI | Literal `includes` + escape if RegExp | ReDoS (audit risk MEDIUM) |
| Second apply path for phrases | Duplicate tagger logic | Phase 42 `applyBrainToRow` | Single consumer |
| Shared Analyzer store | `learned-brain.js` file | Filter `global-brain.json` | Product constraint |
| Complex optimistic UI without API | Local-only rule lists | GET brain after each action | Source of truth is server file |
| Per-tenant phrase stores | Scope like filter lists | Global brain only | D3 global quality |

**Key insight:** Phrase mining is deliberately **weak and gated**. Value comes from admin activation, not from clever extraction. Prefer boring literals + evidence counts over smart NLP.

## Common Pitfalls

### Pitfall 1: Auto-activating on mine
**What goes wrong:** One bad singleton poisons all future city files.  
**Why it happens:** Convenience “make it work immediately.”  
**How to avoid:** Miner hardcodes `status: 'proposed'`; unit test forbids active.  
**Warning signs:** Integration test keeps/suppresses before any status API call.

### Pitfall 2: Single-evidence spam
**What goes wrong:** Hundreds of one-off proposed rules.  
**Why it happens:** Threshold = 1.  
**How to avoid:** ≥2 same-direction; dedupe pattern+kind.  
**Warning signs:** Panel unusable after one train session.

### Pitfall 3: ReDoS / process hang
**What goes wrong:** Process stalls on apply.  
**Why it happens:** Compiling city text as regex.  
**How to avoid:** Literals only from miner; apply uses `includes` or escaped fixed pattern; try/catch around any RegExp.  
**Warning signs:** CPU peg on process with seeded adversarial rule.

### Pitfall 4: Proposed still applied
**What goes wrong:** PHRASE-02 fails.  
**Why it happens:** Apply checks kind but not status.  
**How to avoid:** `phraseRules.filter(r => r.status === 'active')` in apply; regression test.  
**Warning signs:** Seed proposed rule changes kept counts.

### Pitfall 5: Wrong direction mapping
**What goes wrong:** Approving FN creates suppress phrases.  
**Why it happens:** Invert section/action matrix.  
**How to avoid:** Table in Pattern 2; tests for “parking on lawn” dual deny → suppress_phrase.  
**Warning signs:** After activate, good distress phrases get suppressed.

### Pitfall 6: Panel without server gate
**What goes wrong:** Hidden UI but open API.  
**Why it happens:** Client-only `isAdmin`.  
**How to avoid:** `requireAdmin` on GET brain + status POST; 403 tests.  
**Warning signs:** curl as non-admin returns 200 brain dump.

### Pitfall 7: Type rules missing from panel
**What goes wrong:** PHRASE-03 partial — phrases only.  
**Why it happens:** Misread as phrase-only UI.  
**How to avoid:** CONTEXT: type + proposed + active phrases.  
**Warning signs:** Cannot disable a bad suppress_type without editing JSON.

### Pitfall 8: Coupling to superseded plan docs
**What goes wrong:** Planner treats `docs/gsd/plans/2026-07-09-phase-46-*.md` as sole authority.  
**Why it happens:** Historical plans still exist.  
**How to avoid:** CONTEXT + REQUIREMENTS + this RESEARCH are planning authority; GSD plans are reference.  
**Warning signs:** Tasks diverge from locked ≥2 evidence / no auto-activate.

## Code Examples

### Phrase rule document shape

```js
// Source: design spec §4.1
{
  id: 'pr_' + crypto.randomBytes(4).toString('hex'),
  kind: 'promote_phrase' | 'suppress_phrase',
  pattern: 'parking on lawn',      // literal string
  patternType: 'literal',
  status: 'proposed',              // miner always starts here
  evidenceEventIds: ['ev_…', 'ev_…'],
  createdAt: new Date().toISOString(),
  reviewedAt: null,
  reviewedBy: null
}
```

### Hook after decision (sketch)

```js
// lib/bridge-brain-decisions.js — after append event + type rule upsert
let next = applyDecisionCore(input, brain);
next.brain = minePhrasesFromEvent(next.event, next.brain);
// recompute light metrics.phraseRulesProposed if desired (full metrics phase 47)
saveBrain(next.brain);
```

### Activate then apply integration test sketch

```js
// tests — Source: phase-46 plan Task 4
const brain = emptyBrain();
// seed two deny events with description “Parking on lawn”
const afterMine = minePhrasesFromEvent(ev2, minePhrasesFromEvent(ev1, brain));
const proposed = afterMine.phraseRules.find((r) => r.pattern === 'parking on lawn');
assert.equal(proposed.status, 'proposed');

const row = { violationIssueType: 'Parking', descriptionNotes: 'Parking on lawn', distressedSignalTag: 'Strong Distressed Signal' };
assert.equal(applyBrainToRow(row, afterMine, 'code_violation').distressedSignalTag, 'Strong Distressed Signal'); // no effect

proposed.status = 'active';
const applied = applyBrainToRow(row, afterMine, 'code_violation');
// expect standard / not strong when suppress_phrase active
assert.notEqual(applied.distressedSignalTag, 'Strong Distressed Signal');
```

### Admin status handler sketch

```js
// lib/bridge-api.js
// POST /api/bridge/brain/rules/:id/status
requireAdmin(req);
const brain = loadBrain();
const rule = findRule(brain, id); // typeRules or phraseRules
if (!rule) return sendJson(res, 404, { code: 'RULE_NOT_FOUND' });
const allowed = new Set(['active', 'rejected', 'disabled']);
if (!allowed.has(body.status)) return sendJson(res, 400, { code: 'INVALID_STATUS' });
rule.status = body.status;
rule.reviewedAt = new Date().toISOString();
rule.reviewedBy = username;
// optional: append audit event approve_phrase_rule / reject_phrase_rule / disable_rule
saveBrain(brain);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `INDICATOR_CATEGORIES` only | Base regex + type rules + gated phrases | M7 2026-07 | City jargon learnable without deploy |
| Redeploy to fix false tags | Admin activate phrase | M7 | Ops loop minutes not deploys |
| Auto-ML black box | HITL proposed→active | Product D6 | Controllable sellable “brain” |

**Deprecated/outdated:**
- Hand-editing tagger regex as the only training path (still base layer; brain layers on top)
- Sharing Analyze vision brain for Filter text (explicitly out of scope)

## Open Questions

1. **Should distressed+approve feed promote phrases?**  
   - What we know: Type rules already affirm; plan says “optional reinforce.”  
   - What's unclear: Whether weak-signal groups need phrase promote.  
   - Recommendation: Skip phrase mine on distressed+approve in v1; type rules suffice. Document in miner.

2. **Evidence across events vs within one multi-row group?**  
   - What we know: Spec says ≥2 times same direction.  
   - What's unclear: Two samples in one group vs two separate decisions.  
   - Recommendation: Count distinct evidence units — prefer distinct event ids; if one event has ≥2 description samples containing candidate, allow propose (singleton free-text often one event).

3. **GET brain includes full events?**  
   - What we know: Panel needs rules + counts.  
   - What's unclear: Payload size if events=2000.  
   - Recommendation: Return rules + metrics; events tail optional (last 20) or omit until 47.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — discovery via `npm test` glob |
| Quick run command | `node --test tests/bridge-phrase-miner.test.js` |
| Full suite command | `npm test` |
| Live smoke | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHRASE-01 | ≥2 same-direction free-text → proposed rule; single → none | unit | `node --test tests/bridge-phrase-miner.test.js` | ❌ Wave 0 |
| PHRASE-01 | Miner never emits `status: 'active'` | unit | same | ❌ Wave 0 |
| PHRASE-01 | Literals escaped / match via includes not raw regex | unit | same | ❌ Wave 0 |
| PHRASE-02 | Proposed rule does not change apply outcome | unit | `node --test tests/bridge-brain-apply.test.js` (extend) | ❌ Wave 0 (extend) |
| PHRASE-02 | After activate, apply promotes/suppresses on text match | integration | `node --test tests/bridge-phrase-miner.test.js` | ❌ Wave 0 |
| PHRASE-03 | Non-admin GET brain / status → 403 ADMIN_REQUIRED | unit/API | `node --test tests/bridge-brain-api.test.js` | ❌ Wave 0 |
| PHRASE-03 | Admin can set active/rejected/disabled | unit/API | same | ❌ Wave 0 |
| PHRASE-03 | Panel present for admin only (static/DOM smoke optional) | static/manual | bridge.html contains brain panel markers; client gate | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-phrase-miner.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + `scripts/verify-live.ps1` exit 0 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/bridge-phrase-miner.test.js` — covers PHRASE-01, PHRASE-02 mine/apply
- [ ] Extend `tests/bridge-brain-api.test.js` (or create) — GET brain, rule status, 403
- [ ] Extend apply tests for proposed-vs-active phrase
- [ ] Optional: static assert brain panel markup ids in `tests/shell-nav.test.js` or bridge HTML test
- [ ] Framework install: none — use existing `node:test`

## Sources

### Primary (HIGH confidence)

- `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md` — §4.1 phraseRules, §7 mining, §8 ReDoS, §9 API
- `.planning/REQUIREMENTS.md` — PHRASE-01–03
- `.planning/ROADMAP.md` — Phase 46 success criteria
- `.planning/phases/46-phrase-mining-brain-panel/46-CONTEXT.md` — locked decisions
- `.planning/codebase/TESTING.md` — node:test patterns, temp roots
- `.planning/codebase/CONCERNS.md` — no brain yet; ReDoS; separate Analyzer brain
- `docs/bridge/TAGGING-RULES.md` — base layer (phrases layer on top in 47 docs)
- `modules/property-analyzer/lib/learned-brain.js` — pattern only (capArray style), not store
- `lib/bridge-list-store.js` — atomic write + crypto ids pattern
- Phase 42 RESEARCH — apply only `active` phrases; pipeline order

### Secondary (MEDIUM confidence)

- `docs/gsd/plans/2026-07-09-phase-46-filter-phrase-brain-panel.md` — task breakdown / interfaces (reference, not GSD authority)
- `docs/gsd/plans/2026-07-09-m7-audit-filter-brain.md` — ReDoS risk, BRAIN-11/12

### Tertiary (LOW confidence)

- Exact stopword list and bigram window — not locked; discretion above

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; modules named in design + prior phase research
- Architecture: HIGH — design §7 + CONTEXT locked; apply consumer exists in phase 42 design
- Pitfalls: HIGH — ReDoS, auto-activate, admin gate documented in audit + concerns

**Research date:** 2026-07-09  
**Valid until:** 2026-08-08 (30 days; stable domain)

## RESEARCH COMPLETE
