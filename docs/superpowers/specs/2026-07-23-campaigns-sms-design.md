# Design Spec — Campaigns → SMS (Phuglee Admin)

**Date:** 2026-07-23  
**Product:** Phuglee / Distress OS  
**Surface:** Admin rail **Campaigns → SMS** (`/campaigns/sms`)  
**Status:** Approved direction (conversation). **Nothing live until explicit go-live.**

---

## Problem

Leads are quality-checked in Phuglee (Vault). Outreach runs through Go High Level (GHL). Manual export + ad-hoc blasts make it hard to:

- Know who is code-violation vs other future sources  
- Know who has been texted how many times  
- Avoid re-texting excluded people (NI, DNC/DND, interested, follow up, open DTS)  
- Run multi-touch (up to 12) without 12 smart lists  
- See simple KPIs (interested, not interested, DNC/DND)  

## Goals

1. **Admin-only cockpit** in Phuglee: track SMS outreach + fire campaigns when ready.  
2. **GHL remains the send pipe** (numbers, delivery, conversations, DND).  
3. **Auto sequence (Option B)** every **4 days**, max **12** or stop on **reply** — **disabled until go-live**.  
4. **Vault publish → GHL upsert** with correct tags/fields (incremental; paced).  
5. **KPI strip** for funnel + outcomes.  
6. **Dry-run / preview always available**; live send behind env flag + admin confirm.

## Non-goals (v1)

- Email campaigns UI  
- Member/Max access to Campaigns  
- Rewriting GHL Conversations UI  
- Auto-go-live  
- Perfect multi-property person graph (one phone → many addresses) beyond primary address on contact  

---

## Product decisions (locked)

| Decision | Value |
|----------|--------|
| Menu | Rail section **Campaigns** → page **SMS** |
| Path | `/campaigns/sms` |
| Access | **Admin only** (`username === admin`) |
| Source tag (current data) | `code violation` on all current home + land vault syncs |
| Class tags | `distressed` \| `well maintained` \| `land` (map from Phuglee `leadType`) |
| Spacing | **4 days** between cold texts to same person |
| Hard minimum | **24 hours** (no same-day double hit) |
| Hard stop | **12** cold texts **or** inbound reply |
| Mode | Option B auto sequence **when enabled**; manual “send this touch count” buttons always in UI |
| Live default | **`SMS_CAMPAIGNS_LIVE=false`** — no real SMS until flag + explicit action |

### Cold-text exclusions (any = out)

**Tags (case-insensitive contains / exact normalize):**

- `wrong number`  
- `not interested`  
- `dnc`  
- `dnd`  
- `interested`  
- `follow up` / `follow-up` / `followup`  

**Also out:**

- GHL system SMS DND active  
- Open opportunity on **DTS** pipeline  
- `sms_count >= 12`  
- No usable phone  
- Last cold SMS &lt; 4 days ago (for auto + “eligible now”; manual override only via explicit admin force — v1: **no force**)  

### Touch model

- Contact custom field / tag-backed counter: **`sms_count`** (0–12)  
- **`last_sms_at`** ISO  
- **`last_sms_campaign`** e.g. `cv-touch-03`  
- Message bank: 12 templates; touch N uses template N (`sms_count + 1`)  
- After successful send: `sms_count += 1`, update `last_sms_at`, optional campaign tag  

No per-touch smart lists. Filter by count at fire time.

---

## Architecture

```
Phuglee Vault (lead SoT for property)
    │ publish / approve
    ▼
Sync queue (leadId) ──► GHL upsert + tags + custom fields
    │
    ▼
Campaigns SMS engine (Phuglee admin API)
    │ dry-run / preview / (live) send / auto tick
    ▼
GHL Conversations SMS API (fromNumber by state)
    │
    ▼
Run log + KPI aggregation (GHL search + local logs)
```

**Roles**

| System | Owns |
|--------|------|
| Phuglee | Lead quality, vault, campaign policy, admin UI, send orchestration, run logs |
| GHL | Contact delivery, DND, conversation thread, opportunities/DTS |

---

## Admin UI — Campaigns → SMS

### Access

- Rail: **Campaigns** (admin only) → **SMS**  
- Non-admin: link hidden; route shows gate (like Operating Costs); APIs 403  

### Layout

1. **Hero** — title SMS Campaigns, live/dry status badge, Refresh  
2. **KPI strip — outcomes**  
   - Interested  
   - Not interested  
   - DNC / DND out (combined + optional split in detail)  
   - Wrong number  
   - Follow up  
3. **KPI strip — funnel**  
   - Eligible now  
   - In sequence (count 1–11)  
   - At max (12)  
   - Never texted (0)  
   - Sent this week / all-time (from run log)  
4. **Policy card** — 4-day spacing, max 12, live flag status, auto on/off  
5. **Actions** (all require confirm; live blocked if flag off)  
   - Preview eligible (count + sample)  
   - Dry-run send touch N (no SMS)  
   - Send touch N (live only if flag on)  
   - Start / pause auto sequence (live only if flag on)  
6. **Run history** — last N runs (mode, touch, sent, skipped, failed)  

### Copy principles

- Ops war-room tone (Phuglee brand)  
- Big danger on live send  
- Never imply a campaign is live when flag is off  

---

## Data model

### Config (code + env)

`lib/campaigns/sms-policy.js` — frozen policy constants + tag normalizers + from-number map + message bank placeholders.

Env:

- `SMS_CAMPAIGNS_LIVE` = `true` \| `false` (default false)  
- `SMS_CAMPAIGNS_AUTO` = `true` \| `false` (default false; only meaningful if LIVE)  
- Existing `GHL_API_KEY`, `GHL_LOCATION_ID`  

### Local store

`data/campaigns/sms/`

- `runs/` — one JSON per run  
- `index.json` — recent run summaries  
- `auto-state.json` — `{ enabled, lastTickAt, lastError }`  
- `lead-contact-map.json` — optional `leadId → ghlContactId` cache  

### GHL contact contract

**Tags always applied on vault sync:**

- `code violation`  
- `src:phuglee`  
- `class:distressed` \| `class:well maintained` \| `class:land`  
- `vault:active` (or update on catalogStatus change later)  

**Custom fields (create if missing via location custom fields API, or document manual create once):**

- `phuglee_lead_id`  
- `sms_count` (number)  
- `last_sms_at` (text/date)  
- `last_sms_campaign` (text)  
- `property_address` (text)  
- `vault_published_at` (text)  

Prefer custom fields for counters; tags for class/source/suppress.

---

## APIs (admin only)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/campaigns/sms/overview` | KPIs + policy + live flags |
| GET | `/api/admin/campaigns/sms/eligible?touch=0` | Count + sample for `sms_count === touch` |
| POST | `/api/admin/campaigns/sms/dry-run` | Body: `{ touch }` — full plan, no send |
| POST | `/api/admin/campaigns/sms/send` | Body: `{ touch, confirm: "SEND" }` — live only if flag |
| GET | `/api/admin/campaigns/sms/runs` | History |
| GET/POST | `/api/admin/campaigns/sms/auto` | Get/set auto enabled (live only) |
| POST | `/api/admin/campaigns/sms/sync-lead` | Body: `{ leadId }` — upsert one lead (internal/tests) |

All routes: `requireAdmin`.

---

## Sync on vault publish

Hook after successful vault publish / approve path:

1. Enqueue `leadId` (file-backed queue, durable)  
2. Worker (in-process interval or on-demand tick from admin):  
   - Load lead  
   - Skip if no phone and no email (log un-syncable)  
   - Upsert GHL contact by phone then email  
   - Apply tags + custom fields  
   - Store `ghlContactId` map  
3. Never block vault UI on GHL failure; surface failures on Campaigns SMS page  

---

## Send engine

1. Build candidate set: GHL contacts with `code violation` + class filter optional + `sms_count === touch`  
2. Apply exclusions (tags, DND, open DTS, cooldown 4d, max 12)  
3. For each: resolve `fromNumber` by property/contact state  
4. Build message from template bank + firstName + street  
5. If dry-run: log only  
6. If live: `POST /conversations/messages` SMS + tag/field updates  
7. Pace ~1 send / 2–3s; 429 backoff  
8. Write run summary  

**Auto tick (Option B):** every N minutes check `auto-state`; for each contact eligible for next touch (count &lt; 12, cooldown ok, not excluded), send next template. Only if LIVE + AUTO.

---

## Message bank (v1 drafts — require human approval before go-live)

Stored in `lib/campaigns/sms-messages.js`. Touch 1 aligns with existing drip style + Ginn double-question evolution. Full copy approved out-of-band before LIVE.

---

## Testing

- Unit: policy exclusion, cooldown, touch selection, tag normalize  
- Unit: from-number map  
- API: admin gate 403 for non-admin  
- API: dry-run never calls sendSms (mock ghl-client)  
- API: send refuses when LIVE=false  
- UI smoke: page loads admin gate  

## Go-live checklist (human)

1. Custom fields exist in GHL  
2. Message bank approved  
3. Dry-run counts look right  
4. Small live pilot (e.g. 5 contacts)  
5. Set `SMS_CAMPAIGNS_LIVE=true`  
6. Optional `SMS_CAMPAIGNS_AUTO=true`  

---

## Success criteria

1. Admin opens `/campaigns/sms` and sees KPIs including interested / NI / DNC-DND.  
2. Non-admin cannot access.  
3. Dry-run produces plan with zero SMS.  
4. With LIVE=false, send endpoint returns 403/409 with clear message.  
5. Vault sync upserts contact with `code violation` + class tag.  
6. After go-live, send touch N increments `sms_count` and respects 4-day spacing and exclusions.
