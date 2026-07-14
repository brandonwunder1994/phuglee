(function () {
  if (window.__PHUGLEE_AUTH_DISABLED__) return;

  var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index.html' || path === '/heat') return;

  var signOutUrl = (window.PhugleeSession && window.PhugleeSession.SIGN_OUT_URL)
    || '/?signed_out=1&login=1';

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

  function redirectToSignIn() {
    var returnUrl = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace('/?login=1&return=' + encodeURIComponent(returnUrl));
  }

  function normalizePath(pathname) {
    var p = (pathname || '/').replace(/\/+$/, '') || '/';
    if (p === '/index.html') return '/';
    return p;
  }

  var DISPOS_USER = 'brad';
  var DISPOS_PATHS = { '/vault': true, '/under-contract': true };

  function isDisposUser(user) {
    return user === DISPOS_USER;
  }

  function enforceDisposPath(user) {
    if (!isDisposUser(user)) return;
    var path = normalizePath(window.location.pathname);
    if (!DISPOS_PATHS[path]) {
      window.location.replace('/vault');
    }
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

  var sessionUser = (function () {
    var api = sessionApi();
    if (api && typeof api.getSessionUser === 'function') {
      return api.getSessionUser() || '';
    }
    try {
      return sessionStorage.getItem('phuglee_session') || '';
    } catch (_) {
      return '';
    }
  })();

  if (sessionUser) {
    enforceDisposPath(sessionUser);
  } else if (sessionApi() && typeof sessionApi().syncSessionFromServerCookie === 'function') {
    sessionApi().syncSessionFromServerCookie().then(function (data) {
      if (data && data.username) enforceDisposPath(data.username);
    });
  }

  if (sessionApi() && typeof sessionApi().guardProtectedPage === 'function') {
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) sessionApi().guardProtectedPage();
    });
  }
})();