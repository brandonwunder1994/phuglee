# Overview snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Overview situation board with a single deal-file snapshot sheet (parties, economics including end buyer price, close/status, inline notes, InvestorBase).

**Architecture:** Client-only Overview re-render in `under-contract.js`. Replace `renderOverviewSituation` with `renderOverviewSnapshot`. Reuse existing deal fields, `statusChip`, `money`, `saveDealFields`, and InvestorBase section. No new API fields.

**Tech Stack:** Vanilla JS, Phuglee CSS tokens, existing `/api/leads/admin/contracts` PATCH via `saveDealFields`, Node test suite.

**Spec:** `docs/superpowers/specs/2026-07-22-uc-overview-snapshot-design.md`

## Global Constraints

- Overview tab only — do not redesign other tabs or the board  
- End buyer price = `purchasePrice + assignmentFee` only when both are finite; else `—`  
- Empty end buyer = quiet blank / “Not found” (not “Add buyer” CTA)  
- No next-move spine, blockers, recent, people Call/SMS console  
- Cache bump after HTML/JS/CSS change  
- After public edits: `scripts/verify-live.ps1` from project root  
- Layout integrity: real gaps, minmax grids, stack under ~900px  

---

### Task 1: Failing tests for snapshot structure

**Files:**
- Modify: `tests/under-contract.test.js`
- Test: `tests/under-contract.test.js`

**Interfaces:**
- Produces: assertions for `renderOverviewSnapshot`, economics labels, removal of situation-board markers

- [ ] **Step 1: Update Overview assertions in the workbench test**

In `tests/under-contract.test.js`, replace the Phase 5 situation-board Overview block (and any O1 assertions tied only to `uc-ov-spine`) with:

```js
  // Overview deal snapshot (not situation board)
  assert.match(html, /id="uc-drawer-facts"/);
  assert.match(js, /function renderOverviewSnapshot\s*\(/);
  assert.match(js, /function overviewSellerNames\s*\(/);
  assert.match(js, /function overviewEndBuyerPrice\s*\(/);
  assert.match(js, /function saveOverviewNotes\s*\(/);
  assert.match(js, /End buyer/);
  assert.match(js, /Our price|Purchase \(seller\)/);
  assert.equal(js.includes('function overviewBlockers'), false);
  assert.equal(js.includes('uc-ov-spine'), false);
  assert.equal(js.includes('function renderOverviewSituation'), false);
  assert.match(css, /Overview deal snapshot|uc-snap-/);
```

Keep integration anchors for Docs/Media/Buyers/Comms that still exist; drop O1 `uc-ov-spine-title` if present.

Bump version pin assertions from `74-integration` to `75-overview-snap` (or whatever cache string Task 3 uses — keep consistent).

- [ ] **Step 2: Run tests — expect FAIL on missing snapshot symbols**

```bash
node --test tests/under-contract.test.js
```

Expected: FAIL matching `renderOverviewSnapshot` / `overviewBlockers` still present until Task 2.

- [ ] **Step 3: Commit tests**

```bash
git add tests/under-contract.test.js
git commit -m "test(uc): overview snapshot structure (failing first)"
```

---

### Task 2: Implement snapshot render + notes save

**Files:**
- Modify: `public/js/under-contract.js` (overview helpers ~2568–2828, `renderProfile` call site, event binds)
- Modify: `public/css/under-contract.css` (replace P5 overview board styles with snapshot styles)
- Modify: `public/under-contract.html` (cache query only unless static notes shell needed)

**Interfaces:**
- Consumes: `deal`, `contact`, `money`, `statusChip`, `dealTypeBadgeHtml`, `STAGE_LABELS`, `saveDealFields`, `esc`
- Produces:
  - `overviewSellerNames(deal, contact) → string[]` (1–2)
  - `overviewEndBuyerPrice(deal) → number | null`
  - `overviewEndBuyerName(deal) → string` (empty if none)
  - `renderOverviewSnapshot(deal, contact)`
  - `saveOverviewNotes()` async

- [ ] **Step 1: Add helpers (near old overview helpers)**

```js
  function overviewSellerNames(deal, contact) {
    const out = [];
    const sellers = Array.isArray(deal?.contractSellers) ? deal.contractSellers : [];
    for (const s of sellers) {
      const n = String(s?.name || '').trim();
      if (n && !out.includes(n)) out.push(n);
      if (out.length >= 2) return out;
    }
    const joined = String(deal?.sellerNames || deal?.ownerName || contact?.sellersName || contact?.name || '').trim();
    if (joined) {
      const parts = joined.split(/\s*\/\s*|\s+and\s+|\s*&\s*/i).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        if (!out.includes(p)) out.push(p);
        if (out.length >= 2) break;
      }
    }
    if (!out.length && deal?.ownerName) out.push(String(deal.ownerName).trim());
    return out.slice(0, 2);
  }

  function overviewEndBuyerName(deal) {
    return String(deal?.cashBuyerName || '').trim();
  }

  function overviewEndBuyerPrice(deal) {
    const p = Number(deal?.purchasePrice);
    const a = Number(deal?.assignmentFee);
    if (!Number.isFinite(p) || !Number.isFinite(a)) return null;
    return p + a;
  }
```

- [ ] **Step 2: Replace `renderOverviewSituation` with `renderOverviewSnapshot`**

Remove: `overviewBlockers`, `overviewNextMove`, `overviewRecentEvents`, `renderOverviewSituation`, `handleOverviewClick` (or gut handleOverviewClick if still bound — unbind).

Render into `#uc-drawer-facts`:

```js
  function renderOverviewSnapshot(deal, contact) {
    const root = $('uc-drawer-facts');
    if (!root) return;
    const sellers = overviewSellerNames(deal, contact);
    const sellerLine = sellers.length ? sellers.join(' · ') : '—';
    const buyerName = overviewEndBuyerName(deal);
    const endPrice = overviewEndBuyerPrice(deal);
    const notesRaw = String(deal.notes || '');
    const closing = deal.closingDate || contact?.closingDate || deal.closingDisplay || '—';

    root.innerHTML =
      `<section class="uc-snap-section" aria-label="Parties">
        <h3 class="uc-brief-section-title">Parties</h3>
        <div class="uc-snap-grid uc-snap-grid--parties">
          <div class="uc-snap-field">
            <span class="uc-snap-label">Seller${sellers.length > 1 ? 's' : ''}</span>
            <strong class="uc-snap-value">${esc(sellerLine)}</strong>
          </div>
          <div class="uc-snap-field">
            <span class="uc-snap-label">End buyer</span>
            <strong class="uc-snap-value${buyerName ? '' : ' is-empty'}">${esc(buyerName || '—')}</strong>
          </div>
        </div>
      </section>

      <section class="uc-snap-section" aria-label="Economics">
        <h3 class="uc-brief-section-title">Economics</h3>
        <div class="uc-snap-econ">
          <div class="uc-snap-econ-cell">
            <span class="uc-snap-label">Our price</span>
            <strong class="uc-money-display">${esc(money(deal.purchasePrice))}</strong>
          </div>
          <div class="uc-snap-econ-cell">
            <span class="uc-snap-label">End buyer price</span>
            <strong class="uc-money-display">${esc(endPrice == null ? '—' : money(endPrice))}</strong>
          </div>
          <div class="uc-snap-econ-cell">
            <span class="uc-snap-label">Assignment</span>
            <strong class="uc-money-display">${esc(money(deal.assignmentFee))}</strong>
          </div>
        </div>
      </section>

      <section class="uc-snap-section" aria-label="Close and status">
        <h3 class="uc-brief-section-title">Close & status</h3>
        <div class="uc-snap-status">
          <div class="uc-snap-field">
            <span class="uc-snap-label">Closing</span>
            <strong class="uc-snap-value">${esc(closing)}</strong>
          </div>
          <div class="uc-snap-field">
            <span class="uc-snap-label">Title open</span>
            <div class="uc-snap-chip">${statusChip({ label: 'Title', yn: deal.titleOpened, text: deal.titleOpenedLabel })}</div>
          </div>
          <div class="uc-snap-field">
            <span class="uc-snap-label">Our EMD</span>
            <div class="uc-snap-chip">${statusChip({ label: 'EMD', yn: deal.sellerEmdSubmitted, text: deal.sellerEmdLabel })}</div>
          </div>
          <div class="uc-snap-field">
            <span class="uc-snap-label">Buyer EMD</span>
            <div class="uc-snap-chip">${statusChip({ label: 'Buyer EMD', yn: deal.buyerEmdSubmitted, text: deal.buyerEmdLabel })}</div>
          </div>
          <div class="uc-snap-field">
            <span class="uc-snap-label">Vacancy</span>
            <div class="uc-snap-chip">${statusChip({ kind: 'vacancy', label: 'Vacancy', value: deal.vacancy, text: deal.vacancyLabel })}</div>
          </div>
          <div class="uc-snap-field">
            <span class="uc-snap-label">Access</span>
            <strong class="uc-snap-value">${esc(deal.accessDisplay || deal.accessLabel || '—')}</strong>
          </div>
        </div>
      </section>

      <section class="uc-snap-section" aria-label="Notes">
        <h3 class="uc-brief-section-title">Notes</h3>
        <label class="uc-snap-notes-label" for="uc-overview-notes">Snapshot notes</label>
        <textarea id="uc-overview-notes" class="phuglee-textarea uc-snap-notes" rows="4" placeholder="Quick notes for this file…">${esc(notesRaw)}</textarea>
        <div class="uc-snap-notes-actions">
          <button type="button" id="uc-overview-notes-save" class="phuglee-btn phuglee-btn-primary phuglee-btn-sm">Save notes</button>
        </div>
      </section>`;
  }
```

Wire in `renderProfile`: call `renderOverviewSnapshot(deal, contact)` instead of `renderOverviewSituation`.

- [ ] **Step 3: `saveOverviewNotes` + bind**

```js
  async function saveOverviewNotes() {
    const dealId = state.activeDealId;
    if (!dealId) {
      showToast('Open a property first');
      return;
    }
    const notes = ($('uc-overview-notes')?.value || '').trim();
    const btn = $('uc-overview-notes-save');
    if (btn) btn.disabled = true;
    try {
      const data = await saveDealFields(dealId, { notes });
      if (data.deal) {
        mergeDealIntoState(data.deal);
        state.profile = { ...(state.profile || {}), ...data.deal };
      }
      showToast('Notes saved');
    } catch (err) {
      showToast(err.message || 'Could not save notes');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
```

In init listeners (where `uc-drawer-facts` click was bound):

```js
    $('uc-drawer-facts')?.addEventListener('click', (ev) => {
      if (ev.target.closest('#uc-overview-notes-save')) {
        saveOverviewNotes().catch((e) => showToast(e.message || 'Save failed'));
      }
    });
```

Remove `handleOverviewClick` / `navigateProfileInstrument` overview-blocker paths if they only served the board. Keep `navigateProfileInstrument` for other tabs.

If `runProfilePrimaryAction` still navigates with `focus: 'docs-attention'` that is fine.

- [ ] **Step 4: CSS — Overview deal snapshot**

Replace or append after removing P5 board block:

```css
/* Overview deal snapshot */
.uc-drawer.uc-profile .uc-drawer-facts.uc-brief {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}
.uc-snap-section { margin: 0; min-width: 0; }
.uc-snap-grid--parties {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) minmax(12rem, 1fr);
  gap: 0.85rem 1rem;
}
.uc-snap-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--vault-border, #333) 75%, transparent);
  background: color-mix(in srgb, var(--vault-surface, #1a1a1a) 94%, #000);
}
.uc-snap-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--phuglee-meta-text, #b0a99c);
}
.uc-snap-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--phuglee-cream, #f5f2e4);
  line-height: 1.35;
  word-break: break-word;
}
.uc-snap-value.is-empty { color: var(--vault-muted); font-weight: 500; }
.uc-snap-econ {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
.uc-snap-econ-cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--vault-border, #333) 75%, transparent);
  background: color-mix(in srgb, var(--vault-surface, #1a1a1a) 94%, #000);
  min-width: 0;
}
.uc-snap-econ-cell .uc-money-display {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--phuglee-cream, #f5f2e4);
}
.uc-snap-status {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
.uc-snap-notes { width: 100%; min-height: 6rem; }
.uc-snap-notes-label {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.8rem;
  color: var(--phuglee-meta-text, #b0a99c);
}
.uc-snap-notes-actions { margin-top: 0.55rem; }
@media (max-width: 900px) {
  .uc-snap-grid--parties,
  .uc-snap-econ,
  .uc-snap-status {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .uc-snap-econ,
  .uc-snap-status,
  .uc-snap-grid--parties {
    grid-template-columns: 1fr;
  }
}
```

Delete obsolete `.uc-ov-*` rules if unused.

- [ ] **Step 5: Cache bump**

`public/under-contract.html`: `?v=75-overview-snap` on CSS and JS.

- [ ] **Step 6: Syntax + tests + live**

```bash
node --check public/js/under-contract.js
node --test tests/under-contract.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Expected: check exit 0; 37+ tests pass; LIVE ok.

- [ ] **Step 7: Commit**

```bash
git add public/js/under-contract.js public/css/under-contract.css public/under-contract.html tests/under-contract.test.js
git commit -m "feat(uc): overview deal snapshot sheet — parties, economics, status, notes"
```

---

### Task 3: DESIGN.md note (product register only)

**Files:**
- Modify: `DESIGN.md` (Contract profile instruments table)

- [ ] **Step 1: Update Overview row**

Change Overview instrument job to: **Deal snapshot — parties, economics, close/status, notes, investor URL** (not situation board / blockers).

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs: overview instrument is deal snapshot, not situation board"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Parties sellers 1–2 + end buyer blank | Task 2 |
| Our / end buyer / assignment money | Task 2 |
| Closing, title, EMDs, vacancy, access | Task 2 |
| Inline notes + Save | Task 2 |
| InvestorBase kept | unchanged section |
| Photo/address/stage/type via hero | keep hero; no second photo |
| Remove situation board | Task 2 |
| Tests + live | Task 1–2 |
| DESIGN.md | Task 3 |

## Self-review

- No TBD placeholders in steps  
- End buyer price formula explicit  
- Cache version string consistent (`75-overview-snap`)  
