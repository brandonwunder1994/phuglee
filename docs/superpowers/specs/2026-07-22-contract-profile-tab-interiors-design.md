# Contract Profile Tab Interiors — Design Spec

**Date:** 2026-07-22  
**Status:** Draft — operator review  
**Surface:** `/under-contract` centered workbench **tab bodies only**  
**Prerequisite:** Workbench shell (tabs, hero, stage CTA) already shipped  

---

## 1. Problem

Shell IA is right (tabs + hero + primary CTA). Tab **interiors** still ship the old accordion era:

- Nested `.uc-panel` borders + summary headers that **repeat the tab name**
- Flat form dumps and equal-weight fields
- Double chrome (tab frame → panel frame → body inset → row cards)

Result: “organized ugly set of data.”

---

## 2. Goals

1. Each tab feels like a **purpose-built workspace**, not a forced-open accordion.  
2. Keep **all features** (docs/SignNow, buyers, SMS×3, media, rehab, scan, investor URL).  
3. Phuglee product register: dark earth, cream, ember/gold — Linear/Attio density, not purple glass SaaS.  
4. First 2 seconds in a tab answer the operator question for that tab.

### Non-goals

- Board cards / KPI strip  
- Backend / API changes  
- New deal stages or fields  

---

## 3. Shared system (ship first)

| Fix | Spec |
|-----|------|
| Kill accordion chrome in tabs | Remove/hide `.uc-panel-summary` for tab children; no chevron; no “Documents” under Documents |
| Flatten surfaces | `.uc-profile-tabpanel` content: padding + gap only; no nested card border on every section |
| Section headers | Quiet `h3` only when **2+ peer regions** in one tab (e.g. Media / Rehab) |
| Toolbar | Top of tab: meta left · primary right · ghosts clustered |
| List row primitive | Hairline separators, hover actions, status chips — not full boxed rows |
| Empty states | Why it matters + primary CTA (+ optional secondary) |
| Type | Labels muted 0.65–0.75rem, tracking ≤0.04em; values 0.875–0.9rem cream |
| Density | List actions ~32–36px; reserve 44px only for primary mobile taps |

---

## 4. Tab designs

### Overview — “Deal brief sheet”

**Ugly now:** Equal People/Economics/Status dumps; money duplicates hero; Investor Base still a panel.

**Target:**

1. **Contacts** — seller + cash buyer; phone/email as links  
2. **Deal pulse** — Access · Vacancy · Photos · EMDs · Funded as friction-first chips/rows  
3. **Notes** — full-width prose surface  
4. **Investor site** — single URL row (open / copy / edit), no accordion  

**Remove:** full Economics group (money lives in hero); duplicate Closing / Buyer EMD in status dump.

### Documents — “Deal vault”

**Ugly now:** Panel titled Documents; twin form footers (upload vs SignNow); card-per-doc.

**Target:**

1. Toolbar: Refresh signed (ghost)  
2. Pending SignNow band (if any)  
3. Document **list rows** (kind chip · name · source · View · ⋯)  
4. Footer **two action blocks:** Upload file | Send via SignNow  
5. Preview replaces/expands below list, not between forms  

**Empty:** “No contracts on file yet” + Send Document + Upload.

### Buyers — “Offer board”

**Ugly now:** Panel titled Buyers; mini-form cards; weak empty.

**Target:**

1. Toolbar: “N offers” · **Add buyer**  
2. Sorted by amount: name · amount · hover Edit/Remove  
3. Draft row when adding  
4. Empty: “No buyers pitched yet” + Add buyer  

### Comms — “Message desk”

**Already best IA.** Fix presentation:

1. Keep channel segments  
2. Strip pane borders (no double frame)  
3. Unified context bar per channel  
4. Thread `flex:1` min-height ~280px; compose sticky bottom  
5. Empty that teaches  

### Media / Rehab — “Dispo packet”

**Ugly now:** Three stacked panels (Media · Rehab · Scan) — worst tab.

**Target (one scroll story):**

1. **Photos** — count · Upload · ZIP · grid  
2. **Condition estimate** — dense summary strip + controls + lines (not 4 hero tiles)  
3. **Systems notes** — denser rehab fields + Save  

Quiet section headers only; **no** accordion summaries.

---

## 5. Implementation order (max wow/hour)

1. Shared chrome kill + density  
2. Media / Rehab unwrap  
3. Overview brief  
4. Documents vault  
5. Buyers board  
6. Comms height + frame strip  

---

## 6. Files

- `public/under-contract.html` — unwrap summaries, section structure  
- `public/css/under-contract.css` — tab interior system  
- `public/js/under-contract.js` — fact layout, empty states, buyer sort, light class hooks  
- `tests/under-contract.test.js` — structure asserts  

---

## 7. Success criteria

1. No tab shows a redundant accordion title matching the tab name.  
2. Nested card depth ≤ 1 (row hover ≠ full card stack).  
3. Each tab has ≤1 obvious primary action.  
4. Brandon/Brad: “this looks finished inside, not just reorganized.”  
5. Feature parity; `under-contract` tests pass; live verify green.  
