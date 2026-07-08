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

  function signOut() {
    clearSession();
    window.location.replace('/?signed_out=1');
  }

  window.PhugleeSession = {
    SESSION_KEY: SESSION_KEY,
    LOGOUT_KEY: LOGOUT_KEY,
    getSessionUser: getSessionUser,
    hasExplicitLogout: hasExplicitLogout,
    isAuthenticated: isAuthenticated,
    clearSession: clearSession,
    establishSession: establishSession,
    signOut: signOut
  };
})();