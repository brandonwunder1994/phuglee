'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('phuglee credentials', () => {
  let prevAuthRoot;
  let tmpDir;

  before(() => {
    prevAuthRoot = process.env.PHUGLEE_AUTH_ROOT;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phuglee-auth-'));
    process.env.PHUGLEE_AUTH_ROOT = tmpDir;
    // Fresh module load against temp root
    delete require.cache[require.resolve('../lib/phuglee-credentials')];
  });

  after(() => {
    if (prevAuthRoot == null) delete process.env.PHUGLEE_AUTH_ROOT;
    else process.env.PHUGLEE_AUTH_ROOT = prevAuthRoot;
    delete require.cache[require.resolve('../lib/phuglee-credentials')];
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  test('register + authenticate round-trip', () => {
    const creds = require('../lib/phuglee-credentials');
    const registered = creds.registerUser({
      username: 'scanuser',
      password: 'secret99',
      plan: 'pro',
      email: 'scan@example.com',
      fullName: 'Scan User'
    });
    assert.equal(registered.ok, true);
    const auth = creds.authenticateUser('scanuser', 'secret99');
    assert.equal(auth.ok, true);
    assert.equal(auth.username, 'scanuser');
    assert.equal(auth.plan, 'pro');
    const bad = creds.authenticateUser('scanuser', 'wrong');
    assert.equal(bad.ok, false);
  });

  test('self-register cannot claim plan=max', () => {
    const creds = require('../lib/phuglee-credentials');
    const registered = creds.registerUser({
      username: 'maxgrabber',
      password: 'secret99',
      plan: 'max',
      email: 'maxgrab@example.com',
      fullName: 'Max Grabber'
    });
    assert.equal(registered.ok, false);
    assert.equal(registered.code, 'PLAN_NOT_ALLOWED');
  });

  test('bootstrap admin verifies env password', () => {
    const prev = process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD;
    process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD = 'bootstrap-secret';
    try {
      delete require.cache[require.resolve('../lib/phuglee-credentials')];
      const creds = require('../lib/phuglee-credentials');
      const ok = creds.authenticateUser('admin', 'bootstrap-secret');
      assert.equal(ok.ok, true);
      assert.equal(ok.username, 'admin');
      const bad = creds.authenticateUser('admin', 'nope');
      assert.equal(bad.ok, false);
    } finally {
      if (prev == null) delete process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD;
      else process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD = prev;
      delete require.cache[require.resolve('../lib/phuglee-credentials')];
    }
  });
});
