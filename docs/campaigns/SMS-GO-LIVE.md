# Campaigns → SMS — Go-live checklist

**Default: nothing is live.** `SMS_CAMPAIGNS_LIVE` must be unset/false until this list is done.

## Before LIVE

1. [ ] Review design: `docs/superpowers/specs/2026-07-23-campaigns-sms-design.md`
2. [ ] Approve all 12 message templates in `lib/campaigns/sms-messages.js`
3. [ ] Confirm GHL location has the 8 local numbers used in `lib/campaigns/sms-policy.js`
4. [ ] Confirm DTS pipeline name still matches `findDtsPipeline()` (`/DTS/i`, not OLD)
5. [ ] Optional: create custom fields `sms_count`, `last_sms_at`, `phuglee_lead_id` in GHL (counters also use `sms:N` tags)
6. [ ] Admin opens `/campaigns/sms` — KPIs load, badge shows **DRY MODE**
7. [ ] Dry-run touch `0` — inspect sample messages; **zero** real SMS
8. [ ] Pilot: set `SMS_CAMPAIGNS_LIVE=true` only on a controlled environment; send limit **5** with confirm `SEND`
9. [ ] Verify: count tags updated, exclusions still work, no open DTS contacts texted
10. [ ] Only then enable production LIVE (and optionally `SMS_CAMPAIGNS_AUTO=true` + auto checkbox)

## Env flags

| Env | Default | Meaning |
|-----|---------|---------|
| `SMS_CAMPAIGNS_LIVE` | false | Allows `/send` and auto tick |
| `SMS_CAMPAIGNS_AUTO` | false | Allows Option B auto when UI enables it |
| `GHL_API_KEY` / `GHL_LOCATION_ID` | required | GHL Private Integration |

## Kill switches

- Unset `SMS_CAMPAIGNS_LIVE`
- Pause auto on `/campaigns/sms`
- Exclude tags: not interested, dnc, dnd, interested, follow up, wrong number
- Auto-tags (optional but recommended): `person:dnc` (human opt-out), `system:landline` (can't SMS)
  - In Phuglee: **Preview DNC tags** → **Tag DNC split in GHL**
  - Ongoing webhook: `POST https://<host>/api/webhooks/ghl/sms-dnd-tags` (optional secret `GHL_SMS_TAG_WEBHOOK_SECRET`)
  - GHL workflow examples: inbound body STOP → Custom Webhook with `{ "contactId": "{{contact.id}}", "body": "{{message.body}}" }`; failed SMS → `{ "contactId": "{{contact.id}}", "status": "failed", "error": "landline" }`

## Policy (locked)

- Spacing: **4 days**
- Max: **12** or reply
- Source tag: **code violation**
- Hard minimum: 24 hours
