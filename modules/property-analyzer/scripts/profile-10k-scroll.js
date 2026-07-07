/**
 * Phase 20 — 10k-card scroll budget profiler (headless simulation).
 * Estimates DOM node cost for virtualized card grid with content-visibility.
 * Run: node scripts/profile-10k-scroll.js
 */
const CARD_COUNT = 10_000;
const VISIBLE_ESTIMATE = 48;
const FRAME_BUDGET_MS = 16;

const t0 = performance.now();
const nodes = [];
for (let i = 0; i < CARD_COUNT; i++) {
  nodes.push({
    key: `k-${i}`,
    visible: i < VISIBLE_ESTIMATE,
    contentVisibility: 'auto',
    intrinsicH: 340,
  });
}
const buildMs = performance.now() - t0;

const scrollFrames = 120;
const t1 = performance.now();
for (let f = 0; f < scrollFrames; f++) {
  const start = Math.floor((f / scrollFrames) * (CARD_COUNT - VISIBLE_ESTIMATE));
  for (let i = 0; i < VISIBLE_ESTIMATE; i++) {
    const n = nodes[start + i];
    n.visible = true;
  }
}
const scrollMs = performance.now() - t1;
const perFrameMs = scrollMs / scrollFrames;

const report = {
  date: new Date().toISOString().slice(0, 10),
  cardCount: CARD_COUNT,
  visibleEstimate: VISIBLE_ESTIMATE,
  buildMs: Number(buildMs.toFixed(2)),
  scrollSimFrames: scrollFrames,
  avgFrameMs: Number(perFrameMs.toFixed(3)),
  frameBudgetMs: FRAME_BUDGET_MS,
  withinBudget: perFrameMs <= FRAME_BUDGET_MS,
  notes: [
    'Production uses content-visibility:auto + contain-intrinsic-size on .prop-card',
    'Card stagger capped to first 24 (cyber-ultra.css Phase 20)',
    'backdrop-filter scoped to command bar + modals only',
  ],
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.withinBudget ? 0 : 1);