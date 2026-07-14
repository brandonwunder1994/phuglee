(function () {
  'use strict';

  var HEALTH_TIMEOUT_MS = 8000;
  var missionState = {
    forgeUp: null,
    analyzerUp: null
  };

  function setModuleStatus(prefix, isUp) {
    var dot = document.getElementById(prefix + '-dot');
    var label = document.getElementById(prefix + '-label');
    if (!dot || !label) return;

    dot.classList.remove('is-checking', 'is-up', 'is-down');
    if (isUp === null) {
      dot.classList.add('is-checking');
      label.textContent = 'Checking…';
      return;
    }
    if (isUp) {
      dot.classList.add('is-up');
      label.textContent = 'Online';
    } else {
      dot.classList.add('is-down');
      label.textContent = 'Offline';
    }
  }

  function fetchWithTimeout(url, ms) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? window.setTimeout(function () { controller.abort(); }, ms)
      : null;

    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .finally(function () {
        if (timer) window.clearTimeout(timer);
      });
  }

  function readCoverageSnippet() {
    var citiesEl = document.getElementById('command-city-count');
    var statesEl = document.getElementById('command-state-count');
    var cities = citiesEl && citiesEl.textContent ? citiesEl.textContent.trim() : '';
    var states = statesEl && statesEl.textContent ? statesEl.textContent.trim() : '';
    if (!cities || cities === '—' || !states || states === '—') return '';
    return cities + ' cities · ' + states + ' states live. ';
  }

  function updateMissionFocus() {
    var title = document.getElementById('command-mission-title');
    var desc = document.getElementById('command-mission-desc');
    var cta = document.getElementById('command-mission-cta');
    if (!title || !desc || !cta) return;

    var forgeUp = missionState.forgeUp;
    var analyzerUp = missionState.analyzerUp;
    var coverage = readCoverageSnippet();

    // Default: work-first Collect
    var next = {
      title: 'Hit the Clerk',
      desc: coverage
        ? coverage + 'Pull fresh lists at the clerk before aggregators dilute them.'
        : 'Pull fresh lists at the clerk before aggregators dilute them.',
      href: '/collect',
      cta: 'Open Collect →'
    };

    if (forgeUp === false && analyzerUp === false) {
      next.desc =
        'Forge and Analyze are offline. You can still open Collect when modules recover — check status on the right.';
    } else if (forgeUp === false) {
      next.desc =
        (coverage || '') +
        'Request tooling is offline — tracker/PDF may fail. Hit the clerk path still opens Collect.';
    } else if (analyzerUp === false) {
      next.desc =
        (coverage || '') +
        'Analyze is offline — you can still collect and scrub. Rank & dial when it recovers.';
    }

    title.textContent = next.title;
    desc.textContent = next.desc;
    cta.setAttribute('href', next.href);
    cta.textContent = next.cta;
  }

  function pollHealth() {
    setModuleStatus('command-forge', null);
    setModuleStatus('command-analyzer', null);

    fetchWithTimeout('/api/health', HEALTH_TIMEOUT_MS)
      .then(function (r) {
        if (!r.ok) throw new Error('health ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var modules = (data && data.modules) || {};
        var forgeUp = modules.formForge === 'up';
        var analyzerUp = modules.propertyAnalyzer === 'up';
        missionState.forgeUp = forgeUp;
        missionState.analyzerUp = analyzerUp;
        setModuleStatus('command-forge', forgeUp);
        setModuleStatus('command-analyzer', analyzerUp);
        updateMissionFocus();
      })
      .catch(function () {
        missionState.forgeUp = false;
        missionState.analyzerUp = false;
        setModuleStatus('command-forge', false);
        setModuleStatus('command-analyzer', false);
        updateMissionFocus();
      });
  }

  function watchCoverageCounts() {
    var citiesEl = document.getElementById('command-city-count');
    if (!citiesEl || typeof MutationObserver === 'undefined') return;

    var obs = new MutationObserver(function () {
      updateMissionFocus();
    });
    obs.observe(citiesEl, { childList: true, characterData: true, subtree: true });
    var statesEl = document.getElementById('command-state-count');
    if (statesEl) {
      obs.observe(statesEl, { childList: true, characterData: true, subtree: true });
    }
  }

  function hideShellLoading() {
    if (window.PhugleeStates && typeof window.PhugleeStates.hideShellLoading === 'function') {
      window.PhugleeStates.hideShellLoading();
    } else {
      var strip = document.getElementById('shell-loading-strip');
      if (strip) strip.hidden = true;
      document.body.classList.remove('shell-nav-loading');
    }
  }

  var CHECKLIST_KEY = 'phuglee_command_checklist_dismissed';

  function initFirstRunChecklist() {
    var card = document.getElementById('command-first-run');
    var dismiss = document.getElementById('command-checklist-dismiss');
    if (!card) return;
    var dismissed = false;
    try {
      dismissed = localStorage.getItem(CHECKLIST_KEY) === '1';
    } catch (_) {}
    if (dismissed) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        try {
          localStorage.setItem(CHECKLIST_KEY, '1');
        } catch (_) {}
        card.hidden = true;
      });
    }
  }

  function init() {
    hideShellLoading();
    initFirstRunChecklist();
    updateMissionFocus();
    watchCoverageCounts();
    pollHealth();
    revealAdminTools();
    window.setInterval(pollHealth, 30000);
    window.addEventListener('pageshow', hideShellLoading);
  }

  function revealAdminTools() {
    function show() {
      var isAdmin = window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function'
        ? window.PhugleeSettings.isAdmin()
        : false;
      if (!isAdmin) {
        try { isAdmin = sessionStorage.getItem('phuglee_session') === 'admin'; } catch (_) {}
      }
      document.querySelectorAll('[data-admin-only]').forEach(function (el) {
        el.hidden = !isAdmin;
      });
    }
    show();
    if (window.PhugleeSession && typeof window.PhugleeSession.syncSessionFromServerCookie === 'function') {
      window.PhugleeSession.syncSessionFromServerCookie().then(show);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
