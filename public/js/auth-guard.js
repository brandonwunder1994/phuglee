(function () {
  if (window.__PHUGLEE_AUTH_DISABLED__) return;

  var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index.html') return;

  try {
    if (sessionStorage.getItem('phuglee_logout') === '1') {
      var returnUrl = window.location.pathname + window.location.search + window.location.hash;
      window.location.replace('/?login=1&return=' + encodeURIComponent(returnUrl));
      return;
    }
    if (sessionStorage.getItem('phuglee_session')) return;
  } catch (_) {}

  var returnUrl = window.location.pathname + window.location.search + window.location.hash;
  window.location.replace('/?login=1&return=' + encodeURIComponent(returnUrl));
})();