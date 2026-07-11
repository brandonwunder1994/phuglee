# Filter State Matrix (DESK-05)

**Phase:** 75 — Contract Freeze & Surface Inventory  
**Requirement:** DESK-05  
**Companion to:** [`CONTRACT-FREEZE.md`](./CONTRACT-FREEZE.md) · [`SURFACE-INVENTORY.md`](./SURFACE-INVENTORY.md)  
**Source of truth:** `public/js/bridge.js` (primary). Train/feed helpers may live in the same file or adjacent modules; **do not invent** class names for “future use.”  
**Status:** CSS may **style** these states. CSS must **not** invent parallel show/hide or enablement.

## Hard rules

1. Visibility of workflow panels is the HTML **`hidden`** attribute (via `setHidden` / `el.hidden = …`), not a CSS-only class.
2. Enablement is the **`disabled` property** (and sometimes `aria-disabled`). Prefer `:disabled` / `[disabled]` selectors — **do not invent `.is-disabled`** unless JS already toggles that class (it does not today).
3. **Train fail-closed:** `#bridge-train-wrap` ships with `hidden`. Non-admin paths force `setHidden(trainWrap, true)`. CSS is **never** the sole gate — never `#bridge-train-wrap { display: flex !important; }`.
4. If you customize `[hidden]` presentation, **pair** it: e.g. `.foo[hidden] { display: none !important; }` so UA + custom rules agree.
5. Do not use `pointer-events: none` on parents of live controls (dropzone, type chips, train actions).
6. Native `<dialog>` open/close is browser + `.showModal()` / `.close()` — do not replace with div modals or fake “is-open-dialog” classes.

Aligned with research pitfalls 2 & 4 (hidden/disabled semantics; no CSS-only workflow state). See `.planning/research/PITFALLS.md`.

---

## § Visibility (`hidden` / `setHidden`)

Core helper in `bridge.js`:

```js
function setHidden(el, hidden) {
  if (el) el.hidden = hidden;
}
```

| State token | Host element(s) / selectors | Who sets it | CSS may | CSS must not |
|-------------|----------------------------|-------------|---------|--------------|
| `hidden` attribute | Nearly all workflow panels: `#bridge-type-panel`, `#bridge-upload-panel`, `#bridge-loading-panel`, `#bridge-results-panel`, `#bridge-save-panel`, `#bridge-attach-panel`, `#bridge-train-wrap`, `#bridge-train-mission`, `#bridge-train-panel`, `#bridge-brain-panel`, `#bridge-city-dossier`, `#bridge-outcome-drawer`, `#bridge-city-outcome`, `#bridge-error-wrap`, victory strip/download, lists empty/wrap/toolbar/HUD, toolbars, pagination, status lines, pagers, etc. | `setHidden` / direct `el.hidden =` in pipeline, renderResults, clear, process, lists render, victory, dossier, outcome | Style appearance when **not** hidden; optionally reinforce `.host[hidden] { display: none }` | Invent `.is-hidden` / opacity-0 ghosts that remain focusable; force display on `#bridge-train-wrap` while `hidden` |
| `hidden` (typeahead list) | `#bridge-city-search-results` | City search open/close path | Style list when open | Leave list in tab order when closed |
| `hidden` (dynamic toast/flash) | `#bridge-scanned-toast`, `#bridge-lists-flash` | Toast show/hide timers; lists flash | Animate enter/exit **with** hidden pairing | Rely on opacity alone without `hidden` |

---

## § Enablement (`disabled`)

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `disabled` property | `#bridge-process`, `#bridge-paste-convert`, `#bridge-outcome-save`, `#bridge-train-undo`, `#bridge-save-list`, `#bridge-state` / `#bridge-city` (loading/empty), download-all / clear-all when n=0, train card buttons while pending | Process/file gate, paste gate, outcome selection, undo stack, save in-flight, city loaders, list counts, train pending | `button:disabled`, `select:disabled`, `[disabled]` visual mute | Invent `.is-disabled` without JS; leave clickable look when disabled; `pointer-events: none` on parent that blocks enabled siblings |
| `aria-disabled` | `#bridge-train-undo` (mirrors undo) | Undo enable path | Optional a11y-aligned styling if needed | Treat aria alone as the enable gate for mouse (property is source of truth) |

---

## § Theater / mode

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `is-theater` | `#bridge-train-wrap` | Theater chrome toggle when admin Train session active | Layout/drama for authorized theater | Use as sole visibility gate; show theater without wrap unhidden by JS |
| `bridge-results-mode--theater` | `.bridge-results-mode` (mode tab rail inside train wrap) | Same theater toggle | Rail emphasis in theater mode | Apply to kept table outside train wrap as fake theater |
| `is-active` | `#bridge-mode-kept`, `#bridge-mode-train`, `#bridge-mode-brain` | Results mode switch | Active tab paint | Hide non-active **panels** via CSS only — panels use `hidden` |
| `aria-selected` | Mode tabs | Results mode switch | Align with active tab styles | Conflict with `is-active` |
| `data-mode` | `kept` / `train` / `brain` on mode buttons | Static HTML + click handlers | Attribute selectors if needed | Rename values (freeze) |
| `is-active` + `is-complete` | `#bridge-pipeline` steps `.bridge-pipeline-step` | Pipeline step index updater | Step progress paint | Drive step visibility of panels via pipeline CSS alone |
| `is-active` | City typeahead options; inventory HUD type chips | Keyboard/hover index; inventory filter | Option/chip highlight | |
| `is-open` | `#bridge-outcome-drawer`; `#bridge-train-open-count` when open groups > 0 | Outcome drawer toggle; train mission stats | Expanded drawer chrome; open-count emphasis | CSS-only expand that leaves `#bridge-city-outcome` visible without JS |
| `aria-expanded` | `#bridge-outcome-drawer-toggle`; `#bridge-city-search` | Drawer / typeahead | Chevron/open affordance | |

---

## § Dropzone

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `has-file` | `#bridge-dropzone` | File selection / clear | Filled-state border/background | Imply process enabled without also respecting `#bridge-process:disabled` |
| `is-dragover` | `#bridge-dropzone` | dragenter / dragleave / drop | Drag highlight | `pointer-events: none` on dropzone or ancestors that block drop |

Related visibility: `#bridge-file-name`, `#bridge-clear-file` use `hidden`; process uses `disabled`.

---

## § Selection chips

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `is-selected` | `#bridge-date-chips .bridge-date-chip` | Date chip pick | Selected chip paint | |
| `aria-pressed` | Date chips | Same path | Pressed affordance | Diverge from `is-selected` |
| `:checked` (native) | `input[name="bridge-upload-type"]` | User + form | Chip face via `input:checked + .bridge-type-chip-face` | Replace radios with non-form controls without freeze update |

---

## § Status tones

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `is-success` | `#bridge-save-status`, `#bridge-attach-status`, `#bridge-outcome-status`, `#bridge-paste-status`, train/brain status helpers | Status helpers with `kind === 'success'` | Green/success tone | Use as visibility substitute for `hidden` |
| `is-error` | Same status hosts + error paths | `kind === 'error'` | Error tone | |
| `is-busy` | `#bridge-paste-status` (and clear on settle) | Paste convert in-flight | Busy/spinner copy tone | Block UI solely via busy class without disabling buttons JS already disables |

Status lines are typically also toggled with `setHidden` when empty.

---

## § Train card motion

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `is-pending` | `.bridge-train-group` / brain rule cards; buttons inside disabled while pending | Approve/deny / rule busy paths | Pending opacity/spinner | Leave buttons clickable visually while JS set `disabled` |
| `is-exiting` | Train group card after decision | Exit animation before DOM remove | Exit transition | **Skip completion under `prefers-reduced-motion`** — reduce motion, still finish remove path; do not trap cards forever |
| `is-enter` | `.bridge-scrub-feed-item` | Scrub feed item render | Enter animation | Same reduced-motion rule: content must still appear |

Reduced-motion is a **CSS twin** of motion classes — pair `@media (prefers-reduced-motion: reduce)` with existing kill-switches in `bridge.css`; do not invent a separate JS state.

---

## § Kill report / table / toast / flash

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| `bridge-kill-report` | `#bridge-kpi-grid` | Results KPI render after process | Kill-report layout/stats | Assume class present before process |
| `is-sorted` | Results table `<th>` | Sort click handler | Sorted column indicator | |
| `is-in` / `is-out` | `#bridge-scanned-toast` | Toast show/hide sequence | Enter/exit animation | Omit `[hidden]` pairing (see existing toast rules) |
| `hidden` flash | `#bridge-lists-flash` | Brief show after list actions | Flash chrome | Permanent unhidden flash without JS |

---

## § Dialogs (native)

| State token | Host element(s) | Who sets it | CSS may | CSS must not |
|-------------|-----------------|-------------|---------|--------------|
| Open state (`dialog[open]` / top layer) | `#bridge-history-dialog`, `#bridge-type-column-confirm-dialog` | `showModal()` / `close()` in bridge.js | Backdrop, panel chrome, focus rings | Replace `<dialog>` with custom div modal; invent `.is-dialog-open` on body as sole trap; hide dialog with `display:none` that breaks top layer |
| `hidden` on suggested line | `#bridge-type-column-suggested` | Type-confirm populate | | |

---

## § ARIA busy / live (informational)

| State token | Host | Who sets it | CSS may | CSS must not |
|-------------|------|-------------|---------|--------------|
| `aria-busy="true"` (static on load panel) | `#bridge-loading-panel` | Markup + process show path | Loading affordance | Use aria-busy alone to hide other panels |
| `aria-live` | Victory, loading, feed, status, lists total | Markup / toast | | Suppress live regions with `display:none` on ancestors incorrectly |

---

## § Restyle checklist for implementers

Phases 76–80 operators **must**:

1. **Pair `[hidden]`** — any custom hide rule includes `[hidden]` (or leaves UA default). No opacity-only ghosts.
2. **Style `:disabled` / `[disabled]`** — never invent `.is-disabled` without wiring JS.
3. **Never force Train open with CSS** — no `display:flex !important` (or similar) on `#bridge-train-wrap`.
4. **No `pointer-events: none` on dropzone / chip / train parents** that host live controls.
5. **Style existing tokens only** — `is-theater`, `has-file`, `is-dragover`, `is-active`, `is-selected`, `is-pending`, `is-exiting`, `is-success`, `is-error`, `is-busy`, `is-in`/`is-out`, `bridge-kill-report`, `is-sorted`, `bridge-results-mode--theater`.
6. **Do not invent parallel state classes** for “cleaner” BEM without a JS change (JS is frozen for pure visual phases).
7. **Native dialogs stay `<dialog>`** — style `dialog` / `::backdrop`, keep close/ok/cancel IDs.
8. **Reduced-motion** — kill or shorten animations; do not leave `is-exiting` / `is-enter` incomplete.
9. **Verify admin vs non-admin** after theater paint — non-admin must not see or focus Train mission / armory.
10. **Run freeze + cinema + theater tests** after markup class hooks: `node --test tests/bridge-contract-freeze.test.js` and related suites; full `npm test` before merge.

---

## § Extraction notes

Live tokens confirmed via read-only scan of `public/js/bridge.js` (`classList`, `setHidden`, `.hidden`, `.disabled`, `aria-*`). Adjacent `bridge-train.js` / `bridge-scrub-feed.js` may share string templates; card/feed state classes are applied from the main bridge boot paths above.

**Not documented as CSS workflow state:** pure data attributes used for delegation (`data-action`, `data-format`, `data-step`) — those are freeze contracts (see CONTRACT-FREEZE), not visual state toggles.

---

## § Related docs

- [`CONTRACT-FREEZE.md`](./CONTRACT-FREEZE.md)
- [`SURFACE-INVENTORY.md`](./SURFACE-INVENTORY.md)
- [`.planning/research/PITFALLS.md`](../../.planning/research/PITFALLS.md) — Pitfall 2 (hidden/disabled), Pitfall 4 (CSS-only state)

---

*DESK-05 state matrix — Phase 75. Docs only; no new state class names.*
