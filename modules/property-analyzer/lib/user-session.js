const fs = require('fs');
const path = require('path');

const ADMIN_USERNAME = 'admin';
const VAULT_STORAGE_KEY = '_vault';
const ANONYMOUS_STORAGE_KEY = '_anonymous';

function sanitizePhugleeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function sanitizePhugleePlan(plan) {
  return String(plan || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function readScopeFromRequest(req) {
  const username = sanitizePhugleeUsername(
    req?.headers?.['x-phuglee-user'] || req?.headers?.['X-Phuglee-User'] || ''
  );
  const plan = sanitizePhugleePlan(
    req?.headers?.['x-phuglee-plan'] || req?.headers?.['X-Phuglee-Plan'] || ''
  );
  return resolveSessionScope({ username, plan });
}

function resolveSessionScope({ username = '', plan = '' } = {}) {
  const user = sanitizePhugleeUsername(username);
  const tier = sanitizePhugleePlan(plan);

  if (user === ADMIN_USERNAME) {
    return {
      kind: 'admin',
      username: user,
      storageKey: user,
      plan: tier || 'pro'
    };
  }

  if (tier === 'max') {
    return {
      kind: 'vault',
      username: user || 'max',
      storageKey: VAULT_STORAGE_KEY,
      plan: 'max'
    };
  }

  if (user) {
    return {
      kind: 'user',
      username: user,
      storageKey: user,
      plan: tier || 'lite'
    };
  }

  return {
    kind: 'anonymous',
    username: '',
    storageKey: ANONYMOUS_STORAGE_KEY,
    plan: ''
  };
}

function userSessionDir(dataRoot, storageKey) {
  return path.join(dataRoot, 'users', storageKey);
}

function scopeSessionPath(dataRoot, sessionFile, scope) {
  const key = scope?.storageKey || ANONYMOUS_STORAGE_KEY;
  return path.join(userSessionDir(dataRoot, key), sessionFile);
}

function legacyGlobalSessionPath(dataRoot, sessionFile) {
  return path.join(dataRoot, sessionFile);
}

function emptySession() {
  return { records: [], results: [], processed: 0, savedAt: 0 };
}

function sessionHasAddresses(session) {
  const records = Array.isArray(session?.records) ? session.records.length : 0;
  const results = Array.isArray(session?.results) ? session.results.length : 0;
  return records + results > 0;
}

function ensureUserSessionDir(dataRoot, storageKey) {
  const dir = userSessionDir(dataRoot, storageKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  ADMIN_USERNAME,
  VAULT_STORAGE_KEY,
  ANONYMOUS_STORAGE_KEY,
  sanitizePhugleeUsername,
  sanitizePhugleePlan,
  readScopeFromRequest,
  resolveSessionScope,
  userSessionDir,
  scopeSessionPath,
  legacyGlobalSessionPath,
  emptySession,
  sessionHasAddresses,
  ensureUserSessionDir
};