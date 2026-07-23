(function () {
  'use strict';

  var bar = null;
  var pollTimer = null;

  function isAuthenticated() {
    if (window.PhugleeSession && typeof window.PhugleeSession.isAuthenticated === 'function') {
      return window.PhugleeSession.isAuthenticated();
    }
    try {
      if (sessionStorage.getItem('phuglee_logout') === '1') return false;
      return !!sessionStorage.getItem('phuglee_session');
    } catch (_) {
      return false;
    }
  }

  function planLabel() {
    try {
      var user = sessionStorage.getItem('phuglee_session');
      if (!user) return '';
      var users = JSON.parse(localStorage.getItem('phuglee_users') || '{}');
      var plan = (users[user] && users[user].plan) || 'pro';
      return plan.charAt(0).toUpperCase() + plan.slice(1);
    } catch (_) {
      return 'Pro';
    }
  }

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('footer');
    bar.className = 'distress-status-bar';
    bar.id = 'distress-status-bar';
    bar.setAttribute('aria-label', 'System status');
    document.body.appendChild(bar);
    document.body.classList.add('has-status-bar');
    return bar;
  }

  function render(modules) {
    if (!isAuthenticated()) {
      if (bar) bar.hidden = true;
      return;
    }
    ensureBar();
    bar.hidden = false;

    var forge = modules && modules.formForge === 'up';
    var analyzer = modules && modules.propertyAnalyzer === 'up';

    var onAnalyzer = /^\/analyzer(\/|$)/.test(window.location.pathname || '');
    var planPill = onAnalyzer
      ? ''
      : '<span class="distress-status-pill">' + planLabel() + ' · Collect. Filter. Review.</span>';

    bar.innerHTML =
      '<div class="distress-status-left">' +
        '<span class="distress-status-brand">Distress OS</span>' +
        '<span class="distress-status-pill">' +
          '<span class="distress-status-dot ' + (forge ? 'is-up' : 'is-down') + '"></span> Forge' +
        '</span>' +
        '<span class="distress-status-pill">' +
          '<span class="distress-status-dot ' + (analyzer ? 'is-up' : 'is-down') + '"></span> Review' +
        '</span>' +
      '</div>' +
      '<div class="distress-status-right">' + planPill + '</div>';
  }

  function poll() {
    fetch('/api/health')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        render(data.modules || {});
      })
      .catch(function () {
        render({ formForge: 'down', propertyAnalyzer: 'down' });
      });
  }

  function mount() {
    if (!isAuthenticated()) return;
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    poll();
    pollTimer = window.setInterval(poll, 30000);
  }

  window.DistressStatus = { mount: mount, render: render };
})();