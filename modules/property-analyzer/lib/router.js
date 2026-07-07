function createRouter() {
  const routes = [];
  return {
    get(path, handler) { routes.push({ method: 'GET', path, handler, exact: true }); },
    post(path, handler) { routes.push({ method: 'POST', path, handler, exact: true }); },
    getPrefix(prefix, handler) { routes.push({ method: 'GET', prefix, handler, exact: false }); },
    async dispatch(req, res, url) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        if (r.exact && r.path === url.pathname) {
          const handled = await r.handler(req, res, url);
          if (handled !== false) return true;
        }
        if (!r.exact && r.prefix && url.pathname.startsWith(r.prefix)) {
          const handled = await r.handler(req, res, url);
          if (handled !== false) return true;
        }
      }
      return false;
    }
  };
}

module.exports = { createRouter };