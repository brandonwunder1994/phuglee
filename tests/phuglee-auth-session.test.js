'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  createSessionToken,
  verifySessionToken,
  readSessionFromReq,
  buildSessionCookieHeader,
  COOKIE_NAME
} = require('../lib/phuglee-auth');
const { readPhugleeUser, readHeaderUser } = require('../lib/phuglee-user');

describe('phuglee auth session', () => {
  test('createSessionToken + verifySessionToken round-trip', () => {
    const prev = process.env.PHUGLEE_SESSION_SECRET;
    process.env.PHUGLEE_SESSION_SECRET = 'test-secret-phase5';
    try {
      const token = createSessionToken({ username: 'Brandon', plan: 'pro' });
      const session = verifySessionToken(token);
      assert.ok(session);
      assert.equal(session.username, 'brandon');
      assert.equal(session.plan, 'pro');
      assert.ok(session.exp > Math.floor(Date.now() / 1000));
    } finally {
      if (prev == null) delete process.env.PHUGLEE_SESSION_SECRET;
      else process.env.PHUGLEE_SESSION_SECRET = prev;
    }
  });

  test('verifySessionToken rejects tampered signature', () => {
    const prev = process.env.PHUGLEE_SESSION_SECRET;
    process.env.PHUGLEE_SESSION_SECRET = 'test-secret-phase5';
    try {
      const token = createSessionToken({ username: 'admin' });
      const bad = token.replace(/\.[^.]+$/, '.AAAA');
      assert.equal(verifySessionToken(bad), null);
    } finally {
      if (prev == null) delete process.env.PHUGLEE_SESSION_SECRET;
      else process.env.PHUGLEE_SESSION_SECRET = prev;
    }
  });

  test('readSessionFromReq prefers cookie over header spoof', () => {
    const prev = process.env.PHUGLEE_SESSION_SECRET;
    process.env.PHUGLEE_SESSION_SECRET = 'test-secret-phase5';
    try {
      const token = createSessionToken({ username: 'alice', plan: 'lite' });
      const req = {
        headers: {
          cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}`,
          'x-phuglee-user': 'eve'
        }
      };
      assert.equal(readSessionFromReq(req).username, 'alice');
      assert.equal(readPhugleeUser(req), 'alice');
      assert.equal(readHeaderUser(req), 'eve');
    } finally {
      if (prev == null) delete process.env.PHUGLEE_SESSION_SECRET;
      else process.env.PHUGLEE_SESSION_SECRET = prev;
    }
  });

  test('buildSessionCookieHeader is HttpOnly', () => {
    const header = buildSessionCookieHeader('abc.def', { headers: {} });
    assert.match(header, new RegExp(`^${COOKIE_NAME}=`));
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);
    assert.match(header, /Path=\//);
  });
});

describe('deep health route contract', () => {
  test('server.js defines /api/health/deep with non-200 on module failure', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(src, /pathname === '\/api\/health\/deep'/);
    assert.match(src, /const status = modulesOk \? 200 : 503/);
    // Shallow health remains always-200 for Railway
    assert.match(
      src,
      /pathname === '\/api\/health'[\s\S]*?send\(res, 200[\s\S]*?formForge/
    );
  });

  test('verify-live.ps1 documents optional -Deep deep health check', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'verify-live.ps1'),
      'utf8'
    );
    assert.match(src, /\[switch\]\$Deep/);
    assert.match(src, /api\/health\/deep/);
    assert.match(src, /VERIFY_DEEP/);
  });
});
