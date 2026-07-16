'use strict';

/**
 * Product roles for Phuglee shell access.
 * - admin: full product
 * - dispos (brad): Vault + Sales Pipeline + Contract Tracker
 * - vault (matt): The Vault only (no admin Vault actions)
 */

const ADMIN_USERNAME = 'admin';
const DISPOS_USERNAME = 'brad';
const VAULT_ONLY_USERNAME = 'matt';

const ROLES = {
  admin: {
    id: 'admin',
    label: 'Admin',
    plan: 'max',
    fullName: 'Administrator',
    email: 'admin@phuglee.com'
  },
  dispos: {
    id: 'dispos',
    label: 'Disposition',
    plan: 'max',
    fullName: 'Disposition Partner',
    email: ''
  },
  vault: {
    id: 'vault',
    label: 'Vault',
    plan: 'max',
    fullName: 'Vault Partner',
    email: ''
  },
  user: {
    id: 'user',
    label: 'User',
    plan: null
  }
};

/** Pages the disposition partner may open (normalized paths). */
const DISPOS_ALLOWED_PATHS = new Set([
  '/vault',
  '/land-vault',
  '/under-contract',
  '/pipeline',
  '/buyers',
  '/trust-funds' // legacy alias
]);

/** Pages the vault-only partner may open (normalized paths). */
const VAULT_ONLY_ALLOWED_PATHS = new Set(['/vault', '/land-vault']);

function sanitizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function roleForUsername(username) {
  const key = sanitizeUsername(username);
  if (key === ADMIN_USERNAME) return ROLES.admin;
  if (key === DISPOS_USERNAME) return ROLES.dispos;
  if (key === VAULT_ONLY_USERNAME) return ROLES.vault;
  return ROLES.user;
}

function isAdminUsername(username) {
  return sanitizeUsername(username) === ADMIN_USERNAME;
}

function isDisposUsername(username) {
  return sanitizeUsername(username) === DISPOS_USERNAME;
}

function isVaultOnlyUsername(username) {
  return sanitizeUsername(username) === VAULT_ONLY_USERNAME;
}

/** Admin or disposition desk — Contract Tracker + related APIs. */
function isContractDeskUsername(username) {
  return isAdminUsername(username) || isDisposUsername(username);
}

/** Max Vault access (paid max, admin, disposition, or vault-only). */
function hasVaultAccess(username, plan) {
  if (isContractDeskUsername(username) || isVaultOnlyUsername(username)) return true;
  return String(plan || '').trim().toLowerCase() === 'max';
}

function normalizePath(pathname) {
  let p = String(pathname || '/').split('?')[0].split('#')[0];
  p = p.replace(/\/+$/, '') || '/';
  if (p === '/index.html') return '/';
  return p;
}

function isPathAllowedForUsername(username, pathname) {
  const path = normalizePath(pathname);
  if (isVaultOnlyUsername(username)) {
    return VAULT_ONLY_ALLOWED_PATHS.has(path);
  }
  if (isDisposUsername(username)) {
    return DISPOS_ALLOWED_PATHS.has(path);
  }
  return true;
}

function defaultHomeForUsername(username) {
  if (isVaultOnlyUsername(username)) return '/vault';
  if (isDisposUsername(username)) return '/under-contract';
  if (isAdminUsername(username)) return '/command';
  return '/command';
}

module.exports = {
  ADMIN_USERNAME,
  DISPOS_USERNAME,
  VAULT_ONLY_USERNAME,
  ROLES,
  DISPOS_ALLOWED_PATHS,
  VAULT_ONLY_ALLOWED_PATHS,
  sanitizeUsername,
  roleForUsername,
  isAdminUsername,
  isDisposUsername,
  isVaultOnlyUsername,
  isContractDeskUsername,
  hasVaultAccess,
  normalizePath,
  isPathAllowedForUsername,
  defaultHomeForUsername
};
