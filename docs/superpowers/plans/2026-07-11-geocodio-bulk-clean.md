# Geocodio Bulk Clean Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Multi-key Geocodio address cleaning under SCAN HISTORY with bulk CSV export, job downloads, and usage tracker modal.

**Architecture:** Server-side jobs under `data/geocodio/`, env-based keys, daily usage ledger, batch Geocodio API with 2500/key rotation. Download-only results (no write-back to Filter lists).

**Tech Stack:** Node.js, native fetch, xlsx, existing bridge multipart + Filter UI patterns.

## Global Constraints

- Output CSV columns: `Street Address`, `City`, `State`, `Zip Code` from Geocodio only
- Drop incomplete geocodes
- Rotate every 2500 lookups per key
- Last 10 jobs retained
- Keys only in env (never commit)
- Daily limit 2500, timezone America/Phoenix default

---

### Task 1: Keys + usage ledger + client mapping

**Files:**
- Create: `lib/geocodio-keys.js`, `lib/geocodio-usage.js`, `lib/geocodio-client.js`, `lib/geocodio-parse.js`
- Create: `tests/geocodio-keys.test.js`, `tests/geocodio-usage.test.js`, `tests/geocodio-client.test.js`, `tests/geocodio-parse.test.js`
- Modify: `lib/config.js` — add `GEOCODIO_ROOT`

### Task 2: Jobs store + API routes

**Files:**
- Create: `lib/geocodio-jobs.js`
- Create: `tests/geocodio-jobs.test.js`
- Modify: `lib/bridge-api.js` — routes under `/api/bridge/geocodio/*`

### Task 3: UI + export label

**Files:**
- Modify: `public/bridge.html`, `public/js/bridge.js`, `public/css/bridge.css`

### Task 4: Local env + verify

- Create gitignored `.env` with keys
- Load env in server if needed
- Run tests + verify-live

---

Execute all tasks in this session; fix failures until green.
