---
phase: 20
date: 2026-06-30
---

# 10k Scroll Performance Profile

**Script:** `scripts/profile-10k-scroll.js`

| Metric | Value |
|--------|-------|
| Cards simulated | 10,000 |
| Visible estimate | 48 |
| Avg frame (sim) | <0.01ms |
| Frame budget | 16ms |
| Within budget | yes |

**Mitigations shipped (Phase 20):**
- `content-visibility: auto` on `.prop-card`
- Card entrance stagger capped to first 24 only
- `backdrop-filter` removed from glass panels (scoped to command bar + modals)

**status: no sustained >16ms regression documented**