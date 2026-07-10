# Phase 52: Format Memory + Confirm Gate - Research

**Researched:** 2026-07-09  
**Domain:** Filter/Data Bridge — per-city format fingerprint, admin Type-column confirm gate, process meta  
**Confidence:** HIGH (seams verified in code + Phase 51 shipped); MEDIUM (batch mixed-fingerprint UX polish)

## Summary

Phase 51 forced a single scorer-chosen Type column into `columnMap.violationIssueType`, but **every** process still auto-applies that pick with no city memory and no admin gate. Phase 52 adds durable **per-city (+ uploadType) format memory** and a **pre-normalize confirm gate**: first upload or fingerprint change pauses with ranked candidates; matching fingerprint reuses the last confirmed Type header with no modal. Confirm **persist** is admin-only; non-admins get a clear `TYPE_COLUMN_CONFIRM_REQUIRED` state (no hang). Multi-file batches fingerprint **per file** and never silently apply one file’s Type header to another. Process/review meta exposes Type resolution (`auto_reuse` | `admin_confirm` | `scorer` | `unresolved`).

**Phase 51 baseline (shipped, do not regress):**
- `lib/bridge-type-column-score.js` — `scoreTypeColumns` / `pickTypeColumn` / `resolveTypeColumnHeader` with ranked `{ header, score, reasons, samples, aliasTier }`
- `lib/bridge-engine/normalizer.js` — `forceTypeColumnFromScorer` always overwrites Type (including `null`)
- COL process tests green; promote empty-cell-only

**Primary recommendation:** New volume-safe `lib/bridge-city-format-store.js` + pure fingerprint helper; gate **after parse + score, before `normalizeRawRows`** in `processUpload`; HTTP **409** `TYPE_COLUMN_CONFIRM_REQUIRED`; resume by re-POST multipart with `confirmedTypeHeader` (+ fingerprint echo); inject confirmed/reused header into normalizer force path; UI modal in `public/js/bridge.js`; zero new npm packages.

---

## User Constraints

### Locked Decisions (from PROJECT.md / REQUIREMENTS / phase brief / v1.8)

- **Confirm first time per city format OR when sheet format differs** from last confirmed for that city (GATE-02)
- **Same format → reuse** last confirmed Type column with **no** confirm modal (GATE-03)
- **Admin confirm with samples**; option for **“No type column”** (keep for review) (GATE-04)
- **Confirm persist admin-only**; non-admin on new/changed format → clear pending/confirm-required state, **no infinite hang** (GATE-05)
- **Single Type column** — Phase 51 scorer already forces map; confirm/reuse inject into that force path (COL-04 coexistence)
- **Zero new npm packages preferred** — pure JS + volume-safe store like brain
- **Format memory store separate from `global-brain.json`** (REQUIREMENTS Out of Scope)
- **Do not wipe user data** — never touch `data/filter-lists/`, `data/bridge-brain/`, Form Forge/Analyzer user stores (AGENTS.md)
- **Do NOT implement short labels** (Phase 53)
- **META-01 lives with Phase 52** — full source enum needs confirm + reuse paths

### Claude's Discretion (plan may choose within bounds)

- Exact fingerprint algorithm details (must be order-independent headers + light shape; not full-file hash)
- Single index JSON vs per-city files under `BRIDGE_CITY_FORMATS_ROOT`
- Resume strategy: re-upload preferred for v1.8 (vs server parse staging)
- Batch mixed-fingerprint policy shape (pause-all vs per-file partial) — must be **explicit** and never silent cross-map
- Whether water_shut_off skips Type gate entirely (recommended: yes)
- Confirm UI chrome (native `<dialog>` like history modal vs custom panel)
- Whether `confirmedTypeHeader` empty string vs sentinel `__none__` means “No type column”

### Deferred Ideas (OUT OF SCOPE — Phase 52)

- Display-only short labels (Phase 53)
- Full regression suite lock TEST-01–03 (Phase 54) — **do** include unit + process wire tests for GATE/META in 52
- ML / embeddings classifier, learned global synonyms
- Confirm every upload; per-user Type maps
- Multi-column Type blend
- Server-side multi-tenant auth (header admin remains)
- Server temp staging of parse results / resume tokens
- Storing format memory inside `global-brain.json`
- Admin “forget this city’s format” UI (P2 nice-to-have; optional if cheap)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Each city (+ upload type) stores durable format fingerprint + last confirmed Type header | `bridge-city-format-store.js` + fingerprint helper; key `cityId` + `uploadType` |
| GATE-02 | First upload or fingerprint differs → pause before normalize/tag/brain; show admin confirm UI | Early branch in `processUpload` after parse+score; 409 payload with candidates |
| GATE-03 | Matching fingerprint reuses last confirmed Type with no modal | Memory load + header inject; skip gate when fingerprint matches |
| GATE-04 | Confirm UI: ranked candidates, suggested winner, samples, alternate pick, “No type column” | Scorer `ranked` + samples already exist; UI modal + re-POST |
| GATE-05 | Confirm persist admin-only; non-admin new/changed format → clear pending state, no hang | `requireAdmin` on save; 409 always returns (stateless server); non-admin cannot complete confirm write |
| GATE-06 | Multi-file (≤5): per-file fingerprint/confirm; mixed formats never silent one-map | Batch pre-scan fingerprints; explicit mismatch/confirm policy |
| META-01 | Process/review meta: winner header, score or null, optional runner-up, source enum | `processingMeta.typeResolution` on full process success |
</phase_requirements>

---

## Standard Stack

### Core

| Library / module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js | 20+ (local 24.x) | Runtime | Existing shell |
| `lib/bridge-type-column-score.js` | Phase 51 shipped | Ranked candidates + samples for confirm UI + force path | GATE-04 input; do not reimplement scorer |
| `lib/bridge-city-format-store.js` | **NEW** | Load/save per-city fingerprint + typeHeader | Mirror brain atomic JSON; separate domain |
| Fingerprint helper | **NEW** (store module or `lib/bridge-format-fingerprint.js`) | Order-independent header fingerprint | `crypto.createHash('sha1')` already used in review-groups |
| `lib/bridge-engine/index.js` | existing | Gate in `processUpload` / batch policy | Only full-pipeline seam |
| `lib/bridge-engine/normalizer.js` | existing | Accept type override / reuse header | Force path already exists |
| `lib/bridge-api.js` | existing | Map 409 + multipart confirm fields + admin gate on persist | `requireAdmin`, `handleProcess` patterns |
| `public/js/bridge.js` | existing | Confirm modal + re-POST process | Existing `processUpload()` FormData flow |
| Node `fs` + atomic rename | built-in | Durable store | Same as `bridge-brain-store.writeJsonAtomic` |
| Node `crypto` | built-in | Fingerprint digest | No new deps |
| `node --test` | built-in | Unit + process fixtures | Existing suite |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/config.js` | `BRIDGE_CITY_FORMATS_ROOT` | Volume-safe path (mirror `BRIDGE_BRAIN_ROOT`) |
| `lib/bridge-intake-schema.js` | `normalizeHeader` for fingerprint | Shared header normalize |
| `lib/multipart.js` | Parse multipart fields | `confirmedTypeHeader`, `formatFingerprint` on re-POST |
| `lib/phuglee-user.js` | `readPhugleeUser` | Admin check (`username === 'admin'`) |
| `.gitignore` | Ignore `data/bridge-city-formats/` | Like brain/lists — runtime data not committed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate city-format store | Nest in `global-brain.json` | **Forbidden** — brain version conflicts + domain mix |
| Re-upload on confirm | Server parse staging + token | Faster UX but TTL/cleanup; defer past v1.8 |
| HTTP 409 gate | Soft 200 `{ ok:false, needsConfirm }` | Clients may treat 200 as success; **prefer 409** |
| Non-admin auto-process with scorer, no persist | Always-pause until admin maps | Safer Train quality; matches product “admin confirms” |
| Full-file hash fingerprint | Header multiset + light shape | File hash re-confirms every day (row churn) |
| SQLite/Redis for maps | Atomic JSON file | Overkill for single-tenant local/Railway |

**Installation:**

```bash
# No new packages
npm test
```

---

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── bridge-city-format-store.js   # NEW: load/save + fingerprint helpers
├── bridge-type-column-score.js   # UNCHANGED (Phase 51)
├── bridge-brain-store.js         # UNCHANGED (do not mix format memory)
├── config.js                     # MODIFY: BRIDGE_CITY_FORMATS_ROOT
├── bridge-api.js                 # MODIFY: 409 map, multipart confirm fields, admin persist
└── bridge-engine/
    ├── index.js                  # MODIFY: gate after parse+score; batch policy; typeResolution meta
    └── normalizer.js             # MODIFY: typeColumnOverride / force confirmed header
public/js/
└── bridge.js                     # MODIFY: 409 confirm modal + re-POST
public/
└── bridge.html                   # MODIFY: confirm <dialog> markup (optional if JS-built)
tests/
├── bridge-city-format-store.test.js   # NEW pure store + fingerprint
├── bridge-engine.test.js              # ADD GATE/META process fixtures
└── bridge-api-handlers.test.js        # ADD 409 / admin persist if API-level tests exist
data/
└── bridge-city-formats/          # runtime only; gitignore (never wipe in agent work)
```

### Pattern 1: Gate after parse + score, before normalize (required)

**What:** `processUpload` parses, scores, fingerprints, consults memory. If confirm required and no valid `confirmedTypeHeader` on this request → **throw structured error** (no normalize / dedupe / brain / groups).

**When:** `uploadType === 'code_violation'` (recommended). Water shut-off: **skip gate** (Type UX is code-violation Train; water pass-through must not regress).

**Flow:**

```
processUpload({ buffer, filename, city, uploadType, confirmedTypeHeader?, formatFingerprint?, username })
  │
  ├─ parse → { headers, rows }
  ├─ ranked = scoreTypeColumns(headers, sample(rows))
  ├─ fingerprint = formatFingerprint(headers, optional light shape)
  ├─ memory = loadCityFormat(city.id, uploadType)
  │
  ├─ needConfirm =
  │     !memory
  │  || memory.fingerprint !== fingerprint
  │  // invalid resume: confirmed provided but not in headers and not "none" → hard 400
  │
  ├─ if needConfirm && confirmedTypeHeader === undefined:
  │     throw {
  │       code: 'TYPE_COLUMN_CONFIRM_REQUIRED',
  │       statusCode: 409,
  │       details: {
  │         city, uploadType, sourceFile,
  │         formatFingerprint: fingerprint,
  │         candidates: ranked.slice(0, 8),  // header, score, samples
  │         suggestedHeader: pickTypeColumn(ranked)?.header ?? null,
  │         lastConfirmed: memory || null,
  │         adminRequiredToPersist: true
  │       }
  │     }
  │
  ├─ typeHeader =
  │     resolveConfirmed(confirmedTypeHeader)  // string header | null for "no type"
  │  || (memory && memory.fingerprint === fingerprint
  │        ? memory.typeHeader   // may be null = previously confirmed no type
  │        : undefined)
  │  || pickTypeColumn(ranked)?.header ?? null
  │
  ├─ source =
  │     confirmed provided this request → 'admin_confirm'
  │  || memory fingerprint match → 'auto_reuse'
  │  || else → typeHeader ? 'scorer' : 'unresolved'
  │     // Note: for code_violation, full success without confirm/reuse should not happen
  │     // after gate ships (except tests injecting override / water skip)
  │
  ├─ if confirmed provided AND username is admin:
  │     saveCityFormat({ cityId, uploadType, fingerprint, typeHeader, confirmedBy })
  │  if confirmed provided AND not admin:
  │     // Do not hang: either reject confirm with 403 ADMIN_REQUIRED
  │     // or process without persist only if product allows — PREFER 403 on confirm attempt
  │
  └─ normalizeRawRows(..., { typeColumnOverride: typeHeader })
       → rest of pipeline unchanged
```

**Key integration truth (from ARCHITECTURE):** Gate is **not** after full process. Wrong Type must never reach Train groups or brain apply.

### Pattern 2: Normalizer override (inject into Phase 51 force path)

**What:** Extend `normalizeRawRows` / `forceTypeColumnFromScorer` so confirm/reuse **wins over** live scorer pick.

**API shape:**

```javascript
// context.typeColumnOverride:
//   string  → force that header (must exist in headers; else hard error before normalize)
//   null    → force no Type column (admin "No type column")
//   undefined → fall back to live scorer (water / legacy / tests)

function forceTypeColumn(columnMap, headers, rawRows, override) {
  if (override !== undefined) {
    if (override === null) {
      columnMap.violationIssueType = null;
      return { header: null, score: null, ranked: [], source: 'override' };
    }
    if (!headers.includes(override)) {
      const err = new Error(`Confirmed Type header not found in file: ${override}`);
      err.code = 'INVALID_TYPE_COLUMN';
      throw err;
    }
    columnMap.violationIssueType = override;
    return { header: override, score: null, ranked: [], source: 'override' };
  }
  return forceTypeColumnFromScorer(columnMap, headers, rawRows); // Phase 51
}
```

**COL-04 still holds:** Always set `columnMap.violationIssueType` from resolution — never leave alias-first Type when override/scorer abstains.

### Pattern 3: City format store (volume-safe, not brain)

**Config (mirror brain):**

```javascript
// lib/config.js
BRIDGE_CITY_FORMATS_ROOT: process.env.BRIDGE_CITY_FORMATS_ROOT
  ? path.resolve(process.env.BRIDGE_CITY_FORMATS_ROOT)
  : (process.env.PDA_DATA_ROOT
    ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-city-formats')
    : path.join(ROOT, 'data', 'bridge-city-formats')),
```

**Document shape (single index preferred for v1.8):**

```json
{
  "version": 1,
  "cities": {
    "arizona-marana": {
      "code_violation": {
        "fingerprint": "a1b2c3…",
        "typeHeader": "Vio Cat",
        "confirmedAt": "2026-07-09T12:00:00.000Z",
        "confirmedBy": "admin",
        "sourceFileLast": "export.csv",
        "headerSnapshot": ["Property Address", "Vio Cat", "Open Date"]
      }
    }
  }
}
```

- `typeHeader: null` is valid — means admin confirmed **No type column** for this fingerprint.
- Key by **cityId + uploadType** (`code_violation` vs `water_shut_off` if water ever stores).
- Atomic write: temp file + `renameSync` (copy from brain store).
- Corrupt JSON → empty store (warn), do not throw on load.
- **Gitignore** `data/bridge-city-formats/`. Agents must never delete this root.

**Fingerprint (GATE-01):**

```javascript
function formatFingerprint(headers, opts = {}) {
  // 1. Normalize each header via normalizeHeader
  // 2. Drop empty / _meta
  // 3. Sort for order-independence (reorder columns ≠ new format)
  // 4. Join with \u0001 + optional light shape bands
  // 5. sha1 hex
  const normalized = (headers || [])
    .map((h) => normalizeHeader(h))
    .filter((h) => h && h !== '_meta')
    .sort();
  const base = normalized.join('\u0001');
  // Optional light shape: e.g. column count band only — NOT cell values
  // Do NOT hash row counts or full file bytes
  return crypto.createHash('sha1').update(base, 'utf8').digest('hex');
}
```

| Change | Fingerprint | Expected |
|--------|-------------|----------|
| Same headers, reordered | Same | Reuse |
| Extra blank/unnamed column that normalizes away | Same (if filtered) | Reuse |
| New real header added | Different | Re-confirm |
| Type header renamed | Different | Re-confirm |
| New rows only | Same | Reuse |
| Full file sha256 | Changes daily | **Do not use** |

### Pattern 4: API + UI resume (stateless server)

**Multipart fields on process:**

| Field | Required | Meaning |
|-------|----------|---------|
| `cityId`, `uploadType`, `file` | always | Existing |
| `confirmedTypeHeader` | on resume | Exact header string, or empty / `__none__` for “No type column” |
| `formatFingerprint` | on resume (recommended) | Echo from 409; server re-computes and **must match** or 409 again |

**HTTP mapping in `handleProcess`:**

```javascript
if (err.code === 'TYPE_COLUMN_CONFIRM_REQUIRED') {
  sendJson(res, 409, {
    error: err.message || 'Confirm Violation Type column for this city format',
    code: 'TYPE_COLUMN_CONFIRM_REQUIRED',
    ...err.details
  });
  return;
}
if (err.code === 'ADMIN_REQUIRED') {
  sendJson(res, 403, { error: err.message, code: 'ADMIN_REQUIRED' });
  return;
}
if (err.code === 'INVALID_TYPE_COLUMN') {
  sendJson(res, 400, { error: err.message, code: err.code });
  return;
}
```

**UI (`bridge.js` `processUpload`):**

1. `fetch` process; if `!res.ok` and `data.code === 'TYPE_COLUMN_CONFIRM_REQUIRED'`:
   - Stop loading spinner (no hang)
   - If admin: open confirm dialog with candidates, samples, radio list, “No type column”, Confirm button
   - If non-admin: show clear message: *“An admin must confirm the Type column for this city format once. Ask an admin to process this file.”* — no spinner, process button re-enabled
2. On admin Confirm: re-build FormData with same files + `confirmedTypeHeader` + `formatFingerprint` → POST again
3. On success: existing `renderResults`

Mirror existing history `<dialog>` pattern in `bridge.html` for a11y.

**Admin-only persist rule (GATE-05):**

| Actor | Same fingerprint | New/changed fingerprint |
|-------|------------------|-------------------------|
| Admin | Auto-reuse, process 200 | 409 → modal → re-POST → save memory → 200 |
| Non-admin | Auto-reuse, process 200 | 409 + message; **cannot** persist; **must not** spin forever |

Do **not** implement “non-admin processes with scorer without confirm” as default — that reopens wrong-column Train poison. Day-2 non-admins are unblocked by **reuse** after admin maps once.

### Pattern 5: Multi-file batch (GATE-06)

**Today:** `processUploadBatch` loops `processUpload` per file; `NO_USABLE_ROWS` soft-fails; other errors hard-fail whole batch.

**Required policy (prescriptive):**

1. **Per-file fingerprint** — never one map for the batch.
2. **Pre-scan (or fail-fast on first confirm):** If any file needs confirm, do not merge partial Train results that mixed schemas.
3. **Same fingerprint across all files + memory match:** process all with reuse; one `typeResolution` (or per-file in `processingMeta.files[]`).
4. **Same fingerprint, need confirm:** single 409 with shared candidates; admin re-POSTs all files with one `confirmedTypeHeader`.
5. **Mixed fingerprints in one batch:**
   - **Preferred v1.8:** return 409 `TYPE_COLUMN_CONFIRM_REQUIRED` with `files: [{ filename, formatFingerprint, candidates, suggestedHeader, needsConfirm }]` and `code` note that mixed formats require per-fingerprint confirm — **or** 400 `FORMAT_MISMATCH` listing fingerprints and refuse until admin processes files separately / confirms each fingerprint into store then re-uploads.
   - **Never:** apply file 1’s Type header name to file 2 if that header is missing.
6. Extend `processingMeta.files[]` with `fingerprint`, `typeHeader`, `typeResolutionSource` for audit.

### Pattern 6: META-01 `processingMeta.typeResolution`

On **successful** full process (200):

```javascript
processingMeta.typeResolution = {
  header: string | null,          // chosen Type header or null
  score: number | null,           // scorer score when known; null on pure override without re-score
  runnerUp: { header, score } | null,
  source: 'auto_reuse' | 'admin_confirm' | 'scorer' | 'unresolved',
  fingerprint: string,
  formatMatched: boolean          // true when memory fingerprint matched
};
```

| source | When |
|--------|------|
| `auto_reuse` | Memory fingerprint matched; applied `memory.typeHeader` (incl. null) |
| `admin_confirm` | This request supplied `confirmedTypeHeader` and process used it |
| `scorer` | Gate skipped (e.g. water) or no memory path used live scorer winner |
| `unresolved` | Type header is null after resolution (no candidacy / no-type confirm) without implying error |

Also keep existing `processingMeta.columnMap.violationIssueType` in sync with `typeResolution.header`.

### Anti-Patterns to Avoid

- **Confirm after full process** — Train/brain already poisoned  
- **Format memory in `global-brain.json`** — version thrash + domain mix  
- **Full-file / row-count fingerprint** — confirm fatigue  
- **Server infinite wait / job for confirm** — client owns modal; server stateless  
- **Admin-only entire `/process`** — blocks day-2 reuse for operators  
- **Silent batch one-map** — mixed clerk extracts  
- **Non-admin silent scorer auto-map on first format** — wrong column sticks without admin eyes  
- **Short labels / Train title changes** — Phase 53  
- **Wiping city-format or brain data** during implementation  

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic JSON write | Ad-hoc writeFile | Brain’s temp+rename pattern | Crash-safe on Windows/Railway |
| Admin gate | New auth system | `requireAdmin` / `X-Phuglee-User === 'admin'` | Existing single-tenant pattern |
| Column ranking | New scorer | Phase 51 `scoreTypeColumns` | Already returns samples for UI |
| Header normalize | New lower/trim | `normalizeHeader` from intake-schema | Fingerprint stability |
| Multipart parse | busboy/multer | Existing `parseMultipart` / `collectUploadFiles` | Zero deps |
| Modal framework | React modal | Native `<dialog>` like history | Matches bridge UI |
| Resume token store | Redis/temp files | Re-upload same files + confirm fields | v1.8 simplicity |

**Key insight:** Hard parts are **gate placement**, **admin-only persist without hanging non-admins**, and **batch fingerprint policy** — not inventing a new classifier.

---

## Common Pitfalls

### Pitfall 1: Confirm blocks non-admin or hangs process

**What goes wrong:** Non-admin upload spins forever; 403 without payload; process button dead.  
**Why:** Gate implemented as “admin-only process” or missing client 409 branch.  
**How to avoid:** Always return 409 body; client clears loading; non-admin gets copy, not spinner; same-format reuse works for all.  
**Warning signs:** Non-admin first city of day never finishes; no 409 handler in `fetchJson`/`processUpload`.

### Pitfall 2: Fingerprint too strict or too loose

**What goes wrong:** Re-confirm every reorder (strict) or silent wrong Type after schema change (loose).  
**Why:** Order-dependent join or full-file hash; or only cityId without fingerprint.  
**How to avoid:** Sorted normalized headers; never file bytes; store fingerprint with typeHeader.  
**Warning signs:** Confirm rate ≈ 100%; or Train categories shift after clerk adds a column with no modal.

### Pitfall 3: Gate after normalize/brain

**What goes wrong:** Groups built on wrong Type; admin “confirms” too late.  
**Why:** Easier to bolt UI onto 200 response.  
**How to avoid:** Throw before `normalizeRawRows`.  
**Warning signs:** 200 with rows + “please confirm” toast.

### Pitfall 4: Override does not force columnMap

**What goes wrong:** Admin picks `Vio Cat`; process still maps Status Description via scorer.  
**Why:** Phase 51 force always re-scores and ignores confirm.  
**How to avoid:** `typeColumnOverride` path **before** or **instead of** scorer force; assert columnMap in tests.  
**Warning signs:** META source admin_confirm but columnMap differs.

### Pitfall 5: Multi-file silent cross-map

**What goes wrong:** File 1 Type header applied to file 3 missing that column → empty/wrong types.  
**Why:** City-level map without per-file header check.  
**How to avoid:** Per-file fingerprint; validate header ∈ headers; mixed → explicit error/confirm.  
**Warning signs:** Batch `sourceFile: "a · b"` with half empty Type.

### Pitfall 6: Persist without admin / spoof only on client

**What goes wrong:** Client hides modal but POST saves map.  
**Why:** Trust client role.  
**How to avoid:** Server `requireAdmin` (or username check) **before** `saveCityFormat`.  
**Warning signs:** Non-admin can write city-formats JSON.

### Pitfall 7: “No type column” not representable

**What goes wrong:** Cannot distinguish “not confirmed yet” vs “confirmed none”.  
**Why:** Missing header treated as needConfirm forever.  
**How to avoid:** Store `typeHeader: null` with fingerprint; resume field `__none__` or empty with explicit `confirmedNoType=1`.  
**Warning signs:** Confirm modal every time after choosing No type column.

### Pitfall 8: Water shut-off / MAP regressions

**What goes wrong:** Water uploads require Type confirm; Vio Cat promote breaks.  
**Why:** Gate too broad; override disables promote incorrectly.  
**How to avoid:** Skip gate for `water_shut_off`; keep promote empty-cell-only; keep COL/MAP tests green.  
**Warning signs:** Water process 409; MAP-01 fails.

### Pitfall 9: Touching user data roots

**What goes wrong:** Agent deletes filter-lists or brain while testing store.  
**Why:** “Clean slate” habit.  
**How to avoid:** Temp dirs in tests only (pattern in `bridge-brain-store.test.js`); never wipe real `data/*`.  
**Warning signs:** Tests write to production `BRIDGE_BRAIN_ROOT` without temp override.

---

## Code Examples

### Verified seams (today — Phase 51)

```110:131:lib/bridge-engine/index.js
async function processUpload({ buffer, filename, city, uploadType, username = '', plan = '' }) {
  // ...
  const parsed = isTabularFile(sourceFile)
    ? await parseTabularFile(buffer, sourceFile)
    : await parseDocumentFile(buffer, sourceFile);

  const normalized = normalizeRawRows(parsed.rows, parsed.headers, {
    city,
    uploadType,
    sourceFile,
    processedAt
  });
```

```38:60:lib/bridge-engine/normalizer.js
function forceTypeColumnFromScorer(columnMap, headers, rawRows) {
  const sampleRows = (rawRows || []).slice(0, 80);
  // ...
  const typeRes = resolveTypeColumnHeader(headers, sampleRows, {
    claimedHeaders: claimed
  });
  columnMap.violationIssueType = typeRes.header;
  return typeRes;
}
```

```516:531:lib/bridge-type-column-score.js
function resolveTypeColumnHeader(headers, sampleRows, opts = {}) {
  const ranked = scoreTypeColumns(headers, sampleRows, opts);
  const picked = pickTypeColumn(ranked, opts);
  return {
    header: picked ? picked.header : null,
    score: picked ? picked.score : null,
    ranked,
    source: picked ? 'scorer' : 'unresolved'
  };
}
```

### Brain atomic write pattern (copy for city-format store)

```53:58:lib/bridge-brain-store.js
function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}
```

### Admin gate pattern

```536:545:lib/bridge-api.js
function requireAdmin(req) {
  const username = readPhugleeUser(req);
  if (username !== ADMIN_USERNAME) {
    const err = new Error('Admin required');
    err.code = 'ADMIN_REQUIRED';
    err.statusCode = 403;
    throw err;
  }
  return username;
}
```

### Batch soft-fail pattern (extend for confirm, do not soft-merge half-confirmed)

```430:454:lib/bridge-engine/index.js
  for (const file of entries) {
    try {
      const payload = await processUpload({ /* ... */ });
      successes.push(payload);
    } catch (err) {
      if (err && err.code === 'NO_USABLE_ROWS') {
        failures.push({ /* ... */ });
        continue;
      }
      // Hard errors fail the whole batch
      err.failedFile = file.filename;
      throw err;
    }
  }
```

**Recommendation:** Treat `TYPE_COLUMN_CONFIRM_REQUIRED` as **hard** for the batch (throw with aggregated `files[]` details), not soft-skip like `NO_USABLE_ROWS`. Soft-skip would leave mixed partial Train state.

### Conceptual gate throw

```javascript
// lib/bridge-engine/index.js (conceptual)
const ranked = scoreTypeColumns(parsed.headers, parsed.rows.slice(0, 80));
const fingerprint = computeFormatFingerprint(parsed.headers);
const memory = loadCityFormat(city.id, uploadType);

const hasConfirmField = Object.prototype.hasOwnProperty.call(opts, 'confirmedTypeHeader');
const needConfirm = !memory || memory.fingerprint !== fingerprint;

if (needConfirm && !hasConfirmField) {
  const err = new Error(
    'Confirm the Violation Type column for this city spreadsheet format before processing.'
  );
  err.code = 'TYPE_COLUMN_CONFIRM_REQUIRED';
  err.statusCode = 409;
  err.details = {
    city,
    uploadType,
    sourceFile,
    formatFingerprint: fingerprint,
    candidates: ranked.slice(0, 8).map(({ header, score, samples, reasons }) => ({
      header, score, samples: (samples || []).slice(0, 5), reasons
    })),
    suggestedHeader: pickTypeColumn(ranked)?.header ?? null,
    lastConfirmed: memory
      ? { fingerprint: memory.fingerprint, typeHeader: memory.typeHeader }
      : null
  };
  throw err;
}
```

### Client 409 handling (conceptual)

```javascript
// public/js/bridge.js — inside processUpload try
const res = await fetch('/api/bridge/process', { method: 'POST', body: form, headers: bridgeHeaders() });
const data = await res.json().catch(() => ({}));
if (res.status === 409 && data.code === 'TYPE_COLUMN_CONFIRM_REQUIRED') {
  stopLoadingAnimation();
  setHidden(loadingPanel, true);
  if (!isBridgeAdmin()) {
    showError('An admin must confirm the Type column for this city format once. Ask an admin to process this upload.');
    return;
  }
  const choice = await openTypeColumnConfirmDialog(data); // header string | null
  if (choice === undefined) return; // cancelled
  form.append('formatFingerprint', data.formatFingerprint);
  form.append('confirmedTypeHeader', choice === null ? '__none__' : choice);
  // re-fetch process with same files...
  return;
}
```

---

## State of the Art

| Old Approach | Current Approach (Phase 52) | When | Impact |
|--------------|----------------------------|------|--------|
| Always auto scorer map (Phase 51) | Confirm first format; reuse thereafter | v1.8 Phase 52 | Stops silent first-map mistakes |
| No city format memory | Durable fingerprint + typeHeader store | Phase 52 | Day-2 zero-friction |
| Alias-first Type | Scorer force (51) + confirm/reuse override (52) | v1.8 | Correct column + human gate |
| Soft 200 “needs confirm” | Prefer **409** structured gate | Phase 52 | Clients cannot treat as finished |

**Deprecated for Type resolution on process path:**
- Auto-applying scorer on first city format without admin confirm  
- City map without fingerprint  
- Format memory inside brain file  

---

## Open Questions

1. **Water shut-off gate**  
   - What we know: Water ignores type suppress; Train is code-violation-centric  
   - Recommendation: **Skip Type confirm for `water_shut_off`**; source `scorer`/`unresolved` as today  

2. **Non-admin confirm attempt**  
   - What we know: GATE-05 admin-only persist  
   - Recommendation: If non-admin sends `confirmedTypeHeader`, respond **403 ADMIN_REQUIRED** (do not process without persist, do not persist)  

3. **Mixed batch UX**  
   - What we know: Never silent cross-map  
   - Recommendation: Hard 409/400 with per-file details; simplest product: “process matching formats separately when mixed”  

4. **Document/OCR sparse headers**  
   - What we know: Same process path  
   - Recommendation: Fingerprint whatever headers parse yields; first OCR upload still confirm; reuse when headers stable  

5. **Score on META for admin_confirm**  
   - Recommendation: Re-score for meta (`score` of chosen header in ranked list) so admin_confirm still has numeric score when available  

---

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node --test` (no Jest/Vitest) |
| Config file | none — `package.json` `"test": "node --test tests/**/*.test.js"` |
| Quick run command | `node --test tests/bridge-city-format-store.test.js tests/bridge-type-column-score.test.js` |
| Full suite command | `npm test` |
| Live health (UI) | `powershell -File scripts/verify-live.ps1` — **required** when `public/` or server routes change |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| GATE-01 | Fingerprint order-independent; save/load typeHeader + fingerprint by city+uploadType | unit | `node --test tests/bridge-city-format-store.test.js` | ❌ Wave 0 |
| GATE-01 | Corrupt JSON / missing file → empty memory, no throw | unit | same | ❌ Wave 0 |
| GATE-02 | First process (no memory) throws `TYPE_COLUMN_CONFIRM_REQUIRED` before usable rows | integration | `node --test tests/bridge-engine.test.js` | ❌ Wave 0 |
| GATE-02 | Fingerprint change (extra header) requires confirm again | integration | same | ❌ Wave 0 |
| GATE-03 | After save memory, second process same headers reuses without throw; columnMap = confirmed | integration | same | ❌ Wave 0 |
| GATE-03 | Header reorder only → same fingerprint → reuse | unit + integration | store + engine | ❌ Wave 0 |
| GATE-04 | 409 payload includes ranked candidates, suggestedHeader, samples | integration | engine and/or api | ❌ Wave 0 |
| GATE-04 | Resume with `confirmedTypeHeader` forces that map; `__none__` → Type null, rows still process | integration | engine | ❌ Wave 0 |
| GATE-05 | saveCityFormat / confirm path rejects non-admin (403); non-admin first upload gets 409 not hang | unit + api | store policy + api handler | ❌ Wave 0 |
| GATE-06 | Two files different Type headers → no silent single map (hard confirm/mismatch) | integration | engine batch | ❌ Wave 0 |
| GATE-06 | Two files same fingerprint → one confirm/reuse path | integration | engine batch | ❌ Wave 0 |
| META-01 | Success payload has `processingMeta.typeResolution` with source enum | integration | engine | ❌ Wave 0 |
| COL regression | COL-01/02/03/04 + MAP promote still green after override wire | integration | existing engine COL/MAP tests | ✅ keep green |
| Water | water_shut_off not stuck on Type confirm | integration | existing water tests | ✅ keep green |

### Sampling Rate

- **Per task commit:** `node --test tests/bridge-city-format-store.test.js tests/bridge-type-column-score.test.js`  
- **Per wave merge:** `node --test tests/bridge-city-format-store.test.js tests/bridge-engine.test.js`  
- **Phase gate:** `npm test` green; if UI changed, `scripts/verify-live.ps1` green  

### Wave 0 Gaps

- [ ] `tests/bridge-city-format-store.test.js` — fingerprint order-independence, load/save, null typeHeader, temp root isolation  
- [ ] Engine GATE fixtures in `tests/bridge-engine.test.js` — confirm required, reuse, override, META source, batch mixed  
- [ ] Optional API handler tests for 409 body shape + admin persist  
- [ ] Framework install: none  
- [ ] Temp override `config.BRIDGE_CITY_FORMATS_ROOT` in tests (mirror brain temp pattern)  
- [ ] Keep green: COL-01–04, MAP-01–03, water, brain process tests  

---

## Implementation Plan Hints (for planner)

Suggested task waves (not PLAN.md):

1. **Wave 0 — RED tests:** store/fingerprint + process gate contracts + META shape + batch mixed  
2. **Wave 1 — Store + config:** `BRIDGE_CITY_FORMATS_ROOT`, `bridge-city-format-store.js`, gitignore, unit green  
3. **Wave 2 — Engine gate + normalizer override:** parse→score→fingerprint→gate/reuse→normalize; typeResolution meta; COL/MAP still green  
4. **Wave 3 — API:** multipart fields, 409/403 mapping, pass username into process for persist  
5. **Wave 4 — UI:** confirm dialog, admin/non-admin paths, re-POST; `verify-live.ps1`  
6. **Wave 5 — Batch policy + full `npm test`**

**Files expected to change:**

| File | Action |
|------|--------|
| `lib/bridge-city-format-store.js` | NEW |
| `lib/config.js` | MODIFY (`BRIDGE_CITY_FORMATS_ROOT`) |
| `lib/bridge-engine/index.js` | MODIFY (gate, batch, meta) |
| `lib/bridge-engine/normalizer.js` | MODIFY (override) |
| `lib/bridge-api.js` | MODIFY (409, fields, admin) |
| `public/js/bridge.js` | MODIFY (modal flow) |
| `public/bridge.html` / CSS | MODIFY (dialog chrome if needed) |
| `.gitignore` | MODIFY (`data/bridge-city-formats/`) |
| `tests/bridge-city-format-store.test.js` | NEW |
| `tests/bridge-engine.test.js` | MODIFY |
| `lib/bridge-type-column-score.js` | ideally **unchanged** |
| `lib/bridge-brain-store.js` | **unchanged** |
| `data/filter-lists/`, `data/bridge-brain/` | **never touch** |

**Do not add:** shortLabel, new npm deps, brain-file format maps, server parse staging.

---

## Sources

### Primary (HIGH confidence)

- `lib/bridge-engine/index.js` — `processUpload`, `processUploadBatch`, merge semantics  
- `lib/bridge-engine/normalizer.js` — Phase 51 force Type  
- `lib/bridge-type-column-score.js` — ranked candidates + samples  
- `lib/bridge-api.js` — `handleProcess`, `requireAdmin`, 409 VERSION_CONFLICT precedent  
- `lib/bridge-brain-store.js` — atomic JSON + volume root pattern  
- `lib/config.js` — `BRIDGE_BRAIN_ROOT` / `PDA_DATA_ROOT` nesting  
- `public/js/bridge.js` — process FormData + admin detection  
- Phase 51: `51-RESEARCH.md`, `51-VERIFICATION.md` (passed 4/4)  
- `.planning/REQUIREMENTS.md` GATE-01–06, META-01  
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md`, `STACK.md`, `FEATURES.md`  
- AGENTS.md — never wipe filter lists / brain  

### Secondary (MEDIUM confidence)

- HTTP 409 vs soft 200 for gate (industry import tools use blocking step; 409 fits existing conflict style)  
- Batch mixed-fingerprint UX (pause-all vs process-separate) — product-tunable; safety locked  
- Fingerprint light shape bands beyond headers — optional; headers-only is enough for v1.8  

### Tertiary (LOW confidence)

- Soft-match renamed Type column across fingerprints — out of scope; re-confirm is correct  
- Server parse staging for faster confirm — deferred  

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero-deps; brain store mirror verified  
- Architecture / gate seam: **HIGH** — processUpload parse→normalize order verified; Phase 51 force path ready for override  
- Pitfalls: **HIGH** — from milestone PITFALLS + current batch/admin code  
- Batch mixed UX details: **MEDIUM** — policy prescribed but UI polish discretionary  
- Fingerprint shape signature extras: **MEDIUM** — headers-only sufficient; bands optional  

**Research date:** 2026-07-09  
**Valid until:** ~2026-08-08 (stable domain; re-check if processUpload signature or admin model changes)

---

## RESEARCH COMPLETE

**Phase:** 52 - Format Memory + Confirm Gate  
**Confidence:** HIGH (core gate/store); MEDIUM (batch mixed UX polish)

### Key Findings

- Gate **after parse + score, before `normalizeRawRows`** — return **409** `TYPE_COLUMN_CONFIRM_REQUIRED` with ranked candidates/samples from Phase 51 scorer; resume via re-POST + `confirmedTypeHeader` (re-upload preferred).
- New **`lib/bridge-city-format-store.js`** under `BRIDGE_CITY_FORMATS_ROOT` (not brain); fingerprint = **order-independent normalized headers** (sha1); store `typeHeader` including **null** for “No type column”.
- Inject confirm/reuse via **normalizer override** so Phase 51 force path cannot undercut admin choice (COL-04).
- **Admin-only persist**; non-admin gets clear 409 message and no spinner hang; same-format **reuse works for all**.
- Batch: **per-file fingerprint**; treat confirm as hard fail for merge; never silent one-map across mixed formats.
- **META-01:** `processingMeta.typeResolution` with `auto_reuse | admin_confirm | scorer | unresolved`.
- Zero new packages; Wave 0 needs store tests + engine GATE/META fixtures; keep COL/MAP/water green.

### File Created

`.planning/phases/52-format-memory-confirm-gate/52-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Brain-store pattern + crypto + existing scorer verified |
| Architecture | HIGH | processUpload seam + Phase 51 force path verified in code |
| Pitfalls | HIGH | Milestone pitfalls map 1:1 to Phase 52 |
| Batch mixed policy | MEDIUM | Safety locked; exact UX message discretionary |

### Open Questions

- Water skip gate (recommend yes)  
- Non-admin sending confirm fields → 403 (recommend)  
- Mixed batch: hard refuse vs multi-fingerprint confirm wizard  

### Ready for Planning

Research complete. Planner can create PLAN.md files for Phase 52.
