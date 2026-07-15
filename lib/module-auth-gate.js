'use strict';
/**
 * Gate proxied module paths (/forge, /analyzer) behind Phuglee session when auth is on.
 */
const auth = require('./phuglee-auth');

function wantsHtml(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html');
}

/**
 * @returns {boolean} true if request was rejected (response already sent)
 */
function rejectUnauthorizedModule(req, res, moduleLabel) {
  if (!auth.isAuthRequired()) return false;
  const session = auth.readSessionFromReq(req);
  if (session && session.username) return false;

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

module.exports = { rejectUnauthorizedModule };
