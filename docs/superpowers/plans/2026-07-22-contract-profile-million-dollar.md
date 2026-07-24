# Contract Profile Million-Dollar Desk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after design approval. Checkbox tasks.

**Goal:** Rebuild each Contract Tracker profile tab as a distinct premium **instrument** (not a restyle of equal admin furniture), meeting jaw-drop success criteria in the design spec.

**Architecture:** Keep centered workbench shell. Replace tab interiors phase-by-phase. Prefer surgical HTML/CSS/JS changes; extract helpers only when a phase requires it. Shared tokens in `under-contract.css` under a new “instrument system” block.

**Tech stack:** Vanilla HTML/CSS/JS (`public/under-contract.*`), existing contracts APIs, Phuglee tokens.

**Spec:** `docs/superpowers/specs/2026-07-22-contract-profile-million-dollar-design.md`

## Global constraints

- Feature parity: SignNow, SMS×3, buyers, media, rehab, condition scan, investor URL  
- Phuglee product register; ban glass/purple/equal-chip wallpaper  
- No board list redesign  
- After public/ edits: `scripts/verify-live.ps1`  
- Bump `?v=` on css/js per ship  
- Phase ships independently testable  

---

## Phase 0 — Design tokens + instrument primitives (shared)

**Files:** `public/css/under-contract.css`, light HTML class hooks  

**Deliverable:** Shared primitives used by later phases:

- `.uc-instrument` tab root  
- `.uc-exception-band` (needs attention)  
- `.uc-desk-split` (list | preview)  
- `.uc-rank-row` list instrument  
- Type: display money, section label, meta  
- Empty: `.uc-empty-workflow` (title + body + primary CTA)  

**Exit:** No visual regression on existing tabs (primitives unused until Phase 1).

---

## Phase 1 — Documents: package pipeline + preview desk

**Highest revenue pain.**

### Tasks

1. **Package model UI** from existing `documents` + `signNowPending`  
   - Group/display: PSA / AOC / JV / Amendment / other  
   - Status: not sent / pending (N parties if available) / complete / uploaded  
2. **Needs attention band** only when pending/missing required for stage  
3. **Split desk:** package/list left · preview right (stack on mobile)  
4. **Kill twin Upload/SignNow cards** → intent bar: Import signed · Send package  
5. **Preview theater** (not iframe mid-scroll between forms)  
6. Empty workflow: “Send first package or import signed PDF”  
7. Tests for markup + status rendering; live verify  

**Exit criteria:** Blind test “this is a vault/pipeline, not a file form.” Who-blocks visible when data allows.

---

## Phase 2 — Media / Rehab: evidence workbench

### Tasks

1. **Condition hero** (one dominant total + confidence + rescan)  
2. **Split stage:** large viewer + room-filtered filmstrip (AI room labels; fallback All)  
3. **Line items** sorted by $; click opens evidence photo(s)  
4. **Assumptions drawer** (finish/sqft/contingency) — not permanent form chrome  
5. **Systems notes** as compact overrides under same section, not third equal panel  
6. Drag-drop upload + progress; empty states: no photos vs unscanned  
7. Tests + live verify  

**Exit criteria:** Click a $ line → evidence photo. Estimate is first read.

---

## Phase 3 — Comms: three-mode desk

### Tasks

1. Full-height desk shell; sticky compose; kill nested card frames  
2. **Mode headers:** Seller identity · Internal war room · Photographer job ticket  
3. Real names (never Them/You)  
4. Silent poll / demote Refresh  
5. Seller templates (access / photos / closing) as chips above compose  
6. Photographer: upload URL + media count banner above thread  
7. Optimistic send UI; day separators if feasible  
8. File-to-deal from attachment pulses Media tab count  
9. Tests + live verify  

**Exit criteria:** Switching channels feels like switching modes; Seller is relationship console.

---

## Phase 4 — Buyers: disposition market

### Tasks

1. Leading offer crown (amount, name, actions)  
2. Board rows: rank · amount · name · status · vs purchase · actions  
3. Economics strip: purchase · best · spread  
4. Couple “Lock / Send AOC” to existing primary flows  
5. Empty workflow  
6. Tests + live verify  

**Exit criteria:** Winner and spread obvious in 2 seconds.

---

## Phase 5 — Overview: situation board

### Tasks

1. Next-move spine (close window, assignment, stage, primary copy)  
2. Ranked blockers with deep-links to Docs/Comms/Buyers/Media  
3. People as operators (SMS/call/open Comms)  
4. Recent human events (reuse team/SMS/doc events if available; graceful if thin)  
5. Notes inline + investor instrumental row  
6. **Remove** redundant economics/pulse confetti  
7. Tests + live verify  

**Exit criteria:** 3-second “what’s on fire / what do I do?”

---

## Phase 6 — Integration pass

1. Cross-tab deep links work end-to-end  
2. Motion only on meaningful state (send, sign import, scan complete)  
3. `prefers-reduced-motion`  
4. Mobile full-bleed quality on Comms + Docs split  
5. Operator script O1–O5  
6. Full `tests/under-contract.test.js` + live verify  
7. Update DESIGN.md note if needed (product register only)  

---

## Operator acceptance script

| # | Action | Pass if |
|---|--------|---------|
| O1 | Open deal mid-stage | Next move obvious on Overview |
| O2 | Open Documents with pending SignNow | Needs-attention + package status clear |
| O3 | Open Media with photos + scan | Hero $ + click line opens photo |
| O4 | Seller SMS unread deep-link | Lands Seller desk, unread context |
| O5 | Two buyer offers | Leader crowned + spread vs purchase |

---

## Effort (rough)

| Phase | Size | Depends on |
|-------|------|------------|
| 0 Primitives | S | — |
| 1 Documents | L | 0 |
| 2 Media | L | 0 |
| 3 Comms | L | 0 |
| 4 Buyers | M | 0 |
| 5 Overview | M | 1–4 preferred for deep-links |
| 6 Integration | S–M | 1–5 |

**Order is deliberate:** Documents and Media deliver jaw-drop first; Overview last so blockers can deep-link to finished instruments.

---

## Out of scope reminders

Board cards, new CRM backend, multi-tenant, brand marketing.
