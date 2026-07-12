# Phase 44 — Admin Review UX (Train Brain)

> **GSD:** `/gsd:execute-phase 44`  
> **Milestone:** [M7 Filter Superpower Brain](../milestones/M7-filter-superpower-brain.md)  
> **Spec:** `docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
> **Depends on:** Phase 43

**Goal:** On Filter results, **admin** gets a production-grade Train Brain UI: two sections (marked distressed / not marked), **grouped** cards with signals + descriptions, ✓ Approve and ✗ Deny controls (wired to stubs or local-only until phase 45).

**Architecture:** Client-side render from `lastResult.reviewGroups`; admin gate via session username; match bridge design system.

---

## Quality bar

| Pass | Fail |
|------|------|
| Admin sees tabs: Kept list \| Train brain | Everyone sees train chrome |
| Non-admin: no train tab / no ✓✗ | Non-admin can open train UI |
| Distressed groups show type, count, indicator chips, description samples | Only address table |
| Not-distressed section present when groups exist | Missing FN section |
| Singleton groups labeled clearly | Look like 20-stacks |
| Empty train state copy when no groups | Blank crash |
| A11y: buttons labeled, sections headings | Icon-only no name |
| Mobile usable stack | Horizontal overflow disaster |

---

## Files

| Action | Path |
|--------|------|
| Modify | `public/bridge.html` — train panel markup |
| Modify | `public/js/bridge.js` — render groups, admin gate, state |
| Modify | `public/css/bridge.css` or existing bridge styles — cards, chips, actions |
| Optional | `public/js/auth-session.js` / session helper for username |

---

## UI structure

```html
<!-- inside bridge-results-panel, admin only -->
<div id="bridge-train-wrap" hidden>
  <div class="bridge-results-mode" role="tablist">
    <button type="button" data-mode="kept" class="is-active">Kept list</button>
    <button type="button" data-mode="train">Train brain</button>
  </div>
  <div id="bridge-train-panel" hidden>
    <section aria-labelledby="train-distressed-h">
      <h3 id="train-distressed-h">Marked distressed</h3>
      <p class="bridge-panel-lead">Approve if the AI/tagger is right. Deny removes these from the kept list and trains the global brain.</p>
      <div id="bridge-train-distressed" class="bridge-train-groups"></div>
    </section>
    <section aria-labelledby="train-fn-h">
      <h3 id="train-fn-h">Not marked distressed</h3>
      <p class="bridge-panel-lead">Catch false negatives. Approve promotes into the kept list and teaches the brain to keep this type next time.</p>
      <div id="bridge-train-not-distressed" class="bridge-train-groups"></div>
    </section>
  </div>
</div>
```

### Group card content

- Title: `{violationTypeLabel}` + badge `×{count}`
- Chips: each `matchedIndicators` entry (or “No signal text” for FN)
- Description samples (blockquote list, truncated 160 chars)
- Sample addresses (muted)
- Actions: button.approve (✓ Approve), button.deny (✗ Deny)
- `data-group-id`, `data-section`
- Phase 44: click shows toast “Training API ships in phase 45” **or** calls a no-op handler that sets local `pendingDecision` visual state only — prefer **disabled API with clear comment** vs fake success. **Best:** wire `fetch` to `/api/bridge/brain/decisions` and show friendly error until 45 lands — OR leave handlers as `// PHASE45` with visual “selected” only. Spec: **handlers stubbed, UI complete**; phase 45 plugs real API without redesign.

### Admin detection

```js
function isBridgeAdmin() {
  const u = (window.PhugleeSession && PhugleeSession.getUsername && PhugleeSession.getUsername())
    || sessionStorage.getItem('phuglee_session')
    || '';
  return String(u).trim().toLowerCase() === 'admin';
}
```

Use the project’s real session helper if one already exists (`auth-session.js`).

---

## Tasks

### Task 1: Markup + CSS

- [ ] Add train wrap structure to `bridge.html`
- [ ] Styles: `.bridge-train-group`, chips, approve (success/ember), deny (danger), count badge
- [ ] Respect existing glass/phuglee panels

### Task 2: Render from lastResult

- [ ] On `renderResults`, if admin → show train wrap; build cards from `reviewGroups`
- [ ] Mode toggle kept vs train
- [ ] Expand optional details for sample rows if `rowIds` resolvable from lastResult

### Task 3: Kept list enrichment

- [ ] Even in kept table, add optional columns or tooltip for matchedIndicators + description (admin or all users) — **minimum:** show in train cards; nice-to-have in table for admin

### Task 4: Verify

```powershell
powershell -File scripts\verify-live.ps1
# Manual: login admin → /bridge process file → Train brain visible
# Manual: non-admin → no train wrap
```

- [ ] Commit: `feat(filter): phase 44 admin train-brain review UX`

---

## Out of scope

Persisting decisions (45), phrase brain panel (46)
