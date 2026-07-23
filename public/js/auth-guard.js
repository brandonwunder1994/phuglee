(function () {
  if (window.__PHUGLEE_AUTH_DISABLED__) return;

  function normalizePath(pathname) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    if (p === '/index.html') return '/';
    return p;
  }

  var path = normalizePath(window.location.pathname);
  var DISPOS_USER = 'brad';
  /** Settings only — Brad can open every other product page. */
  var DISPOS_DENIED_PATHS = {
    '/operating-costs': true,
    '/campaigns/sms': true,
    '/campaigns-sms.html': true
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
    if (DISPOS_DENIED_PATHS[p]) {
      window.location.replace(DISPOS_HOME);
    }
  }

  // Public landers stay public. Vault-only still gets bounced off them.
  if (path === '/' || path === '/heat') {
    if (isLoggedIn()) {
      var landUser = getSessionUser();
      if (landUser && isVaultOnlyUser(landUser)) enforceRestrictedPath(landUser);
      else if (sessionApi() && typeof sessionApi().syncSessionFromServerCookie === 'function') {
        sessionApi().syncSessionFromServerCookie().then(function (data) {
          if (data && data.username && isVaultOnlyUser(data.username)) {
            enforceRestrictedPath(data.username);
          }
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

  function afterAuthenticated(user) {
    if (user) enforceRestrictedPath(user);
    if (sessionApi() && typeof sessionApi().guardProtectedPage === 'function') {
      window.addEventListener('pageshow', function (event) {
        if (event.persisted) sessionApi().guardProtectedPage();
      });
    }
  }

  if (!isLoggedIn()) {
    try {
      if (sessionStorage.getItem('phuglee_logout') === '1') {
        window.location.replace(signOutUrl);
        return;
      }
    } catch (_) {}
    var api = sessionApi();
    // Cookie may still be valid (new tab / empty sessionStorage) — hydrate before bounce.
    if (api && typeof api.syncSessionFromServerCookie === 'function') {
      api.syncSessionFromServerCookie().then(function (data) {
        if (data && data.username) {
          afterAuthenticated(data.username);
          return;
        }
        redirectToSignIn();
      });
      return;
    }
    redirectToSignIn();
    return;
  }

  var sessionUser = getSessionUser();

  if (sessionUser) {
    afterAuthenticated(sessionUser);
  } else if (sessionApi() && typeof sessionApi().syncSessionFromServerCookie === 'function') {
    sessionApi().syncSessionFromServerCookie().then(function (data) {
      if (data && data.username) afterAuthenticated(data.username);
    });
  } else {
    afterAuthenticated(sessionUser);
  }
})();
