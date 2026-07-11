# Filter page UI map (`/bridge`)

> **Purpose:** Research-only inventory of the Filter surface as it exists today, so visual/UX upgrades can be recommended against real code — not invented plans.  
> **Route:** `/bridge` (shell nav label **Filter**, emoji 🧹)  
> **Primary files:** `public/bridge.html`, `public/css/bridge.css` (~1.9k lines), `public/js/bridge.js` (~3k lines), `public/js/bridge-train.js` (~160 lines)  
> **Mapped:** 2026-07-10  
> **Out of scope for this doc:** Implementation plans, GSD milestones/phases, PR breakdowns.

---

## 1. Surface inventory

### Page chrome & atmosphere

| Piece | Location | Notes |
|-------|----------|--------|
| Auth guard scripts | `bridge.html` L32–35 | `auth-session`, `auth-config`, `auth-guard`, `phuglee-session-headers` |
| Theme / tokens stack | L16–31 | `tokens`, glass, heat-base, premium atmosphere/components, shell, shell-nav, settings, command-palette, distress-status, **bridge.css**, phuglee-components, phuglee-a11y |
| Body | L37 `body.has-premium-bg.bridge-page` | Premium photo bg uses **`premium-bg--subtle`** (not `--strong` like Collect) |
| Premium layers | L39–43 | photo / grain / wear |
| Extra radial wash | L44 `.bridge-bg` | Orange radial + `--bg-deep` (`bridge.css` L10–17) |
| Shell nav / footer | L45, L434 | `#distress-os-nav-mount`, `#distress-os-footer-mount` via `shell-nav.js` |
| Skip link | L38 | `phuglee-skip-link` |
| Reveal motion | `main[data-phuglee-reveal]` + children | `phuglee-motion.js` |

### Hero

| Element | File:line | Content |
|---------|-----------|---------|
| Step label | `bridge.html` L49 | `Step 02 · Filter` |
| H1 | L50 | **Scrub the Mess** (ops voice — matches M5 copy DO list) |
| Lead | L51 | Long product explainer: formats, normalize, tag, save, download; Analyze stays separate |

### Proof rail (static “steps” strip)

| Element | File:line | Content |
|---------|-----------|---------|
| Rail | L54–85 | 3 equal columns: Pick Your City · Choose the Lead Type · Filter Quality Results |
| Featured first item | L55 | Gold accent rail; icon + gold title only — **no live metrics** |
| Structure | `bridge.css` L76–84 | `grid-template-columns: repeat(3, 1fr)` |

### Pipeline nav (interactive step indicator)

| Element | File:line | Steps |
|---------|-----------|--------|
| `<ol id="bridge-pipeline">` | L87–94 | 1 City · 2 Type · 3 Upload · 4 Results |
| States | `bridge.css` L311–357 | `.is-active` (gold/orange number), `.is-complete` |

### Progressive step panels

| Step | Panel id / section | File:line | Primary CTA / controls | Default visibility |
|------|-------------------|-----------|------------------------|--------------------|
| **1 City** | (no id; first `.bridge-panel`) | L96–171 | State/city selects; **Attachment history**; **City reply (no list yet)** outcomes + **Save to City Tracker** | Always visible; selects start disabled/loading |
| **2 Type** | `#bridge-type-panel` | L173–194 | Two radio cards: Code Violation / Water Shut Off | `hidden` until city selected |
| **3 Upload** | `#bridge-upload-panel` | L196–226 | Response date, dropzone (≤5 files), format badges, **Process upload**, Clear files | `hidden` until type chosen |
| **Loading** | `#bridge-loading-panel` | L228–233 | `phuglee-loading-state` + rotating copy | `hidden` during process |
| **4 Results** | `#bridge-results-panel` | L235–358 | KPIs, mode tabs, table, save, attach | `hidden` until process success |
| **Saved lists** | `#bridge-lists-panel` | L360–390 | Download all CSV/XLSX, Clear all; per-row rename/download/delete | Always on page; empty or table |
| Trust line | L392 | “Public records only · Your data stays on your machine” | Always |
| Global error | `#bridge-error-wrap` | L394–397 | Message + **Try again** | `hidden` until error |

### City step sub-surfaces

- **State / City selects** — L99–109; load from `/api/bridge/states`, `/api/bridge/cities?state=…` (`bridge.js` ~1463–1490).
- **Attachment history** — button L112; modal dialog L400–411; list from `/api/bridge/history/:cityId`.
- **City reply (no list yet)** — L114–170; outcomes: needs_clarification, no, other_source, they_charge, approved_bad_data; optional notes; request type; **Save to City Tracker** → `/api/bridge/city-outcome`.

### Type step

- Equal 2-card radio grid (`bridge-type-grid`) — CV / WS icons, short descriptions (L176–193).

### Upload step

- Format badges: `.xlsx .csv .pdf .docx .txt .jpg .png` (L199–201).
- Response date (required for Form Forge KPIs) (L203–213).
- Dropzone + multi-file (max 5) (L214–221).
- **Process upload** primary; **Clear files** ghost (L222–225).

### Loading state

- Panel: L228–233; `aria-live="polite"` `aria-busy="true"`.
- Copy rotation (`bridge.js` L4–12, `startLoadingAnimation` ~1631–1638): Detecting format → Parsing → Normalizing → Tagging → Deduplicating → Cross-checking Analyze → Building filtered list (900ms interval).
- Uses shared `phuglee-loading-bar` / `phuglee-loading-copy`.

### Results surface

| Sub-area | File:line | Behavior |
|----------|-----------|----------|
| Meta line | L237 `#bridge-results-meta` | Kept count, file(s), type, city, parser, Analyze index count, format-reuse, duration, admin train tip (`bridge.js` ~2260–2294) |
| KPI grid | L238 `#bridge-kpi-grid` | Kept (accent), no distress, discarded other, already in Analyze (if >0), needs review, deduped (`renderKpis` ~1645–1663) |
| Stub / discard note | L239 `#bridge-stub-note` | Discard / review / import notes |
| **Mode tabs (admin)** | L241–249 `#bridge-train-wrap` | Kept list · Train brain · Filter brain — **admin only** (`isBridgeAdmin`, train wrap hidden for non-admin ~2334–2347) |
| Train brain panel | L251–271 | Search, Undo, Marked distressed / Not marked distressed group cards |
| Filter brain panel | L272–290 | Metrics, active type rules, proposed/active phrase rules |
| Results toolbar | L293–318 | Search, tag, confidence, needs-review checkbox, **Preview CSV** |
| Results table | L320–333 | Street, Violation/Issue, Distressed Tag, Confidence, Date; sort + page size 50 |
| Pagination | L334 | Prev/next style controls |
| Workflow strip | L336 | Teaching: Process → (Train) → Save → Download → enrich outside → manual Analyze |
| Save filtered list | L338–348 | Name + **Save list** → `/api/bridge/lists` POST |
| Optional attach | L350–357 | **Attach versioned dataset** → `/api/bridge/attach` |

### Saved lists

| State | File:line |
|-------|-----------|
| Empty | L372 `#bridge-lists-empty` — dashed box teaching full path |
| Table | L373–388 — Type badge, rename input, uploaded, records, status, city, CSV/XLSX/Delete |
| Total strip | `#bridge-lists-total` — combined record count |
| Post-save flash | JS-built `#bridge-lists-flash` (`resetImportAreaAfterSave` ~1879–1918) — green success + optional **Download this list (CSV)**; auto-hides 10s; full import-area reset |

### Dialogs

1. **Attachment history** — L400–411 (`dialog.bridge-history-dialog`).
2. **Confirm Violation Type column** — L413–432 — admin-only gate for unknown formats (`TYPE_COLUMN_CONFIRM_REQUIRED`); candidates + samples; Cancel / Confirm.

### Primary CTAs (operator path)

| Priority | Control | When it matters |
|----------|---------|-----------------|
| 1 | Process upload | After city + type + files |
| 2 | Save list | After process with kept rows |
| 3 | Download (per-list / all / flash) | After save — enrichment handoff |
| Side | Save to City Tracker | Reply without usable file |
| Side | Attach versioned dataset | Optional Forge turnaround |
| Admin | Train Distressed / Not Distressed buttons | Quality loop |
| Admin | Filter brain Activate/Disable | Rule lifecycle |

### Empty / loading / error (summary)

| State | Where | Mechanism |
|-------|-------|-----------|
| States loading | City selects | “Loading states…” option |
| No cities for state | City select | Options from API / empty |
| No files yet | Dropzone | Default “Drop files here” |
| Process loading | `#bridge-loading-panel` | Rotating steps + bar |
| No kept rows / stub | Results meta + stub note; save/table hidden if empty |
| No saved lists | `#bridge-lists-empty` | Dashed teaching empty |
| Train empty groups | Train sections | `bridge-train-muted` empty copy |
| Process / network error | `#bridge-error-wrap` + retry | `showError` + `lastFailedAction` |
| Outcome / save / attach status | Inline status nodes | success/error classes |
| Type confirm cancelled | Error wrap | Soft messaging mid multi-format confirm |
| Non-admin type confirm needed | Error | “Ask an admin…” (`bridge.js` ~2851–2855) |

---

## 2. Design system usage

### Shared stack (inherited)

| Layer | Used on Filter? | Source |
|-------|-----------------|--------|
| `--phuglee-*` tokens | Yes extensively in `bridge.css` | `tokens.css` |
| `premium-bg` + grain/wear | Yes, **`--subtle`** | `premium-atmosphere.css` |
| `phuglee-panel` | Proof rail + every step panel + dialogs | `phuglee-components` / glass |
| `phuglee-btn` primary/secondary | Mixed on CTAs | Often **dual-classed** with `bridge-btn` |
| `phuglee-loading-state` | Loading panel | Shared loading primitive |
| `phuglee-pattern-bg--subtle` | Main | Brand pattern |
| `phuglee-skip-link`, a11y | Yes | `phuglee-a11y.css` |
| `distress-glass--float` | Dialog cards | Glass elevation |
| Shell nav / footer / settings / command palette | Yes | Global chrome |
| `data-phuglee-reveal` | Hero + major sections | Motion system |
| `hub-*` classes | **No** | Collect uses `collect-hub-*`; Filter does not use `hub.css` |
| Heat field / glow | **No** | Collect adds `heat-field`; Filter only subtle premium + `.bridge-bg` |
| Home story / territory HUD classes | **No** | Marketing only (`home-*`, coverage dock) |

### One-off / local `bridge-*` system

`bridge.css` is a full page stylesheet (~1900 lines). Almost every control is `bridge-*`:

- Layout: `bridge-main` (max-width **920px** centered), `bridge-hero`, `bridge-panel`, `bridge-row`
- Wizard: `bridge-pipeline-*`, `bridge-step-badge`, `bridge-type-*`, `bridge-dropzone*`
- Results: `bridge-kpi*`, `bridge-results-*`, `bridge-tag*`, `bridge-pagination*`
- Persistence: `bridge-save-*`, `bridge-lists-*`, `bridge-list-*`
- Admin: `bridge-mode-tab`, `bridge-train-*`, `bridge-brain-*`
- Dialogs: `bridge-history-dialog*`, `bridge-type-confirm-*`
- Buttons: parallel system `bridge-btn` / `bridge-btn-primary` / `bridge-btn-ghost` **alongside** `phuglee-btn` (some CTAs carry both; some only `bridge-btn`)

### Tokens / motion notes

- H1 uses **cream→orange gradient text** (`bridge.css` L55–65) — M5 style bible prefers solid cream when avoidable; gradient titles already system-wide elsewhere.
- Card/type hover uses glass elevated shadows and small transforms (`bridge-type-body` transitions ~L514–517).
- Dialog open animation: `@keyframes bridge-dialog-rise` (~L1601).
- Train card exit: `.bridge-train-group.is-exiting` animation (~L2068+).
- No Filter-specific theater videos or map HUD on this page (marketing uses `/videos/filter.mp4` on home/heat only).

---

## 3. Visual density & hierarchy

### What reads primary today

1. **Centered H1 “Scrub the Mess”** + long lead (marketing-length, not desk-length).
2. **Equal 3-up proof rail** — icon + gold labels; decorative, not operational proof.
3. **4-step pipeline chips** — clear process orthography.
4. **Sequential form panels** — each step is a similar `phuglee-panel` block with step badge + uppercase H2 + stone lead.
5. **Process upload** and later **Save list** / **Download all** as fire CTAs (gold→orange gradients).

### What reads secondary / flat

- City outcome radiogroup and attachment history sit under step 1 without a strong “primary path vs exception path” visual split (exception path competes with the happy path).
- Type cards are **peer tiles** (2 equal glass cards) — functional but grid-like.
- Results KPIs are a uniform auto-fit grid; only “Kept” gets accent — hierarchy exists but is quiet.
- Admin mode tabs (Kept / Train / Brain) appear only after process; for admins the results zone becomes dense (toolbar + table + train + save + attach) without a mission-style dominant panel.
- Saved lists is a spreadsheet-like table always below the fold — operationally critical, visually “admin tool,” not “war room inventory.”
- Workflow teaching strip (L336) is muted stone text — easy to miss, but important for Analyze boundary.

### Flat / bland risk (vs M5 bar)

| Pattern | Filter today | M5 anti-pattern? |
|---------|--------------|------------------|
| Equal 3-card feature strip | Proof rail | **Yes** — “No new equal 3-card feature grid” |
| Centered wizard in 920px column | Form SaaS | Not forbidden, but reads less “ops desk” than Collect/Command asymmetry |
| Long essay lead under H1 | Product copy | Collect lead is shorter; Command is punchier |
| Static proof labels | No live counts | M5 wants **proof-first / live when possible** |
| Subtle atmosphere | Weaker photo presence | Collect uses `premium-bg--strong` + heat field |
| Dual button systems | bridge-btn + phuglee-btn | Visual consistency drift |

**Net hierarchy:** Clear *sequential process*, weak *single dominant job surface*. The page tells you the four steps; it does not feel like you are already “in the scrub” the way Collect feels like you are already “at the clerk desk.”

---

## 4. Comparison anchors (vs shipped gritty-premium surfaces)

Reference bar: `.planning/v1.4-GRITTY-PREMIUM.md`, `docs/gsd/milestones/M5-gritty-premium-surfaces.md`, `docs/superpowers/specs/2026-07-09-gritty-premium-surfaces-design.md`.  
M5 **explicitly out-of-scoped Filter internals** (M5 milestone “Out of scope”). Filter never received phases 32–36 treatment. M6 territory theater is homepage-only.

| Dimension | Command (P32) | Collect (P33) | Home pipeline / territory (P34–41) | **Filter (`/bridge`) today** |
|-----------|---------------|---------------|-------------------------------------|------------------------------|
| **Layout metaphor** | Mission board / ops desk | Work desk: primary Start + secondary tracker | Story strip + war-room map HUD | Vertical **wizard form** (center column) |
| **Tone** | “Clerk → scrub → dial. One board.” | “Hit the Clerk” + channel chips | Same-address film + live coverage | “Scrub the Mess” H1 good; body is **help-doc + form** |
| **Proof** | Live city/state counts, Forge/Analyze dots | Channel list + tracker path | Real map counts, ticker, spotlight | **Static** 3 labels; KPIs only **after** process |
| **Asymmetry** | Dominant mission + status stack | Primary panel + side scrap | Bezel story / map + close | Symmetric panels; equal type cards; equal proof cells |
| **Motion** | Reveal + status | Reveal + dialog wizard | Pipeline video, map cascade, ticker | Reveal + loading copy cycle + dialog rise + train exit |
| **HUD language** | Status dots, pulse nodes, tool chips | Desk kickers (“Start a batch”) | Display-scale counts, heat palette | Step badges 1–4; KPI labels; spreadsheet chrome |
| **Atmosphere** | command-bg | **strong** premium + heat field | Hero-grade photo / film | **subtle** premium + soft orange radial |
| **Primary CTA** | Mission CTA driven by health/coverage | **Start Requests** dominates page | Fused close CTA | CTAs appear **late** in sequence (Process, then Save) |
| **Personality** | Ops slang in pulse (“Scrub the Mess”) | Ops slang everywhere | Theater + proof | Ops H1; rest is operational prose + admin tooling density |

### Marketing Filter vs product Filter

- Home/heat **Filter stage** uses `/videos/filter.mp4` and tally “raw → kept” UI language (`home-ui-preview.css` filter scene).
- Live `/bridge` does **not** reuse that film language — operator page is tables, selects, dropzone.

### What Filter already matches M5 voice

- H1 **Scrub the Mess** (command pulse + style bible DO).
- Step label `Step 02 · Filter` parallels Collect `Step 01 · Collect`.
- Trust line identical pattern to Command/Collect.
- Distress tags and orange review flags carry brand color language.

### What Filter still fails against the raised bar

- Still can feel like a **generic dark SaaS multi-step form** wrapped in premium tokens.
- Proof rail is the clearest “pre-M5 equal feature grid” leftover on a product step page.
- No live “mission” framing (e.g. saved list backlog, last scrub, open train debt for admin).
- Non-work theater: no scrub tally animation, no dossier bezel, no ember heat field.

---

## 5. Interaction model

### Happy path (non-admin)

```text
Open /bridge (auth)
  → Load states; pick State → City
  → Pick upload type (CV / WS)
  → Set response date; drop ≤5 files
  → Process upload → /api/bridge/process
  → Review KPIs + table (filter/sort/page)
  → Optional Preview CSV
  → Save list → /api/bridge/lists
  → Full UI reset; flash on Saved lists
  → Download CSV/XLSX (one or all) for external enrichment
  → Manual Analyze import later (never auto-pushed)
```

### Parallel / exception paths

| Path | Flow |
|------|------|
| **City reply, no list** | After city: choose outcome → optional notes → Save to City Tracker (`/api/bridge/city-outcome`) — does not replace file upload path |
| **Attachment history** | Modal of prior versioned attaches for city |
| **Optional attach** | After results: attach to Form Forge city profile for turnaround KPIs |
| **Admin type-column confirm** | 409 `TYPE_COLUMN_CONFIRM_REQUIRED` → dialog(s) for multi-format → re-POST process |
| **Admin Train** | After process: Train brain tab → Approve/Deny groups → `/api/bridge/brain/decisions`; live list mutation; Undo stack |
| **Admin Brain panel** | View/activate/disable rules via `/api/bridge/brain*` |
| **Soft train-before-save** | Admin on Train tab with open groups: confirm dialog before save (not hard block) |
| **Clear all / delete list** | User-initiated only; never agent wipe (AGENTS.md) |

### Friction points (observed)

1. **Long front-loaded setup** before any “scrub theater” — city → type → date → files → process before KPIs appear.
2. **City reply outcomes** share step 1 with the main path; cognitive load for “I have a file” operators.
3. **Type column confirm** can interrupt multi-file batches (up to 8 rounds); non-admin hard-stops with ask-admin message.
4. **Post-save full reset** is intentional for multi-city batches but surprises operators who want to re-inspect the just-processed table (flash points them to Saved lists).
5. **Analyze boundary** is correct product-wise but easy to misunderstand; teaching strip is low-contrast.
6. **Admin density**: Train + Brain + Kept + Save + Attach + Saved lists on one long scroll after process.
7. **Dual empty teaching** (saved lists empty + long leads) repeats the same pipeline explanation.
8. **Date required** for process path is operationally right for KPIs but adds a form field before the dropzone climax.

---

## 6. Asset / motion / copy gaps

| Gap | Evidence |
|-----|----------|
| **No Filter product video** on `/bridge` | `filter.mp4` only on `index.html` / `heat.html` story stages |
| **No duck / mascot peak moment** | M5: full duck only hero/peak empty; Filter empty lists is plain dashed text box |
| **Proof rail not live** | Labels only — no “lists staged”, “records ready”, coverage, or last-run stats |
| **Atmosphere underpowered vs Collect** | `premium-bg--subtle` vs Collect `--strong` + heat-field |
| **Loading is copy-only** | Rotating phrases + bar; no scrub tally, kill/keep visualization, or address dossier film |
| **KPI grid arrives late** | No anticipatory “desk” metrics at idle |
| **Personality peaks at H1** then drops into form labels (“Select city profile”, “Label upload type”) | Collect keeps desk voice throughout |
| **Train copy is strong (emoji ops)** | Distressed / Not Distressed buttons — personality exists mainly in **admin** train, not main operator surface |
| **Success flash is green SaaS-adjacent** | `.bridge-lists-flash` green palette (`bridge.css` ~1285–1316) vs ember/gold brand heat (M6 avoided SaaS green on territory) |
| **No reduced-motion callouts specific to Filter** | Dialog/train animations exist; not audited here for full `prefers-reduced-motion` coverage beyond shared motion |
| **Static proof icons** | SVG pin / list / funnel — fine, but not proof imagery (distress photo, clerk list snippet) |

---

## 7. Constraints (must not break)

### Data & runtime (AGENTS.md hard rules)

- **Never wipe** Filter saved lists (`FILTER_LISTS_ROOT` / `data/filter-lists/`) or Superpower Brain (`BRIDGE_BRAIN_ROOT` / `data/bridge-brain/`) as part of UI work.
- User-only deletes via Filter UI or explicit wipe request.
- Restarts OK; lists/brain on disk/volume.

### Product / API contracts

| Contract | Notes |
|----------|--------|
| **Auth** | Page gated; session headers for APIs |
| **Admin brain** | Train/Brain chrome + brain APIs **admin-only**; non-admin must never see train tabs or call decisions/undo |
| **Process pipeline** | `/api/bridge/process` multipart; type-column confirm resume fields; multi-format confirm loops |
| **List save/download** | CRUD + download-all formats; post-save reset behavior intentional for batching |
| **City outcome** | Tracker path independent of lists |
| **Attach** | Optional Forge versioning; **does not** send leads to Analyze |
| **Water shut-off** | Brain type-suppression rules must not corrupt water handling (M7 design invariant) |
| **DOM IDs / hooks** | Large surface of stable IDs (`bridge-process`, `bridge-save-list`, train/brain nodes, list table actions) — tests and JS tightly coupled |
| **Analyze isolation** | Nothing auto-imports to Analyze; copy and workflow must stay honest |
| **Auth user check** | `isBridgeAdmin()` via settings session user `admin` |

### Design system / shell

- Preserve shell nav Filter entry (`shell-nav.js` bridge id).
- Prefer vanilla stack; no new framework (M5 D6 spirit still applies sitewide).
- After any `public/` edit: `scripts/verify-live.ps1` per project rules (operational constraint for implementers).

### Regression hot zones

- `bridge-train.js` pure helpers unit-tested without DOM.
- Train decision keys prefer `groupId` (singleton / shared type-key bugs already fixed historically).
- Soft train-before-save must remain non-blocking if cancelled.
- Type confirm non-admin error path must stay clear.

---

## 8. Evidence-based upgrade opportunities

Observations only — grounded in gaps vs M5 gritty-premium / M6 territory-theater patterns **already in-repo**. No phase plan.

1. **Retire or reforge the equal 3-up proof rail**  
   Today: decorative equal grid (`bridge.html` L54–85; `bridge.css` L76–84). M5 anti-slop forbids equal feature grids; Command replaced them with live status + mission.

2. **Asymmetric “scrub desk” landing instead of centered essay + wizard stack**  
   Collect’s primary panel + side scrap (`collect.html` L63–89) shows the pattern: one dominant job surface, secondary history/tracker. Filter’s 920px centered stack lacks a dominant work object at idle.

3. **Live / proof metrics at idle**  
   Command loads real coverage + health; Filter KPIs only post-process. Opportunity: staged list count, total records ready, last save, open admin train debt — from `/api/bridge/lists` already fetched on load.

4. **Strengthen atmosphere to match product step peers**  
   Collect uses `premium-bg--strong` + heat field; Filter uses `--subtle`. Side-by-side with hero/Collect, Filter can read like a lighter admin tool.

5. **Bring marketing Filter theater language into the product moment**  
   Home filter video + raw→kept tally (`/videos/filter.mp4`, `home-filter-tally*`) never appear on `/bridge`. Loading or results reveal could reuse that proof vocabulary without inventing a new brand dialect.

6. **Make Process the visual climax of the upload step**  
   Dropzone is decent; date field and badges compete. Collect puts a single fire CTA as the page story. Filter’s Process is correct but not “desk-primary.”

7. **Separate happy path vs “no list” path hierarchy**  
   City outcomes are valuable but flatten step 1. A collapsed exception drawer or secondary scrap would match Collect’s “Already waiting? Tracker” demotion pattern.

8. **Results as a mission readout, not only a grid of KPI tiles**  
   `renderKpis` is solid data; presentation is equal mini-cards. Territory HUD (display-scale counts) and Command status stack show stronger hierarchy for the same “numbers that matter” content.

9. **Kept / Train / Brain as ops modes with clearer hierarchy**  
   Tabs exist and work; for admin, Train is the superpower story (M7) but sits peer with Kept. Opportunity: keep function, raise visual rank of Train when open groups > 0 (meta already computes train tip).

10. **Saved lists as staging inventory, not only a spreadsheet**  
    Critical master staging (`bridge-lists-panel`) uses table + emoji chips. Could feel like a war-room queue (counts, type heat, ready/downloaded status as HUD) while preserving rename/download/delete actions and APIs.

11. **Post-save success in brand heat, not green flash**  
    `.bridge-lists-flash` green success (L1285+) conflicts with M6 heat-palette direction (avoid SaaS green islands). Ember/gold success would align with tag accents already on the page.

12. **Shorten / punch lead copy under H1**  
    Current lead is accurate but marketing-long. M5 voice prefers ops slang over essay; Collect/Command leads are tighter. Teaching can move into progressive panels or empty states.

13. **Unify button systems**  
    Mixed `bridge-btn` and `phuglee-btn` (sometimes both) create uneven CTA chrome vs Collect/Command which lean on `phuglee-btn` / heat buttons.

14. **Empty Saved lists as peak personality moment**  
    Dashed instructional empty (L372) is clear but generic. M5 allows full duck / peak empty moments; opportunity for one strong empty that still teaches Process → Save → Download without a second essay.

15. **Surface format-reuse / duration / discard story as proof, not only meta string**  
    Process already returns rich `processingMeta` and discard stats (`bridge.js` ~2260–2330). Today they bury into a single meta sentence + optional stub note. HUD chips would make “the scrub worked” felt immediately.

16. **(Stretch) Pipeline pulse alignment with Command**  
    Command pulse links Collect → Filter → Analyze with slang names. Filter’s internal 1–4 pipeline is different orthography (City/Type/Upload/Results). Aligning language or embedding a slim product-spine reminder could reduce mental map friction without changing APIs.

---

## File index (quick)

| Path | Role |
|------|------|
| `public/bridge.html` | Markup surface |
| `public/css/bridge.css` | Page-local design system |
| `public/js/bridge.js` | Full interaction + API client |
| `public/js/bridge-train.js` | Admin train helpers (cards, keys, admin gate) |
| `public/js/shell-nav.js` | Nav item Filter → `/bridge` |
| `public/css/tokens.css` + premium/shell/phuglee* | Shared tokens & chrome |
| `public/videos/filter.mp4` | Marketing-only Filter theater |
| `.planning/v1.4-GRITTY-PREMIUM.md` | Quality bar |
| `docs/gsd/milestones/M5-…` / `M6-…` | Shipped surface metaphors (Filter out of M5 scope) |
| `docs/gsd/milestones/M7-filter-superpower-brain.md` | Capability milestone (brain), not visual gritty pass |
| `AGENTS.md` | Data safety + live verify constraints |

---

*End of research map. No implementation recommendations scheduled; opportunities in §8 are observations for later prioritization.*
