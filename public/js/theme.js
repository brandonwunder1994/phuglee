(function () {
  'use strict';

  var STORAGE_KEY = 'phuglee_theme';
  var VALID = { dark: 1, light: 1, system: 1 };

  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function readPref() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return VALID[v] ? v : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function writePref(pref) {
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch (_) {}
  }

  function apply(pref) {
    var resolved = resolveTheme(pref);
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-pref', pref);
    window.dispatchEvent(new CustomEvent('phuglee-theme-change', {
      detail: { pref: pref, resolved: resolved }
    }));
  }

  function setTheme(pref) {
    if (!VALID[pref]) pref = 'dark';
    writePref(pref);
    apply(pref);
  }

  function getTheme() {
    return readPref();
  }

  function getResolvedTheme() {
    return resolveTheme(readPref());
  }

  apply(readPref());

  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
      if (readPref() === 'system') apply('system');
    });
  } catch (_) {}

  window.PhugleeTheme = { setTheme: setTheme, getTheme: getTheme, getResolvedTheme: getResolvedTheme };
})();