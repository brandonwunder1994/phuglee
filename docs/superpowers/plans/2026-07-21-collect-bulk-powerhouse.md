# Collect Bulk Request Powerhouse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/collect` the bulk request powerhouse: lane counts, fire queues (email-only + PDF drip), PDF needs-fill intake, portal walkthrough, and a single sent/returned tracker — without breaking Form Forge accuracy.

**Architecture:** Hybrid 2→3 strangler. Collect is the only operator surface. Form Forge stays the engine (Gmail, PDF fill, cooldowns, `submission-log`, pending queue builders). Phase 1 wraps existing queues behind Collect. Phase 2+ moves fire-queue UI onto Collect while calling forge send APIs only. Filter remains the place “came back” is recorded (`responseReceivedAt` → forge `response_at`).

**Tech Stack:** Vanilla JS (IIFE) on Distress OS `:3000`; Form Forge Flask under `/forge` proxy; Node `node --test` for pure JS; pytest under `modules/form-forge/tests` for engine parity; `scripts/verify-live.ps1` after UI changes.

**Spec:** `docs/superpowers/specs/2026-07-21-collect-bulk-powerhouse-design.md` (approved)

## Global Constraints

- Never wipe: `modules/form-forge/data/`, `modules/form-forge/forms/`, `data/filter-lists/`, bridge brain, analyzer users.
- Collect must **not** implement a second Gmail client; only call existing forge endpoints:
  - `GET /forge/api/portal/pending-email-only-requests`
  - `GET /forge/api/portal/pending-pdf-requests`
  - `GET /forge/api/portal/pending-online-requests`
  - `GET /forge/api/portal/kpi`
  - `POST /forge/api/portal/city/<id>/send-email-only`
  - `POST /forge/api/portal/city/<id>/send-email`
  - `POST /forge/api/portal/city/<id>/submit`
- v1 bulk lanes = **code_violation** channel only (water shutoff out of bulk UI).
- Fire queue pattern **B**: list eligible → default checked → confirm → drip send.
- Ship-gate after site edits: from project root  
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` must exit 0.
- Do not claim “Form Forge is gone” until Phase 5; engine stays.

## File map (by responsibility)

| Path | Role |
|------|------|
| `public/collect.html` | Collect desk markup (lanes, tracker strip, secondary wizard) |
| `public/js/collect-records.js` | Wizard (keep secondary) + lane bootstrap |
| `public/js/collect-lanes.js` | **New** — fetch pending queues, compute lane counts, render desk |
| `public/js/collect-fire-queue.js` | **New Phase 2** — fire queue UI + drip orchestration |
| `public/js/collect-tracker.js` | **New Phase 4** — sent/returned desk |
| `public/css/distress-collect-hub.css` | Desk layout tokens/layout |
| `public/css/collect-records.css` | Wizard + queue table styles |
| `tests/collect-lanes.test.js` | **New** — pure helpers for counts / eligibility summary |
| `modules/form-forge/review_portal/static/*` | Engine UIs; add return-to-Collect chrome only |
| `modules/form-forge/review_portal/submission_tracker.py` | Pending queues (reuse; extend only if needs-fill count missing) |
| `public/js/shell-nav.js` | After Phase 1: bulk forge links secondary / admin |

---

# PHASE 1 — Collect command center

**Outcome:** Operator starts bulk work from `/collect` with live lane counts and one-click open of the correct existing forge queues. Strong return path to Collect. Wizard is secondary.

### Task 1: Pure lane-summary helpers + tests

**Files:**
- Create: `public/js/collect-lanes.js` (Node-exportable helpers at bottom)
- Create: `tests/collect-lanes.test.js`

**Interfaces:**
- Produces:
  - `summarizePendingQueue(payload) -> { ready: number, blocked: number, sentThisMonth: number, monthLabel: string }`
  - `buildLaneModel({ emailOnly, pdf, online, kpi }) -> { lanes: Array<Lane>, tracker: TrackerStrip }`
  - Lane shape: `{ id, label, ready, blocked, sentThisMonth, href, ctaLabel }`
  - Tracker shape: `{ monthLabel, emailPdf, emailOnly, onlinePortal, total }` from kpi current month when available
- Consumes: forge pending queue JSON (`total_pending`, `total_blocked`, `total_sent_this_month`, `current_month_label`, `items`, `blocked`) and kpi JSON from `GET /forge/api/portal/kpi`

- [ ] **Step 1: Write failing tests**

Create `tests/collect-lanes.test.js`:

```js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

// Load as CJS: collect-lanes.js must set module.exports when typeof module !== 'undefined'
const lanes = require('../public/js/collect-lanes.js');

describe('summarizePendingQueue', () => {
  it('reads forge pending-pdf shape', () => {
    const s = lanes.summarizePendingQueue({
      current_month_label: 'July 2026',
      total_pending: 12,
      total_blocked: 3,
      total_sent_this_month: 40,
      items: new Array(12).fill({}),
      blocked: new Array(3).fill({})
    });
    assert.equal(s.ready, 12);
    assert.equal(s.blocked, 3);
    assert.equal(s.sentThisMonth, 40);
    assert.equal(s.monthLabel, 'July 2026');
  });

  it('handles empty/missing payload', () => {
    const s = lanes.summarizePendingQueue(null);
    assert.equal(s.ready, 0);
    assert.equal(s.blocked, 0);
    assert.equal(s.sentThisMonth, 0);
  });
});

describe('buildLaneModel', () => {
  it('builds four bulk lanes with forge hrefs and returnTo', () => {
    const model = lanes.buildLaneModel({
      emailOnly: { total_pending: 5, total_blocked: 1, total_sent_this_month: 2, current_month_label: 'July 2026' },
      pdf: { total_pending: 20, total_blocked: 4, total_sent_this_month: 50, current_month_label: 'July 2026' },
      online: { total_pending: 8, total_blocked: 2, total_sent_this_month: 10, current_month_label: 'July 2026' },
      kpi: null
    });
    assert.equal(model.lanes.length, 4);
    const ids = model.lanes.map((l) => l.id);
    assert.deepEqual(ids, ['email_only', 'pdf_ready', 'pdf_needs_fill', 'portal']);
    assert.equal(model.lanes[0].ready, 5);
    assert.equal(model.lanes[1].ready, 20);
    assert.equal(model.lanes[3].ready, 8);
    assert.ok(model.lanes[0].href.includes('/forge/portal/email-only'));
    assert.ok(model.lanes[0].href.includes('returnTo=collect'));
    assert.ok(model.lanes[1].href.includes('request-pdfs'));
    assert.ok(model.lanes[3].href.includes('submit-portals'));
  });

  it('pdf_needs_fill uses blocked-without-ready heuristic until Phase 3 API exists', () => {
    // Phase 1: needs-fill count may be 0 or derived; assert field exists and is non-negative
    const model = lanes.buildLaneModel({
      emailOnly: { total_pending: 0, total_blocked: 0, total_sent_this_month: 0 },
      pdf: { total_pending: 1, total_blocked: 0, total_sent_this_month: 0 },
      online: { total_pending: 0, total_blocked: 0, total_sent_this_month: 0 },
      needsFillCount: 7
    });
    const fill = model.lanes.find((l) => l.id === 'pdf_needs_fill');
    assert.equal(fill.ready, 7);
    assert.ok(fill.href.includes('/forge/'));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
cd C:\Users\brand\Projects\distress-os
node --test tests/collect-lanes.test.js
```

Expected: FAIL (module missing or exports missing).

- [ ] **Step 3: Implement helpers in `public/js/collect-lanes.js`**

```js
(function (root) {
  'use strict';

  function summarizePendingQueue(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ready: 0, blocked: 0, sentThisMonth: 0, monthLabel: '' };
    }
    return {
      ready: Number(payload.total_pending) || 0,
      blocked: Number(payload.total_blocked) || 0,
      sentThisMonth: Number(payload.total_sent_this_month) || 0,
      monthLabel: String(payload.current_month_label || '')
    };
  }

  function withReturnTo(path) {
    const base = path.indexOf('?') >= 0 ? path + '&' : path + '?';
    return base + 'returnTo=collect';
  }

  /**
   * @param {object} input
   * @param {object} input.emailOnly
   * @param {object} input.pdf
   * @param {object} input.online
   * @param {object|null} [input.kpi]
   * @param {number} [input.needsFillCount] Phase 1 may pass 0; Phase 3 supplies real count
   */
  function buildLaneModel(input) {
    const email = summarizePendingQueue(input && input.emailOnly);
    const pdf = summarizePendingQueue(input && input.pdf);
    const online = summarizePendingQueue(input && input.online);
    const needsFill = Math.max(0, Number(input && input.needsFillCount) || 0);

    const lanes = [
      {
        id: 'email_only',
        label: 'Email-only',
        ready: email.ready,
        blocked: email.blocked,
        sentThisMonth: email.sentThisMonth,
        href: withReturnTo('/forge/portal/email-only'),
        ctaLabel: 'Open email queue'
      },
      {
        id: 'pdf_ready',
        label: 'PDF ready',
        ready: pdf.ready,
        blocked: pdf.blocked,
        sentThisMonth: pdf.sentThisMonth,
        href: withReturnTo('/forge/portal/request-pdfs'),
        ctaLabel: 'Open PDF send queue'
      },
      {
        id: 'pdf_needs_fill',
        label: 'PDF needs fill',
        ready: needsFill,
        blocked: 0,
        sentThisMonth: 0,
        href: withReturnTo('/forge/'),
        ctaLabel: 'Open PDF filler'
      },
      {
        id: 'portal',
        label: 'Portals',
        ready: online.ready,
        blocked: online.blocked,
        sentThisMonth: online.sentThisMonth,
        href: withReturnTo('/forge/portal/submit-portals'),
        ctaLabel: 'Open portal queue'
      }
    ];

    const monthLabel = email.monthLabel || pdf.monthLabel || online.monthLabel || '';
    let tracker = {
      monthLabel,
      emailPdf: pdf.sentThisMonth,
      emailOnly: email.sentThisMonth,
      onlinePortal: online.sentThisMonth,
      total: pdf.sentThisMonth + email.sentThisMonth + online.sentThisMonth,
      href: withReturnTo('/forge/portal')
    };

    // Prefer KPI monthly bucket when present (shape from build_submission_kpi)
    const kpi = input && input.kpi;
    if (kpi && kpi.months && kpi.months[0] && kpi.months[0].counts) {
      const c = kpi.months[0].counts;
      tracker = {
        monthLabel: kpi.months[0].label || monthLabel,
        emailPdf: Number(c.email_pdf) || 0,
        emailOnly: Number(c.email_only) || 0,
        onlinePortal: Number(c.online_portal) || 0,
        total: Number(c.total) || 0,
        href: withReturnTo('/forge/portal')
      };
    }

    return { lanes, tracker };
  }

  const api = { summarizePendingQueue, buildLaneModel, withReturnTo };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PhugleeCollectLanes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
node --test tests/collect-lanes.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add public/js/collect-lanes.js tests/collect-lanes.test.js
git commit -m "feat(collect): lane summary helpers for bulk command center"
```

---

### Task 2: Collect HTML — bulk desk markup

**Files:**
- Modify: `public/collect.html`

**Interfaces:**
- Consumes: none (static markup + ids for `collect-lanes` / `collect-records`)
- Produces: DOM ids `collect-lanes-root`, `collect-tracker-strip`, `collect-secondary-details`, keep wizard dialog intact

- [ ] **Step 1: Replace primary hub body** (keep wizard `<dialog>` and scripts)

Inside `.collect-hub`, replace the current single “Start a batch” desk with:

```html
<header class="collect-hub-hero" data-phuglee-reveal-child>
  <h1 class="collect-hub-title">Request</h1>
  <p class="collect-hub-lead">Bulk public-records requests — email-only, filled PDFs, and portals. One desk.</p>
</header>

<section class="collect-lanes" id="collect-lanes-root" aria-label="Bulk request lanes" data-phuglee-reveal-child>
  <p class="collect-lanes-loading" id="collect-lanes-status" role="status">Loading queues…</p>
  <!-- collect-lanes.js renders .collect-lane cards here -->
</section>

<aside class="collect-tracker-strip phuglee-panel" id="collect-tracker-strip" data-phuglee-reveal-child aria-label="This month">
  <p class="collect-tracker-strip-title">Sent this month</p>
  <p class="collect-tracker-strip-body" id="collect-tracker-strip-body">—</p>
  <a class="collect-tracker-strip-link" id="collect-tracker-strip-link" href="/forge/portal?returnTo=collect">Open tracker</a>
</aside>

<details class="collect-secondary" id="collect-secondary-details" data-phuglee-reveal-child>
  <summary>Single batch / custom cities</summary>
  <p class="collect-secondary-desc">Pick specific cities and a workflow (secondary path).</p>
  <button type="button" class="phuglee-btn phuglee-btn-secondary" id="btn-start-requests">Start custom batch</button>
</details>

<aside class="collect-desk-side collect-desk-side--row" data-phuglee-reveal-child>
  <a href="/government-lists" class="collect-desk-tracker">…phonebook…</a>
  <a href="/pre-liens" class="collect-desk-tracker">…pre-liens…</a>
</aside>

<p class="collect-hub-trust">Public records only · Send via your Gmail through Form Forge engine</p>
```

Keep the existing `start-requests-dialog` wizard markup unchanged below.

- [ ] **Step 2: Script tags** — after auth, before `collect-records.js`:

```html
<script src="/js/collect-lanes.js?v=1" defer></script>
<script src="/js/collect-records.js?v=6" defer></script>
```

Bump CSS `?v=` on collect styles by 1.

- [ ] **Step 3: Manual open** `http://127.0.0.1:3000/collect` (auth) — page loads, no JS errors, wizard still openable via secondary button.

- [ ] **Step 4: Commit**

```powershell
git add public/collect.html
git commit -m "feat(collect): bulk lane desk markup (Phase 1 shell)"
```

---

### Task 3: Wire lane fetch + render + CSS

**Files:**
- Modify: `public/js/collect-lanes.js` (add `bootCollectLanes` DOM binding)
- Modify: `public/css/distress-collect-hub.css`
- Modify: `public/js/collect-records.js` only if needed so wizard still binds `#btn-start-requests`

**Interfaces:**
- Produces: `bootCollectLanes({ fetchImpl })` called on `DOMContentLoaded`
- Fetches (parallel):
  - `GET /forge/api/portal/pending-email-only-requests`
  - `GET /forge/api/portal/pending-pdf-requests`
  - `GET /forge/api/portal/pending-online-requests`
  - `GET /forge/api/portal/kpi` (optional; ignore failure)

- [ ] **Step 1: Add bootstrap** at end of `collect-lanes.js` (browser only):

```js
async function fetchJson(url, fetchImpl) {
  const f = fetchImpl || fetch;
  const res = await f(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error(url + ' ' + res.status);
  return res.json();
}

async function loadLaneModel(fetchImpl) {
  const f = fetchImpl || fetch;
  const [emailOnly, pdf, online, kpi] = await Promise.all([
    fetchJson('/forge/api/portal/pending-email-only-requests', f).catch(() => null),
    fetchJson('/forge/api/portal/pending-pdf-requests', f).catch(() => null),
    fetchJson('/forge/api/portal/pending-online-requests', f).catch(() => null),
    fetchJson('/forge/api/portal/kpi', f).catch(() => null)
  ]);
  return buildLaneModel({ emailOnly, pdf, online, kpi, needsFillCount: 0 });
}

function renderLanes(root, model) {
  if (!root) return;
  root.innerHTML = model.lanes
    .map(function (lane) {
      return (
        '<article class="collect-lane phuglee-panel" data-lane="' +
        lane.id +
        '">' +
        '<h2 class="collect-lane-title">' +
        escapeHtml(lane.label) +
        '</h2>' +
        '<p class="collect-lane-count"><strong>' +
        lane.ready +
        '</strong> ready' +
        (lane.blocked ? ' · ' + lane.blocked + ' blocked' : '') +
        '</p>' +
        '<p class="collect-lane-sent">' +
        lane.sentThisMonth +
        ' sent this month</p>' +
        '<a class="phuglee-btn phuglee-btn-primary collect-lane-cta" href="' +
        escapeHtml(lane.href) +
        '">' +
        escapeHtml(lane.ctaLabel) +
        '</a>' +
        '</article>'
      );
    })
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function bootCollectLanes(opts) {
  const root = document.getElementById('collect-lanes-root');
  const status = document.getElementById('collect-lanes-status');
  const stripBody = document.getElementById('collect-tracker-strip-body');
  const stripLink = document.getElementById('collect-tracker-strip-link');
  if (!root) return;
  try {
    const model = await loadLaneModel(opts && opts.fetchImpl);
    if (status) status.remove();
    renderLanes(root, model);
    if (stripBody) {
      stripBody.textContent =
        model.tracker.total +
        ' total · PDF ' +
        model.tracker.emailPdf +
        ' · Email ' +
        model.tracker.emailOnly +
        ' · Portal ' +
        model.tracker.onlinePortal +
        (model.tracker.monthLabel ? ' · ' + model.tracker.monthLabel : '');
    }
    if (stripLink) stripLink.href = model.tracker.href;
  } catch (err) {
    if (status) {
      status.textContent =
        'Could not load Form Forge queues. Is Distress OS + Form Forge running? You can still use custom batch below.';
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bootCollectLanes();
    });
  } else {
    bootCollectLanes();
  }
}

// export boot for tests if needed
api.loadLaneModel = loadLaneModel;
api.bootCollectLanes = bootCollectLanes;
api.renderLanes = renderLanes;
```

Ensure `api` object is updated before `module.exports`.

- [ ] **Step 2: CSS** — dense 2×2 lane grid on desktop, stack on mobile; primary CTA large; no marketing void center. Reuse Phuglee panel tokens already on page.

- [ ] **Step 3: Confirm wizard** — `collect-records.js` still finds `#btn-start-requests` inside `<details>`.

- [ ] **Step 4: Run unit tests + verify-live**

```powershell
node --test tests/collect-lanes.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Expected: tests PASS; verify-live exit 0.

- [ ] **Step 5: Commit**

```powershell
git add public/js/collect-lanes.js public/css/distress-collect-hub.css public/collect.html
git commit -m "feat(collect): live bulk lane counts from forge pending queues"
```

---

### Task 4: Return-to-Collect chrome on Form Forge workflow pages

**Files:**
- Modify: `modules/form-forge/review_portal/static/portal-shared.js` (preferred shared helper)
- Modify if needed: `email-only-requests.html`, `request-pdfs.html`, `submit-portals.html`, `portal.html`, `index.html`

**Interfaces:**
- Produces: if `URLSearchParams` has `returnTo=collect`, inject sticky bar:  
  `← Request` linking to `/collect`

- [ ] **Step 1: Add helper** in `portal-shared.js` (or small inline if shared not loaded everywhere):

```js
function injectReturnToCollect() {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('returnTo') !== 'collect') return;
    if (document.getElementById('forge-return-collect')) return;
    var bar = document.createElement('div');
    bar.id = 'forge-return-collect';
    bar.className = 'forge-return-collect';
    bar.innerHTML = '<a href="/collect">← Request</a><span>Bulk desk · Form Forge engine</span>';
    document.body.insertBefore(bar, document.body.firstChild);
  } catch (e) { /* ignore */ }
}
```

Call on DOM ready from each of: email-only, request-pdfs, submit-portals, portal tracker, forge index.

- [ ] **Step 2: Minimal CSS** for `.forge-return-collect` (full-width bar, cream/ember link, safe under existing forge tokens).

- [ ] **Step 3: Manual check** — open `/forge/portal/request-pdfs?returnTo=collect` → bar visible; without param → no bar.

- [ ] **Step 4: Commit**

```powershell
git add modules/form-forge/review_portal/static/
git commit -m "feat(forge): return-to-Collect bar when opened from Request desk"
```

---

### Task 5: Phase 1 ship-gate + nav note

**Files:**
- Optionally modify: `public/js/shell-nav.js` — leave FORGE_LINKS for now (Phase 5 retires); optional comment that bulk entry is Collect.

- [ ] **Step 1: Smoke checklist (manual)**
  1. `/collect` shows 4 lanes with numbers (or 0 if queues empty).
  2. Each CTA opens correct forge page with `returnTo=collect`.
  3. `← Request` returns to Collect.
  4. Secondary custom batch wizard still works.
  5. No data files deleted.

- [ ] **Step 2: verify-live**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

- [ ] **Step 3: Commit any smoke fixes; tag Phase 1 done in commit message**

```powershell
git commit -m "chore(collect): Phase 1 command center complete"
```

**Phase 1 done when:** Daily bulk work starts on `/collect`; forge remains engine UI.

---

# PHASE 2 — Fire queues on Collect (email_only + pdf_ready)

**Outcome:** Operator runs fire queue + **Send all** drip without using standalone forge nav. Same send endpoints.

### Task 6: Fire-queue pure helpers + tests

**Files:**
- Create: `public/js/collect-fire-queue.js`
- Create: `tests/collect-fire-queue.test.js`

**Interfaces:**
- `normalizeFireItems(pendingPayload) -> { items: FireItem[], blocked: BlockedItem[] }`
- FireItem: `{ id, city, state, checked: true, channel: 'email_only'|'email_pdf', contactEmail?, label }`
- `selectedIds(items) -> string[]`
- `dripPlan(ids, { delayMs }) -> { steps: { id, delayMs }[] }` (client-side pacing only; default delayMs from existing request-pdfs JS if present, else 1500)

- [ ] **Step 1–4:** TDD helpers (write tests → implement → pass → commit)  
  Message: `feat(collect): fire-queue normalize helpers`

### Task 7: Collect fire-queue routes (UI)

**Files:**
- Modify: `public/collect.html` — add views/sections or hash routes:
  - `#/fire/email-only`
  - `#/fire/pdf`
- Modify: `public/js/collect-fire-queue.js` — render table, select-all, Send all confirm dialog
- Modify: `public/css/collect-records.css` — dense queue table

**Send API mapping:**
- Email-only: `POST /forge/api/portal/city/${id}/send-email-only` with JSON body as existing UI uses (inspect `email-only-requests.js` and mirror fields exactly).
- PDF: `POST /forge/api/portal/city/${id}/send-email` mirroring `request-pdfs.js`.

- [ ] **Step 1:** Read `email-only-requests.js` and `request-pdfs.js` send call bodies; document exact JSON in code comments.
- [ ] **Step 2:** Implement sequential drip with confirm:  
  `Send ${n} ${channel} requests?` → loop selected ids → update row status sent|failed|skipped.
- [ ] **Step 3:** On complete, refresh lane counts via `bootCollectLanes`.
- [ ] **Step 4:** Lane CTAs on Collect home point to `/collect#/fire/email-only` and `/collect#/fire/pdf` instead of forge (Phase 2 cutover). Keep forge pages as fallback links in secondary text.
- [ ] **Step 5:** Manual drip **1 city** first; then small batch. Never first-run entire queue in prod without operator confirmation.
- [ ] **Step 6:** Run forge pytest subset for email send if available + `node --test tests/collect-fire-queue.test.js` + verify-live.
- [ ] **Step 7:** Commit `feat(collect): native fire queues for email-only and PDF drip`

### Task 8: Phase 2 parity checklist

- [ ] Cooldown blocked cities appear in blocked list, not selected by default.
- [ ] Missing contact cannot be checked.
- [ ] PDF queue excludes cities without completed PDF (server already filters via `is_pdf_email_eligible` / can_send).
- [ ] Submission log gains rows identical to forge UI sends (spot-check `submission-log.jsonl` after 1 test send).
- [ ] Commit `test(collect): Phase 2 fire-queue parity notes` only if adding automated checks.

**Phase 2 done when:** Operator can bulk drip email-only and PDF-ready entirely from Collect.

---

# PHASE 3 — PDF needs fill intake

**Outcome:** Cities that need first-time PDF fill are countable and reachable from Collect; after fill they join PDF ready.

### Task 9: Needs-fill eligibility (engine)

**Files:**
- Prefer extend: `modules/form-forge/review_portal/submission_tracker.py` **or** new `review_portal/pdf_fill_queue.py`
- Test: `modules/form-forge/tests/test_pdf_fill_queue.py` (new)
- Route: `GET /api/portal/pending-pdf-fill` in `app.py`

**Definition (implement exactly):**
- City is PDF pathway (not email-only, not pure online-only without PDF form).
- No completed filled PDF available for code_violation send (mirror whatever `is_pdf_email_eligible` / completed-forms-manifest checks).
- Return `{ total_pending, items: [{ id, city, state, reason }] }`.

- [ ] **Step 1:** Write pytest for 1 eligible + 1 already filled.
- [ ] **Step 2:** Implement queue builder + API.
- [ ] **Step 3:** Wire Collect `needsFillCount` from this API in `loadLaneModel`.
- [ ] **Step 4:** Lane CTA opens forge PDF filler with city deep-link if supported, else `/forge/?returnTo=collect`.
- [ ] **Step 5:** Commit `feat(forge): pending PDF fill queue API` + `feat(collect): needs-fill lane count`

### Task 10: Gov-list promote (minimal)

**Files:**
- Script or admin-only action later; **Phase 3 minimum** is forge cities only.
- Document follow-up: promote catalog `code_violation` + `method=email|pdf` rows into forge registry with contact email (separate plan if large).

- [ ] **Step 1:** Add short note in Collect needs-fill empty state:  
  “New research cities appear after they are enrolled in Form Forge / fill queue.”
- [ ] **Step 2:** Do **not** auto-import 9k catalog rows in this phase.
- [ ] **Step 3:** Commit docs-only if needed.

**Phase 3 done when:** Needs-fill count is real; operator can open fill tool from Collect; completed fills show in PDF ready on next load.

---

# PHASE 4 — Tracker powerhouse + Filter bounce

**Outcome:** Collect shows sent + returned + overdue; Filter attach remains write path for returned.

### Task 11: Tracker data API consumption

**Files:**
- Create: `public/js/collect-tracker.js`
- Create: `tests/collect-tracker.test.js`
- Modify: `public/collect.html` — tracker view `#/tracker`

**Interfaces:**
- Use `GET /forge/api/portal/cities` or `GET /forge/api/portal/cv-tracker` (prefer existing tracker payload used by `portal.js`).
- Row: place, channel last sent, `response_at` / returned, status `pending|received|cooldown|overdue`.
- Overdue default: sent ≥ **21 days** ago and no response_at (spec default).

- [ ] **Step 1:** Pure `classifyTrackerRow(city, { now, overdueDays: 21 })` tests.
- [ ] **Step 2:** Render dense table on Collect; strip on home links here.
- [ ] **Step 3:** No Collect form to set returned date (read-only). Optional “Mark received” only if forge already has response POST — mirror forge, do not invent.
- [ ] **Step 4:** Commit `feat(collect): request tracker desk (sent + returned)`

### Task 12: Filter handoff link (optional small)

**Files:**
- Modify: `public/js/bridge.js` or attach success toast only — after successful attach with `responseReceivedAt`, show link “View on Request tracker” → `/collect#/tracker`.

- [ ] **Step 1:** Locate attach success UI path; add one link.
- [ ] **Step 2:** verify-live + commit `feat(filter): link to Collect tracker after list attach`

**Phase 4 done when:** Operator plans next bulk cycle from Collect tracker alone.

---

# PHASE 5 — Absorb / retire Form Forge UI (operator-facing)

**Outcome:** Approach 3 for operators; engine package remains.

### Task 13: Nav cleanup

**Files:**
- Modify: `public/js/shell-nav.js` — remove or nest under Admin: Request PDFs, Email-only, Submit Portals (keep PDF Filler until fill is fully embedded).
- Collect remains primary.

- [ ] **Step 1:** Move bulk forge links to admin-only block (`isAdminUser()`).
- [ ] **Step 2:** verify-live; commit `feat(nav): bulk request entry only via Collect`

### Task 14: Final parity audit

- [ ] Compare one full cycle: email-only drip, PDF drip, portal mark-submitted, fill one PDF — Collect-only path.
- [ ] Confirm submission-log and registry intact.
- [ ] Update spec status line to Implemented Phase 1–5.
- [ ] Commit `docs(collect): powerhouse Phase 5 complete`

---

## Spec coverage checklist

| Spec requirement | Task(s) |
|------------------|---------|
| Bulk email-only fire queue + drip | 6–8 |
| Bulk PDF ready drip | 6–8 |
| PDF needs fill | 9–10 |
| Portal walkthrough | 1–3 (link), Phase 2 can deep-link; full Collect portal queue optional extend Task 7 pattern to online submit |
| Sent + returned tracker | 11–12 |
| One desk / hybrid 2→3 | 1–5 then 13 |
| No dual Gmail | Global + Task 7 |
| No data wipe | Global |
| Phase gates | Explicit phase sections |

## Placeholder / risk scan

- Exact POST JSON for send endpoints must be copied from existing forge JS in Task 7 (do not invent fields).
- KPI month shape: if `build_submission_kpi` differs, adjust `buildLaneModel` in Task 1 after inspecting one live `/forge/api/portal/kpi` response.
- Portal full fire-queue on Collect may reuse Task 7 with `POST .../submit` — implement in Phase 2 if time; else Phase 1 deep-link remains acceptable until then.

---

## Execution handoff

Plan complete and saved to:

`docs/superpowers/plans/2026-07-21-collect-bulk-powerhouse.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks (`superpowers:subagent-driven-development`)
2. **Inline Execution** — this session with `superpowers:executing-plans`, batch with checkpoints

**Which approach?** Start at **Task 1 (Phase 1)** unless you specify otherwise.
