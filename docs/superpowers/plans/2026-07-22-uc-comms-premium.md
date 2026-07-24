# Comms premium desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Rebuild Comms UI as a single conversation shell (channel rail + identity + full-height thread + sticky compose) without changing messaging APIs.

**Architecture:** HTML structure cleanup in `#uc-panel-comms`, CSS flex height + bubble craft, JS header/empty/action visibility only.

**Spec:** `docs/superpowers/specs/2026-07-22-uc-comms-premium-design.md`

## Global Constraints

- Comms tab only  
- Keep Seller / Internal / Photographer + all send/load/mark-read/save-media  
- No message templates  
- Cache bump + verify-live  
- Layout integrity + prefers-reduced-motion  

---

### Task 1: Markup shell

**Files:** `public/under-contract.html`

- [ ] Restructure each channel pane:
  - Remove `uc-comm-mode-kicker` elements  
  - Identity: single name + sub meta  
  - Actions in one `uc-comm-actions` cluster  
  - Thread + compose inside `uc-comm-pane-inner` flex column  
- [ ] Photographer: slim `uc-comm-job-strip` instead of heavy banner class if needed  

---

### Task 2: CSS conversation surface

**Files:** `public/css/under-contract.css`

- [ ] Flex chain: tabpanel → shell → pane-inner → thread flex 1 / compose shrink 0  
- [ ] Channel rail: pills, active state, unread badge placement  
- [ ] Bubbles: in/out alignment, max-width, padding, meta  
- [ ] Day separators quiet  
- [ ] Compose sticky bar styling  
- [ ] Job strip slim  
- [ ] Mobile full-bleed already exists — verify chain  

---

### Task 3: JS copy + visibility

**Files:** `public/js/under-contract.js`

- [ ] Empty-state strings per channel  
- [ ] Placeholders per channel  
- [ ] “Mark read” shorter label  
- [ ] Ensure mark-read / save-all / copy URL only show when needed  
- [ ] Don’t reintroduce channel pulse if tab mail badge is enough  

---

### Task 4: Tests + live + commit

```bash
node --check public/js/under-contract.js
node --test tests/under-contract.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Update tests: Comms three-mode still present; assert no “War room” / “Relationship” kickers; assert `uc-comm-pane-inner` flex / compose sticky class names from implementation.

```bash
git commit -m "feat(uc): premium Comms conversation shell"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| Single shell + sticky compose | 1–2 |
| No kickers | 1, 3 |
| Bubble craft | 2 |
| Actions context-only | 3 |
| Photographer strip | 1–2 |
| Tests + live | 4 |
