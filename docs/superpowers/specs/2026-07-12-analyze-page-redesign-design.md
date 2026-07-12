# Design Spec — Analyze Page Full Redesign

**Date:** 2026-07-12  
**Status:** Draft for user review (shape brief confirmed)  
**Product:** Phuglee Distress OS — Analyze (`/analyzer/`)  
**Surface:** `modules/property-analyzer/public/` + shell `public/css/distress-analyzer-os.css`  
**Approach:** Unify in place (Approach 1)  
**Process:** Superpowers brainstorming + Impeccable critique/audit/shape  

**Related:**
- Critique snapshot: `.impeccable/critique/2026-07-12T23-02-22Z__modules-property-analyzer-public-index-html.md`
- Heuristics baseline: **22/40** · Audit technical: **8/20**
- Supersedes partial intent of: `docs/gsd/plans/2026-07-08-analyze-page-simplification.md` (IA cleanup not fully finished)
- Preserves behavior from: location hub, scan desk v3.1, live scan feed, virtual scroll

---

## 1. Problem

Analyze is a stack of partial redesigns (cyber HUD → location hub → scan desk → glass elevation). Styles, class names, and section hierarchy do not agree. Operators feel the mismatch from scan desk through property profiles and full-screen review.

| Layer | Evidence | Cost |
|-------|----------|------|
| CSS archaeology | ~15 stylesheets: `cyber-*`, `phuglee-*`, `premium-*`, `heat-theme`, `app.css` | Specificity wars; every polish reopens fights |
| Theme body classes | `cyber-theme heat-theme analyze-phuglee` | Three identities at once |
| Legacy DOM | Hidden controls, agent grid, dual upload paths | Dead chrome fights live UI |
| Competing sections | Live KPIs + session buckets + local KPIs + rankings | Same numbers thrice; unclear truth |
| Property modal | `cyber-dialog`, REC, reticle, NO SIGNAL | Trust collapse at dial moment |
| Prop cards | `card-cyber` + glass overrides | Class names from a different era |

**Impeccable critique (2026-07-12):** first paint sells a dashboard; primary path is verbally clear and visually contradicted. Live scan and review are the emotional peaks; desk and modal damage the story.

---

## 2. Goal

One **product-grade Analyze surface**:

- **Filter glass** structure and component vocabulary  
- **Analyze heat** only on judgment moments (Start Scan, Distressed emphasis, live feed, tier states, profile distress)  
- Primary path **new list → scan → review** owns first paint  
- Past markets **hard-demoted**  
- Property modal and full-screen Review rebuilt into the same system  

**Success criteria**

1. First paint answers “upload/scan this list” without scrolling past history or empty rankings.  
2. Visually continuous with Filter (panels, buttons, KPIs); heat only where judgment lives.  
3. Card → property modal → review feels one product.  
4. No visible cyber identity (REC, reticle, NO SIGNAL, scanline aesthetic).  
5. Existing scan / review / export / tier engines still work; analyzer tests still pass.  
6. Critique re-run target: heuristics **≥ 30/40**, technical audit **≥ 14/20**.

---

## 3. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope of redesign | **Full (D):** visual system + IA + profiles + review |
| Visual lane | **Hybrid C:** Filter glass + Analyze heat |
| Primary happy path | **A:** new list → scan → review |
| Past markets / rankings | **Hard demote (A):** not competing on first paint |
| Property profile | **Redesigned modal (A)** |
| Review overlay | **In scope** — full hybrid redesign |
| Implementation approach | **Unify in place (1)** — no second app shell |
| Spreadsheet upload on desk | **Keep** (path A) |
| Session KPIs when empty | **Hidden until first scan result** |
| Local market KPIs | **Only after market selection in history** |
| Cyber CSS as identity | **Retire from this route** |
| Engines (scan/tier/export/session) | **Preserve behavior** — UI layers only unless hooks require tiny additives |

---

## 4. Non-goals

- Rewriting `scan.js`, `lib/tier-engine.js`, export schema, or session persistence model  
- New React/Tailwind app or parallel stack  
- Collect, Filter, marketing pages (except shared token alignment by reuse)  
- Full PRODUCT.md / brand init (optional follow-up via `/impeccable init`)  
- Replacing review with modal-only review (out of scope this pass)  
- Calendar-based history filters  

---

## 5. Design direction (Impeccable product register)

| Decision | Choice |
|----------|--------|
| **Register** | Product tool (design serves the task) |
| **Color strategy** | **Restrained** overall; **Committed heat** only on Start Scan, Distressed KPI, live feed pulse, tier pills, Keep/primary review |
| **Scene sentence** | Operator at a dim desk after hours, one market list on screen, Street View of a tired house open — focused judgment, not a cyber command center |
| **Anchors** | Filter/bridge glass desk; Linear (calm density + hierarchy); existing Review keyboard flow (power-user bones) |
| **Typography** | Outfit/body + JetBrains Mono for data; **Anton only for rare display moments**, not panel labels/KPI values (product register) |
| **Motion** | 150–250 ms state feedback; no page-load choreography; respect `prefers-reduced-motion` |

### Absolute bans (must pass)

- Side-stripe borders as accent on cards/nav  
- Gradient text on titles  
- REC / reticle / NO SIGNAL / D4D cosplay  
- Nested cards inside cards  
- Eyebrow spam on every section  
- Equal visual weight for admin vs primary actions  

---

## 6. Information architecture

### 6.1 Zone model

```
┌──────────────────────────────────────────────────────────────┐
│ Distress OS shell nav (unchanged ownership)                  │
├──────────────────────────────────────────────────────────────┤
│ ANALYZE WORKSPACE                                            │
│                                                              │
│  A. Pipeline strip (Upload → Scan → Buckets → Review)        │
│  B. Scan desk (featured) — import, Start/Stop, Review menu   │
│  C. Live scan (only while scanning / just finished)          │
│  D. Session buckets (only after ≥1 result) — ONE KPI truth   │
│  E. Results workbench (after results or explicit open)       │
│       filters · search · cards/table · export                │
│  F. Past markets (hard demote — control, not first zone)     │
│                                                              │
│  OVERLAYS: Property modal · Review mode · Settings/API/Brain │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Visibility matrix

| State | Pipeline | Scan desk | Live scan | Session KPIs | Results | Past markets |
|-------|----------|-----------|-----------|--------------|---------|--------------|
| Empty / no data | On | On (import focus) | Hidden | Hidden | Hidden | Collapsed control only |
| List ready, not scanning | On (Scan active) | On + Start enabled | Hidden | Hidden or one-line count | Hidden | Collapsed |
| Scanning | On (Scan active) | On + Stop | **Primary** | Live KPIs = session truth during scan | Hidden | Collapsed |
| Has results, idle | On (Buckets/Review) | Compact | Hidden | **One strip** | Available (default open if last session had selection; else after “Work results”) | Secondary |
| Review mode | Hidden under overlay | Under overlay | Under overlay | Under overlay | Under overlay | Under overlay |

**Hard demote rule:** Past markets never appears as a full peer panel on first paint. Access via compact control (“Past markets”) that expands the historical picker only when invoked.

**One KPI truth:** During scan, live KPI strip is the session truth. After scan, the same five buckets render as the session strip (not a second competing grid). Local market KPIs appear only after a past-market selection.

### 6.3 Action hierarchy (scan desk)

| Priority | Control | Notes |
|----------|---------|-------|
| Primary | Start Scan / Stop Scan | Heat accent |
| Secondary | Review Leads ▾ | Distressed first in menu |
| Tertiary (overflow) | Export backup, API usage, Brain, Settings | Not on primary action row |

---

## 7. Component design

### 7.1 Scan desk

- Featured glass panel (`phuglee-panel-featured` or successor token)  
- Import dropzone: teach expected columns or “list from Filter”; glass/gold parity with Filter  
- Status line: location + count when ready  
- Pipeline steps reflect real state (complete / active / upcoming)  

### 7.2 Live scan

- Address feed primary; progress fraction; Stop  
- KPI chips: Distressed (accent), Well Maintained, Land, Blocked, Scanned, Workers  
- Meta: auto-save + worker auto-adjust (plain language)  
- Keep worker engine behavior; retire agent-grid as primary UI (legacy may remain hidden only if tests require IDs — prefer migrate IDs, then delete husks)  

### 7.3 Session buckets

- Single `bridge-kpi` style grid aligned with Filter  
- Distressed uses heat accent  
- Needs Review residual (hidden at zero)  
- Clicking a KPI filters results when results workbench is open  

### 7.4 Results workbench

- Title: “Distress Rankings” or “Leads” + count  
- Filters: one canonical tier set  
- Search (`/` shortcut preserved)  
- Cards / table toggle with accessible names  
- Export CSV / Excel in results header  
- Bulk edit preserved  

### 7.5 Property cards

- Drop `card-cyber` visual identity; use glass card primitive  
- Street View thumb, address, tier pill (heat for Distressed), key contact line  
- Selected / bulk states use tokens, not ad-hoc neon  

### 7.6 Property modal (redesign)

```
┌─────────────────────────────────────────────────────────────┐
│ Address · tier pill                    [← Prev] n/m [Next →] [×] │
├──────────────────────────────┬──────────────────────────────┤
│ Street View (primary media)  │ Distress level (clean number  │
│ Satellite optional inset     │   or compact meter — no HUD) │
│ Human empty if no imagery    │ Contact stack + copy         │
│                              │ Violations / mailing / equity │
│                              │ Property facts               │
│                              │ Tier edit entry              │
└──────────────────────────────┴──────────────────────────────┘
```

**Kill:** REC badge, scan-line cosplay, target reticle, “NO SIGNAL”, “Satellite · D4D”, `inspector-cyber` as aesthetic class (rename to neutral if needed for JS).  

**Keep:** prev/next, Esc, imagery load behavior, enrichment profile sections, score/tier edit entry points.

### 7.7 Review overlay (redesign)

- Same glass + heat tokens as modal and desk  
- Media left, meta right, action bar bottom  
- Actions + kbd: Keep `1`, Well Maintained `2`, Land `3`, Later `4`, Blocked `5`, Undo `6`  
- Progress, checkpoint, Exit  
- No cyber panel-chrome cosplay; plain focused judgment desk  

### 7.8 Modals (settings, upload legacy, brain, API usage)

- Shared dialog primitive (glass elevated) — not `cyber-dialog` as identity  
- Upload modal may remain for lead-type tagging edge cases; primary import is scan desk dropzone  
- Settings/Brain admin-gated where already gated  

---

## 8. Canonical vocabulary

| Concept | Canonical label (UI everywhere) |
|---------|----------------------------------|
| Distressed homes | Distressed |
| Clean / skip | Well Maintained |
| Vacant / lot | Land |
| Imagery blocked | Blocked |
| Uncertain residual | Needs Review |
| Review menu “Manual Review” | Needs Review |
| Filter “Vacant Lot/Land” | Land |

Display names in export may keep schema fields; **UI labels** must not fracture.

---

## 9. Visual / CSS strategy

### Ownership tree (target)

1. `tokens.css` — Phuglee + glass tokens  
2. `phuglee-components.css` — shared primitives  
3. `phuglee-analyzer.css` — Analyze layout & zones (primary surface CSS)  
4. `public/css/distress-analyzer-os.css` — embedded shell overrides only  
5. Minimal residual in `app.css` / review CSS for behavior-bound rules  

### Cyber retirement

- Remove identity: scanlines, grain, vignette, ambient orbs, cyber-grid as visible atmosphere on Analyze  
- Stop loading or neutralize `cyber-theme` / heat dual identity on body for this route  
- Rename or restyle `cyber-dialog` → shared dialog classes without requiring engine rewrites  
- Do not leave `card-cyber` as the public visual name if it implies a second system  

### Implementation phases (for plan)

1. **Distill IA** — first paint, KPI truth, demote history/results  
2. **Layout** — zones, action row, modal grid, review chrome  
3. **Quieter** — purge cyber identity  
4. **Typeset** — product type scale; Anton out of labels  
5. **Clarify** — tier vocabulary  
6. **Adapt** — responsive filter/bulk/review  
7. **Harden** — a11y, dead DOM, duplicate IDs  
8. **Polish** — critique re-run  

Impeccable command order for implementers:  
`distill` → `layout` → `quieter` → `typeset` → `clarify` → `adapt` → `harden` → `polish`.

---

## 10. Data flow & state (UI only)

No new backend APIs required for the redesign.

| Concern | Source of truth | UI binding |
|---------|-----------------|------------|
| Pending scan queue | session / import-meta | Scan desk count + Start enable |
| Scan progress | scan session events | Live feed + live KPIs |
| Results list | session results + filters | Workbench + virtual scroll |
| Location filter | location-hub state | Past markets + breadcrumb |
| Selected property | state.selectedKey | Card selected + modal |
| Review queue | review.js flows | Review overlay |

Preserve: virtual scroll, import dedupe, adaptive workers, backup export, profile enrichment rendering.

---

## 11. Error handling & empty states

| Case | Treatment |
|------|-----------|
| No data | Scan desk only; teach import; link/context to Filter optional |
| No Street View | “No Street View for this address” — not NO SIGNAL |
| Rate limit / API fail | Existing scan issue alert; plain language |
| Empty filter result | “No leads in this tier” + clear filters |
| Save failed toast | Keep retry behavior; style with glass toast system |
| Review complete | Clear panel + Exit; path to export distressed |

---

## 12. Accessibility

- One primary landmark; skip link preserved  
- All icon-only buttons get `aria-label` (view toggle, closes)  
- Search inputs labeled (visible or `aria-label`)  
- No duplicate IDs (`failSvCount` etc.)  
- Focus trap in modal + review; Esc exits  
- Focus visible on all interactive controls  
- Contrast ≥ 4.5:1 body; tier pills not color-only  
- `prefers-reduced-motion` on card hover and reveals  

---

## 13. Testing strategy

### Preserve (engine / regression)

- Existing `modules/property-analyzer/tests/*` — must stay green  
- Distress-os rewrite/embed tests for analyzer proxy  

### Add / extend (UI-facing, TDD-friendly)

| Area | Tests |
|------|-------|
| Visibility matrix | Pure functions: given state flags, which zones visible |
| Canonical labels | Map filter keys → display labels single source |
| First-paint rules | Empty session → rankings/KPIs hidden |
| Vocabulary | Review menu / filter / KPI labels match constants |
| Profile empty copy | No “NO SIGNAL” string in rendered empties |

Prefer pure helpers extracted from render/session wiring over brittle full-DOM snapshots where possible.

### Manual / browser verification

- Empty → upload → start → live feed → complete → review Distressed  
- Card → modal prev/next → Esc  
- Review 1–6 + Exit  
- Embedded shell at `/analyzer/` (sidebar hidden, glass panels)  
- Mobile width: action row and filters usable  
- Re-run `/impeccable critique` + `audit` after ship  

### Live verify (project rule)

After public/server edits: `scripts\verify-live.ps1` from distress-os root.

---

## 14. File map (expected)

| File | Change |
|------|--------|
| `modules/property-analyzer/public/index.html` | Zone structure, modal/review markup, kill HUD chrome |
| `modules/property-analyzer/public/css/phuglee-analyzer.css` | Primary layout system |
| `modules/property-analyzer/public/css/tokens.css` | Any missing glass/heat tokens |
| `modules/property-analyzer/public/css/phuglee-components.css` | Shared dialog/card/button if needed |
| `modules/property-analyzer/public/css/cyber-*.css` | Neutralize or stop loading on Analyze |
| `modules/property-analyzer/public/css/app.css` | Remove conflicts; keep behavior hooks |
| `public/css/distress-analyzer-os.css` | Embedded overrides for new zones |
| `modules/property-analyzer/public/js/scan-ready.js` | First-paint / desk state |
| `modules/property-analyzer/public/js/live-scan-feed.js` | Align with single KPI truth |
| `modules/property-analyzer/public/js/location-hub.js` | Hard-demote presentation |
| `modules/property-analyzer/public/js/render.js` | Cards, KPIs, profile modal body |
| `modules/property-analyzer/public/js/review.js` | Review chrome wiring only as needed |
| `modules/property-analyzer/public/js/state.js` | Visibility flags if needed |
| New small helpers + tests | Visibility matrix, labels |

---

## 15. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Breaking scan/review by renaming DOM IDs | Prefer class/visual changes; keep IDs engines bind to; migrate with tests |
| CSS specificity wars mid-PR | Phase: IA structure first, then quieter purge, then polish |
| Scope creep into engine refactors | Spec non-goals; plan tasks UI-only |
| Power users lose admin affordances | Move to overflow, don’t delete |
| Large HTML/CSS conflict in one PR | Implementation plan: phased tasks + worktree |

---

## 16. Implementation plan handoff

When this spec is approved:

1. Invoke **writing-plans** → `docs/superpowers/plans/2026-07-12-analyze-page-redesign.md`  
2. Create **git worktree** for isolation  
3. **subagent-driven-development** with TDD + code review per task  
4. Impeccable order: distill → layout → quieter → typeset → clarify → adapt → harden → polish  
5. Verification before completion claims; `verify-live.ps1` after surface edits  

---

## 17. Spec self-review

| Check | Result |
|-------|--------|
| Placeholders / TBD | None material; open questions asserted as defaults in §3 |
| Internal consistency | Hybrid C + path A + hard demote + modal + review in scope — aligned |
| Scope | Single surface redesign; engines out — focused enough for one plan |
| Ambiguity | “Work results” default: open workbench when session already has results on load; else after first scan completes or user opens it — **explicit default** |
| Stack fidelity | Vanilla HTML/CSS/JS — matches production |

---

## Approval

- [x] Shape brief confirmed (2026-07-12)  
- [ ] Written spec reviewed by user  
- [ ] Ready for writing-plans  

**User review gate:** Please review this file and request changes or approve to proceed to the implementation plan.
