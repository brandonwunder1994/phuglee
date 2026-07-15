'use strict';
/**
 * One-shot: upsert vault-only user matt on the auth volume.
 * Usage (Railway): node scripts/upsert-vault-user-matt.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function authRoot() {
  if (process.env.PHUGLEE_AUTH_ROOT) return path.resolve(process.env.PHUGLEE_AUTH_ROOT);
  if (process.env.PDA_DATA_ROOT) return path.join(path.resolve(process.env.PDA_DATA_ROOT), 'auth');
  return path.join(__dirname, '..', 'data', 'auth');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const root = authRoot();
fs.mkdirSync(root, { recursive: true });
const file = path.join(root, 'users.json');
let users = {};
if (fs.existsSync(file)) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) users = raw;
  } catch (_) {}
}

users.matt = {
  username: 'matt',
  password: hashPassword('wholesale'),
  fullName: 'Matt',
  email: 'matt@phuglee.com',
  plan: 'max',
  createdAt: Date.now()
};

const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
fs.renameSync(tmp, file);

console.log(JSON.stringify({
  ok: true,
  file,
  usernames: Object.keys(users),
  mattPlan: users.matt.plan
}, null, 2));
