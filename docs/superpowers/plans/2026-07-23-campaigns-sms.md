# Campaigns → SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-only Phuglee **Campaigns → SMS** cockpit that tracks GHL SMS KPIs, dry-runs multi-touch blasts (4-day spacing, max 12), syncs vault leads into GHL with `code violation` tags, and keeps all live sending **off** until `SMS_CAMPAIGNS_LIVE=true` plus explicit admin confirm.

**Architecture:** New `lib/campaigns/` domain (policy, messages, GHL eligibility, send/dry-run, run store, vault sync queue) behind `/api/admin/campaigns/sms/*`. Admin page `/campaigns/sms` mirrors Operating Costs patterns. GHL remains delivery pipe via existing `lib/leads-platform/ghl-client.js` plus contact search/upsert helpers. Live send and auto-sequence are hard-gated by env flags.

**Tech Stack:** Node.js (Phuglee `server.js`), existing GHL Private Integration client, file-backed JSON stores under `data/campaigns/sms/`, shell nav + `shell-bundle.css` / vault desk patterns, Node test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-07-23-campaigns-sms-design.md`

## Global Constraints

- **Nothing live by default:** `SMS_CAMPAIGNS_LIVE` defaults false; auto defaults false.
- **Admin only:** `username === admin` for page + all APIs (same bar as Operating Costs).
- **Cold exclusions (any):** tags wrong number, not interested, dnc, dnd, interested, follow up; system SMS DND; open DTS opportunity; sms_count ≥ 12; no phone; last_sms within 4 days.
- **Spacing:** 4 days normal; 24h hard minimum.
- **Hard stop:** 12 cold texts or inbound reply (reply detection via conversation or interested/follow-up tags in v1; full message scan optional later).
- **Source tag:** `code violation` on current vault syncs; class tags from leadType.
- **No per-touch smart lists:** filter by `sms_count` at fire time.
- **Do not invent GHL custom field IDs** — resolve by name at runtime or document one-time setup.
- **Pacing:** respect GHL rate limits (~100/10s); exponential backoff on 429.
- **Phuglee brand:** ops war-room UI; no marketing SaaS chrome; no live claim when flag off.
- **Tests required** for policy + live gate before any send path lands.

## File map

| Path | Responsibility |
|------|----------------|
| `lib/campaigns/sms-policy.js` | Constants: spacing, max, tags, exclusions, from-number map, class map |
| `lib/campaigns/sms-messages.js` | 12 message templates (draft; approved before go-live) |
| `lib/campaigns/sms-tags.js` | Normalize/match suppress + class + source tags |
| `lib/campaigns/sms-eligibility.js` | Pure functions: isExcluded, cooldownOk, nextTouch |
| `lib/campaigns/sms-ghl.js` | GHL search by tags, open DTS check, upsert contact, field/tag updates |
| `lib/campaigns/sms-kpis.js` | Aggregate KPI counts from GHL (+ run log) |
| `lib/campaigns/sms-send.js` | Dry-run + live send orchestration |
| `lib/campaigns/sms-store.js` | Runs index, auto-state, lead→contact map, queue |
| `lib/campaigns/sms-sync.js` | Vault lead → GHL upsert |
| `lib/campaigns/api.js` | HTTP router for `/api/admin/campaigns/sms/*` |
| `public/campaigns-sms.html` | Admin page shell |
| `public/css/campaigns-sms.css` | Page styles (tokens / vault desk) |
| `public/js/campaigns-sms.js` | Client: KPIs, preview, dry-run, gated send UI |
| `public/js/shell-nav.js` | Campaigns section (admin) |
| `public/js/command-palette.js` | Jump entry adminOnly |
| `public/js/auth-guard.js` | Deny non-admin path |
| `lib/phuglee-roles.js` | Deny `/campaigns/sms` for dispos/vault-only |
| `server.js` | Route mount + static page |
| `data/campaigns/sms/` | Runtime data (gitignored if secrets/large; keep `.gitkeep`) |
| `tests/campaigns-sms-*.test.js` | Policy, eligibility, API gates, dry-run |

---

### Task 1: Policy + eligibility pure module (TDD)

**Files:**
- Create: `lib/campaigns/sms-policy.js`
- Create: `lib/campaigns/sms-tags.js`
- Create: `lib/campaigns/sms-eligibility.js`
- Create: `tests/campaigns-sms-eligibility.test.js`

**Interfaces:**
- Produces:
  - `SMS_SPACING_MS` = 4 * 24 * 60 * 60 * 1000
  - `SMS_HARD_MIN_MS` = 24 * 60 * 60 * 1000
  - `SMS_MAX_TOUCHES` = 12
  - `SOURCE_TAG` = `'code violation'`
  - `FROM_BY_STATE`, `FALLBACK_BY_STATE` (copy from existing drip scripts)
  - `classTagForLeadType(leadType) → string|null`
  - `normalizeTag(t) → string`
  - `contactHasSuppressTag(tags) → boolean`
  - `isCooldownOk(lastSmsAt, now, { hardMinOnly }) → boolean`
  - `isAtMax(smsCount) → boolean`
  - `evaluateContactEligibility({ tags, dndSms, hasOpenDts, smsCount, lastSmsAt, hasPhone, now }) → { ok, reason }`

- [ ] **Step 1: Write failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateContactEligibility,
  classTagForLeadType,
  SMS_MAX_TOUCHES
} = require('../lib/campaigns/sms-eligibility');
// re-export policy from eligibility or import policy in tests

test('classTagForLeadType maps lead types', () => {
  assert.equal(classTagForLeadType('distressed'), 'class:distressed');
  assert.equal(classTagForLeadType('well_maintained'), 'class:well maintained');
  assert.equal(classTagForLeadType('land'), 'class:land');
});

test('suppress: not interested blocks', () => {
  const r = evaluateContactEligibility({
    tags: ['code violation', 'not interested'],
    dndSms: false,
    hasOpenDts: false,
    smsCount: 0,
    lastSmsAt: null,
    hasPhone: true,
    now: Date.now()
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not interested/i);
});

test('open DTS blocks', () => {
  const r = evaluateContactEligibility({
    tags: ['code violation'],
    dndSms: false,
    hasOpenDts: true,
    smsCount: 2,
    lastSmsAt: null,
    hasPhone: true,
    now: Date.now()
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /dts/i);
});

test('cooldown 4 days', () => {
  const now = Date.parse('2026-07-23T12:00:00Z');
  const recent = new Date(now - 2 * 86400000).toISOString();
  const r = evaluateContactEligibility({
    tags: ['code violation'],
    dndSms: false,
    hasOpenDts: false,
    smsCount: 1,
    lastSmsAt: recent,
    hasPhone: true,
    now
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooldown|spacing|4 day/i);
});

test('max 12 blocks', () => {
  const r = evaluateContactEligibility({
    tags: ['code violation'],
    dndSms: false,
    hasOpenDts: false,
    smsCount: SMS_MAX_TOUCHES,
    lastSmsAt: null,
    hasPhone: true,
    now: Date.now()
  });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run tests — expect FAIL** (module missing)

```bash
cd C:\Users\brand\Projects\distress-os
node --test tests/campaigns-sms-eligibility.test.js
```

- [ ] **Step 3: Implement policy, tags, eligibility**

`sms-policy.js` — export spacing constants, max, source tag, FROM maps, `classTagForLeadType`, `resolveFromNumber(state)`.

`sms-tags.js` — suppress matchers for: wrong number, not interested, dnc, dnd, interested, follow up (normalize: lower, strip punctuation).

`sms-eligibility.js` — pure `evaluateContactEligibility` as in interface; export classTag from policy.

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test tests/campaigns-sms-eligibility.test.js
```

- [ ] **Step 5: Commit**

```bash
git add lib/campaigns/sms-policy.js lib/campaigns/sms-tags.js lib/campaigns/sms-eligibility.js tests/campaigns-sms-eligibility.test.js
git commit -m "feat(campaigns): SMS policy and eligibility rules"
```

---

### Task 2: Message bank + live flags helper

**Files:**
- Create: `lib/campaigns/sms-messages.js`
- Create: `lib/campaigns/sms-flags.js`
- Create: `tests/campaigns-sms-messages.test.js`

**Interfaces:**
- Produces:
  - `getMessageTemplate(touch1to12) → { id, body }`
  - `renderMessage(touch, { firstName, street, city }) → string` (≤160 prefer)
  - `isSmsCampaignsLive() → boolean` from `process.env.SMS_CAMPAIGNS_LIVE`
  - `isSmsCampaignsAuto() → boolean` from `process.env.SMS_CAMPAIGNS_AUTO`

- [ ] **Step 1: Write tests** for touch 1–12 exist, render substitutes name/street, touch 0 or 13 throws, live defaults false when env unset.

- [ ] **Step 2: Implement 12 draft templates** (Ginn-safe: no shame openers). Touch 1:

```text
Hey {first}, my name is Brandon. I'm looking to buy in the area — would you sell {street}?
```

(Remaining touches: soft variants; mark file header `// DRAFT — human approve before LIVE`.)

- [ ] **Step 3: Run tests PASS; commit**

```bash
git commit -m "feat(campaigns): SMS message bank and live flags"
```

---

### Task 3: File store (runs, queue, map, auto-state)

**Files:**
- Create: `lib/campaigns/sms-store.js`
- Create: `data/campaigns/sms/.gitkeep`
- Create: `tests/campaigns-sms-store.test.js`
- Modify: `.gitignore` if needed to ignore `data/campaigns/sms/runs/*` but keep gitkeep

**Interfaces:**
- Produces:
  - `appendRun(summary) → runId`
  - `listRuns({ limit }) → RunSummary[]`
  - `getAutoState() / setAutoState(patch)`
  - `enqueueSync(leadId) / dequeueSyncBatch(n) / markSyncDone(leadId, result)`
  - `setContactMap(leadId, contactId) / getContactMap(leadId)`

Use `lib/write-json-atomic.js` if present.

- [ ] **Step 1: Failing tests** with temp dir via `process.env.CAMPAIGNS_SMS_DATA_ROOT`

- [ ] **Step 2: Implement store**

- [ ] **Step 3: Tests PASS; commit**

```bash
git commit -m "feat(campaigns): SMS run log and sync queue store"
```

---

### Task 4: GHL helpers (search, DTS open, upsert, KPIs)

**Files:**
- Create: `lib/campaigns/sms-ghl.js`
- Create: `lib/campaigns/sms-kpis.js`
- Create: `tests/campaigns-sms-ghl.test.js` (mock `ghl-client` / inject fetch)

**Interfaces:**
- Consumes: `lib/leads-platform/ghl-client.js` (`api`, `searchContacts`, `addContactTags`, `sendSms`, `findDtsPipeline`, `searchOpportunities`, `toE164Us`, …)
- Produces:
  - `searchContactsByTag(tag, { pageLimit, searchAfter })` using `POST /contacts/search` filters
  - `contactHasOpenDts(contactId) → boolean`
  - `upsertVaultLeadContact(lead) → { contactId, created, reused }`
  - `readSmsCount(contact) → number`
  - `writeSmsState(contactId, { smsCount, lastSmsAt, campaignId })`
  - `fetchOutcomeKpis() → { interested, notInterested, dncDnd, wrongNumber, followUp }`
  - `fetchFunnelKpis() → { neverTexted, inSequence, atMax, eligibleNow }` (eligible may be approximate: neverTexted + cooldown-ok subset computed in send module)

**Notes:**
- Tag filters: reuse pattern from `scripts/_tmp-drip-blast-unique4.js` (`filters: [{ field: 'tags', operator: 'contains', value }]`, `searchAfter` pagination).
- DTS: `findDtsPipeline()` then `searchOpportunities({ contactId, status: 'open', pipelineId })`.
- Upsert: prefer `POST /contacts/upsert` if available with locationId; else search phone → create/update. Always add tags via `addContactTags` (do not wipe tags).
- KPI counts: paginate with care; cache in memory for 60s on overview endpoint to reduce 429s.

- [ ] **Step 1: Unit tests with mocked api()** for tag page parse + suppress detection + sms count parse

- [ ] **Step 2: Implement sms-ghl + sms-kpis**

- [ ] **Step 3: Tests PASS; commit**

```bash
git commit -m "feat(campaigns): GHL search, upsert, and SMS KPIs"
```

---

### Task 5: Dry-run + send engine (live gated)

**Files:**
- Create: `lib/campaigns/sms-send.js`
- Create: `tests/campaigns-sms-send.test.js`

**Interfaces:**
- Produces:
  - `async planSend({ touch, limit }) → { touch, candidates, excluded[], wouldSend[] }`
  - `async executeSend({ touch, limit, dryRun, confirm }) → RunSummary`
- Rules:
  - `touch` is current `sms_count` to target (0 = never texted); after send becomes touch+1
  - If `!dryRun && !isSmsCampaignsLive()` → throw `LIVE_DISABLED`
  - If `!dryRun && confirm !== 'SEND'` → throw `CONFIRM_REQUIRED`
  - Dry-run must **never** call `ghl.sendSms`

- [ ] **Step 1: Tests**
  - dry-run does not call sendSms
  - live without flag throws
  - live without confirm throws
  - exclusion removes NI / DTS

- [ ] **Step 2: Implement** pacing loop (default `DRIP_MS=2500`), fromNumber via policy, message via `renderMessage(touch+1, …)`, on success update fields/tags + append run

- [ ] **Step 3: Tests PASS; commit**

```bash
git commit -m "feat(campaigns): SMS dry-run and gated send engine"
```

---

### Task 6: Vault → GHL sync

**Files:**
- Create: `lib/campaigns/sms-sync.js`
- Create: `tests/campaigns-sms-sync.test.js`
- Modify: vault publish path — find where leads become approved/active:
  - `lib/leads-platform/publish.js` and/or
  - `lib/leads-platform/api.js` publish/sync handlers
- Prefer: after successful `upsertLead` when `reviewStatus === 'approved'` and catalog active, call `enqueueSync(leadId)` only (non-blocking)

**Interfaces:**
- Produces: `async syncLeadById(leadId) → result`, `async processSyncQueue({ max }) → stats`

- [ ] **Step 1: Test enqueue + sync maps tags `code violation` + class tag**

- [ ] **Step 2: Implement sync from `getLead` + `upsertVaultLeadContact`

- [ ] **Step 3: Wire enqueue into publish (no await of GHL in request path)

- [ ] **Step 4: Optional in-process interval in server or first admin overview call processes queue (max 20)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(campaigns): enqueue vault leads for GHL SMS sync"
```

---

### Task 7: Admin HTTP API

**Files:**
- Create: `lib/campaigns/api.js`
- Create: `tests/campaigns-sms-api.test.js`
- Modify: `server.js` — mount:

```js
if (pathname.startsWith('/api/admin/campaigns/sms')) {
  const handled = await getCampaignsSmsApi().handle(req, res, pathname, url);
  if (handled) return;
}
```

**Interfaces:**
- Consumes: operating-costs style admin auth — reuse `requireAdmin` pattern from `lib/operating-costs/api.js` or `lib/bridge-api.js`
- Routes:
  - `GET .../overview` → flags + policy + kpis + autoState + queueDepth
  - `GET .../eligible?touch=0&sample=10`
  - `POST .../dry-run` JSON `{ touch, limit? }`
  - `POST .../send` JSON `{ touch, limit?, confirm }`
  - `GET .../runs?limit=20`
  - `GET .../auto` / `POST .../auto` `{ enabled }` (POST requires LIVE)

- [ ] **Step 1: Tests with mock req/res** — non-admin 403; dry-run 200; send when live false → 409

- [ ] **Step 2: Implement router**

- [ ] **Step 3: Wire server.js**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(campaigns): admin SMS campaigns API"
```

---

### Task 8: Roles, auth-guard, shell nav, command palette

**Files:**
- Modify: `lib/phuglee-roles.js` — add `/campaigns/sms` to `DISPOS_DENIED_PATHS` (and ensure vault-only cannot access)
- Modify: `public/js/auth-guard.js` — deny non-admin for `/campaigns/sms`
- Modify: `public/js/shell-nav.js`:
  - `CAMPAIGN_LINKS = [{ id: 'campaigns-sms', label: 'SMS', href: '/campaigns/sms' }]`
  - Admin-only section **Campaigns** in `buildNav`
  - `activeId` + `pageTitleFor` + icon
- Modify: `public/js/command-palette.js` — adminOnly command Campaigns SMS
- Modify: any role tests that snapshot denied paths

- [ ] **Step 1: Update roles + guard**

- [ ] **Step 2: Add rail section only when `isAdminUser()`

- [ ] **Step 3: Bump shell-nav cache query if pages hardcode `?v=`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(campaigns): admin nav Campaigns → SMS"
```

---

### Task 9: Admin page UI (track + buttons, no live without flag)

**Files:**
- Create: `public/campaigns-sms.html`
- Create: `public/css/campaigns-sms.css`
- Create: `public/js/campaigns-sms.js`
- Modify: `server.js` static route if needed (usually public/ is enough for `/campaigns-sms.html`; prefer clean path `/campaigns/sms` via rewrite or dedicated HTML at that path)

**Path serving:** Prefer `public/campaigns/sms.html` **or** server rewrite:

```js
if (pathname === '/campaigns/sms') {
  // serve public/campaigns-sms.html
}
```

**UI requirements:**
- Gate for non-admin (like `operating-costs.html` `#oc-gate`)
- Badge: `DRY MODE` when live false; `LIVE` when true
- KPI tiles: Interested, Not interested, DNC/DND, Wrong number, Follow up, Eligible, Never texted (0), In sequence, At max (12)
- Policy card: 4 days, max 12, exclusions list
- Controls: touch number input (0–11), Preview, Dry-run, Send (disabled + tooltip if !live)
- Auto toggle disabled if !live
- Confirm modal: type `SEND` for live
- Run history table
- Use existing classes: `phuglee-btn`, `vault-title`, shell-bundle

- [ ] **Step 1: Scaffold HTML/CSS/JS** reading `GET /api/admin/campaigns/sms/overview`

- [ ] **Step 2: Wire dry-run → show wouldSend count**

- [ ] **Step 3: Wire send only if overview.live === true**

- [ ] **Step 4: Manual browser check as admin + non-admin

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(campaigns): admin SMS campaigns page"
```

---

### Task 10: Auto sequence tick (Option B, fully gated)

**Files:**
- Create: `lib/campaigns/sms-auto.js`
- Modify: `lib/campaigns/api.js` auto endpoints
- Modify: `server.js` optional `setInterval` every 5–10 min **only if** LIVE && AUTO && autoState.enabled

**Behavior:**
- For each touch 0..11, find contacts with that count who pass eligibility; send next message
- Cap per tick (e.g. 50) to control rate
- Write run with `mode: 'auto'`
- If !LIVE, interval no-ops

- [ ] **Step 1: Test auto refuses when LIVE false**

- [ ] **Step 2: Implement tick**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(campaigns): gated SMS auto sequence tick"
```

---

### Task 11: Docs + go-live checklist + AGENTS note

**Files:**
- Create: `docs/campaigns/SMS-GO-LIVE.md` — human checklist (custom fields, approve messages, pilot 5, set env)
- Modify: `AGENTS.md` — short pointer: Campaigns SMS admin, never claim live without flag
- Modify: design spec if field IDs discovered during implement

- [ ] **Step 1: Write go-live doc**

- [ ] **Step 2: Commit**

```bash
git commit -m "docs(campaigns): SMS go-live checklist"
```

---

### Task 12: Verification pass

- [ ] **Step 1: Run unit suite**

```bash
cd C:\Users\brand\Projects\distress-os
node --test tests/campaigns-sms-eligibility.test.js tests/campaigns-sms-messages.test.js tests/campaigns-sms-store.test.js tests/campaigns-sms-ghl.test.js tests/campaigns-sms-send.test.js tests/campaigns-sms-sync.test.js tests/campaigns-sms-api.test.js
```

Expected: all PASS

- [ ] **Step 2: Confirm LIVE default**

```bash
node -e "delete process.env.SMS_CAMPAIGNS_LIVE; console.log(require('./lib/campaigns/sms-flags').isSmsCampaignsLive())"
```

Expected: `false`

- [ ] **Step 3: Admin page loads locally** (`scripts/verify-live.ps1` after public edits per AGENTS.md)

- [ ] **Step 4: Final commit if fixes needed**

---

## Implementation order (summary)

1. Policy/eligibility  
2. Messages/flags  
3. Store  
4. GHL/KPIs  
5. Send dry-run  
6. Vault sync  
7. API  
8. Nav/auth  
9. UI  
10. Auto (gated)  
11. Docs  
12. Verify  

## Explicit non-actions until go-live

- Do not set `SMS_CAMPAIGNS_LIVE=true` in production without CEO OK  
- Do not enroll real contacts into auto  
- Do not send pilot without written message approval  
- Do not remove dry-run or confirm gates  

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Admin Campaigns → SMS page | 8, 9 |
| KPIs interested / NI / DNC-DND / wrong / follow up | 4, 9 |
| Funnel KPIs | 4, 9 |
| code violation + class tags on sync | 4, 6 |
| 4-day spacing, max 12, exclusions | 1, 5 |
| Option B auto every 4 days | 10 |
| Live off by default | 2, 5, 7 |
| Dry-run / preview buttons | 5, 7, 9 |
| Vault publish enqueue | 6 |
| Local from numbers | 1, 5 |
| Run history | 3, 9 |
| Go-live checklist | 11 |

## Placeholder scan

No TBD steps. Message bank is draft but file is required; go-live doc requires human approval of copy before LIVE.

---

## Execution handoff

Plan complete and saved to:

- **Spec:** `docs/superpowers/specs/2026-07-23-campaigns-sms-design.md`  
- **Plan:** `docs/superpowers/plans/2026-07-23-campaigns-sms.md`  

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

**Which approach?**  

Reminder: implementing the plan still does **not** send live SMS until you later set the live flag and explicitly confirm a send.
