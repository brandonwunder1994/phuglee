const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  resolveSessionScope,
  scopeSessionPath,
  emptySession,
  sessionHasAddresses
} = require('../modules/property-analyzer/lib/user-session');
const {
  readPhugleeScope,
  readPhugleePlan,
  readPhugleeUser
} = require('../lib/phuglee-user');
const { resolveIndexScope } = require('../lib/analyzer-import-index');

test('resolveSessionScope maps users to isolated storage keys', () => {
  assert.deepEqual(resolveSessionScope({ username: 'admin', plan: 'pro' }), {
    kind: 'admin',
    username: 'admin',
    storageKey: 'admin',
    plan: 'pro'
  });

  assert.deepEqual(resolveSessionScope({ username: 'jane', plan: 'lite' }), {
    kind: 'user',
    username: 'jane',
    storageKey: 'jane',
    plan: 'lite'
  });

  assert.deepEqual(resolveSessionScope({ username: 'team1', plan: 'max' }), {
    kind: 'vault',
    username: 'team1',
    storageKey: '_vault',
    plan: 'max'
  });

  assert.deepEqual(resolveSessionScope({ username: '', plan: '' }), {
    kind: 'anonymous',
    username: '',
    storageKey: '_anonymous',
    plan: ''
  });
});

test('scopeSessionPath writes under users/<storageKey>/', () => {
  const file = scopeSessionPath('/data', 'distressAnalyzerSession_LATEST.json', {
    storageKey: 'jane'
  });
  assert.equal(
    file.replace(/\\/g, '/'),
    '/data/users/jane/distressAnalyzerSession_LATEST.json'
  );
});

test('readPhugleeScope reads user and plan headers together', () => {
  const scope = readPhugleeScope({
    headers: {
      'x-phuglee-user': 'Admin',
      'x-phuglee-plan': 'MAX'
    }
  });
  assert.equal(scope.kind, 'admin');
  assert.equal(scope.storageKey, 'admin');
  assert.equal(readPhugleeUser({ headers: { 'x-phuglee-user': 'bob' } }), 'bob');
  assert.equal(readPhugleePlan({ headers: { 'x-phuglee-plan': 'Pro' } }), 'pro');
});

test('resolveIndexScope matches analyzer session routing', () => {
  const lite = resolveIndexScope({ username: 'newbie', plan: 'lite' });
  assert.equal(lite.storageKey, 'newbie');

  const max = resolveIndexScope({ username: 'buyer', plan: 'max' });
  assert.equal(max.storageKey, '_vault');
});

test('empty scoped sessions have no importable addresses', () => {
  assert.equal(sessionHasAddresses(emptySession()), false);
});

