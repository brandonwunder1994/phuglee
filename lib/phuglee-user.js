const {
  sanitizePhugleeUsername,
  sanitizePhugleePlan,
  resolveSessionScope,
  scopeSessionPath
} = require('../modules/property-analyzer/lib/user-session');

function readHeaderUser(req) {
  const raw = req?.headers?.['x-phuglee-user'] || req?.headers?.['X-Phuglee-User'] || '';
  return sanitizePhugleeUsername(raw);
}

function readHeaderPlan(req) {
  const raw = req?.headers?.['x-phuglee-plan'] || req?.headers?.['X-Phuglee-Plan'] || '';
  return sanitizePhugleePlan(raw);
}

/**
 * Prefer verified HttpOnly session cookie over spoofable X-Phuglee-User.
 * Header fallback is allowed only when AUTH_DISABLED / PHUGLEE_ALLOW_HEADER_AUTH.
 */
function readPhugleeUser(req) {
  try {
    const { readSessionFromReq, allowHeaderIdentityFallback } = require('./phuglee-auth');
    const session = readSessionFromReq(req);
    if (session && session.username) return session.username;
    if (!allowHeaderIdentityFallback()) return '';
  } catch (_) {
    /* auth module unavailable */
  }
  return readHeaderUser(req);
}

function readPhugleePlan(req) {
  try {
    const { readSessionFromReq, allowHeaderIdentityFallback } = require('./phuglee-auth');
    const session = readSessionFromReq(req);
    if (session && session.username) {
      return session.plan || '';
    }
    if (!allowHeaderIdentityFallback()) return '';
  } catch (_) {
    /* auth module unavailable */
  }
  return readHeaderPlan(req);
}

function readPhugleeScope(req) {
  return resolveSessionScope({
    username: readPhugleeUser(req),
    plan: readPhugleePlan(req)
  });
}

function sessionPathForScope(dataRoot, sessionFile, scope) {
  return scopeSessionPath(dataRoot, sessionFile, scope);
}

module.exports = {
  sanitizePhugleeUsername,
  sanitizePhugleePlan,
  readHeaderUser,
  readHeaderPlan,
  readPhugleeUser,
  readPhugleePlan,
  readPhugleeScope,
  resolveSessionScope,
  scopeSessionPath,
  sessionPathForScope
};