# Documents simple desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace Documents vault chrome with Pending / Signed buckets, formal type labels, click-to-view modal, and Send Doc type chooser into existing send flows.

**Architecture:** Client-only re-render of `#uc-panel-docs`. Keep `buildPackageModel` / SignNow sync / send entry points. New render function + two small modals (view, send type).

**Tech Stack:** Vanilla JS, existing dialogs, Phuglee CSS.

**Spec:** `docs/superpowers/specs/2026-07-22-uc-documents-simple-design.md`

## Global Constraints

- Documents tab only  
- Labels: Purchase Contract, AOC, JV Agreement, Amendment  
- No new API  
- Cache bump after HTML/JS/CSS  
- `verify-live.ps1` after public edits  
- Layout integrity  

---

### Task 1: Tests for simple docs desk structure

**Files:**
- Modify: `tests/under-contract.test.js`

- [ ] **Step 1: Update workbench test docs section**

Replace vault-instrument assertions that require dual desk / import primary / attention band with:

```js
  // Documents simple desk
  assert.match(html, /id="uc-docs-pending-list"|id="uc-docs-signed-list"/);
  assert.match(html, /Send Doc|uc-docs-send-doc/);
  assert.match(js, /function renderDocsDesk\s*\(/); // or final name
  assert.match(js, /Pending signatures|function renderDocs/);
  assert.match(js, /Purchase Contract/);
  assert.match(js, /openDocsSendTypeModal|uc-docs-send-type/);
  assert.match(js, /openDocViewerModal|uc-doc-view-dialog/);
  assert.equal(html.includes('uc-docs-preview-empty') && html.includes('Preview desk'), false);
```

(Adjust exact IDs to match implementation in Task 2; keep pin version in sync.)

- [ ] **Step 2: Run tests — expect FAIL until Task 2**

```bash
node --test tests/under-contract.test.js
```

- [ ] **Step 3: Commit tests** (optional mid-stream) or commit with implementation

---

### Task 2: Markup — strip dual desk; add buckets + modals

**Files:**
- Modify: `public/under-contract.html` (`#uc-panel-docs`)

- [ ] **Step 1: Replace docs panel content**

Structure:

```html
<div id="uc-panel-docs" ...>
  <section class="uc-tab-section uc-docs-simple" id="uc-docs-instrument" aria-label="Documents">
    <div class="uc-tab-toolbar">
      <span class="uc-tab-toolbar-meta" id="uc-docs-toolbar-meta">Documents</span>
      <div class="uc-tab-toolbar-actions">
        <button type="button" id="uc-docs-refresh-sn" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm">Refresh signed</button>
        <button type="button" id="uc-docs-send-doc" class="phuglee-btn phuglee-btn-primary phuglee-btn-sm">Send Doc</button>
      </div>
    </div>

    <section class="uc-docs-bucket" aria-labelledby="uc-docs-pending-heading">
      <h3 id="uc-docs-pending-heading" class="uc-brief-section-title">Pending signatures</h3>
      <ul id="uc-docs-pending-list" class="uc-docs-bucket-list"></ul>
    </section>

    <section class="uc-docs-bucket" aria-labelledby="uc-docs-signed-heading">
      <h3 id="uc-docs-signed-heading" class="uc-brief-section-title">Signed</h3>
      <ul id="uc-docs-signed-list" class="uc-docs-bucket-list"></ul>
    </section>
  </section>
</div>
```

- [ ] **Step 2: Add dialogs (near other uc dialogs)**

```html
<dialog id="uc-docs-send-type-dialog" class="uc-dialog uc-dialog--docs-send" aria-labelledby="uc-docs-send-type-title">
  <form method="dialog" class="uc-edit-form" id="uc-docs-send-type-form">
    <h3 id="uc-docs-send-type-title">Send document</h3>
    <p class="uc-docs-send-type-hint">What do you want to send?</p>
    <div class="uc-docs-send-type-grid" role="radiogroup" aria-label="Document type">
      <!-- four options: psa, aoc, jv, amendment -->
    </div>
    <div class="uc-edit-actions">
      <button type="submit" value="cancel" class="phuglee-btn phuglee-btn-ghost">Cancel</button>
      <button type="button" id="uc-docs-send-type-continue" class="phuglee-btn phuglee-btn-primary">Continue</button>
    </div>
  </form>
</dialog>

<dialog id="uc-doc-view-dialog" class="uc-dialog uc-dialog--doc-view" aria-labelledby="uc-doc-view-title">
  <div class="uc-doc-view-shell">
    <div class="uc-doc-view-bar">
      <h3 id="uc-doc-view-title">Document</h3>
      <div>
        <a id="uc-doc-view-open-tab" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm" target="_blank" rel="noopener">Open tab</a>
        <button type="button" id="uc-doc-view-close" class="phuglee-btn phuglee-btn-ghost phuglee-btn-sm">Close</button>
      </div>
    </div>
    <iframe id="uc-doc-view-frame" class="uc-doc-view-frame" title="Document preview"></iframe>
  </div>
</dialog>
```

Remove (or leave unused/hidden for safety): old `uc-docs-packages`, `uc-docs-list`, intent bar, import panel, side preview — **prefer delete from HTML** so UI cannot regress.

Keep hidden `uc-doc-kind` select if `sendPackageKind` still reads it, or set kind in JS without DOM select.

---

### Task 3: JS — render buckets, view modal, send type modal

**Files:**
- Modify: `public/js/under-contract.js`

**Display title map:**

```js
const DOCS_UI_LABELS = {
  psa: 'Purchase Contract',
  aoc: 'AOC',
  jv: 'JV Agreement',
  amendment: 'Amendment'
};
```

- [ ] **Step 1: `renderDocsDesk(deal)`**

```js
function renderDocsDesk(deal) {
  const packages = buildPackageModel(deal || state.profile);
  const pending = packages.filter((p) => p.status === 'pending');
  const signed = packages.filter((p) => p.status === 'complete');
  // fill #uc-docs-pending-list and #uc-docs-signed-list
  // each row: button.uc-docs-row with data-pkg-key, data-status, label DOCS_UI_LABELS
  // empty states as <li class="uc-docs-bucket-empty">
  // toolbar meta: "N pending · M signed"
}
```

Wire from `renderDocuments` / `renderProfile` (replace old package + list render body).

- [ ] **Step 2: Click handler**

- Pending/signed row click → if `primaryDoc?.viewUrl` open view modal; else if pending showToast('Waiting on signatures — use Refresh signed when complete')  
- Or pending: no view unless URL exists  

- [ ] **Step 3: View modal**

```js
function openDocViewerModal(doc, label) {
  const dlg = $('uc-doc-view-dialog');
  // set title, frame src, open tab href
  dlg.showModal();
}
function closeDocViewerModal() { /* clear src, close */ }
```

Migrate callers of `openDocViewer` for profile docs to modal, or alias.

- [ ] **Step 4: Send Doc modal**

```js
function openDocsSendTypeModal() { $('uc-docs-send-type-dialog')?.showModal(); }
function continueDocsSendType() {
  const kind = selected; // psa|aoc|jv|amendment
  dlg.close();
  const deal = state.profile;
  if (kind === 'psa') sendPackageKind('psa');
  else if (kind === 'aoc') openAocAction(deal);
  else if (kind === 'jv') openSendJv(deal);
  else if (kind === 'amendment') openAmendment(deal);
}
```

Bind `#uc-docs-send-doc`, continue, cancel.

- [ ] **Step 5: Keep refresh**

Existing `#uc-docs-refresh-sn` → `refreshSignedDocuments` → re-render desk.

- [ ] **Step 6: Remove dead handlers** for import panel / old package buttons if markup gone; keep `buildPackageModel` intact.

- [ ] **Step 7: Cache** `?v=83-docs-simple` (or next free)

---

### Task 4: CSS

**Files:**
- Modify: `public/css/under-contract.css`

- [ ] Styles for:
  - `.uc-docs-simple` spacing  
  - `.uc-docs-bucket-list`  
  - `.uc-docs-row` (full-width text button, formal title + underline optional)  
  - `.uc-docs-row.is-pending` / `.is-signed` subtle status color  
  - `.uc-dialog--doc-view` large modal, iframe min-height ~60vh  
  - `.uc-docs-send-type-grid` 2×2 type buttons  

---

### Task 5: Verify + commit

```bash
node --check public/js/under-contract.js
node --test tests/under-contract.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

```bash
git add public/under-contract.html public/js/under-contract.js public/css/under-contract.css tests/under-contract.test.js
git commit -m "feat(uc): Documents simple pending/signed desk + Send Doc"
```

Optional: update `DESIGN.md` Documents row to “Pending/Signed packages · Send Doc · view modal”.

---

## Spec coverage

| Spec | Task |
|------|------|
| Two buckets only | 2–3 |
| Four labels | 3 |
| Click → modal view | 3 |
| Send Doc → type → existing flows | 3 |
| SignNow status via buildPackageModel | 3 |
| Refresh signed | 3 |
| Tests + live | 1, 5 |

## Self-review

- No TBD process inventing  
- Send paths name real functions  
- Board untouched  
