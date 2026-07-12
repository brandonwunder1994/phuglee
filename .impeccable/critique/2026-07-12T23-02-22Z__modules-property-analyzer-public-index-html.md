---
target: Analyze page /analyzer
total_score: 22
p0_count: 2
p1_count: 2
timestamp: 2026-07-12T23-02-22Z
slug: modules-property-analyzer-public-index-html
---
# Critique — Phuglee Analyze (2026-07-12)

**Target:** modules/property-analyzer/public/index.html
**Method:** dual-agent (A: design director · B: detector + source evidence; parent ran detect.mjs)
**Heuristics total:** 22/40

## Anti-patterns
- CSS stack: cyber + heat + phuglee + premium (~15 sheets)
- body: cyber-theme heat-theme analyze-phuglee
- Cyber HUD: REC, reticle, NO SIGNAL, scanlines, cyber-dialog
- Triple KPI boards; first paint shows zeroed buckets + empty rankings
- Action row pollution (Start + Review + Export backup + API usage)

## Priority issues
- P0 First paint sells dashboard not scan desk
- P0 Property modal still Cyber HUD
- P1 Design-system stacking
- P1 Action-row pollution
- P2 Tier vocabulary fractures
- P3 Dead/duplicate chrome

## Detector CLI (parent)
- broken-image x5 (false positive: JS-filled imgs)
- em-dash-overuse (UI placeholders)
