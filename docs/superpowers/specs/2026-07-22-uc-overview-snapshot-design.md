# Overview snapshot — Contract Tracker profile

**Date:** 2026-07-22  
**Surface:** `/under-contract` profile → **Overview tab only**  
**Status:** Design approved (Approach A) — awaiting implementation plan sign-off  

## Problem

The current Overview is a “situation board” (next-move spine, blockers, people actions, recent feed). Operators want a **deal file snapshot**: who, money, close date, title/EMD/access/vacancy, notes, investor URL — not an action cockpit.

## Goal

Open a deal on Overview and in a few seconds answer:

1. Who is the seller (1 or 2 names)?  
2. End buyer name — or clearly blank if not found?  
3. Our lockup price, end buyer price, assignment (spread)?  
4. Closing date?  
5. Title open? Our EMD? Buyer EMD? Vacancy? Access?  
6. Snapshot notes + InvestorBase URL?

## Non-goals

- Redesign Documents, Media, Comms, Buyers, or the board  
- Next-move / blockers / recent activity on Overview  
- People Call/SMS/Email console on Overview (Comms owns contact actions)  
- New backend fields (all required data already exists)

## Approved approach

**Approach A — Single snapshot sheet** (user approved).

Vertical sections inside the Overview tab panel:

1. **Identity** — photo, address, stage, contract type (Cash / Subject-to)  
2. **Parties** — Seller(s) · End buyer  
3. **Economics** — Our price · End buyer price · Assignment (spread)  
4. **Close & status** — Closing · Title · Our EMD · Buyer EMD · Vacancy · Access  
5. **Notes** — inline textarea + Save (you / Brad)  
6. **Investor site** — keep existing InvestorBase URL control  

### Alternatives rejected

| Approach | Why not |
|----------|---------|
| B — Two-column desk | More chrome; uneven mobile; more than asked |
| C — Keep situation board | Wrong product for the brief |

## Money model (locked)

| Label (UI) | Source |
|------------|--------|
| Our price / Purchase (seller lockup) | `deal.purchasePrice` |
| Assignment (spread) | `deal.assignmentFee` |
| End buyer purchase price | `purchasePrice + assignmentFee` when **both** are finite numbers |

- If either purchase or assignment is null/missing → show `—` for the missing field(s) and for end buyer price (do not invent `$0`).  
- Same economic story as: end buyer pays X; we locked at Y; difference is assignment.

## Field mapping

| UI | Data |
|----|------|
| Photo | Existing profile hero / `photoUrl` path used today |
| Address | `address` + city/state/zip |
| Stage | `stage` → `STAGE_LABELS` |
| Contract type | `dealType` / `dealTypeBadgeHtml` (Cash / Subject-to) |
| Seller name(s) | 1–2 names from `contractSellers` / `sellerNames` / `ownerName` / contact sellers (client helper mirroring `resolveContractSellers` name resolution) |
| End buyer | `cashBuyerName` (not Phuglee, not “us”). Empty → quiet `—` / “Not found” |
| Our price | `purchasePrice` via `money()` |
| End buyer price | computed |
| Assignment | `assignmentFee` via `money()` |
| Closing | `closingDate` / `closingDisplay` / contact closing |
| Title open | `titleOpened` / `titleOpenedLabel` |
| Our EMD | `sellerEmdSubmitted` / `sellerEmdLabel` |
| Buyer EMD | `buyerEmdSubmitted` / `buyerEmdLabel` |
| Vacancy | `vacancy` / `vacancyLabel` |
| Access | `accessDisplay` or `accessLabel` + detail if present |
| Notes | `deal.notes` — **inline edit + Save** via existing `saveDealFields` |
| InvestorBase URL | existing `investorBaseUrl` section + save flow |

## Layout & design (product register)

- Register: **product** (ops tool, not marketing).  
- Phuglee tokens; Layout integrity rules (minmax columns, real gaps, stack ~900/768).  
- **No** next-move spine, blockers list, recent feed, or Call/SMS/Email people cards.  
- Economics: clear 3-cell strip (labels + mono money), not SaaS hero-metric confetti.  
- Status: reuse board-style `statusChip` / labels so Title/EMD/Vacancy match the board language.  
- Empty end buyer: quiet blank — no “Add buyer” primary CTA on Overview (Buyers tab later).  
- Header chrome (Edit / Send AOC / Actions) unchanged.  
- Profile hero band already shows photo + metrics; **dedupe thoughtfully**:
  - Prefer one identity source of truth on Overview (either slim hero + snapshot body, or fold identity into snapshot and slim hero metrics so Purchase/Assignment/Buyer EMD are not triple-repeated).  
  - Spec decision for implementers: **Keep global profile hero** (photo, address, stage, type, purchase/assignment/closing/buyer EMD as today) **and** make Overview body the full snapshot list without a second full-bleed photo if hero already has it — **OR** move identity into Overview-only and leave hero minimal.  
  - **Locked for plan:** Keep the existing **profile header chrome + hero band** for navigation consistency. Overview tab content = parties + economics (with end buyer price) + close/status grid + notes + investor. Do **not** re-render a second large property photo inside the tab if hero already shows it. Address/stage/type remain visible in hero; Overview body may repeat stage/type only as small chips if needed for scan when scrolled.

## Interactions

| Control | Behavior |
|---------|----------|
| Notes Save | `saveDealFields(dealId, { notes })` → toast → refresh profile notes |
| Investor URL | Existing save/edit/clear |
| Status fields | Read-only on Overview; change via **Edit** dialog (already has title, EMDs, vacancy, access, buyer, prices) |
| Deep links from P5 blockers | Remove/stop using situation-board markup; overview deep-link targets that pointed at blockers go away with the board |

## Remove from Overview

- `renderOverviewSituation` situation board UI (spine, blockers, people, recent)  
- Related CSS that only serves that board (can leave unused briefly if needed; prefer delete dead CSS)  
- Tests that assert situation-board-only structure → replace with snapshot assertions  

Keep useful helpers if still used elsewhere (`daysUntilClosing` may stay for board/other; `overviewBlockers` / `overviewNextMove` / `overviewRecentEvents` can be removed if unused).

## Accessibility

- Semantic sections with headings  
- Status chips readable (text labels, not color-only)  
- Notes textarea labeled; Save has clear name  
- `prefers-reduced-motion` for any remaining flashes  

## Success criteria (operator)

Mid-stage deal on Overview → answers the six questions above without leaving the tab.  
No next-move banner. No blockers list. Notes savable without opening full Edit (Edit still available for other fields).

## Implementation notes for plan

- Files: `public/js/under-contract.js`, `public/css/under-contract.css`, optionally `public/under-contract.html` (notes markup if static), `tests/under-contract.test.js`, cache bump.  
- Reuse: `money()`, `statusChip()`, `dealTypeBadgeHtml()`, `saveDealFields()`, `renderInvestorBase()`.  
- Verify: `node --check`, `node --test tests/under-contract.test.js`, `scripts/verify-live.ps1`.  
- Scope: Overview tab only.
