/**
 * Server-side Phuglee user credentials (scrypt hashes on disk).
 * Bootstrap admin / brad are verified against PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD (never exported to the browser).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const {
  ADMIN_USERNAME,
  DISPOS_USERNAME,
  roleForUsername,
  isAdminUsername,
  isDisposUsername
} = require('./phuglee-roles');

function authRoot() {
  if (process.env.PHUGLEE_AUTH_ROOT) return path.resolve(process.env.PHUGLEE_AUTH_ROOT);
  if (process.env.PDA_DATA_ROOT) {
    return path.join(path.resolve(process.env.PDA_DATA_ROOT), 'auth');
  }
  return path.join(config.ROOT, 'data', 'auth');
}

function credentialsPath() {
  return path.join(authRoot(), 'users.json');
}

function sanitizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function sanitizePlan(plan) {
  return String(plan || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function ensureAuthDir() {
  const root = authRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function loadUsers() {
  const file = credentialsPath();
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (_) {
    return {};
  }
}

function saveUsers(users) {
  ensureAuthDir();
  const file = credentialsPath();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyStoredPassword(password, stored) {
  const value = String(stored || '');
  if (!value) return false;
  if (value.startsWith('scrypt$')) {
    const parts = value.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHex = parts[2];
    let actual;
    try {
      actual = crypto.scryptSync(String(password || ''), salt, 64);
    } catch (_) {
      return false;
    }
    let expected;
    try {
      expected = Buffer.from(expectedHex, 'hex');
    } catch (_) {
      return false;
    }
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }
  // Legacy client hash: sha256$salt$digest (byte concat salt+password)
  if (/^sha256\$[0-9a-f]+\$[0-9a-f]+$/i.test(value)) {
    const parts = value.split('$');
    const saltHex = parts[1];
    const expectedHex = parts[2].toLowerCase();
    let salt;
    try {
      salt = Buffer.from(saltHex, 'hex');
    } catch (_) {
      return false;
    }
    const pwdBytes = Buffer.from(String(password || ''), 'utf8');
    const combined = Buffer.concat([salt, pwdBytes]);
    const digest = crypto.createHash('sha256').update(combined).digest('hex');
    if (digest.length !== expectedHex.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(expectedHex, 'utf8'));
    } catch (_) {
      return digest === expectedHex;
    }
  }
  return false;
}

function bootstrapAdminPassword() {
  return String(process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '').trim();
}

function isBootstrapAdmin(username, password) {
  const key = sanitizeUsername(username);
  const raw = String(username || '').trim().toLowerCase();
  const expected = bootstrapAdminPassword();
  if (!expected || !password) return false;
  const okUser = isAdminUsername(key) || raw === 'admin@phuglee.com';
  if (!okUser) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Disposition partner shares the admin bootstrap password. */
function isBootstrapDispos(username, password) {
  const key = sanitizeUsername(username);
  const expected = bootstrapAdminPassword();
  if (!expected || !password || !isDisposUsername(key)) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * @returns {{ ok: true, username: string, plan: string, fullName?: string, email?: string }
 *         | { ok: false, error: string, code: string }}
 */
function authenticateUser(username, password) {
  const key = sanitizeUsername(username);
  const rawUser = String(username || '').trim().toLowerCase();
  if (!key && rawUser !== 'admin@phuglee.com') {
    return { ok: false, error: 'Username required', code: 'USERNAME_REQUIRED' };
  }
  if (!password) {
    return { ok: false, error: 'Password required', code: 'PASSWORD_REQUIRED' };
  }

  if (isBootstrapAdmin(username, password)) {
    const role = roleForUsername(ADMIN_USERNAME);
    return {
      ok: true,
      username: ADMIN_USERNAME,
      plan: role.plan,
      fullName: role.fullName,
      email: role.email,
      role: role.id
    };
  }

  if (isBootstrapDispos(username, password)) {
    const role = roleForUsername(DISPOS_USERNAME);
    return {
      ok: true,
      username: DISPOS_USERNAME,
      plan: role.plan,
      fullName: role.fullName,
      email: role.email,
      role: role.id
    };
  }

  const users = loadUsers();
  let record = users[key];
  if (!record) {
    const byEmail = Object.keys(users).find((k) => {
      return String(users[k].email || '').trim().toLowerCase() === rawUser;
    });
    if (byEmail) record = users[byEmail];
  }
  if (!record || !verifyStoredPassword(password, record.password)) {
    return { ok: false, error: 'Invalid username or password', code: 'INVALID_CREDENTIALS' };
  }
  return {
    ok: true,
    username: sanitizeUsername(record.username || key),
    plan: sanitizePlan(record.plan || 'lite'),
    fullName: record.fullName || '',
    email: record.email || '',
    role: roleForUsername(record.username || key).id
  };
}

/**
 * Register a new user. Does not mint a session.
 * @returns {{ ok: true, username: string, plan: string } | { ok: false, error: string, code: string }}
 */
function registerUser({ username, password, plan, email, fullName } = {}) {
  const key = sanitizeUsername(username);
  const tier = sanitizePlan(plan);
  const mail = String(email || '').trim().toLowerCase();
  const name = String(fullName || '').trim();

  if (!key || key.length < 3) {
    return { ok: false, error: 'Username must be at least 3 characters', code: 'INVALID_USERNAME' };
  }
  if (key === ADMIN_USERNAME || key === DISPOS_USERNAME) {
    return { ok: false, error: 'That username is reserved', code: 'USERNAME_RESERVED' };
  }
  if (!password || String(password).length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters', code: 'WEAK_PASSWORD' };
  }
  if (!tier) {
    return { ok: false, error: 'Select a plan', code: 'PLAN_REQUIRED' };
  }
  if (!name) {
    return { ok: false, error: 'Full name is required', code: 'NAME_REQUIRED' };
  }
  if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return { ok: false, error: 'Enter a valid contact address', code: 'INVALID_EMAIL' };
  }

  const users = loadUsers();
  if (users[key]) {
    return { ok: false, error: 'That username is already taken', code: 'USERNAME_TAKEN' };
  }
  const emailTaken = Object.keys(users).some((k) => String(users[k].email || '').toLowerCase() === mail);
  if (emailTaken) {
    return { ok: false, error: 'An account with this contact already exists', code: 'EMAIL_TAKEN' };
  }

  users[key] = {
    username: key,
    password: hashPassword(password),
    fullName: name,
    email: mail,
    plan: tier,
    createdAt: Date.now()
  };
  saveUsers(users);
  return { ok: true, username: key, plan: tier };
}

module.exports = {
  authRoot,
  credentialsPath,
  hashPassword,
  verifyStoredPassword,
  bootstrapAdminPassword,
  isBootstrapAdmin,
  isBootstrapDispos,
  authenticateUser,
  registerUser,
  loadUsers,
  sanitizeUsername,
  sanitizePlan
};
