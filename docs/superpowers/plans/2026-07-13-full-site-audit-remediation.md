# Full Site Audit Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every finding from the Distress OS full-site audit (Phases 0–6) without wiping filter lists, brain, Form Forge, or analyzer session data.

**Architecture:** Fix trust/errors first (Phase 0), then performance and UX layers, then accuracy defaults, then larger add-ons (server auth, OCR, Vault), then cleanup. Keep Collect → Filter → Analyze behavior intact; prefer redirects and additive UI over breaking URL changes.

**Tech Stack:** Node.js shell (`server.js`, `lib/`), vanilla `public/` HTML/CSS/JS, Property Analyzer under `modules/property-analyzer/`, existing `node --test` suites under `tests/`.

**Spec:** `docs/superpowers/specs/2026-07-13-full-site-audit-remediation-design.md`

## Global Constraints

- Never delete/truncate `data/filter-lists/`, `data/bridge-brain/`, Form Forge data, or analyzer users/sessions unless the user explicitly asks.
- After any site-facing edit turn: run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1` (restart via `scripts\restart.ps1` if needed).
- Do not commit unless the user asks.
- Prefer TDD: failing test → implement → pass.
- Keep `/bridge` working if `/filter` is added (redirect).

---

## File map (high level)

| Area | Primary files |
|------|----------------|
| Analyze encoding | `modules/property-analyzer/public/index.html` |
| Geocodio mask | `lib/geocodio-usage.js`, tests under `tests/` |
| Bridge list auth | `lib/bridge-api.js`, `lib/phuglee-user.js` |
| Collect count | `public/js/home-coverage.js`, `public/collect.html` |
| Purge safety | `modules/property-analyzer/routes/session.js` |
| Auth bootstrap | `public/js/auth.js`, `server.js` / `lib/config.js` |
| Shell dead poll | `public/js/shell.js` |
| Analyzer landing | `modules/property-analyzer/public/landing.html` |
| Videos | `public/index.html`, `public/heat.html`, optional CSS |

---

### Task 1: Phase 0.1 — Fix Analyze UTF-8 mojibake + main landmark

**Files:**
- Modify: `modules/property-analyzer/public/index.html`
- Test: `tests/a11y-seo.test.js` (extend) or new `tests/analyzer-utf8-shell.test.js`

**Interfaces:**
- Produces: Valid UTF-8 punctuation in Analyze HTML; single `<main id="main">` landmark for skip link

- [ ] **Step 1: Write failing test** that reads analyzer `index.html` and asserts it does **not** contain mojibake sequences `â€"`, `â†`, `Ã—`, `Â·` and that it contains `<main` with `id="main"`.

```js
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('analyzer index.html is valid UTF-8 (no mojibake)', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../modules/property-analyzer/public/index.html'),
    'utf8'
  );
  assert.equal(html.includes('â€"'), false);
  assert.equal(html.includes('â†'), false);
  assert.equal(html.includes('Ã—'), false);
  assert.match(html, /<main[^>]*\bid=["']main["']/i);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --test tests/analyzer-utf8-shell.test.js`

- [ ] **Step 3: Fix HTML** — replace all mojibake with real characters (`—`, `←`, `×`, `·`), change the skip-target wrapper to `<main id="main" …>` (remove duplicate `id="main"` on a div).

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Verify live** after later Phase 0 batch (or now if editing alone)

---

### Task 2: Phase 0.2 — Mask Geocodio API keys

**Files:**
- Modify: `lib/geocodio-usage.js` (`getUsageForModal`)
- Modify: any UI that displayed full key (mask-only)
- Test: existing geocodio usage tests or new assertion

**Interfaces:**
- Produces: `getUsageForModal()` returns `apiKeyMasked` (e.g. last 4) and **never** full `apiKey`

- [ ] **Step 1: Failing test** — call `getUsageForModal` with a fake env key; assert response keys have no raw secret equal to the env value; assert masked form exists.

- [ ] **Step 2: Implement** — in `getUsageForModal`, replace `apiKey: k.key` with `apiKeyMasked: maskKey(k.key)` (show last 4 only). Keep full key internal to server-only helpers.

- [ ] **Step 3: Update client** if it expects `apiKey` field — read `apiKeyMasked` instead.

- [ ] **Step 4: Tests pass**

---

### Task 3: Phase 0.3 — Gate destructive list endpoints

**Files:**
- Modify: `lib/bridge-api.js` handlers for `DELETE /api/bridge/lists`, `POST /api/bridge/lists/clear`, `POST /api/bridge/lists/delete-many`
- Test: `tests/` bridge list auth test (new or extend)

**Interfaces:**
- Consumes: existing `requireAdmin(req)` **or** a new `requireAuthenticatedUser(req)` that rejects empty/`_anonymous` when auth is enabled
- Produces: 401/403 JSON with `code: 'AUTH_REQUIRED'` or `ADMIN_REQUIRED` for destructive ops

- [ ] **Step 1: Failing test** — invoke clear/delete-many without user header (and with auth not disabled); expect non-2xx.

- [ ] **Step 2: Implement gate** — For interim Phase 0: require admin for `clear` and `delete-many` and single DELETE all; keep single-list delete scoped to matching `X-Phuglee-User` when present, reject anonymous wipe when `PHUGLEE_AUTH_DISABLED` is not set.

- [ ] **Step 3: Tests pass**

---

### Task 4: Phase 0.4 — collect-city-count ID

**Files:**
- Modify: `public/js/home-coverage.js` (prefer writing `#collect-city-count-label`)
- Optional: add `id="collect-city-count"` alias on Collect page if dual-read needed

- [ ] **Step 1: Failing test** (source assertion) — Collect HTML has `collect-city-count-label`; `home-coverage.js` must reference that id (or both).

- [ ] **Step 2: Fix** `home-coverage.js` id list / `getElementById` fallback already partially present — ensure primary write hits `collect-city-count-label`.

- [ ] **Step 3: Pass**

---

### Task 5: Phase 0.5 — Fix purge-import-source over-match

**Files:**
- Modify: `modules/property-analyzer/routes/session.js` (~469–474)
- Test: analyzer session purge test if exists; else add focused unit test

- [ ] **Step 1: Failing test** — `matchesBatch` with only `sourceFileIncludes` must **not** delete batches solely because id contains `new_analyzer_leads`.

- [ ] **Step 2: Remove unconditional** `if (id.includes('new_analyzer_leads')) return true;` — match only on explicit caller filters (`importSource`, `sourceFileIncludes`, batch id).

- [ ] **Step 3: Pass**

---

### Task 6: Phase 0.6 — Hardcoded admin password → env

**Files:**
- Modify: `public/js/auth.js`
- Modify: `server.js` (inject bootstrap secret via `/js/auth-config.js` only when set, never hardcode in repo)
- Modify: `README.md` to document env var (do not print real production password)

**Interfaces:**
- Produces: Bootstrap admin password from `PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD` (or similar) injected into auth-config; default local-only fallback documented; remove literal `wunderhaus` from `auth.js` source.

- [ ] **Step 1: Grep test** — repo `public/js/auth.js` must not contain the string `wunderhaus`.

- [ ] **Step 2: Implement** env injection through existing auth-config pattern.

- [ ] **Step 3: Pass + manual login still works locally with env set**

---

### Task 7: Phase 0.7 — shell.js dead status polling

**Files:**
- Modify: `public/js/shell.js`

- [ ] **Step 1: If `#status-forge` / `#status-analyzer` absent, skip polling** (early return) OR remove dead poll entirely.

- [ ] **Step 2: Source test** — no unconditional `setInterval` without element guard.

---

### Task 8: Phase 0.8 — analyzer landing links

**Files:**
- Modify: `modules/property-analyzer/public/landing.html`

- [ ] **Step 1: Replace** `href="/"` Analyze CTAs with `href="/analyzer/"`.

- [ ] **Step 2: Source assertion test**

---

### Task 9: Phase 0.9 — Video 404 graceful fallback

**Files:**
- Modify: `public/index.html`, `public/heat.html`, and/or a small JS helper

- [ ] **Step 1: On `error` for pipeline `<video>`, hide video / show static poster** so missing mp4 does not break layout.

- [ ] **Step 2: Manual check** with missing file still renders page cleanly.

---

### Task 10: Phase 0 gate — verify live

- [ ] Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1`
- [ ] Run relevant unit tests for Phase 0 files
- [ ] Mark Phase 0 complete on canvas todos

---

## Phase 1 — Speed (tasks 11–18)

### Task 11: defer on app pages
- Modify: `public/bridge.html`, `collect.html`, `command.html`, `heat.html`, `vault.html` — add `defer` to footer scripts consistently.

### Task 12: Lazy homepage videos
- IntersectionObserver or remove `autoplay` until visible; keep `preload="metadata"`.

### Task 13: CSS round-trip reduction
- Prefer one combined shell CSS import chain or shared `shell-bundle.css` that `@import`s tokens→nav→a11y (single link tag) without changing visual tokens.

### Task 14: Cap process body size
- Modify: `lib/bridge-api.js` `readBody` for `/process` — reject over e.g. 80MB with `BODY_TOO_LARGE`.

### Task 15: Proxy streaming
- Modify: `lib/module-proxy.js` / `embedded-analyzer.js` — pipe upstream to client instead of buffering entire body when possible.

### Task 16: Fonts
- Add `font-display: swap` via self-hosted woff2 under `public/fonts/` **or** Google Fonts link with display=swap + preload.

### Task 17: Below-fold homepage
- Ensure carousel/map init only after intersection (verify existing MapLibre lazy path; gate carousel similarly).

### Task 18: OCR note
- Surface clearer 503/`OCR_UNAVAILABLE` messaging; defer worker pool to Phase 5 if still needed.

---

## Phase 2 — Ease of use (tasks 19–26)

### Task 19: `/filter` route + `/bridge` redirect
- Modify: `lib/config.js` `DISTRESS_ROUTES`, `server.js` redirect `/bridge` → `/filter` (301/302), update nav links to `/filter`.

### Task 20: Canonical How It Works
- Keep `/heat` as canonical; make command guide deep-link to `/heat` or one overlay; remove duplicate homepage long guide if redundant.

### Task 21–22: Collect confirm + remove emoji
- Add summary step before Forge redirect; replace emoji with text/icons from phuglee set.

### Task 23: Home vs Dashboard
- Logged-in users hitting `/` get clear “Open Dashboard” primary; remember last destination optional.

### Task 24: Forge / City Tracker in nav
- Add under Properties dropdown: City Tracker → `/forge/portal` (or current portal path).

### Task 25: Demote Vault
- Move Vault to footer or “Coming soon” submenu until Phase 5.6.

### Task 26: Filter upload-lock hint
- Visible helper text when city/type incomplete.

---

## Phase 3 — Accuracy (tasks 27–34)

### Task 27: Already-imported UX
- Checkbox default documented; visible label “Skip addresses already in Analyze”.

### Task 28–29: Type-column docs + wrong-confirm recovery
- UI affordance to clear city format fingerprint (admin); short help copy.

### Task 30: Fuzzy threshold review
- Tests around false positives; adjust similarity or require exact match for short streets.

### Task 31: `/attach` re-validate
- Server re-runs `tagRow` / schema check before Forge forward.

### Task 32: Forge fallback warning
- API flag `registryStale: true` when bundled registry used; UI banner.

### Task 33: OCR page cap messaging
- Include max pages in `OCR_*` / user error strings.

### Task 34: Gold suite green
- Run `node --test tests/bridge-accuracy-gold.test.js` (and engine suite) after changes.

---

## Phase 4 — UX polish (tasks 35–44)

### Task 35–36: Clickable pipeline + Step 02 A label fix
### Task 37: Soften victory strip copy
### Task 38–39: Mobile nav + table scroll hint
### Task 40: Soften home→app transition (shared chrome cues)
### Task 41: Analyze embedded chrome consistency
### Task 42: Prefer `phuglee-btn-*` over mixed button classes on shell pages
### Task 43: Geocodio job failure toast / status
### Task 44: Auth redirect UX (return URL already present — improve message)

---

## Phase 5 — Add-ons (tasks 45–52)

### Task 45: Server session auth (cookie/JWT); stop trusting raw headers alone
### Task 46: Password hashing; remove plaintext localStorage passwords
### Task 47: Dockerfile `PHUGLEE_AUTH_DISABLED` default aligned with entrypoint
### Task 48: Railway/Docker Tesseract for OCR
### Task 49: `/api/health/deep` + update `verify-live.ps1` + Railway health optional
### Task 50: Filter cancel + ETA during scrub
### Task 51: First-run checklist on `/command`
### Task 52: Vault real product **only if** user confirms Max-plan inventory source

---

## Phase 6 — Cleanup (tasks 53–60)

### Task 53: Deduplicate `public/js/coverage/*.css`
### Task 54: Remove dead `home-premium.css` / unused bundles
### Task 55: Incremental split of `bridge.js` (upload vs train) after Phase 1 defer
### Task 56: Sync `package.json` version to `1.1.0`
### Task 57: Video asset test or README note
### Task 58: Fix Form Forge `tests/test_email_only_audit_sync.py` (texas-cedar-park)
### Task 59: Minimal smoke E2E (health + shell routes 200)
### Task 60: Structured `[Bridge API]` logs with requestId/city/durationMs

---

## Self-review

1. **Spec coverage:** All rows in the design coverage matrix map to Tasks 1–60.
2. **Gaps from original blurbs:** Tasks 7–9, 14–18, 23–26, 29–33, 40–44, 48–51, 56–60.
3. **Placeholders:** None intentional; Phase 1–6 tasks are file-scoped for sequential execution after Phase 0.
4. **Data safety:** No task deletes runtime list/brain data.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-13-full-site-audit-remediation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, batch with checkpoints  

Starting recommendation: **Phase 0 Tasks 1–10 first**, then Phase 1, etc.
