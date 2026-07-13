(function () {
  'use strict';

  /** Canonical How It Works lives at /heat (full page + pricing). */
  var HEAT_HREF = '/heat';

  var GUIDE_TRIGGER_IDS = [
    'btn-how-it-works',
    'btn-how-it-works-footer',
    'btn-how-it-works-dashboard',
    'btn-how-it-works-quick'
  ];

  function normalizePath(pathname) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/index.html' ? '/' : p;
  }

  function openGuide() {
    if (normalizePath(window.location.pathname) === '/heat') return;
    window.location.href = HEAT_HREF;
  }

  function closeGuide() {
    /* No overlay — canonical guide is /heat. Kept for callers (auth.js). */
  }

  function bindTriggers() {
    GUIDE_TRIGGER_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        openGuide();
      });
    });
  }

  function init() {
    bindTriggers();

    if (window.location.hash === '#how-it-works') {
      window.setTimeout(openGuide, 40);
    }
  }

  window.PhugleeGuide = {
    open: openGuide,
    close: closeGuide,
    flipToPricing: function () {
      window.location.href = HEAT_HREF + '#pricing';
    },
    flipToHow: openGuide
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
