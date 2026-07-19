(function () {
  'use strict';

  function hideShellLoading() {
    if (window.PhugleeStates && typeof window.PhugleeStates.hideShellLoading === 'function') {
      window.PhugleeStates.hideShellLoading();
    } else {
      var strip = document.getElementById('shell-loading-strip');
      if (strip) strip.hidden = true;
      document.body.classList.remove('shell-nav-loading');
    }
  }

  function revealAdminTools() {
    function show() {
      var isAdmin = window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function'
        ? window.PhugleeSettings.isAdmin()
        : false;
      if (!isAdmin) {
        try { isAdmin = sessionStorage.getItem('phuglee_session') === 'admin'; } catch (_) {}
      }
      var isContractDesk = window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function'
        ? window.PhugleeSettings.isContractDesk()
        : isAdmin;
      if (!isContractDesk) {
        try {
          var user = sessionStorage.getItem('phuglee_session');
          isContractDesk = user === 'admin' || user === 'brad';
        } catch (_) {}
      }
      document.querySelectorAll('[data-admin-only]').forEach(function (el) {
        var href = el.getAttribute('href') || '';
        var showForDesk = isContractDesk && href.indexOf('/under-contract') >= 0;
        el.hidden = !(isAdmin || showForDesk);
      });
    }
    show();
    if (window.PhugleeSession && typeof window.PhugleeSession.syncSessionFromServerCookie === 'function') {
      window.PhugleeSession.syncSessionFromServerCookie().then(show);
    }
  }

  /**
   * If coverage never fills after load, surface a quiet unavailable line.
   * home-coverage.js owns success writes to #command-city-count.
   */
  function watchCoverageUnavailable() {
    var status = document.getElementById('command-coverage-status');
    var citiesEl = document.getElementById('command-city-count');
    if (!status || !citiesEl) return;

    window.setTimeout(function () {
      var text = (citiesEl.textContent || '').trim();
      if (!text || text === '—') {
        status.hidden = false;
      }
    }, 12000);
  }

  function init() {
    hideShellLoading();
    revealAdminTools();
    watchCoverageUnavailable();
    window.addEventListener('pageshow', hideShellLoading);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
