# Milestone Context — Filter Superpower Brain (v1.6)

**Source:** User conversation 2026-07-09 (product decisions locked)  
**Consumed by:** `/gsd:new-milestone`

## Goal

Build a **global, admin-only human feedback and training system** on the Filter (Bridge) results page so Approve/Deny:

1. Fixes the current batch (deny removes kept; approve on not-distressed promotes into kept)
2. Trains a durable shared brain so **every future upload** (all customers) tags distress better

## Locked decisions

| ID | Decision |
|----|----------|
| D1 | Surface: **Filter / Bridge only** (not Analyze vision review) |
| D2 | Current list: **Deny → remove** from kept; **Approve** on non-distressed → **promote** into kept |
| D3 | Brain scope: **Global** (shared for product sale) |
| D4 | Who trains: **Admin only** (`username === admin`, server-enforced) |
| D5 | Grouping: **City Violation/Issue Type** label (normalized); stack N identical types into one ✓/✗; unique free-text one-by-one |
| D6 | Learning model: **HITL hybrid** — type suppress/promote live immediately; phrase mining → **proposed** rules → admin activate before live |
| D7 | Future uploads **must** apply brain on every `processUpload` |
| D8 | Stack: existing Node shell + vanilla HTML/CSS/JS + atomic JSON (same pattern as filter lists) |
| D9 | Show exact **matchedIndicators** + **description** that triggered distress |
| D10 | Second section: items **not** marked distressed (false-negative review) |

## Explicit non-goals

- Analyze Keep/Change vision review redesign
- Per-user or per-city brains
- Black-box ML fine-tunes
- Non-admin training (quality control)

## Why this milestone

User sells the tool; quality must be admin-controlled and improve as admin grades files. Not a one-off clean-list tool — a **superpower brain that learns as we go**.

## Existing insertion points (from prior review)

- `lib/bridge-distress-tagger.js` — regex tagger
- `lib/bridge-engine/index.js` — processUpload, filterDistressOnly drops FN rows today
- `lib/bridge-api.js` — process + lists routes
- `lib/bridge-list-store.js` — atomic JSON pattern to copy
- `public/bridge.html` + `public/js/bridge.js` — results UI (no train chrome today)
- `public/js/auth.js` — bootstrap admin user

## Draft design (reference only — roadmapper/planner own structure)

`docs/superpowers/specs/2026-07-09-filter-superpower-brain-design.md`  
(Hand notes; GSD agents produce authoritative ROADMAP + phase PLANs)
