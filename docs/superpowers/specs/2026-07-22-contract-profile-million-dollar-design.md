# Contract Profile — Million-Dollar Desk Project

**Date:** 2026-07-22  
**Status:** Design draft — research complete; awaiting operator approval before implementation  
**Surface:** `/under-contract` lead profile workbench **tab interiors** (shell kept)  
**Audience:** Brandon + Brad (dispo partners), high-stakes nightly deal work  

---

## 0. Why this project exists

### What we already did (honest)

| Wave | Outcome |
|------|---------|
| Centered modal + tabs | **IA win** — organization is right |
| Tab chrome kill + v66 polish | **Competent polish** — less accordion, still admin |

### User verdict (ground truth)

> Media sucks · Comms sucks · Overview just prettier · Docs looks like shit · want **eye-opening / jaw-dropping / million-dollar software**.

### Thesis

Premium software does not win on decoration. It wins on:

1. **Asymmetric hierarchy** — one primary artifact per surface  
2. **Exception-first UI** — risk and next action louder than fields  
3. **Artifact-native layouts** — each tab is a *different instrument*  
4. **Typed money / time / signature** — not equal text  

**Root sin of current interiors:** *equality*. Same furniture (toolbar → bordered list → forms) in five rooms. Polishing that is rearranging deck chairs.

**Single rule for this project:**  
> If two regions have the same visual weight, one of them is wrong.

---

## 1. Research synthesis (premium DNA)

| Product | Primary artifact | What feels expensive |
|---------|------------------|----------------------|
| **Attio** | Overview + attribute rail | Act-in-place header; sections not twin cards |
| **Linear** | Body + quiet properties | Density + alignment you *feel* |
| **Stripe** | Object + event list | Scarce accent; status as truth |
| **Close** | Conversation *is* the CRM | Comms not a bolted chat box |
| **HubSpot / Affinity** | Activity / relationship spine | Timeline of human events |
| **Notion** | Document first | Properties never compete with content |

### Patterns we will steal (8)

1. One hero decision zone (not equal KPI wallpaper)  
2. Primary artifact owns ≥55–70% of the tab  
3. Three type sizes max; tabular money  
4. Density via alignment, not empty padding  
5. Status as path/exceptions, not equal chips  
6. Lists as instruments (sorted, ranked, stateful)  
7. Empty = workflow with one real CTA  
8. Flat sections / hairlines — no nested card stacks  

### Anti-patterns we ban in this project

| Ban | Why |
|-----|-----|
| Equal pulse chips for every field | No narrative |
| Twin Upload vs SignNow hero cards | Fake balance; vault is primary |
| Chat-in-a-box (gray pane + compose) | 2014 embed, not a desk |
| Same layout DNA on every tab | “Pretty admin” smell |
| Generic dashed empty “No X yet” | No workflow |
| Native file input as the main visual | Credibility assassin |
| Manual “Refresh” as lifestyle chrome | Feels unfinished |
| Hero metrics *and* Overview economics dump | Operator must dedupe |

---

## 2. Current severity scoreboard

| Tab | Distance from premium (10 = far) | Indictment |
|-----|----------------------------------|------------|
| Overview | **6.5** | Prettier fact sheet; no deal command narrative |
| Documents | **8.5** | File manager + forms, not contract vault |
| Buyers | **7** | Two-column CRUD, not disposition market |
| Comms | **9** | Generic chat clone × 3 skins |
| Media / Rehab | **9** | Thumbnail dump + report dump + form dump |

**Interiors overall ~8/10 from premium.** Shell is not the problem.

---

## 3. Target product model

Each tab is a **different instrument**:

| Tab | Instrument | Primary artifact | Operator question answered in 3s |
|-----|------------|------------------|----------------------------------|
| **Overview** | Situation board | Blocker stack + next move | “What’s on fire / what do I do?” |
| **Documents** | Package pipeline + desk | Package cards / vault + preview | “What’s signed / what’s blocking?” |
| **Buyers** | Offer market | $-sorted board + crowned leader | “Who’s winning and by how much?” |
| **Comms** | Relationship / logistics desk | Full-height channel desk | “What did they say / what do I send?” |
| **Media** | Evidence workbench | Stage + filmstrip + cost model | “What does the house cost to fix?” |

### Scene sentence (forces design)

> Brandon and Brad at a dim desk at night, one deal open, money on the line: they need **next move, signatures, best buyer, seller text, and rehab number** without translating admin UI into field ops.

### Color strategy

**Restrained** (product default) with **Committed** accents only on: primary CTA, exception/risk, leading offer, signed-complete. Dark earth + cream + ember/gold. No glass, purple, equal chip rainbow.

### Named anchors

1. **Close.com** — conversation as desk  
2. **Stripe Dashboard** — list discipline, scarce accent  
3. **Attio / Linear** — hierarchy and density  
4. **Dotloop / escrow-class** — package lifecycle for docs  

---

## 4. Tab designs (target, not implementation detail)

### 4.1 Overview — Situation board

**Stop being:** Contact cards + seven equal chips + notes dump.  
**Become:**

```
┌─────────────────────────────────────────────────────────┐
│ NEXT MOVE  ·  Close in 12d  ·  Assignment $18k          │
│ Primary action mirrors shell CTA (contextual copy)      │
├──────────────────────┬──────────────────────────────────┤
│ BLOCKERS (ranked)    │ PEOPLE                           │
│ • Seller EMD missing │ Seller  [SMS] [Call]             │
│ • Access unset       │ Winning buyer → or empty→Buyers  │
│ • AOC unsigned       │                                  │
│ click → deep-link    │                                  │
├──────────────────────┴──────────────────────────────────┤
│ RECENT (last 3–5 human events: SMS, team, stage, doc)   │
├─────────────────────────────────────────────────────────┤
│ NOTES (inline add) · Investor link row (open/copy)      │
└─────────────────────────────────────────────────────────┘
```

**Rules:**

- Hero keeps identity + money metrics; Overview does **not** re-list purchase/assignment.  
- Pulse only for **exceptions / blockers**, ranked.  
- People = operators with actions, not labels.  
- Notes = short activity or inline, not a dead paragraph only.  
- Investor URL = instrumental row, not a third fact stack.

**Jaw-drop moment:** Open deal → instantly see “Close in 12d · blocked on seller EMD · next: Send AOC” without scanning.

---

### 4.2 Documents — Package pipeline + document desk

**Stop being:** Filename list + native file input + twin form cards.  
**Become:**

```
┌─ NEEDS ATTENTION (only if any) ─────────────────────────┐
│ 2 packages awaiting · PSA 1/2 signed · AOC not sent     │
└─────────────────────────────────────────────────────────┘
┌─ PACKAGES (primary) ────────────┬─ PREVIEW DESK ────────┐
│ PSA     · 1/2 signed · [Remind] │                       │
│ AOC     · Not sent   · [Send]   │   PDF / empty state   │
│ JV      · Complete   · [Open]   │                       │
│ + imported files list           │                       │
└─────────────────────────────────┴───────────────────────┘
│ Intent bar: [ Import signed PDF ]  [ Send package ▾ ]   │
└─────────────────────────────────────────────────────────┘
```

**Rules:**

- **Vault/packages are primary** (≥60% of tab).  
- Upload/SignNow are **intents on the desk**, not twin heroes.  
- Status: sent / partial / complete / imported — with **who blocks**.  
- Preview = side panel or theater, never sandwiched between list and forms.  
- Stage-aware banner: “Need signed PSA before AOC.”  
- Hide native file chrome until “Import” intent.

**Jaw-drop moment:** Package cards with 2/3 signed + named blocker; one click open full preview desk.

---

### 4.3 Buyers — Disposition market

**Stop being:** Name | $ | Edit/Remove CRUD.  
**Become:**

```
┌─ LEADING OFFER ─────────────────────────────────────────┐
│ $92,000 · Jane Buyer · +$4k vs next · [Send AOC] [Lock] │
└─────────────────────────────────────────────────────────┘
┌ Rank · Amount · Name · Status · vs Purchase · Actions ─┐
│  1   · $92k   · Jane · Hot    · +12k         · …       │
│  2   · $88k   · Bob  · Pitched· +8k          · …       │
└────────────────────────────────────────────────────────┘
│ Economics strip: Purchase · Best offer · Spread · Target │
```

**Rules:**

- Always sort by **amount desc**.  
- Crown leading offer.  
- Show spread vs purchase (and assignment target if known).  
- Status: Pitched / Hot / AOC out / Dead.  
- Winner couples to shell “Buyer found” / AOC.  
- Deep buyer later: phone, notes — v1 can keep fields but **present** as market.

**Jaw-drop moment:** See who is winning and by how much vs your buy price in one glance.

---

### 4.4 Comms — Deal communications desk

**Stop being:** Three identical chat boxes.  
**Become three modes sharing one desk shell:**

| Channel | Mode | Header identity | Compose |
|---------|------|-----------------|---------|
| **Seller** | Relationship console | Name, phone, last inbound highlight | Templates: access, photos, closing |
| **Internal** | Deal war room | Team thread, pinned decisions | @ notes; kill emoji as differentiator |
| **Photographer** | Job ticket | Job status, media count, upload URL | SMS log under ticket |

**Spatial model:**

```
[ Seller | Internal | Photographer ]   ← segmented, not nested apps
┌─ Context header (mode-specific) ───────────────────────┐
│ Thread (full height, day separators, jump to unread)   │
│ Compose sticky: templates · attach · Send              │
└────────────────────────────────────────────────────────┘
```

**Rules:**

- Never “Them/You” — use real names.  
- Kill manual Refresh as primary lifestyle (poll silently).  
- Attachments = file evidence with “file to deal” that pulses Media tab.  
- Optimistic send.  
- Empty = first message suggestion for stage.

**Jaw-drop moment:** Seller channel feels like a relationship console; Photographer feels like a field job — not three skins of iMessage.

---

### 4.5 Media / Rehab — Evidence workbench

**Stop being:** Thumbnail landfill + report printout + form.  
**Become one model:**

```
┌─ CONDITION HERO  $48k · investor · 72% conf · Rescan ──┐
├─ STAGE (large) ──────────────┬─ FILMSTRIP / ROOMS ─────┤
│  active photo / video        │ Kitchen (4) Bath (2)…   │
│  click line ↔ photo          │                         │
├──────────────────────────────┴─────────────────────────┤
│ LINE ITEMS (sorted $) — click opens evidence photo     │
│ SYSTEMS overrides (compact) — same model, not 2nd form │
└────────────────────────────────────────────────────────┘
```

**Rules:**

- **Estimate first** (one hierarchy-earning number).  
- Photos organized by **room** (use AI labels you already have).  
- Every $ line cites openable evidence.  
- Assumptions (finish/sqft/%) in a **settings drawer**, not permanent form chrome.  
- Human systems notes = overrides on the model, not a parallel brain.  
- Ingest: drag-drop + multi-upload progress; photographer banner.

**Jaw-drop moment:** Click “Roof $6k” → kitchen/exterior photos that justified it; one glance at total rehab for dispo.

---

## 5. Approaches (strategic)

### A — Surface restyle only (reject)
CSS densify lists, prettier chips.  
**Pros:** Fast. **Cons:** User already rejected this (“prettier”).

### B — Sequential instrument rebuild (recommended)
Rebuild tabs one-by-one as distinct instruments; shared design tokens; no big-bang rewrite of all JS.  
**Pros:** Ship jaw-drop tab by tab; lower risk; matches revenue pain.  
**Cons:** ~2–4 weeks of focused work depending on depth.

### C — Full profile SPA rewrite
New component architecture, separate bundle.  
**Pros:** Cleanest long-term. **Cons:** Overkill while `under-contract.js` is the living product; delays value.

**Recommendation: B**, with build order by jaw-drop × revenue pain:

1. **Documents** (signatures = money)  
2. **Media / Rehab** (dispo proof)  
3. **Comms** (daily nerve center)  
4. **Buyers** (disposition)  
5. **Overview** (situation board — already least broken; last so it can deep-link to finished tabs)

---

## 6. Non-goals

- Board table / deal cards redesign (separate project)  
- New backend entities unless needed for package status display (prefer existing SignNow/pending fields)  
- Brand marketing pages  
- Feature cuts (power stays; presentation becomes instruments)  

---

## 7. Success criteria

### Competent bar (not enough alone)

Consistent type, no nested accordion, stage CTA, feature parity.

### Jaw-drop bar (project definition of done)

1. Blind test: five tabs look like **five different tools**, not five skins.  
2. Open a live deal: **3-second next move** on Overview.  
3. Documents show **who blocks signature**, not just filenames.  
4. Buyers show **leader + spread vs purchase**.  
5. Comms: full-height desk, real names, mode-specific headers.  
6. Media: estimate-led, room chapters, line↔photo link.  
7. Brandon/Brad verbal: “this feels like software we’d pay for,” not “nicer admin.”  
8. Tests + live verify green; no feature regression on SignNow/SMS/scan.

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Scope sprawl into “rebuild CRM” | Instrument checklist per tab; freeze shell |
| SignNow data incomplete for 2/3 signed UI | Graceful degrade: status unknown → send/refresh |
| `under-contract.js` size | Section modules only if necessary; prefer surgical DOM |
| AI room labels sparse | Fallback “All photos” chapter |
| Over-design motion | Motion only on state (send, sign complete, scan done) |

---

## 9. Deliverables of this project (after approval)

1. This design spec (approved)  
2. Phased implementation plan (`docs/superpowers/plans/…`)  
3. Per-phase ship: Documents → Media → Comms → Buyers → Overview  
4. Operator walkthrough script O1–O5  

---

## 10. Approval gate

**Do not implement until operator confirms:**

- [ ] Instrument model + ban list accepted  
- [ ] Build order Documents → Media → Comms → Buyers → Overview  
- [ ] Jaw-drop success criteria (not “make prettier”)  

Optional: mockups / visual companion for Documents + Media first before code.
