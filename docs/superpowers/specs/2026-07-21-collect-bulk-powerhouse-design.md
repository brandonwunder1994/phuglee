# Collect Bulk Request Powerhouse — Design Spec

**Date:** 2026-07-21  
**Status:** Implemented (Phases 1–5) — hybrid Collect desk live; Form Forge engine admin/secondary  
**Surfaces:** `/collect` (primary), Form Forge engine (`modules/form-forge`), Filter attach (`responseReceivedAt`), Government Lists (phonebook only)  
**Process:** Superpowers brainstorming → this spec → writing-plans → phased execute + ship-gate  

---

## 1. Problem

Collect is the first step of the product spine (Collect → Filter → Analyze). Every dial-ready list starts with a public-records request. Today that job is **fragmented**:

| Piece | Role today | Pain |
|-------|------------|------|
| `/collect` | Thin hub + 3-step wizard (cities → workflow → Form Forge) | Not bulk; not a command center |
| Form Forge | PDF fill, Gmail drip, email-only, portal submit, submission log | Powerful but a separate product operators must leave Collect for |
| Government Lists | ~9.8k researched sources (phonebook) | Bulk “Start requests” opens Collect **empty**; most sources never enter send queues |
| Filter | Attach list + `responseReceivedAt` (“came back”) | Dates live away from where you plan the next send |

The operator already proved the **winning PDF pattern** on the original ~500–600 cities:

1. Fill each FOIA PDF once (Form Forge fill tool) — one-and-done  
2. Click **Send PDF emails** — Gmail **drip** with filled PDF + clerk contact  
3. Track submissions  

That pattern must scale to:

- **Email-only** cities (contact only; no PDF/portal)  
- **PDF cities still needing first fill** (gov-list research, not in the original filled set)  
- **Portal** cities (walkthrough queue, not Gmail drip)  
- **One surface** so the operator does not think in “Collect vs Form Forge vs tracker”

---

## 2. Goals

### 2.1 Operator goals (must)

1. **Bulk first.** Default work is bulk lanes, not city-by-city sales UX.  
2. **Email-only fire queue.** Eligible email-only cities → open queue → uncheck exceptions → **Send all** (Gmail drip).  
3. **PDF fire queue.** Already-filled PDFs → same fire queue + drip as today.  
4. **PDF needs fill.** Gov-list / new cities without a completed form enter a fill queue; after fill they join PDF ready.  
5. **Portal walkthrough queue.** Fast next/submit/log for online portals.  
6. **Tracking powerhouse.** See **request sent date** and **list returned date** without maintaining two mental calendars.  
7. **One desk.** Day-to-day work lives on Collect; no obligatory “go open Form Forge” for normal bulk cycles.  
8. **Accuracy.** Never lose submission history, filled PDFs, cooldown rules, or Filter return dates.

### 2.2 Product goals (near-term operator, later sellable)

- Collect is the **source of request truth for the spine** (what was asked, when, channel).  
- City-by-city remains a **secondary** path for future multi-tenant users; not the primary IA.  
- Government Lists remains the **phonebook / research registry**, not a second send desk.

### 2.3 Non-goals (explicit)

- Big-bang rewrite that moves Gmail/PDF/tracker into new code with no parity tests  
- Making Collect a second Government Lists research console  
- Auto-submitting third-party web portals without a human (no unattended portal bots in v1)  
- Bulk-sending water shutoffs / tax / probate as first-class v1 lanes (phonebook only; code-violation is primary)  
- Wiping or “resetting” `portal-registry`, `submission-log`, filled forms, filter-lists, or bridge brain  

---

## 3. Architecture decision: hybrid 2→3

### 3.1 Operator destination (Approach 3)

Everything the operator needs for requesting and tracking lives under **Collect** (one product surface).

### 3.2 Engineering path (Approach 2 strangler)

Form Forge remains the **engine** (Gmail, PDF fill/save, cooldowns, submission log, portal helpers) until each capability is proven behind Collect’s UI. Then Form Forge’s standalone UI is demoted to admin/debug or retired.

```text
┌─────────────────────────────────────────────────────────┐
│  COLLECT (operator surface — only desk that matters)    │
│  · Bulk lanes · Fire queues · Fill intake · Tracker     │
└───────────────────────────┬─────────────────────────────┘
                            │ APIs / shared shell / embed
┌───────────────────────────▼─────────────────────────────┐
│  FORM FORGE ENGINE (accuracy-critical)                  │
│  · portal-registry · forms/ · Gmail · submission-log    │
│  · email-only / pdf email / portal submit endpoints     │
└───────────────────────────┬─────────────────────────────┘
                            │ response_at / attach
┌───────────────────────────▼─────────────────────────────┐
│  FILTER (list lands)                                    │
│  · responseReceivedAt on attach → forge request fields  │
└─────────────────────────────────────────────────────────┘

Government Lists = phonebook only (sources, playbooks). Selection may
prefill Collect later; it does not own send.
```

**Rule:** If a change would create dual write paths for “sent” or “returned,” it is rejected.

---

## 4. Domain model

### 4.1 Requestable unit

For v1, the unit of work is a **city** (Form Forge city id) requesting **code violations** (primary). Optional later: water shutoff as secondary channel on same city.

### 4.2 Channel lanes

| Lane id | Operator label | Eligibility (conceptual) | Action |
|---------|----------------|--------------------------|--------|
| `email_only` | Email-only | Contact email; pathway email-only (or no portal/PDF required); not in cooldown; not sent this cycle | Fire queue → Gmail drip plain FOIA |
| `pdf_ready` | PDF ready | Completed filled PDF on file + contact email; not in cooldown | Fire queue → Gmail drip + PDF attach |
| `pdf_needs_fill` | PDF needs fill | Should be PDF channel but no completed fill yet (incl. gov-list promotions) | Fill tool queue (one-and-done per city) |
| `portal` | Portals | Online portal pathway; due for submit | Walkthrough queue (open URL → mark submitted) |

Eligibility must reuse existing Form Forge rules where they exist (`ensure_email_send_allowed`, `request_status` cooldown ~30 days, channel last-sent, etc.). Do not invent a second cooldown system on Collect.

### 4.3 City lifecycle (PDF)

```text
[researched / in phonebook]
        → promote / link forge city
        → pdf_needs_fill
        → (fill tool once)
        → pdf_ready
        → fire queue drip
        → submitted (sent date)
        → (city replies / list delivered)
        → returned (responseReceivedAt / response_at)
        → cooldown → eligible again next cycle
```

Email-only skips fill; portals skip Gmail drip.

### 4.4 Dates (single calendar)

| Event | Canonical store | Collect display |
|-------|-----------------|-----------------|
| **Requested / sent** | Form Forge submission log + city `requests` / `submissions` | Last requested date, channel |
| **List returned** | Filter attach `responseReceivedAt` → forge `requests.*.response_at` (existing bridge attach contract) | “Came back” date, turnaround |
| **Cooldown until** | Derived from last send + `COOLDOWN_DAYS` | Shown in fire queue as excluded reason |

Collect **reads** these fields. It does not store a parallel `collect_sent_at` unless a later migration explicitly consolidates storage (out of scope until Phase 5).

### 4.5 Government Lists relationship

- Catalog (`data/government-lists/catalog.json`) = source registry (URLs, emails, methods, verify status).  
- Form Forge registry = send capability + filled forms + history.  
- Merge rule for powerhouse: cities enter Collect queues when they are **request-linked** (forge city id and/or email-only contact + channel). Research-only rows stay in the phonebook until promoted (fill or email-only enrollment).  
- Bulk handoff: selecting phonebook rows for code/email methods should prefill Collect queues in a later phase — not v1 blocker for fire queues on existing forge cities.

---

## 5. Operator experience

### 5.1 Collect home (first paint)

Work-first desk. No marketing void. Primary content:

1. **Lane cards / rows** with live counts  
   - Email-only: N ready  
   - PDF ready: M ready  
   - PDF needs fill: K waiting  
   - Portals: P due  
2. Primary actions: **Open fire queue** / **Fill next** / **Portal queue**  
3. **Tracker strip:** pending responses · overdue (sent, no return past threshold) · received this month  
4. Secondary: single-city request (collapsed); link to Government Lists phonebook; link to Filter  

**Do not** force the old 3-step wizard as the only entry. Wizard may remain as advanced “custom multi-city pick” under secondary.

### 5.2 Fire queue (lanes: email_only, pdf_ready)

**Pattern B (approved):**

1. Open queue → table of eligible cities (default checked)  
2. Auto-exclude with reasons: no email, cooldown, already sent this cycle, missing PDF (pdf_ready only), send blocked  
3. Operator unchecks any exceptions  
4. **Send all** → confirm count → Gmail **drip** (reuse existing send endpoints and rate/cooldown guards)  
5. Live progress: sent / failed / skipped  
6. Each success appends submission log (same as today)  

Drip behavior must match existing Form Forge request-pdfs / email-only send semantics (no silent mass-send without confirm; no bypass of `ensure_email_send_allowed`).

### 5.3 PDF needs fill queue

1. List cities that need first-time (or re-layout) fill  
2. Open fill tool **inside Collect shell** (Phase 3) or embedded forge fill route with Collect chrome (Phase 1–2 acceptable)  
3. Save completed form → city moves to `pdf_ready`  
4. Never appear in **Send all** until filled  

### 5.4 Portal walkthrough queue

1. Next city: name, portal URL, notes  
2. Open portal (new tab)  
3. Operator completes form  
4. **Mark submitted** → log `online_portal` + timestamp  
5. Next  

No unattended automation in v1.

### 5.5 Tracker

Dense table or desk view:

- Place · channel · last sent · returned · status (pending / received / cooldown) · turnaround  
- Filters: pending only, overdue, by state, by channel  
- Click-through to city detail / last submission  

Source data: forge APIs already used by City Tracker + bridge attach updates.

---

## 6. Technical integration (constraints)

### 6.1 Reuse (do not reimplement blindly)

| Capability | Existing home |
|------------|----------------|
| City summary for Collect picker | `GET /forge/api/portal/cities/summary` |
| PDF email send | `send_city_pdf_email` / request-pdfs UI |
| Email-only send | `send_city_email_only` / email-only UI |
| Portal submit logging | submit-portals + `log_submission` |
| Cooldown / channel state | `request_status.py`, `ensure_email_send_allowed` |
| Submission KPI / recent | portal submissions APIs |
| List returned | Bridge `POST` attach with `responseReceivedAt` → forge `response_at` |

### 6.2 Collect surface files (current)

- `public/collect.html`  
- `public/js/collect-records.js`  
- `public/css/distress-collect-hub.css`, `collect-records.css`  

Form Forge static workflows remain under `modules/form-forge/review_portal/static/` until absorbed.

### 6.3 Shell / proxy

Distress OS already proxies `/forge`. Collect may:

- Phase 1: deep-link with shared shell-nav and return-to-Collect  
- Preferred ASAP: same-origin routes under `/collect/...` that proxy or embed forge workflow pages with Collect chrome  
- Long-term: native Collect JS calling forge JSON APIs only  

### 6.4 Data protection (hard rules)

From project AGENTS / surface map — **never wipe**:

- `modules/form-forge/data/` (portal-registry, submission-log, queues)  
- `modules/form-forge/forms/` (filled PDFs)  
- `data/filter-lists/`, bridge brain, analyzer user data  

All migrations are additive or merge-by-id.

### 6.5 Testing bar

Before claiming a lane is “on Collect”:

- Existing Form Forge tests for that send path still pass  
- New tests for queue eligibility filters (exclude cooldown, missing email, missing PDF)  
- Smoke: verify-live after UI changes; manual drip of 1–2 cities before bulk  

---

## 7. Phased delivery

### Phase 0 — Spec + plan (this process)

- This design approved by operator  
- Implementation plan via Superpowers writing-plans  
- No product behavior change yet  

### Phase 1 — Collect command center (unified UX shell)

**Outcome:** Operator starts and returns only from Collect.

- Replace thin hub with lane cards + counts (from forge APIs)  
- Primary CTAs open the correct existing forge queues (email-only, request-pdfs, submit-portals, tracker)  
- Strong back-link / shell so it feels like one product even if forge HTML still renders the queue  
- Deprioritize 3-step wizard as primary  

**Success:** Daily bulk work starts on `/collect` without hunting Form Forge URLs.

### Phase 2 — Fire queues owned by Collect (email_only + pdf_ready)

**Outcome:** Fire queue UI + **Send all** drip live under Collect (APIs still forge).

- Eligibility lists + exclude reasons  
- Confirm + drip progress  
- Parity with current request-pdfs / email-only send logging  

**Success:** Operator can drip all ready email-only and all ready PDFs without using standalone forge nav.

### Phase 3 — PDF needs fill intake

**Outcome:** Gov-list / unfilled PDF cities enter fill queue from Collect; completed fills join pdf_ready.

- Promote / link research contacts into forge cities where missing  
- Fill tool reachable from Collect  
- Clear state transition needs_fill → ready  

**Success:** New researched cities can be filled once then drip-sent like the original set.

### Phase 4 — Tracker powerhouse + Filter bounce

**Outcome:** Collect shows sent + returned + overdue; Filter attach remains the way “came back” is recorded.

- Tracker desk on Collect reading forge + response fields  
- Optional deep-link from Filter after attach “view in Collect tracker”  
- No second date entry on Collect for return (unless attach missed — then explicit repair action only)  

**Success:** Operator plans next bulk cycle from Collect dates alone.

### Phase 5 — Absorb / retire Form Forge UI

**Outcome:** Approach 3 complete for operators.

- Forge UI routes admin-only or removed from normal nav  
- Engine package remains for APIs and data  
- Optional: sellable city-by-city secondary UX polish  

**Success:** New operators never learn “Form Forge” as a separate app name.

---

## 8. Success metrics

| Metric | Target |
|--------|--------|
| Surfaces touched for a full email-only bulk cycle | 1 (Collect) after Phase 2 |
| Surfaces for PDF bulk cycle (ready set) | 1 after Phase 2 |
| Path for new PDF city (fill → drip) | Collect-only after Phase 3 |
| Dual calendars (sent vs returned) | Zero — one tracker after Phase 4 |
| Data loss incidents | Zero (hard fail) |
| Cooldown / accidental re-send bypass | Zero (reuse forge guards) |

---

## 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Dual send implementations diverge | Collect only calls forge send APIs; no second Gmail client on Collect |
| Iframe/embed auth or cookie issues | Prefer same-origin `/forge` proxy; fall back to full navigation with return URL |
| Gov-list vs forge place identity mismatch | Normalize state; link `forgeCityId`; never auto-send unlinked research rows |
| Operator bulk-sends wrong set | Fire queue defaults + exclude reasons + confirm count; never silent send |
| Scope creep into all list types | v1 = code violation channels only |
| Premature “Form Forge is gone” claims | Phase gates; ship-gate per phase |

---

## 10. Open decisions (resolve in plan or Phase 1)

1. **Water shutoff:** exclude from bulk lanes in v1 (recommended) vs second toggle on same fire queues. **Default: exclude.**  
2. **Overdue threshold:** e.g. sent > 14 or 21 days with no `response_at`. **Default: 21 days** unless existing forge KPI defines otherwise.  
3. **Drip pacing:** keep whatever request-pdfs already uses; document in plan, do not invent a new rate without measuring Gmail limits.  
4. **Embed vs native UI for Phase 2:** prefer native Collect table + forge APIs if effort allows; embed acceptable for Phase 1 only.

---

## 11. Spec self-review

| Check | Result |
|-------|--------|
| Placeholders / TBD | Open decisions listed with defaults — not silent TBD |
| Internal consistency | Hybrid 2→3, bulk B, dates single-store, phases aligned |
| Scope | Large but phased; each phase shippable |
| Ambiguity | Fire queue = B; primary list type = code; portals not auto-bot |

---

## 12. Next Superpowers step

After operator approves this file:

1. Invoke **writing-plans** → `docs/superpowers/plans/2026-07-21-collect-bulk-powerhouse.md` (task-level, testable)  
2. Execute Phase 1 first (command center) unless plan says otherwise  
3. Each phase ends with verification (forge tests + verify-live for Collect UI)

---

## 13. Approval

**Operator:** review this spec.  

- Approve as-is → proceed to writing-plans  
- Request edits → revise this file, then re-approve  
- Reject hybrid → stop before plan  

**Recommended approval phrase:** `Spec approved` or `Spec approved with notes: …`
