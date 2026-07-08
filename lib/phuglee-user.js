const {
  sanitizePhugleeUsername,
  sanitizePhugleePlan,
  resolveSessionScope,
  scopeSessionPath,
  readScopeFromRequest
} = require('../modules/property-analyzer/lib/user-session');

function readPhugleeUser(req) {
  const raw = req?.headers?.['x-phuglee-user'] || req?.headers?.['X-Phuglee-User'] || '';
  return sanitizePhugleeUsername(raw);
}

function readPhugleePlan(req) {
  const raw = req?.headers?.['x-phuglee-plan'] || req?.headers?.['X-Phuglee-Plan'] || '';
  return sanitizePhugleePlan(raw);
}

function readPhugleeScope(req) {
  return readScopeFromRequest(req);
}

function sessionPathForScope(dataRoot, sessionFile, scope) {
  return scopeSessionPath(dataRoot, sessionFile, scope);
}

module.exports = {
  sanitizePhugleeUsername,
  sanitizePhugleePlan,
  readPhugleeUser,
  readPhugleePlan,
  readPhugleeScope,
  resolveSessionScope,
  scopeSessionPath,
  sessionPathForScope
};