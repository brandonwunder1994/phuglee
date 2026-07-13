(function () {
  'use strict';

  var SESSION_KEY = 'phuglee_session';
  var LOGOUT_KEY = 'phuglee_logout';
  var SIGN_OUT_URL = '/?signed_out=1&login=1';

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
    if (window.__PHUGLEE_AUTH_DISABLED__) return true;
    if (hasExplicitLogout()) return false;
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

  /** Restore sessionStorage from HttpOnly cookie after refresh (Analyzer headers need the username). */
  function syncSessionFromServerCookie() {
    if (window.__PHUGLEE_AUTH_DISABLED__) return Promise.resolve(null);
    if (hasExplicitLogout()) return Promise.resolve(null);
    return fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.authenticated || !data.username) return null;
        establishSession(data.username);
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function signOut() {
    try {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
    } catch (_) {}
    clearSession();
    window.location.replace(SIGN_OUT_URL);
  }

  function guardProtectedPage() {
    if (window.__PHUGLEE_AUTH_DISABLED__) return;
    var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') return;
    if (hasExplicitLogout()) {
      window.location.replace(SIGN_OUT_URL);
      return;
    }
    if (getSessionUser()) return;
    syncSessionFromServerCookie().then(function (data) {
      if (!data || !data.username) {
        window.location.replace(SIGN_OUT_URL);
      }
    });
  }

  if (!window.__PHUGLEE_AUTH_DISABLED__ && !hasExplicitLogout() && !getSessionUser()) {
    syncSessionFromServerCookie();
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
    syncSessionFromServerCookie: syncSessionFromServerCookie,
    signOut: signOut,
    guardProtectedPage: guardProtectedPage
  };
})();
