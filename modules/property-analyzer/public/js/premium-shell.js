// premium-shell.js — scan theater class + KPI pulse + mobile nav
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

  function bindAnalyzeMobileNav() {
    const toggle = document.getElementById('analyzeMobileNavToggle');
    const sidebar = document.getElementById('appSidebar');
    if (!toggle || !sidebar) return;

    function setOpen(open) {
      document.body.classList.toggle('analyze-nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Menu';
    }

    toggle.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('analyze-nav-open'));
    });

    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('analyze-nav-open')) return;
      if (sidebar.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    if (global.matchMedia) {
      global.matchMedia('(min-width: 721px)').addEventListener('change', function (mq) {
        if (mq.matches) setOpen(false);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAnalyzeMobileNav);
  } else {
    bindAnalyzeMobileNav();
  }
})(typeof window !== 'undefined' ? window : globalThis);
