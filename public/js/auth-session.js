(function () {
  'use strict';

  var SESSION_KEY = 'phuglee_session';
  var LOGOUT_KEY = 'phuglee_logout';

  function getSessionUser() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function hasExplicitLogout() {
    try {
      return sessionStorage.getItem(LOGOUT_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function isAuthenticated() {
    if (hasExplicitLogout()) return false;
    if (window.__PHUGLEE_AUTH_DISABLED__) {
      try {
        return !!getSessionUser();
      } catch (_) {
        return true;
      }
    }
    return !!getSessionUser();
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem(LOGOUT_KEY, '1');
    } catch (_) {}
  }

  function establishSession(username) {
    try {
      sessionStorage.removeItem(LOGOUT_KEY);
      sessionStorage.setItem(SESSION_KEY, username);
      return true;
    } catch (_) {
      return false;
    }
  }

  var SIGN_OUT_URL = '/?signed_out=1&login=1';

  function signOut() {
    clearSession();
    window.location.replace(SIGN_OUT_URL);
  }

  function guardProtectedPage() {
    if (window.__PHUGLEE_AUTH_DISABLED__) return;
    var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') return;
    if (hasExplicitLogout() || !getSessionUser()) {
      window.location.replace(SIGN_OUT_URL);
    }
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) guardProtectedPage();
    });
  }

  window.PhugleeSession = {
    SESSION_KEY: SESSION_KEY,
    LOGOUT_KEY: LOGOUT_KEY,
    SIGN_OUT_URL: SIGN_OUT_URL,
    getSessionUser: getSessionUser,
    hasExplicitLogout: hasExplicitLogout,
    isAuthenticated: isAuthenticated,
    clearSession: clearSession,
    establishSession: establishSession,
    signOut: signOut,
    guardProtectedPage: guardProtectedPage
  };
})();