// premium-shell.js — scan theater class + KPI pulse (empty-state demo removed)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  R.syncScanTheaterClass = function syncScanTheaterClass(running) {
    const section = document.getElementById('progressSection');
    if (!section) return;
    section.classList.toggle('scanning-active', !!running);
  };

  R.pulseDistressedKpi = function pulseDistressedKpi(count) {
    const card = document.getElementById('sumDistressedKpiCard');
    if (!card || !count || prefersReducedMotion()) return;
    card.classList.remove('kpi-pulse');
    void card.offsetWidth;
    card.classList.add('kpi-pulse');
  };
})(typeof window !== 'undefined' ? window : globalThis);