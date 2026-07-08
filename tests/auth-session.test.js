const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPhugleeSession() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth-session.js'), 'utf8');
  const context = {
    window: {
      addEventListener() {}
    },
    sessionStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); }
    }
  };
  context.window = context;
  vm.runInNewContext(src, context);
  return context.PhugleeSession;
}

test('signOut marks explicit logout and clears session user', () => {
  const api = loadPhugleeSession();
  api.establishSession('admin');
  assert.equal(api.isAuthenticated(), true);
  api.clearSession();
  assert.equal(api.getSessionUser(), '');
  assert.equal(api.hasExplicitLogout(), true);
  assert.equal(api.isAuthenticated(), false);
});

test('establishSession clears explicit logout flag', () => {
  const api = loadPhugleeSession();
  api.clearSession();
  assert.equal(api.isAuthenticated(), false);
  api.establishSession('jane');
  assert.equal(api.getSessionUser(), 'jane');
  assert.equal(api.hasExplicitLogout(), false);
  assert.equal(api.isAuthenticated(), true);
});

test('SIGN_OUT_URL includes login prompt for account switching', () => {
  const api = loadPhugleeSession();
  assert.equal(api.SIGN_OUT_URL, '/?signed_out=1&login=1');
});