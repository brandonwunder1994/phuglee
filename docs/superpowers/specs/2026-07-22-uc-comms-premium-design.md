# Comms desk — premium conversation surface

**Date:** 2026-07-22  
**Surface:** `/under-contract` profile → **Comms tab only**  
**Status:** Awaiting user approval  
**Register:** product (ops tool)  
**Skills applied:** Impeccable product register, superpowers brainstorming, layout integrity, Overview/Documents IA patterns already shipped on this profile  

---

## 1. Audit — what exists today

### Capabilities (keep — these work)

| Channel | Job |
|---------|-----|
| **Seller** | SMS thread to seller (GHL), mark read, save media from MMS, sync |
| **Internal** | Brandon ↔ Brad notes on this deal only, reactions |
| **Photographer** | Field logistics SMS, job banner, copy upload URL, sync |

Backend flows (load/send/poll/mark-read/save media) stay. **Design only.**

### Why it feels “super ugly”

1. **Three stacked chrome layers** — segmented channel pills + “Relationship / War room / Field job” kickers + toolbar of ghost buttons → looks like three products bolted together.  
2. **Not a conversation surface** — thread is a short box with min-heights fighting the modal; compose is a plain textarea + Send, not a sticky message bar.  
3. **Bubbles are generic** — uneven density, meta noise, day separators weak, MMS tiles feel bolted on.  
4. **Kickers are AI-slop eyebrows** — “Relationship”, “War room”, “Field job” on every mode (product register ban: section eyebrows as scaffolding).  
5. **Visual language drifts** from Overview snapshot + Documents chips (formal underlines, fit-content chips, dark paper).  
6. **Unread UX is split** — tab mail icon is good; in-channel orange pulse dot is leftover and clashes.  
7. **Dead air** — header takes vertical budget that should belong to the thread.  
8. **Inconsistent actions** — Sync / Mark as read / Save all media / Copy upload URL compete with equal weight.

### Product bar (Impeccable)

Would an operator who uses iMessage / Slack / Linear trust this as the place they *live* when a seller texts mid-deal? Today: functional, not trusted. Target: **the conversation is the product**; chrome disappears into the task.

---

## 2. Goal

Open Comms and in **2 seconds**:

1. Know **who** you’re talking to (seller / team / photographer).  
2. See the **latest messages** with clear mine vs theirs.  
3. **Send** without hunting.  
4. Handle **unread** without noise.  
5. Hit power actions (mark read, save media, upload URL) only when relevant.

**Non-goals:** new messaging backend, group SMS, templates (removed earlier on purpose), AI auto-reply, redesigning board-row 💬 alerts beyond consistency.

---

## 3. Design approaches

### A — Single conversation shell (recommended)

One **full-height message desk** inside the profile tab:

```
┌─────────────────────────────────────────────────────┐
│ [ Seller ] [ Internal ] [ Photographer ]   · actions│  ← slim rail
├─────────────────────────────────────────────────────┤
│  Day · messages (flex grow, scroll)                 │
│  …                                                  │
├─────────────────────────────────────────────────────┤
│  [ compose ……………………………… ]  [ Send ]              │  ← sticky
└─────────────────────────────────────────────────────┘
```

- **No** kicker eyebrows.  
- Channel switcher = pill rail matching tab language (active = cream/orange edge).  
- **One** identity line: name + phone/meta in muted mono.  
- Actions collapse into a compact row (icons or “More”) on the right of the rail when needed.  
- Thread fills remaining height; compose docks to bottom.

**Why A:** Matches how top messaging products work; fixes the main ugly (chrome over thread); stays three channels without a second app.

### B — Split: thread + context sidebar

Thread left, sticky “deal context” right (address, stage, last unread preview).  
**Tradeoff:** more polish for power users; denser; fights modal width; risk of nested-card slop.

### C — Polish only (bubbles + spacing)

Keep structure, restyle CSS.  
**Tradeoff:** still three headers and weak hierarchy — won’t feel “top of the line.”

**Recommendation: A.**

---

## 4. Information architecture

### Channel rail (always visible)

| Channel | Label | Unread |
|---------|--------|--------|
| Seller | **Seller** | Mail icon badge (existing tab-level + small on pill if unread) |
| Internal | **Internal** | Optional count later (not required v1) |
| Photographer | **Photographer** | None unless we add later |

Drop mode kickers: Relationship / War room / Field job.

### Identity strip (one line under rail)

- **Seller:** `{seller name}` · `{phone or line meta}`  
- **Internal:** `Brandon & Brad · this deal`  
- **Photographer:** `{photographer name or Photographer}` · job chip if scheduled  

### Thread

- Day separators: quiet centered date (e.g. **Tue, Jul 15**)  
- Bubbles:  
  - **Outbound (us):** right, orange-tinted / earth surface  
  - **Inbound (them):** left, cooler dark surface  
- Meta: name · time under bubble, small muted  
- MMS: image grid inside bubble, max 2–3 across, click → existing lightbox / save  
- Empty: short ops copy, not a marketing empty state  

### Compose (sticky)

- Single multi-line field, placeholder by channel  
- **Send** primary, same on all three  
- Enter = send (Shift+Enter = newline) — keep if already present  
- Disabled send when empty  

### Actions (context-only)

| Action | When visible |
|--------|----------------|
| Mark as read | Seller + unread |
| Save all media | Seller + thread has unsaved MMS |
| Sync | Always, but **ghost sm** and last in row |
| Copy upload URL | Photographer when URL exists |
| Job chip / banner | Photographer when shoot scheduled |

Prefer **one action cluster** right-aligned on the identity strip; never a second full toolbar row of equal buttons.

### Photographer job banner

Keep job state, restyle as a **single slim status strip** (not a heavy banner card): date · time · status · copy URL if needed.

---

## 5. Visual system (align with Overview + Documents)

| Token | Use |
|-------|-----|
| Dark earth surface | Pane background, slightly glass over deal photo |
| Cream text | Names, body |
| Muted meta | Times, sublines |
| Orange | Primary send, active channel, unread glow |
| Green | Only success states (e.g. marked read toast) |
| Layout integrity | Real gaps ≥ 0.75–1rem; no smooshed stacks |
| Formal chips | Channel pills like docs type chips if needed — not full-width bars |

### Bubble craft

- Max width ~72% of thread  
- Radius 12px; outbound bottom-right tighter, inbound bottom-left tighter (subtle “tail” optional — skip cartoon tails)  
- Body 0.9–0.95rem, line-height 1.4  
- No gradient text, no glassmorphism stack on every bubble  

### Motion

- Unread: keep mail icon shake+glow on **Comms tab** only  
- Channel pulse: remove red/orange infinite pulse on Seller pill if it competes — badge is enough  
- Scroll to latest on open (existing)  
- `prefers-reduced-motion` for all  

---

## 6. Layout / height contract (critical)

Inside profile modal:

```
.uc-profile-tabpanel--comms → flex column, flex 1, min-height 0
.uc-comm-shell → flex 1, min-height 0, flex column
.uc-comm-pane-inner → flex 1, min-height 0, flex column
.uc-convo-thread → flex 1, overflow-y auto, min-height 0
.uc-comm-compose-block → flex-shrink 0
```

Thread should claim **most** of the viewport below hero+tabs (target: ≥ 50–60% of modal body on desktop).

On mobile full-bleed: same flex chain; compose above home indicator.

---

## 7. Copy (ops voice)

| Spot | Copy |
|------|------|
| Seller empty | “No texts on this deal yet. Message the seller below.” |
| Internal empty | “No internal notes yet. Keep access, buyers, and decisions here.” |
| Photo empty | “No photographer texts yet. Schedule or text logistics below.” |
| Placeholder seller | “Message seller…” |
| Placeholder internal | “Note for the team…” |
| Placeholder photo | “Message photographer…” |
| Mark as read | “Mark read” (shorter) |

Drop theatrical “War room / Field job / Relationship.”

---

## 8. What we remove or demote

| Remove / demote | Why |
|-----------------|-----|
| Mode kickers | AI eyebrow scaffolding |
| Equal-weight Sync primary look | Secondary ghost only |
| Infinite SMS pulse on channel if badge exists | Noise |
| Heavy dual-border nested panels | Nested card slop |
| Short fixed thread min-heights without flex | Dead space / crush |

---

## 9. Success criteria (operator)

| # | Pass if |
|---|---------|
| C1 | Open Comms → channel rail + big thread + sticky compose (no kicker wall) |
| C2 | Seller/Internal/Photo switch is one click; state preserved |
| C3 | Unread: tab mail badge + optional pill badge; mark read clears |
| C4 | Bubbles scannable mine/theirs in 1 second |
| C5 | MMS save still works from thread |
| C6 | Photographer job strip + copy URL still work |
| C7 | Matches Overview/Documents dark ops craft (not a third visual language) |
| C8 | Full `under-contract` tests + verify-live |

---

## 10. Implementation sketch (for plan)

**Files:** `public/under-contract.html` (comms markup), `public/js/under-contract.js` (headers, empty copy, action visibility), `public/css/under-contract.css` (shell flex, bubbles, rail, compose), cache bump, tests.

**Reuse:** `showCommChannel`, `renderMessages`, `renderTeamMessages`, photographer render, poll, mark read, save media.

**No API changes.**

---

## 11. Recommended execution phases

1. **Shell** — flex height contract + sticky compose + strip kickers  
2. **Rail + identity** — clean channel pills + one-line identity + action cluster  
3. **Bubbles** — inbound/outbound craft, day sep, empty states  
4. **Photographer strip** — slim job bar  
5. **Polish** — unread consistency, reduced motion, tests, live  

---

## 12. Open questions (defaults if you approve as-is)

| Q | Default if silent |
|---|-------------------|
| Keep “Sync” visible always? | Yes, ghost, last |
| Reactions on internal? | Keep, quieter chips |
| Seller SMS templates? | Stay removed |
| Hide profile hero when on Comms to gain height? | **No** v1 (keep address context) |

---

## Spec self-review

- No process invention — design over existing channels  
- Approaches A/B/C with recommendation A  
- Aligns with Overview snapshot + Documents simplicity  
- Explicit non-goals and success criteria  
