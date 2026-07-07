(function () {
  'use strict';

  var HEALTH_TIMEOUT_MS = 8000;

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
        setModuleStatus('command-forge', modules.formForge === 'up');
        setModuleStatus('command-analyzer', modules.propertyAnalyzer === 'up');
      })
      .catch(function () {
        setModuleStatus('command-forge', false);
        setModuleStatus('command-analyzer', false);
      });
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

  function init() {
    hideShellLoading();
    pollHealth();
    window.setInterval(pollHealth, 30000);
    window.addEventListener('pageshow', hideShellLoading);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();