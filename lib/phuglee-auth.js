/**
 * Pragmatic interim shell session: HMAC-signed cookie token.
 * Prefer PHUGLEE_SESSION_SECRET; else derive from bootstrap password / NODE_ENV.
 */
'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'phuglee_session';
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

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

function getSessionSecret() {
  const explicit = String(process.env.PHUGLEE_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  const bootstrap = String(process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '').trim();
  if (bootstrap) {
    return crypto.createHash('sha256').update(`phuglee-session:${bootstrap}`).digest('hex');
  }
  // Local/dev fallback — set PHUGLEE_SESSION_SECRET in production.
  return 'phuglee-dev-session-secret-change-me';
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function signPayload(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest();
  return `${payload}.${b64url(sig)}`;
}

/**
 * @param {{ username: string, plan?: string, ttlSec?: number }} opts
 * @returns {string} signed token
 */
function createSessionToken(opts = {}) {
  const username = sanitizePhugleeUsername(opts.username);
  if (!username) {
    const err = new Error('Username required');
    err.code = 'USERNAME_REQUIRED';
    throw err;
  }
  const plan = sanitizePhugleePlan(opts.plan || '');
  const ttlSec = Number(opts.ttlSec) > 0 ? Number(opts.ttlSec) : DEFAULT_TTL_SEC;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return signPayload({ u: username, p: plan || '', exp });
}

/**
 * @param {string} token
 * @returns {{ username: string, plan: string, exp: number } | null}
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest();
  let actual;
  try {
    actual = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const username = sanitizePhugleeUsername(payload.u);
  if (!username) return null;
  return {
    username,
    plan: sanitizePhugleePlan(payload.p || ''),
    exp
  };
}

function parseCookies(req) {
  const raw = req && req.headers && (req.headers.cookie || req.headers.Cookie);
  const out = {};
  if (!raw || typeof raw !== 'string') return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Read verified session from HttpOnly cookie (if present and valid).
 * @returns {{ username: string, plan: string, exp: number } | null}
 */
function readSessionFromReq(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME] || '');
}

function isSecureRequest(req) {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return true;
  const xf = String((req && req.headers && req.headers['x-forwarded-proto']) || '').toLowerCase();
  return xf === 'https';
}

/**
 * @returns {string} Set-Cookie value
 */
function buildSessionCookieHeader(token, req, opts = {}) {
  const maxAge = Number(opts.maxAgeSec) > 0 ? Number(opts.maxAgeSec) : DEFAULT_TTL_SEC;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function buildClearSessionCookieHeader(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  DEFAULT_TTL_SEC,
  getSessionSecret,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  readSessionFromReq,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader
};
