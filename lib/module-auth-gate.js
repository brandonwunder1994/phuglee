'use strict';
/**
 * Gate proxied module paths (/forge, /analyzer) behind Phuglee session when auth is on.
 * Also block role-restricted users (dispos / vault-only) from modules outside their path set.
 */
const auth = require('./phuglee-auth');
const { isPathAllowedForUsername, defaultHomeForUsername } = require('./phuglee-roles');

function wantsHtml(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html');
}

function pathnameOf(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname;
  } catch (_) {
    return String(req.url || '/').split('?')[0] || '/';
  }
}

/**
 * @returns {boolean} true if request was rejected (response already sent)
 */
function rejectUnauthorizedModule(req, res, moduleLabel) {
  if (!auth.isAuthRequired()) return false;
  const session = auth.readSessionFromReq(req);
  if (!session || !session.username) {
    if (wantsHtml(req) && (req.method === 'GET' || req.method === 'HEAD')) {
      // Must match public/js/auth.js + auth-guard.js query params (login=1&return=),
      // not auth=login&next= — otherwise homepage never opens the sign-in modal.
      const next = encodeURIComponent(req.url || '/');
      res.writeHead(302, {
        Location: `/?login=1&return=${next}`,
        'Cache-Control': 'no-store'
      });
      res.end();
      return true;
    }

    res.writeHead(401, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      error: `${moduleLabel} requires login`,
      code: 'AUTH_REQUIRED'
    }));
    return true;
  }

  const path = pathnameOf(req);
  if (!isPathAllowedForUsername(session.username, path)) {
    if (wantsHtml(req) && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(302, {
        Location: defaultHomeForUsername(session.username),
        'Cache-Control': 'no-store'
      });
      res.end();
      return true;
    }
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      error: `${moduleLabel} is not available for this account`,
      code: 'PATH_FORBIDDEN'
    }));
    return true;
  }

  return false;
}

module.exports = { rejectUnauthorizedModule };
