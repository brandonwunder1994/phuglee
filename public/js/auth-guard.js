(function () {
  if (window.__PHUGLEE_AUTH_DISABLED__) return;

  function normalizePath(pathname) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    if (p === '/index.html') return '/';
    return p;
  }

  var path = normalizePath(window.location.pathname);
  var DISPOS_USER = 'brad';
  var DISPOS_PATHS = {
    '/vault': true,
    '/land-vault': true,
    '/under-contract': true,
    '/pipeline': true,
    '/buyers': true,
    '/trust-funds': true,
    '/government-lists': true
  };
  var DISPOS_HOME = '/under-contract';
  var VAULT_ONLY_USER = 'matt';
  var VAULT_ONLY_PATHS = { '/vault': true, '/land-vault': true };
  var VAULT_ONLY_HOME = '/vault';

  function sessionApi() {
    return window.PhugleeSession || null;
  }

  function isLoggedIn() {
    var api = sessionApi();
    if (api && typeof api.isAuthenticated === 'function') {
      return api.isAuthenticated();
    }
    try {
      if (sessionStorage.getItem('phuglee_logout') === '1') return false;
      return !!sessionStorage.getItem('phuglee_session');
    } catch (_) {
      return false;
    }
  }

  function getSessionUser() {
    var api = sessionApi();
    if (api && typeof api.getSessionUser === 'function') {
      return api.getSessionUser() || '';
    }
    try {
      return sessionStorage.getItem('phuglee_session') || '';
    } catch (_) {
      return '';
    }
  }

  function isDisposUser(user) {
    return user === DISPOS_USER;
  }

  function isVaultOnlyUser(user) {
    return user === VAULT_ONLY_USER;
  }

  function enforceRestrictedPath(user) {
    var p = normalizePath(window.location.pathname);
    if (isVaultOnlyUser(user)) {
      if (p === '/command' || p === '/' || p === '/heat' || !VAULT_ONLY_PATHS[p]) {
        window.location.replace(VAULT_ONLY_HOME);
      }
      return;
    }
    if (!isDisposUser(user)) return;
    if (p === '/command' || p === '/' || p === '/heat' || !DISPOS_PATHS[p]) {
      window.location.replace(DISPOS_HOME);
    }
  }

  // Public landers stay public, but restricted users never park on the mission home.
  if (path === '/' || path === '/heat') {
    if (isLoggedIn()) {
      var landUser = getSessionUser();
      if (landUser) enforceRestrictedPath(landUser);
      else if (sessionApi() && typeof sessionApi().syncSessionFromServerCookie === 'function') {
        sessionApi().syncSessionFromServerCookie().then(function (data) {
          if (data && data.username) enforceRestrictedPath(data.username);
        });
      }
    }
    return;
  }

  var signOutUrl = (window.PhugleeSession && window.PhugleeSession.SIGN_OUT_URL)
    || '/?signed_out=1&login=1';

  function redirectToSignIn() {
    var returnUrl = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace('/?login=1&return=' + encodeURIComponent(returnUrl));
  }

  if (!isLoggedIn()) {
    try {
      if (sessionStorage.getItem('phuglee_logout') === '1') {
        window.location.replace(signOutUrl);
        return;
      }
    } catch (_) {}
    redirectToSignIn();
    return;
  }

  var sessionUser = getSessionUser();

  if (sessionUser) {
    enforceRestrictedPath(sessionUser);
  } else if (sessionApi() && typeof sessionApi().syncSessionFromServerCookie === 'function') {
    sessionApi().syncSessionFromServerCookie().then(function (data) {
      if (data && data.username) enforceRestrictedPath(data.username);
    });
  }

  if (sessionApi() && typeof sessionApi().guardProtectedPage === 'function') {
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) sessionApi().guardProtectedPage();
    });
  }
})();
