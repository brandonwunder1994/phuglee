'use strict';

/**
 * Product roles for Phuglee shell access.
 * - admin: full product
 * - dispos (brad): Vault + Sales Pipeline + Contract Tracker
 */

const ADMIN_USERNAME = 'admin';
const DISPOS_USERNAME = 'brad';

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
  user: {
    id: 'user',
    label: 'User',
    plan: null
  }
};

/** Pages the disposition partner may open (normalized paths). */
const DISPOS_ALLOWED_PATHS = new Set(['/vault', '/under-contract', '/pipeline']);

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
  return ROLES.user;
}

function isAdminUsername(username) {
  return sanitizeUsername(username) === ADMIN_USERNAME;
}

function isDisposUsername(username) {
  return sanitizeUsername(username) === DISPOS_USERNAME;
}

/** Admin or disposition desk — Contract Tracker + related APIs. */
function isContractDeskUsername(username) {
  return isAdminUsername(username) || isDisposUsername(username);
}

/** Max Vault access (paid max, admin, or disposition). */
function hasVaultAccess(username, plan) {
  if (isContractDeskUsername(username)) return true;
  return String(plan || '').trim().toLowerCase() === 'max';
}

function normalizePath(pathname) {
  let p = String(pathname || '/').split('?')[0].split('#')[0];
  p = p.replace(/\/+$/, '') || '/';
  if (p === '/index.html') return '/';
  return p;
}

function isPathAllowedForUsername(username, pathname) {
  if (!isDisposUsername(username)) return true;
  return DISPOS_ALLOWED_PATHS.has(normalizePath(pathname));
}

function defaultHomeForUsername(username) {
  if (isDisposUsername(username)) return '/under-contract';
  if (isAdminUsername(username)) return '/command';
  return '/command';
}

module.exports = {
  ADMIN_USERNAME,
  DISPOS_USERNAME,
  ROLES,
  DISPOS_ALLOWED_PATHS,
  sanitizeUsername,
  roleForUsername,
  isAdminUsername,
  isDisposUsername,
  isContractDeskUsername,
  hasVaultAccess,
  normalizePath,
  isPathAllowedForUsername,
  defaultHomeForUsername
};
