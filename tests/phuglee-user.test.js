const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizePhugleeUsername,
  sanitizePhugleePlan,
  readPhugleeUser,
  readPhugleePlan,
  resolveSessionScope
} = require('../lib/phuglee-user');
const { sessionHasAddresses } = require('../lib/analyzer-import-index');

test('sanitizePhugleeUsername normalizes login names', () => {
  assert.equal(sanitizePhugleeUsername(' Admin '), 'admin');
  assert.equal(sanitizePhugleeUsername('user.name@x'), 'usernamex');
});

test('sanitizePhugleePlan normalizes plan ids', () => {
  assert.equal(sanitizePhugleePlan(' Max '), 'max');
  assert.equal(sanitizePhugleePlan('Pro!'), 'pro');
});

test('readPhugleeUser reads request header', () => {
  assert.equal(readPhugleeUser({ headers: { 'x-phuglee-user': 'Brandon' } }), 'brandon');
});

test('readHeaderUser ignores cookies and reads header only', () => {
  const { readHeaderUser } = require('../lib/phuglee-user');
  assert.equal(readHeaderUser({ headers: { 'x-phuglee-user': 'Eve' } }), 'eve');
});

test('readPhugleePlan reads request header', () => {
  assert.equal(readPhugleePlan({ headers: { 'x-phuglee-plan': 'lite' } }), 'lite');
});

test('resolveSessionScope keeps admin on admin storage', () => {
  const scope = resolveSessionScope({ username: 'admin', plan: 'pro' });
  assert.equal(scope.storageKey, 'admin');
});

test('sessionHasAddresses ignores empty analyzer sessions', () => {
  assert.equal(sessionHasAddresses({ records: [], results: [] }), false);
  assert.equal(sessionHasAddresses({
    records: [{ address: '123 Main St' }],
    results: []
  }), true);
});